const { getAuth, getDb } = require('../firebaseAdmin');

const RECENT_AUTH_MAX_AGE_SECONDS = 5 * 60;

function readBearerToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function registerAccountRoutes(app, {
  authProvider = getAuth,
  dbProvider = getDb,
  now = () => Date.now(),
} = {}) {
  app.delete('/api/account', async (req, res) => {
    const token = readBearerToken(req);
    if (!token) return res.status(401).json({ error: 'A signed-in account is required.' });

    const auth = authProvider();
    const db = dbProvider();
    if (!auth || !db) return res.status(503).json({ error: 'Account deletion is temporarily unavailable.' });

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token, true);
    } catch {
      return res.status(401).json({ error: 'Your sign-in has expired. Sign in again and retry.' });
    }

    const authTimeSeconds = Number(decoded.auth_time);
    const authAgeSeconds = Math.floor(now() / 1000) - authTimeSeconds;
    if (
      !decoded.uid ||
      !Number.isFinite(authTimeSeconds) ||
      authAgeSeconds < 0 ||
      authAgeSeconds > RECENT_AUTH_MAX_AGE_SECONDS
    ) {
      return res.status(401).json({ error: 'For security, sign out, sign back in, and try again.' });
    }

    try {
      const userRef = db.collection('users').doc(decoded.uid);
      await db.recursiveDelete(userRef);
      await auth.deleteUser(decoded.uid);
      return res.status(204).send();
    } catch (error) {
      console.error('[account/delete] Failed:', error?.code || error?.name || 'unknown');
      return res.status(500).json({ error: 'Could not finish deleting your account. Sign in again and retry.' });
    }
  });
}

module.exports = {
  RECENT_AUTH_MAX_AGE_SECONDS,
  readBearerToken,
  registerAccountRoutes,
};
