const { getUserFacingErrorMessage } = require('../utils/userFacingErrors');

describe('getUserFacingErrorMessage', () => {
  test('hides technical Firebase permission errors', () => {
    const message = getUserFacingErrorMessage(
      new Error('FirebaseError: Missing or insufficient permissions.'),
      'Fallback message'
    );

    expect(message).toBe('You do not have permission to do that. Sign in and try again.');
  });

  test('keeps short safe messages', () => {
    expect(getUserFacingErrorMessage('No survey available right now')).toBe(
      'No survey available right now'
    );
  });

  test('maps network failures to a recovery message', () => {
    expect(getUserFacingErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Check your connection, then try again.'
    );
  });
});
