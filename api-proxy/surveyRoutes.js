/**
 * Survey Routes — Express Router for rider feedback surveys.
 *
 * Endpoints:
 *   GET  /config              — Active survey config
 *   POST /submit              — Submit response + update aggregates
 *   GET  /aggregates          — Public aggregate stats
 *   GET  /check-submitted     — Has this user/device already submitted?
 *   GET  /report              — CSV download (admin)
 *   POST /admin/config        — Create/update survey config (admin)
 *   POST /admin/toggle        — Activate/deactivate survey (admin)
 *   POST /send-digest         — Trigger email digest (admin, cron-called)
 */

const express = require('express');
const { getDb } = require('./firebaseAdmin');
const { updateAggregates } = require('./surveyAggregator');

const router = express.Router();

const CONFIG_COLLECTION = 'surveyConfig';
const RESPONSES_COLLECTION = 'surveyResponses';
const AGGREGATES_COLLECTION = 'surveyAggregates';

const SURVEY_ADMIN_API_KEY = (process.env.SURVEY_ADMIN_API_KEY || '').trim();

// ─── Helpers ───────────────────────────────────────────────────

function requireDb(res) {
  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'Firestore not configured' });
    return null;
  }
  return db;
}

function requireAdmin(req, res) {
  if (!SURVEY_ADMIN_API_KEY) {
    res.status(503).json({ error: 'Admin API key not configured' });
    return false;
  }
  const key = req.get('x-admin-key') || '';
  if (key !== SURVEY_ADMIN_API_KEY) {
    res.status(403).json({ error: 'Invalid admin key' });
    return false;
  }
  return true;
}

/**
 * Extract respondent identity from the request.
 * Logged-in users: req.clientId starts with "uid:"
 * Anonymous users: use x-device-id header
 */
function getRespondentId(req) {
  const clientId = req.clientId || '';
  if (clientId.startsWith('uid:')) {
    return { uid: clientId.slice(4), anonymousDeviceId: null };
  }
  const deviceId = (req.get('x-device-id') || '').trim().slice(0, 128);
  return { uid: null, anonymousDeviceId: deviceId || null };
}

// ─── GET /config ───────────────────────────────────────────────

router.get('/config', async (_req, res) => {
  const db = requireDb(res);
  if (!db) return;

  try {
    const snapshot = await db
      .collection(CONFIG_COLLECTION)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json({ survey: null });
    }

    const doc = snapshot.docs[0];
    return res.json({ survey: { id: doc.id, ...doc.data() } });
  } catch (err) {
    console.error('[survey/config] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to load survey config' });
  }
});

// ─── POST /submit ──────────────────────────────────────────────

router.post('/submit', async (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  const { surveyId, surveyVersion, answers, trigger, platform } = req.body || {};

  if (!surveyId || !answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'surveyId and answers are required' });
  }

  const { uid, anonymousDeviceId } = getRespondentId(req);
  if (!uid && !anonymousDeviceId) {
    return res.status(400).json({ error: 'User must be logged in or provide x-device-id header' });
  }

  try {
    // Load survey config for validation
    const configDoc = await db.collection(CONFIG_COLLECTION).doc(surveyId).get();
    if (!configDoc.exists) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    const config = configDoc.data();
    if (!config.isActive) {
      return res.status(410).json({ error: 'Survey is no longer active' });
    }

    // Dedup check
    const isDuplicate = await checkDuplicate(db, surveyId, uid, anonymousDeviceId);
    if (isDuplicate) {
      return res.status(409).json({ error: 'Already submitted', alreadySubmitted: true });
    }

    // Validate required questions
    const questions = config.questions || [];
    for (const q of questions) {
      if (q.required && (!answers[q.id] || !answers[q.id].value)) {
        return res.status(400).json({ error: `Question "${q.id}" is required` });
      }
    }

    // Write response
    const response = {
      surveyId,
      surveyVersion: surveyVersion || config.version || 1,
      respondentId: uid || null,
      anonymousDeviceId: anonymousDeviceId || null,
      answers,
      trigger: trigger || 'profile',
      platform: platform || 'unknown',
      submittedAt: Date.now(),
    };

    await db.collection(RESPONSES_COLLECTION).add(response);

    // Update aggregates (non-transactional, acceptable at this scale)
    const aggRef = db.collection(AGGREGATES_COLLECTION).doc(surveyId);
    const aggDoc = await aggRef.get();
    const currentAgg = aggDoc.exists ? aggDoc.data() : null;
    const updatedAgg = updateAggregates(currentAgg, response, questions);
    await aggRef.set(updatedAgg, { merge: true });

    return res.json({ ok: true, message: 'Response recorded' });
  } catch (err) {
    console.error('[survey/submit] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to submit survey response' });
  }
});

// ─── GET /aggregates ───────────────────────────────────────────

router.get('/aggregates', async (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  const surveyId = (req.query.surveyId || '').trim();
  if (!surveyId) {
    return res.status(400).json({ error: 'surveyId query parameter is required' });
  }

  try {
    const doc = await db.collection(AGGREGATES_COLLECTION).doc(surveyId).get();
    if (!doc.exists) {
      return res.json({ aggregates: null });
    }
    return res.json({ aggregates: doc.data() });
  } catch (err) {
    console.error('[survey/aggregates] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to load aggregates' });
  }
});

// ─── GET /check-submitted ──────────────────────────────────────

router.get('/check-submitted', async (req, res) => {
  const db = requireDb(res);
  if (!db) return;

  const surveyId = (req.query.surveyId || '').trim();
  if (!surveyId) {
    return res.status(400).json({ error: 'surveyId query parameter is required' });
  }

  const { uid, anonymousDeviceId } = getRespondentId(req);
  if (!uid && !anonymousDeviceId) {
    return res.json({ submitted: false });
  }

  try {
    const submitted = await checkDuplicate(db, surveyId, uid, anonymousDeviceId);
    return res.json({ submitted });
  } catch (err) {
    console.error('[survey/check-submitted] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to check submission status' });
  }
});

// ─── GET /report ───────────────────────────────────────────────

router.get('/report', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = requireDb(res);
  if (!db) return;

  const surveyId = (req.query.surveyId || '').trim();
  if (!surveyId) {
    return res.status(400).json({ error: 'surveyId query parameter is required' });
  }

  try {
    const snapshot = await db
      .collection(RESPONSES_COLLECTION)
      .where('surveyId', '==', surveyId)
      .orderBy('submittedAt', 'desc')
      .limit(5000)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'No responses found' });
    }

    // Flatten responses for CSV
    const rows = snapshot.docs.map((doc) => {
      const data = doc.data();
      const row = {
        responseId: doc.id,
        surveyId: data.surveyId,
        respondentId: data.respondentId || 'anonymous',
        trigger: data.trigger,
        platform: data.platform,
        submittedAt: data.submittedAt ? new Date(data.submittedAt).toISOString() : '',
      };
      // Flatten answers into columns
      for (const [qId, answer] of Object.entries(data.answers || {})) {
        row[`answer_${qId}`] = answer.value != null ? String(answer.value) : '';
      }
      return row;
    });

    const { Parser } = require('json2csv');
    const fields = Object.keys(rows[0] || {});
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="survey-${surveyId}-report.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('[survey/report] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ─── POST /admin/config ────────────────────────────────────────

router.post('/admin/config', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = requireDb(res);
  if (!db) return;

  const { surveyId, title, description, questions, isActive } = req.body || {};
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'title and questions array are required' });
  }

  try {
    const docRef = surveyId
      ? db.collection(CONFIG_COLLECTION).doc(surveyId)
      : db.collection(CONFIG_COLLECTION).doc();

    const existing = surveyId ? await docRef.get() : null;
    const version = existing?.exists ? (existing.data().version || 0) + 1 : 1;

    const config = {
      title,
      description: description || '',
      version,
      isActive: isActive !== false,
      questions,
      updatedAt: Date.now(),
    };

    if (!existing?.exists) {
      config.createdAt = Date.now();
    }

    await docRef.set(config, { merge: true });
    return res.json({ ok: true, surveyId: docRef.id, version });
  } catch (err) {
    console.error('[survey/admin/config] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to save survey config' });
  }
});

// ─── POST /admin/toggle ────────────────────────────────────────

router.post('/admin/toggle', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = requireDb(res);
  if (!db) return;

  const surveyId = (req.query.surveyId || '').trim();
  const active = req.query.active === 'true';

  if (!surveyId) {
    return res.status(400).json({ error: 'surveyId query parameter is required' });
  }

  try {
    const docRef = db.collection(CONFIG_COLLECTION).doc(surveyId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    await docRef.update({ isActive: active, updatedAt: Date.now() });
    return res.json({ ok: true, surveyId, isActive: active });
  } catch (err) {
    console.error('[survey/admin/toggle] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to toggle survey' });
  }
});

// ─── POST /send-digest ─────────────────────────────────────────

router.post('/send-digest', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = requireDb(res);
  if (!db) return;

  try {
    const { generateAndSendDigest } = require('./surveyDigest');
    const result = await generateAndSendDigest(db);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[survey/send-digest] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to send digest' });
  }
});

// ─── Dedup Helper ──────────────────────────────────────────────

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

module.exports = router;
