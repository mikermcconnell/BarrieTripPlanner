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

  test('uses built-in public config fallback when production env is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    delete process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
    delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
    delete process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
    delete process.env.EXPO_PUBLIC_API_PROXY_URL;

    const { default: runtimeConfig, hasCriticalStartupIssues } = loadRuntimeConfig();

    expect(hasCriticalStartupIssues).toBe(false);
    expect(runtimeConfig.firebase.isConfigured).toBe(true);
    expect(runtimeConfig.proxy.apiBaseUrl).toBe('https://apiproxy-r7pziiwpua-uc.a.run.app');
  });

  test('uses built-in Google sign-in fallback when Google env is absent', () => {
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
    expect(runtimeConfig.startup.followUpIssues).toEqual([]);
    expect(runtimeConfig.googleAuth.webClientId).toContain('.apps.googleusercontent.com');
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

  test('enables V2 auto detours by built-in fallback for native bundles', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS;
    delete process.env.EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI;
    delete process.env.EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION;

    const { default: runtimeConfig } = loadRuntimeConfig();

    expect(runtimeConfig.detours.enabledByDefault).toBe(true);
    expect(runtimeConfig.detours.activeCollection).toBe('activeDetoursV2');
  });
});

test('reads active detours collection from public env', () => {
  process.env.EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION = 'activeDetoursV2';

  const { default: runtimeConfig } = loadRuntimeConfig();

  expect(runtimeConfig.detours.activeCollection).toBe('activeDetoursV2');
});
