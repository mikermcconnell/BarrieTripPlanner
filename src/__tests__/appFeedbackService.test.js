const mockGetIdToken = jest.fn();

jest.mock('../config/firebase', () => ({
  auth: { currentUser: { uid: 'user-1', getIdToken: (...args) => mockGetIdToken(...args) } },
}));
jest.mock('../config/runtimeConfig', () => ({
  __esModule: true,
  default: { proxy: { apiBaseUrl: 'https://proxy.example/' } },
}));
jest.mock('../config/constants', () => ({ APP_CONFIG: { VERSION: '1.0.6' } }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const { appFeedbackService } = require('../services/appFeedbackService');

describe('appFeedbackService', () => {
  beforeEach(() => {
    mockGetIdToken.mockReset().mockResolvedValue('firebase-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ ok: true }),
    });
  });

  afterEach(() => delete global.fetch);

  test('submits private feedback through the authenticated API proxy', async () => {
    await appFeedbackService.submit({
      category: 'bug',
      message: 'The map did not open.',
      source: 'profile',
      submissionId: 'feedback-submission-test-id',
    });

    expect(global.fetch).toHaveBeenCalledWith('https://proxy.example/api/app-feedback', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
      }),
    }));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      category: 'bug',
      message: 'The map did not open.',
      source: 'profile',
      platform: 'android',
      appVersion: '1.0.6',
      submissionId: 'feedback-submission-test-id',
    });
  });

  test('force-refreshes auth when checking developer access', async () => {
    await appFeedbackService.getAccess();
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  test('requests a filtered cursor page and supports permanent deletion', async () => {
    await appFeedbackService.list({ limit: 50, status: 'reviewed', cursor: 'feedback-1' });
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://proxy.example/api/app-feedback?limit=50&status=reviewed&cursor=feedback-1'
    );

    global.fetch.mockClear();
    await appFeedbackService.remove('feedback-1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://proxy.example/api/app-feedback/feedback-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  test('surfaces the server error message', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ error: 'Feedback is too short' }),
    });
    await expect(appFeedbackService.submit({ category: 'bug', message: 'short' }))
      .rejects.toThrow('Feedback is too short');
  });
});
