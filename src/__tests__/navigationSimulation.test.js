const {
  buildNavigationSimulationPath,
  buildSimulatedNavigationLocation,
  getNavigationSimulationProgress,
  isNavigationSimulatorDevEnabled,
  resamplePolylineByDistance,
} = require('../utils/navigationSimulation');

describe('navigationSimulation', () => {
  const transitLeg = {
    mode: 'BUS',
    from: { name: 'Board', lat: 44.389, lon: -79.69, stopId: 'A' },
    intermediateStops: [
      { name: 'Middle', lat: 44.392, lon: -79.687, stopId: 'B' },
    ],
    to: { name: 'Exit', lat: 44.396, lon: -79.682, stopId: 'C' },
  };

  test('builds a repeatable bus-ride path from transit stops', () => {
    const path = buildNavigationSimulationPath(transitLeg, { maxPoints: 12 });

    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual({ latitude: 44.389, longitude: -79.69 });
    expect(path[path.length - 1]).toEqual({ latitude: 44.396, longitude: -79.682 });
  });

  test('does not build a path for walking legs', () => {
    expect(buildNavigationSimulationPath({ mode: 'WALK' })).toEqual([]);
  });

  test('resamples long paths without exceeding the requested max point count', () => {
    const path = resamplePolylineByDistance(
      [
        { latitude: 44.38, longitude: -79.7 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.4, longitude: -79.68 },
      ],
      5
    );

    expect(path.length).toBeLessThanOrEqual(5);
    expect(path[0]).toEqual({ latitude: 44.38, longitude: -79.7 });
    expect(path[path.length - 1]).toEqual({ latitude: 44.4, longitude: -79.68 });
  });

  test('creates high-accuracy simulated navigation locations', () => {
    const path = buildNavigationSimulationPath(transitLeg, { maxPoints: 5 });
    const location = buildSimulatedNavigationLocation(path, 1, 12345);

    expect(location).toMatchObject({
      accuracy: 8,
      simulated: true,
      speed: 8,
      timestamp: 12345,
    });
    expect(Number.isFinite(location.latitude)).toBe(true);
    expect(Number.isFinite(location.longitude)).toBe(true);
    expect(Number.isFinite(location.heading)).toBe(true);
  });

  test('reports clamped simulation progress', () => {
    const path = [{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }];

    expect(getNavigationSimulationProgress(path, -1)).toBe(0);
    expect(getNavigationSimulationProgress(path, 1)).toBe(100);
    expect(getNavigationSimulationProgress(path, 4)).toBe(100);
  });

  test('is dev-only and can be disabled by env value', () => {
    expect(isNavigationSimulatorDevEnabled({ isDev: false })).toBe(false);
    expect(isNavigationSimulatorDevEnabled({ isDev: true, envValue: 'false' })).toBe(false);
    expect(isNavigationSimulatorDevEnabled({ isDev: true })).toBe(true);
  });
});
