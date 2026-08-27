const { getSentryProductionErrors } = require('../../scripts/preflight-android-production-env');

describe('Sentry production preflight', () => {
  test('accepts a configured DSN and source-map token', () => {
    expect(getSentryProductionErrors({
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/123',
      SENTRY_AUTH_TOKEN: 'secret-token',
      SENTRY_DISABLE_AUTO_UPLOAD: 'false',
    })).toEqual([]);
  });

  test('rejects an unobservable production build', () => {
    expect(getSentryProductionErrors({
      EXPO_PUBLIC_SENTRY_DSN: '',
      SENTRY_AUTH_TOKEN: '',
      SENTRY_DISABLE_AUTO_UPLOAD: 'true',
    })).toEqual(expect.arrayContaining([
      'Missing EXPO_PUBLIC_SENTRY_DSN',
      'Missing SENTRY_AUTH_TOKEN for production source-map upload',
      'SENTRY_DISABLE_AUTO_UPLOAD must not be true for production builds',
    ]));
  });

  test('rejects a malformed DSN', () => {
    expect(getSentryProductionErrors({
      EXPO_PUBLIC_SENTRY_DSN: 'not-a-url',
      SENTRY_AUTH_TOKEN: 'secret-token',
    })).toContain('EXPO_PUBLIC_SENTRY_DSN is not a valid URL');
  });
});
