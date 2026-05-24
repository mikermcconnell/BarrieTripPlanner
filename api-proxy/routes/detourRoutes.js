const { createDetourOps, HISTORY_MAX_LIMIT } = require('../services/detourOps');
const { getBaselineStatusWithDivergence } = require('../services/baselineOps');
const { createDetourSimulationOps } = require('../services/detourSimulation');
const { requireDetourAdmin } = require('../middleware/detourAdmin');

function parseDetourLogFilters(req, parseOptionalTimestamp) {
  let limit = 50;
  let routeId = '';
  let eventTypes = [];

  if (req.query.limit != null) {
    const parsedLimit = Number.parseInt(String(req.query.limit), 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > HISTORY_MAX_LIMIT) {
      throw new Error(`Query parameter "limit" must be between 1 and ${HISTORY_MAX_LIMIT}`);
    }
    limit = parsedLimit;
  }

  routeId = req.query.routeId ? String(req.query.routeId).trim() : '';

  if (req.query.eventType != null) {
    eventTypes = String(req.query.eventType)
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
  }

  const startMs = parseOptionalTimestamp(req.query.start, 'start');
  const endMs = parseOptionalTimestamp(req.query.end, 'end');

  if (startMs != null && endMs != null && startMs > endMs) {
    throw new Error('"start" must be less than or equal to "end"');
  }

  return {
    limit,
    routeId,
    eventTypes,
    startMs,
    endMs,
  };
}

function registerDetourRoutes(app, {
  detourWorker,
  parseOptionalTimestamp,
  detourOps = createDetourOps({ detourWorker, getBaselineStatusWithDivergence }),
  detourSimulationOps = createDetourSimulationOps(),
  isProd = process.env.NODE_ENV === 'production',
  allowDetailedRouteDebug = process.env.DETOUR_DEBUG_ROUTE_DETAILS_ENABLED === 'true',
}) {
  app.get('/api/detour-status', (_req, res) => {
    return res.json(detourOps.getStatus());
  });

  app.post('/api/detour-run-once', async (req, res) => {
    try {
      if (detourWorker && !requireDetourAdmin(req, res, {
        isProd,
        schedulerAction: 'detour-run-once',
      })) {
        return;
      }
      const explicitSource = req.query.source ? String(req.query.source).trim() : '';
      const triggerSource = explicitSource || (
        req.clientId === 'scheduler:detour-run-once' ? 'scheduler-primary' : 'manual'
      );
      const result = await detourOps.runOnce({ triggerSource });
      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[detour-run-once] Failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to run detour tick' });
    }
  });

  app.post('/api/detour-simulate', async (req, res) => {
    try {
      const result = await detourSimulationOps.create(req.body || {});
      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[detour-simulate] Failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to publish simulated detour' });
    }
  });

  app.post('/api/detour-simulate/clear', async (req, res) => {
    try {
      const result = await detourSimulationOps.clear(req.body || {});
      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[detour-simulate/clear] Failed:', err.message);
      return res.status(500).json({ ok: false, error: 'Failed to clear simulated detour' });
    }
  });

  app.get('/api/detour-debug', (req, res) => {
    const routeId = req.query.routeId ? String(req.query.routeId).trim() : null;
    const isAdmin =
      req.auth?.admin === true ||
      req.auth?.detourAdmin === true ||
      req.auth?.surveyAdmin === true;

    if (routeId && isProd && !allowDetailedRouteDebug && !isAdmin) {
      return res.status(403).json({
        error: 'Detailed route debug is disabled in production',
        message: 'Use /api/detour-debug without routeId for a safe summary.',
      });
    }

    try {
      return res.json(detourOps.getDebug(routeId));
    } catch (err) {
      console.error('[detour-debug] Failed:', err.message);
      return res.status(500).json({ error: 'Failed to retrieve debug data' });
    }
  });

  app.get('/api/detour-logs', async (req, res) => {
    let filters;
    try {
      filters = parseDetourLogFilters(req, parseOptionalTimestamp);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const result = await detourOps.getLogs(filters);
      return res.json(result);
    } catch (error) {
      console.error('[detour-logs] Failed to query history:', error.message);
      return res.status(500).json({ error: 'Failed to load detour logs' });
    }
  });

  app.get('/api/detour-rollout-health', async (_req, res) => {
    const result = await detourOps.getRolloutHealth();
    return res.json(result);
  });
}

module.exports = {
  parseDetourLogFilters,
  registerDetourRoutes,
};
