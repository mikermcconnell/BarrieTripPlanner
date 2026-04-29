const mockVerifyIdToken = jest.fn();

jest.mock('../firebaseAdmin', () => ({
  getAuth: () => ({
    verifyIdToken: (...args) => mockVerifyIdToken(...args),
  }),
}));

const {
  sanitizeClientKey,
  createAuthenticateApiRequest,
} = require('../middleware/auth');

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

describe('auth middleware', () => {
  beforeEach(() => {
    mockVerifyIdToken.mockReset();
  });

  test('sanitizeClientKey trims, truncates, and removes unsafe characters', () => {
    const input = '  abc<>def:ghi/jklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz  ';
    expect(sanitizeClientKey(input)).toBe('abcdef:ghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwx');
  });

  test('bypasses auth for health endpoint', async () => {
    const middleware = createAuthenticateApiRequest({
      requireApiAuth: true,
      isProd: false,
      detourDebugApiKey: '',
      allowSharedTokenAuth: true,
      apiTokens: new Set(['token']),
      requireFirebaseAuth: false,
    });
    const next = jest.fn();

    await middleware({ path: '/health', get: jest.fn() }, createMockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('accepts shared token auth when enabled', async () => {
    const middleware = createAuthenticateApiRequest({
      requireApiAuth: true,
      isProd: false,
      detourDebugApiKey: '',
      allowSharedTokenAuth: true,
      apiTokens: new Set(['token']),
      requireFirebaseAuth: false,
    });
    const req = {
      path: '/geocode',
      get: jest.fn((header) => (header === 'x-api-token' ? 'token' : '')),
    };
    const next = jest.fn();

    await middleware(req, createMockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.clientId).toBe('token:token');
  });

  test('accepts debug key for detour debug in non-production', async () => {
    const middleware = createAuthenticateApiRequest({
      requireApiAuth: true,
      isProd: false,
      detourDebugApiKey: 'debug-key',
      allowSharedTokenAuth: false,
      apiTokens: new Set(),
      requireFirebaseAuth: false,
    });
    const req = {
      path: '/detour-debug',
      get: jest.fn((header) => (header === 'x-debug-key' ? 'debug-key' : '')),
    };
    const next = jest.fn();

    await middleware(req, createMockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.clientId).toBe('debug-ops');
  });

  test('accepts Firebase bearer auth when verification succeeds', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-123', admin: true });
    const middleware = createAuthenticateApiRequest({
      requireApiAuth: true,
      isProd: true,
      detourDebugApiKey: '',
      allowSharedTokenAuth: false,
      apiTokens: new Set(),
      requireFirebaseAuth: true,
    });
    const req = {
      path: '/geocode',
      get: jest.fn((header) => (header === 'authorization' ? 'Bearer good-token' : '')),
    };
    const next = jest.fn();

    await middleware(req, createMockRes(), next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('good-token');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.clientId).toBe('uid:user-123');
    expect(req.auth).toEqual({ uid: 'user-123', admin: true });
  });

  test('rejects invalid Firebase bearer auth', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'));
    const middleware = createAuthenticateApiRequest({
      requireApiAuth: true,
      isProd: true,
      detourDebugApiKey: '',
      allowSharedTokenAuth: false,
      apiTokens: new Set(),
      requireFirebaseAuth: true,
    });
    const req = {
      path: '/geocode',
      get: jest.fn((header) => (header === 'authorization' ? 'Bearer bad-token' : '')),
    };
    const res = createMockRes();

    await middleware(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: 'Invalid authorization token' });
  });

  test('rejects unauthorized requests with helpful auth details', async () => {
    const middleware = createAuthenticateApiRequest({
      requireApiAuth: true,
      isProd: false,
      detourDebugApiKey: '',
      allowSharedTokenAuth: true,
      apiTokens: new Set(['token']),
      requireFirebaseAuth: true,
    });
    const req = {
      path: '/geocode',
      get: jest.fn(() => ''),
    };
    const res = createMockRes();

    await middleware(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(res.body.details).toMatch(/x-api-token/);
    expect(res.body.details).toMatch(/Firebase Bearer token/);
  });
});
