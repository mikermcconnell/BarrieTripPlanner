const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const IS_TEST = process.env.NODE_ENV === 'test';
const IS_PRODUCTION_LIKE = !IS_DEV && !IS_TEST;

const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;

const readEnv = (name) => {
  const value = process.env[name];
  return hasValue(value) ? value.trim() : '';
};

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
  if (hasValue(process.env.EXPO_PUBLIC_LOCATIONIQ_API_KEY)) {
    insecurePublicVars.push('EXPO_PUBLIC_LOCATIONIQ_API_KEY');
  }
  if (process.env.EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ === 'true') {
    insecurePublicVars.push('EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ=true');
  }
  if (hasValue(process.env.EXPO_PUBLIC_API_PROXY_TOKEN)) {
    insecurePublicVars.push('EXPO_PUBLIC_API_PROXY_TOKEN');
  }
  if (hasValue(process.env.EXPO_PUBLIC_CORS_PROXY_TOKEN)) {
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
    enabledByDefault: readBooleanEnv('EXPO_PUBLIC_ENABLE_AUTO_DETOURS'),
    geometryEnabledByDefault: readBooleanEnv('EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI'),
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
