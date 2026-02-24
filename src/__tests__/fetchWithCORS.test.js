const LOCAL_PROXY = 'http://127.0.0.1:3001/proxy?url=';
const ALL_ORIGINS_PROXY = 'https://api.allorigins.win/raw?url=';
const CUSTOM_PROXY = 'https://proxy.example.com/proxy?url=';

const loadFetchUtils = (os = 'web', env = {}) => {
  jest.resetModules();

  const loggerWarn = jest.fn();
  process.env = {
    ...process.env,
    EXPO_PUBLIC_ENABLE_PUBLIC_CORS_PROXIES: 'false',
    ...env,
  };

  jest.doMock('react-native', () => ({
    Platform: { OS: os },
  }));

  jest.doMock('../utils/logger', () => ({
    __esModule: true,
    default: {
      warn: loggerWarn,
    },
  }));

  const module = require('../utils/fetchWithCORS');
  return { ...module, loggerWarn };
};

describe('fetchWithCORS', () => {
  const originalEnv = process.env;

  afterEach(() => {
    delete global.fetch;
    process.env = originalEnv;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('uses direct fetch on non-web platforms', async () => {
    const { fetchWithCORS } = loadFetchUtils('ios');
    const response = { status: 200, ok: true };
    global.fetch = jest.fn().mockResolvedValue(response);

    const result = await fetchWithCORS('https://example.com/feed');

    expect(result).toBe(response);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://example.com/feed');
  });

  test('falls back to next proxy when first proxy fails with network error', async () => {
    const { fetchWithCORS, loggerWarn } = loadFetchUtils('web', {
      EXPO_PUBLIC_ENABLE_PUBLIC_CORS_PROXIES: 'true',
    });
    const targetUrl = 'https://example.com/feed';
    const finalResponse = { status: 200, ok: true };

    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(finalResponse);

    const result = await fetchWithCORS(targetUrl);

    expect(result).toBe(finalResponse);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe(`${LOCAL_PROXY}${encodeURIComponent(targetUrl)}`);
    expect(global.fetch.mock.calls[1][0]).toBe(
      `${ALL_ORIGINS_PROXY}${encodeURIComponent(targetUrl)}`
    );
    expect(loggerWarn).toHaveBeenCalled();
  });

  test('falls back to next proxy when proxy returns 5xx', async () => {
    const { fetchWithCORS } = loadFetchUtils('web', {
      EXPO_PUBLIC_ENABLE_PUBLIC_CORS_PROXIES: 'true',
    });
    const targetUrl = 'https://example.com/feed';
    const proxyErrorResponse = { status: 503, ok: false };
    const successResponse = { status: 200, ok: true };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(proxyErrorResponse)
      .mockResolvedValueOnce(successResponse);

    const result = await fetchWithCORS(targetUrl);

    expect(result).toBe(successResponse);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('does not fallback for 400 upstream responses', async () => {
    const { fetchWithCORS } = loadFetchUtils('web');
    const targetUrl = 'https://example.com/feed';
    const badRequestResponse = { status: 400, ok: false };

    global.fetch = jest.fn().mockResolvedValue(badRequestResponse);

    const result = await fetchWithCORS(targetUrl);

    expect(result).toBe(badRequestResponse);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(`${LOCAL_PROXY}${encodeURIComponent(targetUrl)}`);
  });

  test('uses EXPO_PUBLIC_API_PROXY_URL when configured', async () => {
    const { fetchWithCORS } = loadFetchUtils('web', {
      EXPO_PUBLIC_API_PROXY_URL: 'https://proxy.example.com',
    });
    const targetUrl = 'https://example.com/feed';
    const response = { status: 200, ok: true };
    global.fetch = jest.fn().mockResolvedValue(response);

    const result = await fetchWithCORS(targetUrl);

    expect(result).toBe(response);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(`${CUSTOM_PROXY}${encodeURIComponent(targetUrl)}`);
  });
});
