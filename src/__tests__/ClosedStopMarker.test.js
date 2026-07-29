global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('@maplibre/maplibre-react-native', () => ({
  MarkerView: 'MarkerView',
  ShapeSource: 'ShapeSource',
  CircleLayer: 'CircleLayer',
}));

const ClosedStopMarker = require('../components/ClosedStopMarker').default;

describe('ClosedStopMarker', () => {
  test('uses a passive marker and a MapLibre hitbox so map drags are not intercepted', () => {
    const onPress = jest.fn();
    let inst;

    act(() => {
      inst = create(React.createElement(ClosedStopMarker, {
        stop: {
          id: 'stop-932',
          code: '932',
          latitude: 44.389,
          longitude: -79.69,
        },
        onPress,
      }));
    });

    const marker = inst.root.findByType('MarkerView');
    expect(marker.props.coordinate).toEqual([-79.69, 44.389]);
    expect(marker.props.allowOverlap).toBe(true);
    expect(marker.props.pointerEvents).toBe('none');
    const frame = inst.root.findByProps({ testID: 'closed-stop-marker-frame' });
    expect(frame.props.style).toEqual(expect.objectContaining({
      width: 76,
      height: 48,
    }));
    expect(frame.props.style).not.toHaveProperty('elevation');
    const touchSource = inst.root.findByType('ShapeSource');
    expect(touchSource.props.hitbox).toEqual({ width: 76, height: 48 });

    act(() => {
      touchSource.props.onPress();
    });

    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'stop-932' }));
    expect(inst.root.findByType('Text').children).toContain('932');
  });

  test('does not render markers for stops without valid coordinates', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(ClosedStopMarker, {
        stop: { id: 'missing-location', code: '999' },
      }));
    });

    expect(inst.toJSON()).toBeNull();
  });

  test('can hide the stop code for regular map mode while keeping the closure icon', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(ClosedStopMarker, {
        stop: {
          id: 'stop-932',
          code: '932',
          latitude: 44.389,
          longitude: -79.69,
        },
        showStopCode: false,
      }));
    });

    expect(inst.root.findByType('MarkerView')).toBeTruthy();
    expect(inst.root.findAllByType('Text')).toHaveLength(0);
    expect(inst.root.findByProps({ testID: 'closed-stop-marker-frame' })).toBeTruthy();
  });

  test('uses a compact half-size closed-stop icon', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(ClosedStopMarker, {
        stop: {
          id: 'stop-932',
          code: '932',
          latitude: 44.389,
          longitude: -79.69,
        },
      }));
    });

    const marker = inst.root.findByProps({ testID: 'closed-stop-marker-icon' });
    const dot = inst.root.findByProps({ testID: 'closed-stop-marker-dot' });

    expect(marker.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 11, height: 11, borderRadius: 5.5, borderWidth: 1.5 }),
    ]));
    expect(dot.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 3.5, height: 3.5, borderRadius: 1.75 }),
    ]));
  });
});
