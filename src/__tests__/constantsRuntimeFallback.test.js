describe('constants runtime fallback', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, NODE_ENV: 'production' };
    delete process.env.EXPO_PUBLIC_API_PROXY_URL;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('LocationIQ proxy uses built-in public API proxy when Expo env injection is missing', () => {
    const { LOCATIONIQ_CONFIG } = require('../config/constants.js');

    expect(LOCATIONIQ_CONFIG.PROXY_URL).toBe('https://apiproxy-r7pziiwpua-uc.a.run.app');
  });
});
