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
});
