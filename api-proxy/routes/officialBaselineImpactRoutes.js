'use strict';

const { requireDetourAdmin } = require('../middleware/detourAdmin');
const {
  promoteOfficialServiceImpactCandidates,
} = require('../officialServiceImpactPublisher');

function registerOfficialBaselineImpactRoutes(app, {
  officialBaselineImpactWorker,
  promoteOfficialImpacts = promoteOfficialServiceImpactCandidates,
  isProd = process.env.NODE_ENV === 'production',
} = {}) {
  app.get('/api/official-impact-status', (_req, res) => {
    if (!officialBaselineImpactWorker) {
      return res.json({ enabled: false });
    }
    return res.json({
      enabled: true,
      ...officialBaselineImpactWorker.getStatus(),
    });
  });

  app.post('/api/official-impact-run-once', async (req, res) => {
    if (!officialBaselineImpactWorker) {
      return res.status(503).json({
        ok: false,
        error: 'Official baseline impact worker is disabled',
      });
    }

    if (!requireDetourAdmin(req, res, {
      isProd,
      schedulerAction: 'official-impact-run-once',
    })) {
      return;
    }

    try {
      const publishCandidates = req.body?.publishCandidates === true ||
        req.query.publishCandidates === 'true';
      const result = await officialBaselineImpactWorker.runOnce({ publishCandidates });
      return res.json(result);
    } catch (err) {
      console.error('[official-impact-run-once] Failed:', err.message);
      return res.status(500).json({
        ok: false,
        error: 'Failed to run official baseline impact scan',
      });
    }
  });

  app.post('/api/official-impact-promote', async (req, res) => {
    if (!requireDetourAdmin(req, res, { isProd })) {
      return;
    }

    const candidateIds = Array.isArray(req.body?.candidateIds)
      ? req.body.candidateIds
      : req.body?.candidateId
        ? [req.body.candidateId]
        : [];

    if (candidateIds.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'candidateIds is required',
      });
    }

    try {
      const result = await promoteOfficialImpacts(candidateIds);
      return res.json(result);
    } catch (err) {
      console.error('[official-impact-promote] Failed:', err.message);
      return res.status(500).json({
        ok: false,
        error: 'Failed to promote official impact candidates',
      });
    }
  });
}

module.exports = {
  registerOfficialBaselineImpactRoutes,
};
