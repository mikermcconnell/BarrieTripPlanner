'use strict';

function parseAppFeedbackAdminUids(env = process.env) {
  return new Set(String(env.APP_FEEDBACK_ADMIN_UIDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
}

function canManageAppFeedback(req, {
  env = process.env,
} = {}) {
  const uid = req?.auth?.uid || '';
  const hasClaim = req?.auth?.admin === true || req?.auth?.appFeedbackAdmin === true;
  if (!uid || !hasClaim) return false;
  return parseAppFeedbackAdminUids(env).has(uid);
}

function requireAppFeedbackAdmin(req, res, options = {}) {
  if (canManageAppFeedback(req, options)) return true;
  res.status(403).json({
    error: 'App feedback administrator access required',
    message: 'This feedback inbox is restricted to the authorized developer.',
  });
  return false;
}

module.exports = {
  canManageAppFeedback,
  parseAppFeedbackAdminUids,
  requireAppFeedbackAdmin,
};
