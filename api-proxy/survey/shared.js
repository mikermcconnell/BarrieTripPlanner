const { getDb } = require('../firebaseAdmin');

const CONFIG_COLLECTION = 'surveyConfig';
const RESPONSES_COLLECTION = 'surveyResponses';
const AGGREGATES_COLLECTION = 'surveyAggregates';

function requireDb(res) {
  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'Firestore not configured' });
    return null;
  }
  return db;
}

function createSurveyAdminGuard(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const surveyAdminUids = new Set(
    (env.SURVEY_ADMIN_UIDS || '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)
  );

  return function requireSurveyAdmin(req, res) {
    if (!req.clientId) {
      res.status(401).json({ error: 'Survey admin routes require authenticated API access' });
      return false;
    }

    if (!isProd) {
      return true;
    }

    const uid = req.clientId.startsWith('uid:') ? req.clientId.slice(4) : '';
    const hasAdminClaim = req.auth?.admin === true || req.auth?.surveyAdmin === true;
    const isAllowlistedAdmin = uid && surveyAdminUids.has(uid);

    if (!uid || (!hasAdminClaim && !isAllowlistedAdmin)) {
      res.status(403).json({
        error: 'Survey admin routes require an authorized Firebase admin user in production',
      });
      return false;
    }

    return true;
  };
}

function getRespondentId(req) {
  const clientId = req.clientId || '';
  if (clientId.startsWith('uid:')) {
    return { uid: clientId.slice(4), anonymousDeviceId: null };
  }
  const deviceId = (req.get('x-device-id') || '').trim().slice(0, 128);
  return { uid: null, anonymousDeviceId: deviceId || null };
}

async function checkDuplicate(db, surveyId, uid, anonymousDeviceId) {
  let query;
  if (uid) {
    query = db
      .collection(RESPONSES_COLLECTION)
      .where('surveyId', '==', surveyId)
      .where('respondentId', '==', uid)
      .limit(1);
  } else if (anonymousDeviceId) {
    query = db
      .collection(RESPONSES_COLLECTION)
      .where('surveyId', '==', surveyId)
      .where('anonymousDeviceId', '==', anonymousDeviceId)
      .limit(1);
  } else {
    return false;
  }

  const snapshot = await query.get();
  return !snapshot.empty;
}

module.exports = {
  CONFIG_COLLECTION,
  RESPONSES_COLLECTION,
  AGGREGATES_COLLECTION,
  requireDb,
  createSurveyAdminGuard,
  getRespondentId,
  checkDuplicate,
};
