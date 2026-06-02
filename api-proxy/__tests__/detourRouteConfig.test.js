describe('detour route config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('parses configured detour corridors from route overrides', () => {
    process.env.DETOUR_ROUTE_OVERRIDES_JSON = JSON.stringify({
      '12A': {
        configuredDetourCorridor: {
          entryPoint: { lat: 44.33658333333333, lon: -79.66955555555555 },
          exitPoint: { latitude: 44.33325, longitude: -79.67405555555556 },
          paddingMeters: 250,
          label: 'Saunders-Welham',
        },
      },
    });

    const { getRouteDetectorConfig } = require('../detourRouteConfig');
    const config = getRouteDetectorConfig('12A', {});

    expect(config.staleEntryAnchorMaxGapMeters).toBe(150);
    expect(config.configuredDetourCorridor).toEqual({
      enabled: true,
      entryPoint: { latitude: 44.33658333333333, longitude: -79.66955555555555 },
      exitPoint: { latitude: 44.33325, longitude: -79.67405555555556 },
      paddingMeters: 250,
      label: 'Saunders-Welham',
    });
  });

  test('matches configured route corridors case-insensitively', () => {
    process.env.DETOUR_ROUTE_OVERRIDES_JSON = JSON.stringify({
      '8A': {
        detourCorridor: {
          entryPoint: { lat: 44.39, lon: -79.684 },
          exitPoint: { lat: 44.39, lon: -79.680 },
        },
      },
    });

    const { getRouteDetectorConfig } = require('../detourRouteConfig');
    const config = getRouteDetectorConfig('8a', {});

    expect(config.configuredDetourCorridor).toEqual({
      enabled: true,
      entryPoint: { latitude: 44.39, longitude: -79.684 },
      exitPoint: { latitude: 44.39, longitude: -79.680 },
    });
  });

  test('ignores configured corridors without valid endpoints', () => {
    process.env.DETOUR_ROUTE_OVERRIDES_JSON = JSON.stringify({
      '8A': {
        configuredDetourCorridor: {
          entryPoint: { lat: 'bad', lon: -79.669 },
          exitPoint: { lat: 44.333, lon: -79.674 },
        },
      },
    });

    const { getRouteDetectorConfig } = require('../detourRouteConfig');
    const config = getRouteDetectorConfig('8A', {});

    expect(config.configuredDetourCorridor).toBeUndefined();
  });
});
