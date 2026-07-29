const { APP_FEEDBACK_MESSAGE_LIMITS } = require('../config/appFeedback');
const {
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
} = require('../../api-proxy/routes/appFeedbackRoutes');

describe('app feedback contract', () => {
  test('keeps client and backend message limits aligned', () => {
    expect(APP_FEEDBACK_MESSAGE_LIMITS).toEqual({
      min: MIN_MESSAGE_LENGTH,
      max: MAX_MESSAGE_LENGTH,
    });
  });
});
