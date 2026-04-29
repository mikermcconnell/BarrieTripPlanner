const fs = require('fs');

function hasFirebaseAdminCredentials(env = process.env) {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) return false;
  return fs.existsSync(env.GOOGLE_APPLICATION_CREDENTIALS);
}

function registerHealthRoutes(app, {
  requireApiAuth,
  requireFirebaseAuth,
  allowSharedTokenAuth,
  sharedTokenConfigured,
  hasLocationIQKey,
  isProd,
  detourDebugApiKey,
  localAiConfig,
}) {
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'api-proxy',
      auth: {
        requireApiAuth,
        requireFirebaseAuth,
        allowSharedTokenAuth,
        sharedTokenConfigured,
      },
      features: {
        locationIqProxyConfigured: hasLocationIQKey,
        detourWorkerEnabled: process.env.DETOUR_WORKER_ENABLED === 'true',
        detourWorkerMode: process.env.DETOUR_WORKER_MODE || 'interval',
        detourHistoryEnabled: process.env.DETOUR_HISTORY_ENABLED !== 'false',
        baselineAutoInitEnabled: process.env.BASELINE_AUTO_INIT === 'true',
        detourRequireSafeBaseline: process.env.DETOUR_REQUIRE_SAFE_BASELINE !== 'false',
        surveyAdminUsesApiAuth: true,
        detourDebugKeyEnabled: !isProd && Boolean(detourDebugApiKey),
        localAiEnabled: Boolean(localAiConfig?.enabled),
        localAiConfigured: Boolean(localAiConfig?.configured),
        firebaseAdminConfigured: hasFirebaseAdminCredentials(process.env),
      },
    });
  });
}

module.exports = {
  registerHealthRoutes,
};
