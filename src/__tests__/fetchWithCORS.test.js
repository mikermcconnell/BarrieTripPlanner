const LOCAL_PROXY = 'http://localhost:3001/proxy?url=';
const ALL_ORIGINS_PROXY = 'https://api.allorigins.win/raw?url=';

const loadFetchUtils = (os = 'web') => {
  jest.resetModules();

  const loggerWarn = jest.fn();

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
  afterEach(() => {
    delete global.fetch;
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
    const { fetchWithCORS, loggerWarn } = loadFetchUtils('web');
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
    const { fetchWithCORS } = loadFetchUtils('web');
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

  test('does not fallback for 4xx upstream responses', async () => {
    const { fetchWithCORS } = loadFetchUtils('web');
    const targetUrl = 'https://example.com/feed';
    const notFoundResponse = { status: 404, ok: false };

    global.fetch = jest.fn().mockResolvedValue(notFoundResponse);

    const result = await fetchWithCORS(targetUrl);

    expect(result).toBe(notFoundResponse);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(`${LOCAL_PROXY}${encodeURIComponent(targetUrl)}`);
  });
});
