const loadRuntimeConfig = () => {
  jest.resetModules();
  return require('../config/runtimeConfig');
};

describe('runtimeConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('flags missing production startup configuration as critical', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    delete process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
    delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
    delete process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
    delete process.env.EXPO_PUBLIC_API_PROXY_URL;

    const { default: runtimeConfig, hasCriticalStartupIssues } = loadRuntimeConfig();

    expect(hasCriticalStartupIssues).toBe(true);
    expect(runtimeConfig.startup.criticalIssues[0]).toContain('EXPO_PUBLIC_FIREBASE_API_KEY');
    expect(runtimeConfig.startup.criticalIssues[0]).toContain('EXPO_PUBLIC_API_PROXY_URL');
  });

  test('adds a follow-up issue when Google sign-in config is absent', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY = 'firebase-key';
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = 'barrie.firebaseapp.com';
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'barrie-project';
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '123456789';
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID = '1:123456789:web:abcdef';
    process.env.EXPO_PUBLIC_API_PROXY_URL = 'https://proxy.example.com';
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    const { default: runtimeConfig, hasCriticalStartupIssues } = loadRuntimeConfig();

    expect(hasCriticalStartupIssues).toBe(false);
    expect(runtimeConfig.startup.followUpIssues).toContain(
      'Google sign-in is disabled for this build because EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not configured.'
    );
  });

  test('reads detour feature defaults from public env flags', () => {
    process.env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS = 'true';
    process.env.EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI = 'false';

    const { default: runtimeConfig } = loadRuntimeConfig();

    expect(runtimeConfig.detours.enabledByDefault).toBe(true);
  });

  test('falls back to legacy geometry flag when detour flag is unset', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS;
    process.env.EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI = 'true';

    const { default: runtimeConfig } = loadRuntimeConfig();

    expect(runtimeConfig.detours.enabledByDefault).toBe(true);
  });
});
