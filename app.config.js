const fs = require('node:fs');
const path = require('node:path');
const appJson = require('./app.base.json');
const packageJson = require('./package.json');

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function resolveGoogleServicesFile(config) {
  const configuredPath = process.env.GOOGLE_SERVICES_JSON || config?.android?.googleServicesFile || './google-services.json';
  const absolutePath = path.resolve(__dirname, configuredPath);
  return fs.existsSync(absolutePath) ? configuredPath : null;
}

function readGoogleWebClientId(googleServicesFile) {
  if (!googleServicesFile) {
    return null;
  }

  try {
    const absolutePath = path.resolve(__dirname, googleServicesFile);
    const googleServices = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    const clients = Array.isArray(googleServices.client) ? googleServices.client : [];

    for (const client of clients) {
      const oauthClients = Array.isArray(client.oauth_client) ? client.oauth_client : [];
      const webClient = oauthClients.find((oauthClient) => oauthClient.client_type === 3 && hasValue(oauthClient.client_id));
      if (webClient) {
        return String(webClient.client_id).trim();
      }
    }
  } catch {
    return null;
  }

  return null;
}

module.exports = ({ config }) => {
  const appVersion = process.env.EXPO_PUBLIC_APP_VERSION || packageJson.version;
  const mergedConfig = {
    ...(config || {}),
    ...(appJson?.expo || {}),
  };
  const resolvedConfig = JSON.parse(JSON.stringify(mergedConfig));
  const googleServicesFile = resolveGoogleServicesFile(resolvedConfig);
  const isEasBuild = process.env.EAS_BUILD === 'true';
  const isEasProductionBuild = isEasBuild && process.env.EAS_BUILD_PROFILE === 'production';
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || readGoogleWebClientId(googleServicesFile);

  if (hasValue(googleWebClientId) && !hasValue(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)) {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = googleWebClientId;
  }

  if (!googleServicesFile && isEasBuild) {
    throw new Error(
      'Missing Android Firebase config file. Provide GOOGLE_SERVICES_JSON as an EAS file secret or add ./google-services.json.'
    );
  }

  if (isEasProductionBuild && !hasValue(process.env.EXPO_PUBLIC_API_PROXY_URL)) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_PROXY_URL for production EAS build. Set it as an EAS environment variable.'
    );
  }

  if (isEasProductionBuild && !hasValue(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID for production EAS build. Set it as an EAS environment variable or include a web OAuth client in google-services.json.'
    );
  }

  if (isEasProductionBuild) {
    const insecureProductionVars = [];
    if (hasValue(process.env.EXPO_PUBLIC_LOCATIONIQ_API_KEY)) {
      insecureProductionVars.push('EXPO_PUBLIC_LOCATIONIQ_API_KEY');
    }
    if (process.env.EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ === 'true') {
      insecureProductionVars.push('EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ=true');
    }
    if (hasValue(process.env.EXPO_PUBLIC_API_PROXY_TOKEN)) {
      insecureProductionVars.push('EXPO_PUBLIC_API_PROXY_TOKEN');
    }
    if (hasValue(process.env.EXPO_PUBLIC_CORS_PROXY_TOKEN)) {
      insecureProductionVars.push('EXPO_PUBLIC_CORS_PROXY_TOKEN');
    }

    if (insecureProductionVars.length > 0) {
      throw new Error(
        `Insecure production EAS env detected: ${insecureProductionVars.join(', ')}. ` +
        'Use server-side proxy auth with Firebase Bearer tokens.'
      );
    }
  }

  if (!resolvedConfig.android) {
    resolvedConfig.android = {};
  }

  // Single source of truth: package.json version controls Expo version/runtime.
  if (hasValue(appVersion)) {
    resolvedConfig.version = String(appVersion).trim();
  }

  resolvedConfig.runtimeVersion = { policy: 'appVersion' };

  if (googleServicesFile) {
    resolvedConfig.android.googleServicesFile = googleServicesFile;
  } else {
    delete resolvedConfig.android.googleServicesFile;
  }

  resolvedConfig.extra = {
    ...(resolvedConfig.extra || {}),
    publicEnv: {
      EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      EXPO_PUBLIC_API_PROXY_URL: process.env.EXPO_PUBLIC_API_PROXY_URL,
      EXPO_PUBLIC_ENABLE_AUTO_DETOURS: process.env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS,
      EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION: process.env.EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION,
    },
  };

  return resolvedConfig;
};
