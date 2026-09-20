const loadSentryConfig = (runtimeConfig) => {
  jest.resetModules();

  const init = jest.fn();
  const Wrapped = () => null;
  const wrap = jest.fn(() => Wrapped);

  jest.doMock('@sentry/react-native', () => ({ init, wrap }));
  jest.doMock('../config/runtimeConfig', () => ({
    __esModule: true,
    default: runtimeConfig,
  }));

  return {
    ...require('../config/sentry'),
    init,
    wrap,
    Wrapped,
  };
};

describe('Sentry startup configuration', () => {
  test('initializes and wraps a production app when a DSN is configured', () => {
    const config = loadSentryConfig({
      isDevelopment: false,
      isTest: false,
      sentry: { dsn: 'https://public@example.ingest.sentry.io/123' },
    });
    const Root = () => null;

    expect(config.initializeSentry()).toBe(true);
    expect(config.initializeSentry()).toBe(false);
    expect(config.init).toHaveBeenCalledTimes(1);
    expect(config.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://public@example.ingest.sentry.io/123',
      enabled: true,
      sendDefaultPii: false,
    }));
    expect(config.wrapWithSentry(Root)).toBe(config.Wrapped);
    expect(config.wrap).toHaveBeenCalledWith(Root);
  });

  test.each([
    ['development', { isDevelopment: true, isTest: false, sentry: { dsn: 'https://public@example.ingest.sentry.io/123' } }],
    ['test', { isDevelopment: false, isTest: true, sentry: { dsn: 'https://public@example.ingest.sentry.io/123' } }],
    ['missing DSN', { isDevelopment: false, isTest: false, sentry: { dsn: '' } }],
  ])('does not initialize or wrap in %s mode', (_name, runtimeConfig) => {
    const config = loadSentryConfig(runtimeConfig);
    const Root = () => null;

    expect(config.initializeSentry()).toBe(false);
    expect(config.init).not.toHaveBeenCalled();
    expect(config.wrapWithSentry(Root)).toBe(Root);
    expect(config.wrap).not.toHaveBeenCalled();
  });
});

