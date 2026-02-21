const request = require('supertest');

const ORIGINAL_ENV = process.env;
jest.setTimeout(20000);

function makeFetchResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

describe('api-proxy route hardening', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      LOCATIONIQ_API_KEY: 'test-locationiq-key',
      REQUIRE_API_AUTH: 'true',
      API_PROXY_TOKEN: 'test-proxy-token',
      REQUIRE_FIREBASE_AUTH: 'false',
      DETOUR_WORKER_ENABLED: 'false',
      NEWS_WORKER_ENABLED: 'false',
    };

    global.fetch = jest.fn().mockResolvedValue(makeFetchResponse({ body: [{ ok: true }] }));
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    delete global.fetch;
  });

  test('rejects unauthorized requests to protected API routes', async () => {
    const app = require('../index');
    const response = await request(app).get('/api/geocode?q=maple');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('accepts x-api-token and proxies geocode requests', async () => {
    const app = require('../index');
    const response = await request(app)
      .get('/api/geocode?q=maple')
      .set('x-api-token', 'test-proxy-token');

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('validates reverse-geocode coordinates', async () => {
    const app = require('../index');
    const response = await request(app)
      .get('/api/reverse-geocode?lat=abc&lon=-79.7')
      .set('x-api-token', 'test-proxy-token');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/must be a valid number/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('validates walking-directions coordinate pair format', async () => {
    const app = require('../index');
    const response = await request(app)
      .get('/api/walking-directions?from=44.3,-79.7&to=invalid')
      .set('x-api-token', 'test-proxy-token');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/must use "lat,lon" format/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
