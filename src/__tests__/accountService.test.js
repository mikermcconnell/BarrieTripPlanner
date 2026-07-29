const mockGetIdToken = jest.fn();

jest.mock('../config/firebase', () => ({
  auth: { currentUser: { uid: 'user-1', isAnonymous: false, getIdToken: (...args) => mockGetIdToken(...args) } },
}));
jest.mock('../config/runtimeConfig', () => ({
  __esModule: true,
  default: { proxy: { apiBaseUrl: 'https://proxy.example' } },
}));

const { deleteCurrentAccount } = require('../services/accountService');

describe('accountService', () => {
  beforeEach(() => {
    mockGetIdToken.mockReset().mockResolvedValue('firebase-token');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204, json: jest.fn().mockRejectedValue(new Error('empty')) });
  });

  afterEach(() => delete global.fetch);

  test('force-refreshes the token and calls the UID-less deletion endpoint', async () => {
    await expect(deleteCurrentAccount()).resolves.toEqual({ success: true });
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
    expect(global.fetch).toHaveBeenCalledWith('https://proxy.example/api/account', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ Authorization: 'Bearer firebase-token' }),
    }));
    expect(global.fetch.mock.calls[0][0]).not.toContain('user-1');
  });
});
