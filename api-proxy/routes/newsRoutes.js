function canRunNewsOperations(req, {
  isProd = process.env.NODE_ENV === 'production',
  schedulerAction = null,
} = {}) {
  const isAdmin =
    req.auth?.admin === true ||
    req.auth?.detourAdmin === true ||
    req.auth?.surveyAdmin === true;
  const isScheduler =
    schedulerAction && req.clientId === `scheduler:${schedulerAction}`;
  const isNonProductionSharedToken =
    !isProd && typeof req.clientId === 'string' && req.clientId.startsWith('token:');

  return Boolean(isAdmin || isScheduler || isNonProductionSharedToken);
}

function requireNewsOperator(req, res, options = {}) {
  if (canRunNewsOperations(req, options)) return true;

  res.status(403).json({
    error: 'News operator access required',
    message: 'This operation is restricted to administrators or trusted scheduler jobs.',
  });
  return false;
}

function registerNewsRoutes(app, {
  newsWorker,
  isProd = process.env.NODE_ENV === 'production',
}) {
  app.get('/api/news-status', (_req, res) => {
    if (!newsWorker) {
      return res.json({ enabled: false });
    }

    return res.json({ enabled: true, ...newsWorker.getStatus() });
  });

  app.post('/api/news-run-once', async (req, res) => {
    if (!newsWorker) {
      return res.status(503).json({
        ok: false,
        error: 'News worker is disabled',
      });
    }

    if (!requireNewsOperator(req, res, {
      isProd,
      schedulerAction: 'news-run-once',
    })) {
      return;
    }

    try {
      await newsWorker.tick();
      return res.json({
        ok: true,
        status: newsWorker.getStatus(),
      });
    } catch (err) {
      console.error('[news-run-once] Failed:', err.message);
      return res.status(500).json({
        ok: false,
        error: 'Failed to run news tick',
      });
    }
  });
}

module.exports = {
  canRunNewsOperations,
  registerNewsRoutes,
};
