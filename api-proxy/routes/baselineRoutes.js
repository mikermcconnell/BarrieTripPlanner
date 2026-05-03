const {
  getBaselineStatusWithDivergence,
  setBaselineFromLiveGtfs,
  setRouteBaselinesFromLiveGtfs,
  clearCurrentBaseline,
} = require('../services/baselineOps');

function registerBaselineRoutes(app, {
  baselineOps = {
    getBaselineStatusWithDivergence,
    setBaselineFromLiveGtfs,
    setRouteBaselinesFromLiveGtfs,
    clearCurrentBaseline,
  },
} = {}) {
  app.get('/api/baseline-status', async (_req, res) => {
    try {
      const status = await baselineOps.getBaselineStatusWithDivergence();
      return res.json(status);
    } catch (err) {
      console.error('[baseline-status] Failed:', err.message);
      return res.status(500).json({ error: 'Failed to retrieve baseline status' });
    }
  });

  app.post('/api/baseline/set', async (_req, res) => {
    try {
      const result = await baselineOps.setBaselineFromLiveGtfs();
      return res.json(result);
    } catch (err) {
      console.error('[baseline/set] Failed:', err.message);
      return res.status(500).json({ error: 'Failed to set baseline', details: err.message });
    }
  });

  app.post('/api/baseline/routes', async (req, res) => {
    try {
      const routeIds = Array.isArray(req.body?.routeIds)
        ? req.body.routeIds
        : String(req.body?.routeId || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);

      const result = await baselineOps.setRouteBaselinesFromLiveGtfs(routeIds);
      return res.json(result);
    } catch (err) {
      console.error('[baseline/routes] Failed:', err.message);
      return res.status(500).json({ error: 'Failed to set route baselines', details: err.message });
    }
  });

  app.post('/api/baseline/clear', async (_req, res) => {
    try {
      const result = await baselineOps.clearCurrentBaseline();
      return res.json(result);
    } catch (err) {
      console.error('[baseline/clear] Failed:', err.message);
      return res.status(500).json({ error: 'Failed to clear baseline', details: err.message });
    }
  });
}

module.exports = {
  registerBaselineRoutes,
};
