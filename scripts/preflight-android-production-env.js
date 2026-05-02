const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { profile: process.env.EAS_BUILD_PROFILE || 'production' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function parseEnvFile(relativePath) {
  const fullPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^(['"])(.*)\1$/, '$2');
    env[key] = value;
  }
  return env;
}

function resolveProfileEnv(easJson, profileName, seen = new Set()) {
  const profile = easJson.build?.[profileName];
  if (!profile || seen.has(profileName)) return {};
  seen.add(profileName);
  const parentEnv = profile.extends ? resolveProfileEnv(easJson, profile.extends, seen) : {};
  return { ...parentEnv, ...(profile.env || {}) };
}

function resolveGoogleServicesPath(env, profileEnv) {
  const configuredPath = env.GOOGLE_SERVICES_JSON || profileEnv.GOOGLE_SERVICES_JSON || './google-services.json';
  const absolutePath = path.resolve(projectRoot, configuredPath);
  return fs.existsSync(absolutePath) ? absolutePath : null;
}

function readGoogleWebClientId(googleServicesPath) {
  if (!googleServicesPath) return '';
  try {
    const json = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
    const clients = Array.isArray(json.client) ? json.client : [];
    for (const client of clients) {
      const oauthClients = Array.isArray(client.oauth_client) ? client.oauth_client : [];
      const webClient = oauthClients.find((oauthClient) => oauthClient.client_type === 3 && hasValue(oauthClient.client_id));
      if (webClient) return String(webClient.client_id).trim();
    }
  } catch {
    return '';
  }
  return '';
}

function hasAndroidOAuthClient(googleServicesPath, packageName) {
  if (!googleServicesPath || !hasValue(packageName)) return false;
  try {
    const json = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
    const clients = Array.isArray(json.client) ? json.client : [];
    return clients.some((client) => {
      const configuredPackage = client.client_info?.android_client_info?.package_name;
      const oauthClients = Array.isArray(client.oauth_client) ? client.oauth_client : [];
      return configuredPackage === packageName && oauthClients.some((oauthClient) => oauthClient.client_type === 1);
    });
  } catch {
    return false;
  }
}

function cleanUrl(value) {
  return hasValue(value) ? value.trim().replace(/\/+$/, '') : '';
}

function main() {
  const { profile } = parseArgs(process.argv);
  const strictProductionProfile = profile === 'production' || profile === 'production-apk';
  const easJson = readJson('eas.json');
  const appBaseJson = readJson('app.base.json');
  const profileEnv = resolveProfileEnv(easJson, profile);
  const fileEnv = profile === 'production' ? parseEnvFile('.env.production') : parseEnvFile('.env');
  const env = { ...fileEnv, ...profileEnv, ...process.env };
  const googleServicesPath = resolveGoogleServicesPath(env, profileEnv);
  const derivedGoogleWebClientId = readGoogleWebClientId(googleServicesPath);
  const androidPackageName = appBaseJson.expo?.android?.package || '';

  if (!hasValue(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) && hasValue(derivedGoogleWebClientId)) {
    env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = derivedGoogleWebClientId;
  }

  const errors = [];
  const warnings = [];

  if (!strictProductionProfile) {
    console.log(`Android production env preflight skipped for non-production profile: ${profile}`);
    return;
  }

  const required = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_API_PROXY_URL',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  ];

  for (const name of required) {
    if (!hasValue(env[name])) errors.push(`Missing ${name}`);
  }

  if (!googleServicesPath && process.env.EAS_BUILD !== 'true') {
    errors.push('Missing google-services.json for local Android build checks');
  }

  const proxyUrl = cleanUrl(env.EXPO_PUBLIC_API_PROXY_URL);
  if (proxyUrl) {
    if (!/^https:\/\//i.test(proxyUrl)) errors.push('EXPO_PUBLIC_API_PROXY_URL must use https for production Android builds');
    if (/localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(proxyUrl)) errors.push('EXPO_PUBLIC_API_PROXY_URL points at a local address');
  }

  const googleWebClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  if (hasValue(googleWebClientId) && !/\.apps\.googleusercontent\.com$/.test(googleWebClientId)) {
    errors.push('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID does not look like a Google OAuth web client ID');
  }

  if (hasValue(googleWebClientId) && !hasAndroidOAuthClient(googleServicesPath, androidPackageName)) {
    errors.push(
      `google-services.json does not include an Android OAuth client for ${androidPackageName}. ` +
        'Add the app signing SHA-1 fingerprint in Firebase/Google Cloud, download the updated google-services.json, and rebuild.'
    );
  }

  const forbidden = [];
  if (hasValue(env.EXPO_PUBLIC_LOCATIONIQ_API_KEY)) forbidden.push('EXPO_PUBLIC_LOCATIONIQ_API_KEY');
  if (String(env.EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ).trim().toLowerCase() === 'true') forbidden.push('EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ=true');
  if (hasValue(env.EXPO_PUBLIC_API_PROXY_TOKEN)) forbidden.push('EXPO_PUBLIC_API_PROXY_TOKEN');
  if (hasValue(env.EXPO_PUBLIC_CORS_PROXY_TOKEN)) forbidden.push('EXPO_PUBLIC_CORS_PROXY_TOKEN');
  if (String(env.EXPO_PUBLIC_ENABLE_PUBLIC_CORS_PROXIES).trim().toLowerCase() === 'true') forbidden.push('EXPO_PUBLIC_ENABLE_PUBLIC_CORS_PROXIES=true');
  if (forbidden.length > 0) errors.push(`Forbidden public production env: ${forbidden.join(', ')}`);

  if (String(env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS).trim().toLowerCase() === 'true') {
    warnings.push('Auto-detours are enabled. Confirm backend Firebase Admin credentials, baseline, and worker ticks before rider testing.');
  }

  console.log(`Android production env preflight (${profile})`);
  console.log(`- API proxy: ${proxyUrl || 'missing'}`);
  console.log(`- Firebase project: ${env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'missing'}`);
  console.log(`- Google web client ID: ${hasValue(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) ? 'present' : 'missing'}`);
  console.log(`- Google services file: ${googleServicesPath ? path.relative(projectRoot, googleServicesPath) : 'EAS secret or missing locally'}`);

  for (const warning of warnings) console.warn(`Warning: ${warning}`);

  if (errors.length > 0) {
    console.error('\nPreflight failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Preflight passed.');
}

main();
