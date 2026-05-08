function hasDetourAdminClaim(auth = {}) {
  return auth?.admin === true || auth?.detourAdmin === true;
}

function isSchedulerClient(req, actionName) {
  return Boolean(actionName) && req?.clientId === `scheduler:${actionName}`;
}

function isNonProductionSharedTokenClient(req, isProd) {
  return !isProd && typeof req?.clientId === 'string' && req.clientId.startsWith('token:');
}

function canManageDetourOperations(req, {
  isProd = process.env.NODE_ENV === 'production',
  schedulerAction = null,
} = {}) {
  return (
    hasDetourAdminClaim(req?.auth) ||
    isSchedulerClient(req, schedulerAction) ||
    isNonProductionSharedTokenClient(req, isProd)
  );
}

function requireDetourAdmin(req, res, options = {}) {
  if (canManageDetourOperations(req, options)) return true;

  res.status(403).json({
    error: 'Detour admin access required',
    message: 'This operation is restricted to detour administrators or trusted scheduler jobs.',
  });
  return false;
}

module.exports = {
  canManageDetourOperations,
  hasDetourAdminClaim,
  requireDetourAdmin,
};
