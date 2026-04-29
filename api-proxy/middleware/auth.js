const rateLimit = require('express-rate-limit');
const { getAuth } = require('../firebaseAdmin');

function sanitizeClientKey(raw) {
  if (!raw) return '';
  return String(raw).trim().slice(0, 64).replace(/[^a-zA-Z0-9_.:-]/g, '');
}

function createAuthenticateApiRequest({
  requireApiAuth,
  isProd,
  detourDebugApiKey,
  allowSharedTokenAuth,
  apiTokens,
  requireFirebaseAuth,
}) {
  return async function authenticateApiRequest(req, res, next) {
    if (req.path === '/health') return next();
    if (!requireApiAuth) return next();

    if (!isProd && req.path === '/detour-debug' && detourDebugApiKey) {
      const debugKey = req.get('x-debug-key');
      if (debugKey && debugKey === detourDebugApiKey) {
        req.clientId = 'debug-ops';
        return next();
      }
    }

    const headerToken = req.get('x-api-token');
    if (allowSharedTokenAuth && headerToken && apiTokens.has(headerToken.trim())) {
      req.clientId = `token:${headerToken.trim().slice(0, 8)}`;
      return next();
    }

    const authHeader = req.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (bearer && requireFirebaseAuth) {
      try {
        const decoded = await getAuth().verifyIdToken(bearer);
        req.clientId = `uid:${decoded.uid}`;
        req.auth = decoded;
        return next();
      } catch (_error) {
        return res.status(401).json({ error: 'Invalid authorization token' });
      }
    }

    return res.status(401).json({
      error: 'Unauthorized',
      details: `Provide ${
        [
          allowSharedTokenAuth ? 'x-api-token' : null,
          requireFirebaseAuth ? 'a valid Firebase Bearer token' : null,
        ]
          .filter(Boolean)
          .join(' or ')
      }`,
    });
  };
}

function createApiRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    keyGenerator: (req) => {
      const auth = sanitizeClientKey(req.clientId);
      return auth || req.ip;
    },
  });
}

module.exports = {
  sanitizeClientKey,
  createAuthenticateApiRequest,
  createApiRateLimiter,
};
