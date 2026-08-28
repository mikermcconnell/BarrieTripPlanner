const loadLogger = ({ isDev = false } = {}) => {
  jest.resetModules();
  global.__DEV__ = isDev;

  const captureException = jest.fn();
  const setTag = jest.fn();
  const withScope = jest.fn((callback) => callback({ setTag }));
  jest.doMock('@sentry/react-native', () => ({ captureException, withScope }));

  const logger = require('../utils/logger').default;
  return { logger, captureException, setTag, withScope };
};

describe('production logger error capture', () => {
  let consoleError;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    delete global.__DEV__;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('captures the underlying Error instead of the preceding log label', () => {
    const { logger, captureException, setTag } = loadLogger();
    const error = new Error('Google API rejected this sign-in');
    error.code = 'DEVELOPER_ERROR';

    logger.error('Google sign in error:', error);

    expect(captureException).toHaveBeenCalledWith(error);
    expect(setTag).toHaveBeenCalledWith('logger.context', 'Google sign in error');
    expect(setTag).toHaveBeenCalledWith('error.code', 'DEVELOPER_ERROR');
  });

  test('normalizes native error-like objects without capturing the log label', () => {
    const { logger, captureException } = loadLogger();

    logger.error('Google sign in error:', {
      name: 'NativeGoogleSignInError',
      code: 'PLAY_SERVICES_NOT_AVAILABLE',
      message: 'Google Play Services is unavailable',
    });

    const captured = captureException.mock.calls[0][0];
    expect(captured).toBeInstanceOf(Error);
    expect(captured.name).toBe('NativeGoogleSignInError');
    expect(captured.code).toBe('PLAY_SERVICES_NOT_AVAILABLE');
    expect(captured.message).toBe('Google Play Services is unavailable');
  });

  test('retains string-only error reporting', () => {
    const { logger, captureException } = loadLogger();

    logger.error('Startup configuration is invalid');

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0]).toMatchObject({
      message: 'Startup configuration is invalid',
    });
  });

  test('does not send errors to Sentry during development', () => {
    const { logger, captureException } = loadLogger({ isDev: true });

    logger.error('Google sign in error:', new Error('Development-only failure'));

    expect(captureException).not.toHaveBeenCalled();
  });
});
