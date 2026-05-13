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

  test('builds the approved Saunders/Welham fixture', () => {
    const fixtures = getDevDetourFixtures('saunders-welham');

    expect(Object.keys(fixtures).sort()).toEqual(['12A', '12B']);
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
    process.env.EXPO_PUBLIC_DETOUR_FIXTURE_PRESET = 'saunders-welham';

    expect(Object.keys(getEnabledDevDetourFixtures()).sort()).toEqual(['12A', '12B']);
  });

  test('does not build the removed Farmers Market test fixture', () => {
    expect(getDevDetourFixtures('farmers-market')).toEqual({});
  });
});
