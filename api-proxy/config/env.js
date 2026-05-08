const fs = require('fs');
const path = require('path');
const { getAuth } = require('../firebaseAdmin');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadProxyEnvFiles(baseDir = __dirname) {
  loadEnvFile(path.join(baseDir, '..', '.env'));
  loadEnvFile(path.join(baseDir, '..', '..', '.env'));
}

function buildProxyConfig(env = process.env) {
  const apiKey = (env.LOCATIONIQ_API_KEY || '').trim();
  const isProd = env.NODE_ENV === 'production';

  return {
    port: env.PORT || 3001,
    apiKey,
    baseUrl: 'https://us1.locationiq.com/v1',
    hasLocationIQKey: Boolean(apiKey),
    isProd,
    requireApiAuth: env.REQUIRE_API_AUTH ? env.REQUIRE_API_AUTH === 'true' : true,
    requireFirebaseAuth: env.REQUIRE_FIREBASE_AUTH === 'true',
    allowSharedTokenAuth: env.ALLOW_SHARED_TOKEN_AUTH
      ? env.ALLOW_SHARED_TOKEN_AUTH === 'true'
      : !isProd,
    apiTokens: new Set(
      (env.API_PROXY_TOKENS || env.API_PROXY_TOKEN || '')
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
    ),
    schedulerApiToken: (env.SCHEDULER_API_TOKEN || '').trim(),
    detourDebugApiKey: (env.DETOUR_DEBUG_API_KEY || '').trim(),
    barrieBounds: '-79.85,44.25,-79.55,44.50',
    allowedOrigins: (
      env.ALLOWED_ORIGINS || (isProd ? '' : 'http://localhost:8081,http://localhost:19006')
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function validateProxyConfig(config, env = process.env) {
  if (env.FUNCTIONS_CONTROL_API === 'true') {
    return;
  }

  if (!config.hasLocationIQKey) {
    console.warn('LOCATIONIQ_API_KEY is missing. LocationIQ proxy endpoints will return 503.');
  }

  if (config.isProd && !config.requireApiAuth) {
    throw new Error(
      'Production proxy must require API auth. Set REQUIRE_API_AUTH=true.'
    );
  }

  if (config.isProd && !config.requireFirebaseAuth) {
    throw new Error(
      'Production proxy must use Firebase Bearer auth. Set REQUIRE_FIREBASE_AUTH=true.'
    );
  }

  if (config.isProd && config.allowSharedTokenAuth) {
    throw new Error(
      'Production proxy must disable general shared token auth. Set ALLOW_SHARED_TOKEN_AUTH=false.'
    );
  }

  if (
    config.requireApiAuth &&
    config.allowSharedTokenAuth &&
    config.apiTokens.size === 0 &&
    !config.requireFirebaseAuth
  ) {
    throw new Error(
      'API auth is required but no auth method is configured. ' +
        'Set API_PROXY_TOKEN/API_PROXY_TOKENS or enable REQUIRE_FIREBASE_AUTH.'
    );
  }

  if (config.requireApiAuth && !config.allowSharedTokenAuth && !config.requireFirebaseAuth) {
    throw new Error(
      'API auth is required but shared token auth is disabled and Firebase auth is not enabled.'
    );
  }

  if (config.requireFirebaseAuth && !getAuth()) {
    throw new Error(
      'REQUIRE_FIREBASE_AUTH=true but Firebase Admin SDK is not configured. ' +
        'Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.'
    );
  }

  if (config.isProd && !env.ALLOWED_ORIGINS) {
    console.warn('ALLOWED_ORIGINS is not set. Browser clients will be blocked by CORS.');
  }
}

module.exports = {
  loadEnvFile,
  loadProxyEnvFiles,
  buildProxyConfig,
  validateProxyConfig,
};
