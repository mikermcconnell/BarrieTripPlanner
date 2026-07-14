'use strict';

const { createDetourReviewOps } = require('../services/detourReviewOps');
const { canReviewDetours, requireDetourReviewer } = require('../middleware/detourReviewer');

function registerDetourReviewRoutes(app, {
  reviewOps = createDetourReviewOps(),
  env = process.env,
  isProd = env.NODE_ENV === 'production',
} = {}) {
  const guardOptions = { env, isProd };

  app.get('/api/detour-reviews/access', (req, res) => {
    return res.json({ canReview: canReviewDetours(req, guardOptions) });
  });

  app.get('/api/detour-reviews/cases', async (req, res) => {
    if (!requireDetourReviewer(req, res, guardOptions)) return;
    try {
      return res.json(await reviewOps.listCases(req.query || {}));
    } catch (error) {
      console.error('[detour-reviews] Failed to load cases:', error.message);
      return res.status(500).json({ error: 'Failed to load detour review cases' });
    }
  });

  app.get('/api/detour-reviews/cases/:caseId/export', async (req, res) => {
    if (!requireDetourReviewer(req, res, guardOptions)) return;
    try {
      const bundle = await reviewOps.exportCase(req.params.caseId);
      if (!bundle) return res.status(404).json({ error: 'Reviewed case not found' });
      const safeFileName = String(req.params.caseId).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 96);
      res.set('Content-Disposition', `attachment; filename="${safeFileName}.json"`);
      return res.json(bundle);
    } catch (error) {
      console.error('[detour-reviews] Failed to export case:', error.message);
      return res.status(500).json({ error: 'Failed to export detour review case' });
    }
  });

  app.get('/api/detour-reviews/cases/:caseId', async (req, res) => {
    if (!requireDetourReviewer(req, res, guardOptions)) return;
    try {
      const reviewCase = await reviewOps.getCase(req.params.caseId);
      return reviewCase
        ? res.json({ case: reviewCase })
        : res.status(404).json({ error: 'Review case not found' });
    } catch (error) {
      console.error('[detour-reviews] Failed to load case:', error.message);
      return res.status(500).json({ error: 'Failed to load detour review case' });
    }
  });

  app.put('/api/detour-reviews/cases/:caseId/review', async (req, res) => {
    if (!requireDetourReviewer(req, res, guardOptions)) return;
    try {
      const result = await reviewOps.saveReview(req.params.caseId, req.body || {}, {
        uid: req.auth?.uid || null,
        email: req.auth?.email || null,
      });
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error('[detour-reviews] Failed to save review:', error.message);
      return res.status(500).json({ error: 'Failed to save detour review' });
    }
  });
}

module.exports = { registerDetourReviewRoutes };
