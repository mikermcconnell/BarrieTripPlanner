const fs = require('node:fs');
const path = require('node:path');
const appJson = require('./app.base.json');

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function resolveGoogleServicesFile(config) {
  const configuredPath = process.env.GOOGLE_SERVICES_JSON || config?.android?.googleServicesFile || './google-services.json';
  const absolutePath = path.resolve(__dirname, configuredPath);
  return fs.existsSync(absolutePath) ? configuredPath : null;
}

module.exports = ({ config }) => {
  const mergedConfig = {
    ...(appJson?.expo || {}),
    ...(config || {}),
  };
  const resolvedConfig = JSON.parse(JSON.stringify(mergedConfig));
  const googleServicesFile = resolveGoogleServicesFile(resolvedConfig);
  const isEasBuild = process.env.EAS_BUILD === 'true';
  const isEasProductionBuild = isEasBuild && process.env.EAS_BUILD_PROFILE === 'production';

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

  if (googleServicesFile) {
    resolvedConfig.android.googleServicesFile = googleServicesFile;
  } else {
    delete resolvedConfig.android.googleServicesFile;
  }

  return resolvedConfig;
};
