const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const IS_TEST = process.env.NODE_ENV === 'test';
const IS_PRODUCTION_LIKE = !IS_DEV && !IS_TEST;

const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;

// These values are public client configuration, not secrets. Keeping a checked-in
// fallback prevents native builds or cached bundles from failing startup when
// Expo env injection is unavailable or incomplete.
const BUILT_IN_PUBLIC_ENV = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'AIzaSyB4u2cJOxaqHUH6LY_yFFpQd1Tn-ET8dbs',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'barrie-transit-trip-plan-cc84e.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'barrie-transit-trip-plan-cc84e',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'barrie-transit-trip-plan-cc84e.firebasestorage.app',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '648843426695',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:648843426695:web:14d220f26fb7001a72f122',
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: 'G-S15LSSF2VM',
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:
    '648843426695-7o1ji1vd60fgrckv1gd9kvnqok8uuprl.apps.googleusercontent.com',
  EXPO_PUBLIC_API_PROXY_URL: 'https://apiproxy-r7pziiwpua-uc.a.run.app',
  EXPO_PUBLIC_ENABLE_AUTO_DETOURS: 'false',
  EXPO_PUBLIC_SHOW_LOW_CONFIDENCE_DETOURS: 'false',
};

// Expo only embeds EXPO_PUBLIC_* values in native bundles when they are
// referenced statically. Keep this map explicit; do not replace it with
// dynamic process.env[name] access for app runtime config.
const PUBLIC_ENV = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  EXPO_PUBLIC_API_PROXY_URL: process.env.EXPO_PUBLIC_API_PROXY_URL,
  EXPO_PUBLIC_CORS_PROXY_URL: process.env.EXPO_PUBLIC_CORS_PROXY_URL,
  EXPO_PUBLIC_ENABLE_AUTO_DETOURS: process.env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS,
  EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI: process.env.EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI,
  EXPO_PUBLIC_SHOW_LOW_CONFIDENCE_DETOURS: process.env.EXPO_PUBLIC_SHOW_LOW_CONFIDENCE_DETOURS,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_LOCATIONIQ_API_KEY: process.env.EXPO_PUBLIC_LOCATIONIQ_API_KEY,
  EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ: process.env.EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ,
  EXPO_PUBLIC_API_PROXY_TOKEN: process.env.EXPO_PUBLIC_API_PROXY_TOKEN,
  EXPO_PUBLIC_CORS_PROXY_TOKEN: process.env.EXPO_PUBLIC_CORS_PROXY_TOKEN,
};

const readEnv = (name) => {
  const value = PUBLIC_ENV[name] || BUILT_IN_PUBLIC_ENV[name];
  return hasValue(value) ? value.trim() : '';
};

const hasPublicEnvValue = (name) => hasValue(PUBLIC_ENV[name]);

const readBooleanEnv = (name, defaultValue = false) => {
  const value = readEnv(name).toLowerCase();
  if (!value) return defaultValue;
  return value === 'true';
};

const firebaseConfig = {
  apiKey: readEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: readEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
  measurementId: readEnv('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID'),
};

const googleAuth = {
  webClientId: readEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  iosClientId: readEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
  androidClientId: readEnv('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),
};

const criticalIssues = [];
const followUpIssues = [];

if (IS_PRODUCTION_LIKE) {
  const requiredStartupVars = {
    EXPO_PUBLIC_FIREBASE_API_KEY: firebaseConfig.apiKey,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
    EXPO_PUBLIC_FIREBASE_APP_ID: firebaseConfig.appId,
    EXPO_PUBLIC_API_PROXY_URL: readEnv('EXPO_PUBLIC_API_PROXY_URL'),
  };

  const missingRequiredVars = Object.entries(requiredStartupVars)
    .filter(([, value]) => !hasValue(value))
    .map(([name]) => name);

  if (missingRequiredVars.length > 0) {
    criticalIssues.push(`Missing required environment variables: ${missingRequiredVars.join(', ')}`);
  }

  const insecurePublicVars = [];
  if (hasValue(readEnv('EXPO_PUBLIC_LOCATIONIQ_API_KEY'))) {
    insecurePublicVars.push('EXPO_PUBLIC_LOCATIONIQ_API_KEY');
  }
  if (readEnv('EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ') === 'true') {
    insecurePublicVars.push('EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ=true');
  }
  if (hasValue(readEnv('EXPO_PUBLIC_API_PROXY_TOKEN'))) {
    insecurePublicVars.push('EXPO_PUBLIC_API_PROXY_TOKEN');
  }
  if (hasValue(readEnv('EXPO_PUBLIC_CORS_PROXY_TOKEN'))) {
    insecurePublicVars.push('EXPO_PUBLIC_CORS_PROXY_TOKEN');
  }

  if (insecurePublicVars.length > 0) {
    criticalIssues.push(
      `Insecure public env detected: ${insecurePublicVars.join(', ')}. Use server-side proxy auth with Firebase Bearer tokens.`
    );
  }

  if (!googleAuth.webClientId) {
    followUpIssues.push(
      'Google sign-in is disabled for this build because EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not configured.'
    );
  }
}

const runtimeConfig = {
  isDevelopment: IS_DEV,
  isTest: IS_TEST,
  isProductionLike: IS_PRODUCTION_LIKE,
  firebase: {
    config: firebaseConfig,
    isConfigured: ['apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId'].every(
      (key) => hasValue(firebaseConfig[key])
    ),
  },
  sentry: {
    dsn: readEnv('EXPO_PUBLIC_SENTRY_DSN'),
  },
  proxy: {
    apiBaseUrl: readEnv('EXPO_PUBLIC_API_PROXY_URL'),
    corsBaseUrl: readEnv('EXPO_PUBLIC_CORS_PROXY_URL'),
  },
  detours: {
    enabledByDefault: hasPublicEnvValue('EXPO_PUBLIC_ENABLE_AUTO_DETOURS')
      ? readBooleanEnv('EXPO_PUBLIC_ENABLE_AUTO_DETOURS')
      : readBooleanEnv(
        'EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI',
        readBooleanEnv('EXPO_PUBLIC_ENABLE_AUTO_DETOURS')
      ),
    showLowConfidenceForValidation: readBooleanEnv('EXPO_PUBLIC_SHOW_LOW_CONFIDENCE_DETOURS'),
  },
  googleAuth,
  startup: {
    criticalIssues,
    followUpIssues,
  },
};

export const hasCriticalStartupIssues = criticalIssues.length > 0;
export const GOOGLE_SIGN_IN_DISABLED_MESSAGE =
  'Google sign-in is unavailable in this build. Configure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and rebuild.';

export default runtimeConfig;
