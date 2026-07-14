'use strict';

function parseReviewerUids(env = process.env) {
  return new Set(String(env.DETOUR_REVIEWER_UIDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
}

function canReviewDetours(req, { env = process.env, isProd = env.NODE_ENV === 'production' } = {}) {
  const uid = req?.auth?.uid || (String(req?.clientId || '').startsWith('uid:')
    ? String(req.clientId).slice(4)
    : '');
  const hasClaim = req?.auth?.admin === true || req?.auth?.detourAdmin === true;
  if (!uid || !hasClaim) return false;
  if (!isProd) return true;
  return parseReviewerUids(env).has(uid);
}

function requireDetourReviewer(req, res, options = {}) {
  if (canReviewDetours(req, options)) return true;
  res.status(403).json({
    error: 'Detour reviewer access required',
    message: 'This tool is restricted to an authorized detour reviewer.',
  });
  return false;
}

module.exports = { canReviewDetours, parseReviewerUids, requireDetourReviewer };
