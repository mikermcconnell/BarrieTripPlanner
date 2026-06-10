const express = require('express');
const surveyRoutes = require('./surveyRoutes');
const {
  buildProxyConfig,
  validateProxyConfig,
} = require('./config/env');
const {
  createAuthenticateApiRequest,
  createApiRateLimiter,
} = require('./middleware/auth');
const { createCorsMiddleware } = require('./middleware/cors');
const {
  parseLatLon,
  validateLatitude,
  validateLongitude,
  parseCoordinatePair,
  normalizeQuery,
  parseOptionalTimestamp,
} = require('./lib/requestParsing');
const { createLocationIqProxy } = require('./lib/locationIqProxy');
const { registerLocationIqRoutes } = require('./routes/locationIqRoutes');
const { registerHealthRoutes } = require('./routes/healthRoutes');
const { registerDetourRoutes } = require('./routes/detourRoutes');
const { registerBaselineRoutes } = require('./routes/baselineRoutes');
const { registerNewsRoutes } = require('./routes/newsRoutes');
const { registerOfficialBaselineImpactRoutes } = require('./routes/officialBaselineImpactRoutes');
const { registerAiRoutes } = require('./routes/aiRoutes');
const { registerPlatformMapRoutes } = require('./routes/platformMapRoutes');
const { buildLocalAiConfig } = require('./lib/ai/config');

function loadEnabledWorker(env, flagName, modulePath) {
  if (env[flagName] !== 'true') {
    return null;
  }
  return require(modulePath);
}

function createApiProxyApp({
  env = process.env,
  config = buildProxyConfig(env),
  detourWorker = loadEnabledWorker(env, 'DETOUR_WORKER_ENABLED', './detourWorker'),
  newsWorker = loadEnabledWorker(env, 'NEWS_WORKER_ENABLED', './newsWorker'),
  officialBaselineImpactWorker = loadEnabledWorker(
    env,
    'OFFICIAL_BASELINE_IMPACT_WORKER_ENABLED',
    './officialBaselineImpactWorker'
  ),
} = {}) {
  validateProxyConfig(config, env);

  const app = express();

  app.set('trust proxy', 1);
  app.use(createCorsMiddleware({ allowedOrigins: config.allowedOrigins }));
  app.use(express.json());
  app.use('/api', createAuthenticateApiRequest({
    requireApiAuth: config.requireApiAuth,
    isProd: config.isProd,
    detourDebugApiKey: config.detourDebugApiKey,
    allowSharedTokenAuth: config.allowSharedTokenAuth,
    apiTokens: config.apiTokens,
    requireFirebaseAuth: config.requireFirebaseAuth,
    schedulerApiToken: config.schedulerApiToken,
  }));
  app.use('/api/', createApiRateLimiter());

  app.use('/api/survey', surveyRoutes);

  const proxyRequest = createLocationIqProxy({
    hasLocationIQKey: config.hasLocationIQKey,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  registerLocationIqRoutes(app, {
    proxyRequest,
    normalizeQuery,
    parseLatLon,
    validateLatitude,
    validateLongitude,
    parseCoordinatePair,
    barrieBounds: config.barrieBounds,
  });

  registerHealthRoutes(app, {
    requireApiAuth: config.requireApiAuth,
    requireFirebaseAuth: config.requireFirebaseAuth,
    allowSharedTokenAuth: config.allowSharedTokenAuth,
    sharedTokenConfigured: config.apiTokens.size > 0,
    schedulerTokenConfigured: Boolean(config.schedulerApiToken),
    hasLocationIQKey: config.hasLocationIQKey,
    isProd: config.isProd,
    detourDebugApiKey: config.detourDebugApiKey,
    localAiConfig: buildLocalAiConfig(env),
  });
  registerAiRoutes(app);
  registerPlatformMapRoutes(app);

  registerDetourRoutes(app, {
    detourWorker,
    parseOptionalTimestamp,
    isProd: config.isProd,
    allowDetailedRouteDebug: env.DETOUR_DEBUG_ROUTE_DETAILS_ENABLED === 'true',
  });

  registerBaselineRoutes(app, { isProd: config.isProd });
  registerNewsRoutes(app, { newsWorker, isProd: config.isProd });
  registerOfficialBaselineImpactRoutes(app, {
    officialBaselineImpactWorker,
    isProd: config.isProd,
  });

  return {
    app,
    PORT: config.port,
    config,
    detourWorker,
    newsWorker,
    officialBaselineImpactWorker,
  };
}

module.exports = {
  createApiProxyApp,
};

