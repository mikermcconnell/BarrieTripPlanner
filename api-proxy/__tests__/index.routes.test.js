const request = require('supertest');

const ORIGINAL_ENV = process.env;
jest.setTimeout(20000);

function makeFetchResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    async text() {
      return JSON.stringify(body);
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

  test('returns detour logs for authorized requests', async () => {
    const app = require('../index');
    const response = await request(app)
      .get('/api/detour-logs?limit=5')
      .set('x-api-token', 'test-proxy-token');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.logs)).toBe(true);
    expect(response.body.limit).toBe(5);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('validates detour logs limit range', async () => {
    const app = require('../index');
    const response = await request(app)
      .get('/api/detour-logs?limit=9999')
      .set('x-api-token', 'test-proxy-token');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/limit/);
    expect(global.fetch).not.toHaveBeenCalled();
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

  test('fails fast when production auth does not require Firebase bearer tokens', () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'production',
      LOCATIONIQ_API_KEY: 'test-locationiq-key',
      REQUIRE_API_AUTH: 'true',
      REQUIRE_FIREBASE_AUTH: 'false',
      ALLOW_SHARED_TOKEN_AUTH: 'true',
      API_PROXY_TOKEN: 'test-proxy-token',
      DETOUR_WORKER_ENABLED: 'false',
      NEWS_WORKER_ENABLED: 'false',
    };

    expect(() => require('../index')).toThrow(/Production proxy must use Firebase Bearer auth/);
  });

  test('detour-debug endpoint requires auth', async () => {
    const app = require('../index');
    const response = await request(app).get('/api/detour-debug');
    expect(response.status).toBe(401);
  });

  test('detour-debug endpoint accessible with x-api-token', async () => {
    const app = require('../index');
    const response = await request(app)
      .get('/api/detour-debug')
      .set('x-api-token', 'test-proxy-token');
    // Worker not enabled, should return disabled status
    expect(response.status).toBe(200);
    expect(response.body.enabled).toBe(false);
  });

  test('detour-debug endpoint accessible with debug API key', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      LOCATIONIQ_API_KEY: 'test-locationiq-key',
      REQUIRE_API_AUTH: 'true',
      API_PROXY_TOKEN: 'test-proxy-token',
      REQUIRE_FIREBASE_AUTH: 'false',
      DETOUR_WORKER_ENABLED: 'false',
      NEWS_WORKER_ENABLED: 'false',
      DETOUR_DEBUG_API_KEY: 'test-debug-key-123',
    };
    const app = require('../index');
    const response = await request(app)
      .get('/api/detour-debug')
      .set('x-debug-key', 'test-debug-key-123');
    expect(response.status).toBe(200);
  });

  test('detour-debug rejects invalid debug API key', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      LOCATIONIQ_API_KEY: 'test-locationiq-key',
      REQUIRE_API_AUTH: 'true',
      API_PROXY_TOKEN: 'test-proxy-token',
      REQUIRE_FIREBASE_AUTH: 'false',
      DETOUR_WORKER_ENABLED: 'false',
      NEWS_WORKER_ENABLED: 'false',
      DETOUR_DEBUG_API_KEY: 'test-debug-key-123',
    };
    const app = require('../index');
    const response = await request(app)
      .get('/api/detour-debug')
      .set('x-debug-key', 'wrong-key');
    expect(response.status).toBe(401);
  });

  test('detour-status endpoint includes geometry summary', async () => {
    const app = require('../index');
    const response = await request(app)
      .get('/api/detour-status')
      .set('x-api-token', 'test-proxy-token');
    expect(response.status).toBe(200);
    // Worker not enabled, should show disabled
    expect(response.body.enabled).toBe(false);
  });

  test('detour-rollout-health returns disabled when worker is off', async () => {
    const app = require('../index');
    const response = await request(app)
      .get('/api/detour-rollout-health')
      .set('x-api-token', 'test-proxy-token');
    expect(response.status).toBe(200);
    expect(response.body.enabled).toBe(false);
  });
});
