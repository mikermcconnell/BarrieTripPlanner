describe('detour detection config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  test('keeps six on-route readings as the interval-mode clear default', () => {
    delete process.env.DETOUR_WORKER_MODE;
    delete process.env.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE;

    const config = require('../detour/detectionConfig');

    expect(config.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE).toBe(6);
  });

  test('uses four on-route readings by default in scheduled mode', () => {
    process.env.DETOUR_WORKER_MODE = 'scheduled';
    delete process.env.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE;

    const config = require('../detour/detectionConfig');

    expect(config.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE).toBe(4);
    expect(config.BASE_ROUTE_DETECTOR_CONFIG.clearConsecutiveOnRoute).toBe(4);
  });

  test('allows explicit clear-reading override in scheduled mode', () => {
    process.env.DETOUR_WORKER_MODE = 'scheduled';
    process.env.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE = '7';

    const config = require('../detour/detectionConfig');

    expect(config.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE).toBe(7);
  });

  test('uses three off-route readings as the default detection threshold', () => {
    delete process.env.DETOUR_CONSECUTIVE_READINGS;

    const config = require('../detour/detectionConfig');

    expect(config.CONSECUTIVE_READINGS_REQUIRED).toBe(3);
    expect(config.BASE_ROUTE_DETECTOR_CONFIG.consecutiveReadingsRequired).toBe(3);
  });

  test('requires two unique vehicles for detour publishing by default', () => {
    delete process.env.DETOUR_MIN_UNIQUE_VEHICLES;

    const config = require('../detour/detectionConfig');

    expect(config.DEFAULT_MIN_VEHICLES_FOR_DETOUR).toBe(2);
  });

  test('does not allow env config to weaken publishing below two vehicles', () => {
    process.env.DETOUR_MIN_UNIQUE_VEHICLES = '1';

    const config = require('../detour/detectionConfig');

    expect(config.DEFAULT_MIN_VEHICLES_FOR_DETOUR).toBe(2);
  });

  test('uses two observations as the short-recurring fallback', () => {
    process.env.DETOUR_RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS = 'not-a-number';

    const config = require('../detour/detectionConfig');

    expect(config.RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS).toBe(2);
  });

  test('exposes normal detour candidate memory defaults', () => {
    const config = require('../detour/detectionConfig');

    expect(config.DETOUR_VEHICLE_TRACE_WINDOW_MS).toBe(20 * 60 * 1000);
    expect(config.DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS).toBe(3 * 60 * 60 * 1000);
    expect(config.DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER).toBe(2);
    expect(config.DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS).toBe(10 * 60 * 1000);
    expect(config.DETOUR_CANDIDATE_CONFIRMATION_MAX_MS).toBe(3 * 60 * 60 * 1000);
  });
});
