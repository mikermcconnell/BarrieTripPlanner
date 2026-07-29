const {
  buildFeedbackAlertText,
  parseRecipients,
  sendAppFeedbackAlert,
} = require('../appFeedbackNotifier');

const feedback = {
  category: 'bug',
  message: 'The map button stopped responding.',
  platform: 'android',
  appVersion: '1.0.6',
  source: 'profile',
};

describe('app feedback notifier', () => {
  test('parses configured recipients without empty entries', () => {
    expect(parseRecipients('mike@example.com, ,dev@example.com')).toEqual([
      'mike@example.com',
      'dev@example.com',
    ]);
  });

  test('builds a private plain-text alert', () => {
    const text = buildFeedbackAlertText(feedback, 'feedback-1');
    expect(text).toContain('Feedback ID: feedback-1');
    expect(text).not.toContain('The map button stopped responding.');
  });

  test('skips cleanly when email is not configured', async () => {
    await expect(sendAppFeedbackAlert(feedback, 'feedback-1', { env: {}, fetchImpl: jest.fn() }))
      .resolves.toEqual({ skipped: true, reason: 'RESEND_API_KEY not configured' });
  });

  test('sends through Resend without exposing the API key in content', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    await expect(sendAppFeedbackAlert(feedback, 'feedback-1', {
      env: {
        RESEND_API_KEY: 'secret-key',
        APP_FEEDBACK_ALERT_RECIPIENTS: 'mike@example.com',
      },
      fetchImpl,
    })).resolves.toEqual({ sent: true, recipients: 1 });

    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer secret-key');
    expect(options.body).not.toContain('secret-key');
    expect(JSON.parse(options.body)).toEqual(expect.objectContaining({
      to: ['mike@example.com'],
      subject: 'New app feedback: bug',
    }));
  });
});
