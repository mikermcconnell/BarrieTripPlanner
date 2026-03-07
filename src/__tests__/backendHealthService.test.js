jest.mock('../utils/retryFetch', () => ({
  retryFetch: jest.fn(),
}));

jest.mock('../services/proxyAuth', () => ({
  getApiProxyRequestOptions: jest.fn(),
}));

describe('backendHealthService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('fetchProxyHealth requests the proxy health endpoint with auth headers', async () => {
    const { retryFetch } = require('../utils/retryFetch');
    const { getApiProxyRequestOptions } = require('../services/proxyAuth');
    getApiProxyRequestOptions.mockResolvedValue({
      headers: {
        Authorization: 'Bearer test-token',
      },
    });
    retryFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        timestamp: '2026-03-07T12:00:00.000Z',
      }),
    });

    const { fetchProxyHealth } = require('../services/backendHealthService');
    const result = await fetchProxyHealth();

    expect(getApiProxyRequestOptions).toHaveBeenCalledWith('test-proxy-token');
    expect(retryFetch).toHaveBeenCalledWith(
      'https://proxy.example.com/api/health',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
        },
        maxRetries: 1,
        baseDelayMs: 500,
      })
    );
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      status: 'ok',
      backendTimestamp: '2026-03-07T12:00:00.000Z',
    }));
  });

  test('fetchProxyHealth throws a typed error when the proxy health endpoint fails', async () => {
    const { retryFetch } = require('../utils/retryFetch');
    const { getApiProxyRequestOptions } = require('../services/proxyAuth');
    getApiProxyRequestOptions.mockResolvedValue({ headers: {} });
    retryFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const { fetchProxyHealth } = require('../services/backendHealthService');

    await expect(fetchProxyHealth()).rejects.toMatchObject({
      name: 'BackendHealthError',
      code: 'PROXY_UNAVAILABLE',
    });
  });
});
