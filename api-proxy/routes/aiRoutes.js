const { buildLocalAiConfig } = require('../lib/ai/config');
const { getAiRuntimeStatus } = require('../lib/ai/status');

function registerAiRoutes(app) {
  app.get('/api/ai-status', (_req, res) => {
    const config = buildLocalAiConfig();
    return res.json({
      enabled: config.enabled,
      configured: config.configured,
      provider: config.provider,
      model: config.model || null,
      timeoutMs: config.timeoutMs,
      ...getAiRuntimeStatus(),
    });
  });
}

module.exports = {
  registerAiRoutes,
};
