const {
  getDevDetourFixtures,
  getDevDetourFixturePreset,
  getEnabledDevDetourFixtures,
} = require('../services/devDetourFixtures');

describe('dev detour fixtures', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPreset = process.env.EXPO_PUBLIC_DETOUR_FIXTURE_PRESET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalPreset == null) {
      delete process.env.EXPO_PUBLIC_DETOUR_FIXTURE_PRESET;
    } else {
      process.env.EXPO_PUBLIC_DETOUR_FIXTURE_PRESET = originalPreset;
    }
  });

  test('builds the approved Farmers Market and Saunders/Welham fixtures', () => {
    const fixtures = getDevDetourFixtures('farmers-market,saunders-welham');

    expect(Object.keys(fixtures).sort()).toEqual(['11', '12A', '12B']);
    expect(fixtures['11'].confidence).toBe('high');
    expect(fixtures['11'].entryPoint).toEqual({ latitude: 44.39043, longitude: -79.69007 });
    expect(fixtures['11'].exitPoint).toEqual({ latitude: 44.39267, longitude: -79.68558 });
    expect(fixtures['11'].segments[0].skippedSegmentPolyline).toEqual([
      { latitude: 44.39047, longitude: -79.6855 },
      { latitude: 44.39267, longitude: -79.68558 },
    ]);
    expect(fixtures['11'].segments[0].likelyDetourRoadNames).toEqual([
      'Owen Street',
      'McDonald Street',
      'Mulcaster Street',
    ]);
    expect(fixtures['11'].segments[0].likelyDetourPolyline[0]).toEqual({ latitude: 44.39043, longitude: -79.69007 });
    expect(fixtures['11'].segments[0].likelyDetourPolyline[1]).toEqual({ latitude: 44.39262, longitude: -79.68792 });
    expect(fixtures['11'].segments[0].likelyDetourPolyline).toEqual([
      { latitude: 44.39043, longitude: -79.69007 },
      { latitude: 44.39262, longitude: -79.68792 },
      { latitude: 44.39267, longitude: -79.68558 },
    ]);
    expect(fixtures['11'].segments[0].suppressStopDerivation).toBe(true);
    expect(fixtures['12A'].segments[0].likelyDetourRoadNames).toEqual([
      'Welham Road',
      'Mapleview Drive East',
      'Bayview Drive',
    ]);
  });

  test('does not auto-enable default fixtures during tests', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.EXPO_PUBLIC_DETOUR_FIXTURE_PRESET;

    expect(getDevDetourFixturePreset()).toBe('');
    expect(getEnabledDevDetourFixtures()).toEqual({});
  });

  test('uses explicit fixture preset outside test mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.EXPO_PUBLIC_DETOUR_FIXTURE_PRESET = 'farmers-market';

    expect(Object.keys(getEnabledDevDetourFixtures()).sort()).toEqual(['11']);
  });
});
