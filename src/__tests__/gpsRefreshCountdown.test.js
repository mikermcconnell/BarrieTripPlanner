import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  getGpsRefreshCountdownDisplay,
  getGpsRefreshCountdownTickDelay,
  useGpsRefreshCountdown,
} from '../hooks/useGpsRefreshCountdown';

global.IS_REACT_ACT_ENVIRONMENT = true;
const fs = require('fs');
const path = require('path');

const CountdownHarness = ({ nextRefreshAt }) => {
  const display = useGpsRefreshCountdown(nextRefreshAt);
  return React.createElement('Text', null, display?.label || '');
};

const readLabel = (renderer) => renderer.root.findByType('Text').props.children;

describe('GPS refresh countdown', () => {
  const now = new Date('2026-08-14T12:00:00.000Z').getTime();

  test('counts down to the next scheduled vehicle refresh', () => {
    expect(getGpsRefreshCountdownDisplay(now + 15_000, now)).toEqual({
      seconds: 15,
      label: 'GPS 15s',
      accessibilityLabel: 'Next GPS refresh in 15 seconds',
    });

    expect(getGpsRefreshCountdownDisplay(now + 1_000, now)).toEqual({
      seconds: 1,
      label: 'GPS 1s',
      accessibilityLabel: 'Next GPS refresh in 1 second',
    });
  });

  test('shows a refresh-now state instead of a negative countdown', () => {
    expect(getGpsRefreshCountdownDisplay(now - 500, now)).toEqual({
      seconds: 0,
      label: 'GPS NOW',
      accessibilityLabel: 'Refreshing GPS bus locations now',
    });
  });

  test('stays hidden until automatic vehicle refreshes are scheduled', () => {
    expect(getGpsRefreshCountdownDisplay(null, now)).toBeNull();
    expect(getGpsRefreshCountdownDisplay('not-a-date', now)).toBeNull();
  });

  test('aligns the next tick to the exact second boundary', () => {
    expect(getGpsRefreshCountdownTickDelay(now + 15_000, now)).toBe(1000);
    expect(getGpsRefreshCountdownTickDelay(now + 15_000, now + 250)).toBe(750);
    expect(getGpsRefreshCountdownTickDelay(now, now)).toBeNull();
  });

  test('schedules the real GPS poll and displayed deadline from the same timer cycle', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'context', 'TransitContext.js'),
      'utf8'
    );
    const start = source.indexOf('const startVehicleUpdates = useCallback');
    const end = source.indexOf('const stopVehicleUpdates = useCallback', start);
    const schedulingSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(schedulingSource).toContain('const scheduleNextVehicleUpdate');
    expect(schedulingSource).toContain('setNextVehicleRefreshAt(new Date(nextRefreshAt))');
    expect(schedulingSource).toContain('vehicleIntervalRef.current = setTimeout');
    expect(schedulingSource).not.toContain('setInterval');
  });

  describe('countdown hook timing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('renders a new refresh cycle without a transient 16 second frame', () => {
      let renderer;
      act(() => {
        renderer = create(<CountdownHarness nextRefreshAt={now + 15_000} />);
      });
      expect(readLabel(renderer)).toBe('GPS 15s');

      jest.setSystemTime(now + 15_000);
      act(() => {
        renderer.update(<CountdownHarness nextRefreshAt={now + 30_000} />);
      });

      expect(readLabel(renderer)).toBe('GPS 15s');
    });

    test('uses wall-clock time when delayed work finally renders', () => {
      let renderer;
      act(() => {
        renderer = create(<CountdownHarness nextRefreshAt={now + 15_000} />);
      });

      jest.setSystemTime(now + 3_400);
      act(() => {
        renderer.update(<CountdownHarness nextRefreshAt={now + 15_000} />);
      });

      expect(readLabel(renderer)).toBe('GPS 12s');
    });
  });
});
