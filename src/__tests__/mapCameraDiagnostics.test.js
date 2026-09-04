import {
  __TEST_ONLY__,
  clearMapCameraDiagnostics,
  formatMapCameraDiagnosticsReport,
  getMapCameraDiagnosticsSnapshot,
  recordMapCameraDiagnostic,
} from '../utils/mapCameraDiagnostics';

describe('map camera diagnostics', () => {
  let consoleInfoSpy;

  beforeAll(() => {
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleInfoSpy.mockRestore();
  });

  beforeEach(() => {
    __TEST_ONLY__.reset();
    __TEST_ONLY__.setEnabledOverride(true);
  });

  afterEach(() => {
    __TEST_ONLY__.reset();
  });

  test('records ordered camera and gesture evidence', () => {
    recordMapCameraDiagnostic('camera.command', { source: 'detour', routeId: '8A' });
    recordMapCameraDiagnostic('map.gesture.start', { isUserInteraction: true });

    const snapshot = getMapCameraDiagnosticsSnapshot();
    expect(snapshot.eventCount).toBe(2);
    expect(snapshot.events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(snapshot.events[0]).toEqual(expect.objectContaining({
      type: 'camera.command',
      details: { source: 'detour', routeId: '8A' },
    }));
  });

  test('keeps a bounded rolling history', () => {
    for (let index = 0; index < __TEST_ONLY__.MAX_EVENTS + 5; index += 1) {
      recordMapCameraDiagnostic('map.region.changed', { index });
    }

    const snapshot = getMapCameraDiagnosticsSnapshot();
    expect(snapshot.eventCount).toBe(__TEST_ONLY__.MAX_EVENTS);
    expect(snapshot.events[0].details.index).toBe(5);
  });

  test('clear starts a fresh diagnostic session and reports metadata', () => {
    recordMapCameraDiagnostic('camera.command', { source: 'old' });
    clearMapCameraDiagnostics();

    const report = formatMapCameraDiagnosticsReport({ version: '1.0.8', platform: 'android' });
    expect(report).toContain('BTTP map camera diagnostics');
    expect(report).toContain('diagnostics.started');
    expect(report).toContain('"platform": "android"');
    expect(report).not.toContain('"source": "old"');
  });

  test('does nothing when diagnostics are disabled', () => {
    __TEST_ONLY__.setEnabledOverride(false);
    expect(recordMapCameraDiagnostic('camera.command')).toBeNull();
    expect(getMapCameraDiagnosticsSnapshot().eventCount).toBe(0);
  });
});
