const { createLocationIqProxy } = require('../lib/locationIqProxy');

function createMockRes() {
  return {
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(body) {
      this.body = body;
      return this;
    }),
  };
}

describe('locationIqProxy helper', () => {
  afterEach(() => {
    delete global.fetch;
    jest.useRealTimers();
  });

  test('returns 503 when LocationIQ key is unavailable', async () => {
    const proxyRequest = createLocationIqProxy({
      hasLocationIQKey: false,
      apiKey: '',
      baseUrl: 'https://example.com',
    });
    const res = createMockRes();

    await proxyRequest('search', new URLSearchParams({ q: 'maple' }), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.body).toEqual({ error: 'LocationIQ proxy is not configured' });
  });

  test('calls the upstream service with the expected URL, key, format, and headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ display_name: 'Maple Ave' }]),
    });

    const proxyRequest = createLocationIqProxy({
      hasLocationIQKey: true,
      apiKey: 'abc123',
      baseUrl: 'https://example.com',
    });
    const res = createMockRes();

    await proxyRequest('search', new URLSearchParams({ q: 'maple' }), res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('https://example.com/search?');
    expect(url).toContain('q=maple');
    expect(url).toContain('key=abc123');
    expect(url).toContain('format=json');
    expect(options.headers).toEqual({ 'User-Agent': 'BarrieTransitProxy/1.0' });
    expect(res.body).toEqual([{ display_name: 'Maple Ave' }]);
  });

  test('maps upstream non-ok responses into proxy errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: 'Rate limit exceeded' }),
    });

    const proxyRequest = createLocationIqProxy({
      hasLocationIQKey: true,
      apiKey: 'abc123',
      baseUrl: 'https://example.com',
    });
    const res = createMockRes();

    await proxyRequest('search', new URLSearchParams({ q: 'maple' }), res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.body).toEqual({ error: 'Rate limit exceeded' });
  });

  test('returns 502 for invalid upstream JSON bodies', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not json',
    });

    const proxyRequest = createLocationIqProxy({
      hasLocationIQKey: true,
      apiKey: 'abc123',
      baseUrl: 'https://example.com',
    });
    const res = createMockRes();

    await proxyRequest('search', new URLSearchParams({ q: 'maple' }), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.body).toEqual({ error: 'Invalid upstream response' });
  });

  test('returns 504 when the upstream request times out', async () => {
    global.fetch = jest.fn().mockRejectedValue({ name: 'AbortError' });

    const proxyRequest = createLocationIqProxy({
      hasLocationIQKey: true,
      apiKey: 'abc123',
      baseUrl: 'https://example.com',
    });
    const res = createMockRes();

    await proxyRequest('search', new URLSearchParams({ q: 'maple' }), res);

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.body).toEqual({ error: 'Upstream request timed out' });
  });
});
