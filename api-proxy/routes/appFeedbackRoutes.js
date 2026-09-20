'use strict';

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../firebaseAdmin');
const { sendAppFeedbackAlert } = require('../appFeedbackNotifier');
const {
  canManageAppFeedback,
  requireAppFeedbackAdmin,
} = require('../middleware/appFeedbackAdmin');

const APP_FEEDBACK_COLLECTION = 'appFeedback';
const APP_FEEDBACK_RATE_LIMIT_COLLECTION = 'appFeedbackRateLimits';
const ALLOWED_CATEGORIES = new Set(['bug', 'usability', 'idea', 'other']);
const ALLOWED_STATUSES = new Set(['new', 'reviewed', 'resolved']);
const ALLOWED_STATUS_FILTERS = new Set(['all', 'open', ...ALLOWED_STATUSES]);
const ALLOWED_PLATFORMS = new Set(['android', 'ios', 'web']);
const ALLOWED_SOURCES = new Set(['profile', 'help_support', 'settings', 'about']);
const SUBMISSION_LIMIT = 5;
const SUBMISSION_WINDOW_MS = 15 * 60 * 1000;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_FEEDBACK_RETENTION_DAYS = 365;
const DEFAULT_RATE_LIMIT_RETENTION_DAYS = 30;

function normalizeFeedbackInput(body = {}) {
  const platform = typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : '';
  const source = typeof body.source === 'string' ? body.source.trim().toLowerCase() : '';
  return {
    category: body.category.trim().toLowerCase(),
    message: body.message.trim(),
    platform: ALLOWED_PLATFORMS.has(platform) ? platform : 'unknown',
    appVersion: typeof body.appVersion === 'string' ? body.appVersion.trim().slice(0, 40) : '',
    source: ALLOWED_SOURCES.has(source) ? source : 'unknown',
  };
}

function validateFeedbackInput(body = {}) {
  if (typeof body.category !== 'string' || !ALLOWED_CATEGORIES.has(body.category.trim().toLowerCase())) {
    return 'Choose a valid feedback category';
  }
  if (typeof body.message !== 'string') {
    return 'Feedback must be text';
  }
  const message = body.message.trim();
  if (message.length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    return `Feedback must be between ${MIN_MESSAGE_LENGTH} and ${MAX_MESSAGE_LENGTH.toLocaleString()} characters`;
  }
  if (
    body.submissionId != null
    && (typeof body.submissionId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(body.submissionId.trim()))
  ) {
    return 'Invalid feedback submission ID';
  }
  return null;
}

function serializeFeedbackDocument(doc) {
  return { id: doc.id, ...doc.data() };
}

function createAppFeedbackSubmitLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.clientId || 'unauthenticated'),
    message: { error: 'Too many feedback submissions. Please try again later.' },
  });
}

function getFeedbackDocumentId(rawId) {
  const feedbackId = String(rawId || '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(feedbackId) ? feedbackId : null;
}

function getQuotaDocumentId(clientId) {
  return crypto.createHash('sha256').update(String(clientId)).digest('hex');
}

function getIdempotentFeedbackDocumentId(clientId, submissionId) {
  if (!submissionId) return null;
  return crypto.createHash('sha256').update(`${clientId}:${submissionId}`).digest('hex');
}

function parseRetentionDays(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function createFeedbackWithinQuota({
  db,
  clientId,
  feedback,
  timestamp,
  maxSubmissions = SUBMISSION_LIMIT,
  windowMs = SUBMISSION_WINDOW_MS,
  submissionId = null,
  feedbackRetentionDays = DEFAULT_FEEDBACK_RETENTION_DAYS,
  rateLimitRetentionDays = DEFAULT_RATE_LIMIT_RETENTION_DAYS,
}) {
  const windowStartedAt = Math.floor(timestamp / windowMs) * windowMs;
  const quotaRef = db.collection(APP_FEEDBACK_RATE_LIMIT_COLLECTION).doc(getQuotaDocumentId(clientId));
  const feedbackDocumentId = getIdempotentFeedbackDocumentId(clientId, submissionId);
  let feedbackRef = feedbackDocumentId
    ? db.collection(APP_FEEDBACK_COLLECTION).doc(feedbackDocumentId)
    : null;
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(quotaRef);
    if (feedbackDocumentId) {
      const existingFeedback = await transaction.get(feedbackRef);
      if (existingFeedback.exists) {
        return { feedbackId: feedbackRef.id, created: false };
      }
    }
    const current = snapshot.exists ? snapshot.data() : {};
    const count = current.windowStartedAt === windowStartedAt ? Number(current.count) || 0 : 0;
    if (count >= maxSubmissions) return false;
    if (!feedbackRef) feedbackRef = db.collection(APP_FEEDBACK_COLLECTION).doc();
    transaction.set(quotaRef, {
      windowStartedAt,
      count: count + 1,
      updatedAt: timestamp,
      expiresAt: new Date(timestamp + rateLimitRetentionDays * 24 * 60 * 60 * 1000),
    }, { merge: true });
    transaction.set(feedbackRef, {
      ...feedback,
      status: 'new',
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: new Date(timestamp + feedbackRetentionDays * 24 * 60 * 60 * 1000),
    });
    return { feedbackId: feedbackRef.id, created: true };
  });
}

function registerAppFeedbackRoutes(app, {
  dbProvider = getDb,
  env = process.env,
  isProd = env.NODE_ENV === 'production',
  now = () => Date.now(),
  submitLimiter = createAppFeedbackSubmitLimiter(),
  feedbackNotifier = sendAppFeedbackAlert,
} = {}) {
  const guardOptions = { env, isProd };

  app.post('/api/app-feedback', submitLimiter, async (req, res) => {
    if (!req.clientId) {
      return res.status(401).json({ error: 'Authenticated API access is required' });
    }
    const db = dbProvider();
    if (!db) return res.status(503).json({ error: 'Firestore not configured' });

    const validationError = validateFeedbackInput(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const feedback = normalizeFeedbackInput(req.body);

    const timestamp = now();
    try {
      const result = await createFeedbackWithinQuota({
        db,
        clientId: req.clientId,
        feedback,
        timestamp,
        submissionId: typeof req.body.submissionId === 'string' ? req.body.submissionId.trim() : null,
        feedbackRetentionDays: parseRetentionDays(
          env.APP_FEEDBACK_RETENTION_DAYS,
          DEFAULT_FEEDBACK_RETENTION_DAYS
        ),
        rateLimitRetentionDays: parseRetentionDays(
          env.APP_FEEDBACK_RATE_LIMIT_RETENTION_DAYS,
          DEFAULT_RATE_LIMIT_RETENTION_DAYS
        ),
      });
      if (!result) {
        return res.status(429).json({ error: 'Too many feedback submissions. Please try again later.' });
      }
      if (result.created) {
        await feedbackNotifier(feedback, result.feedbackId, { env }).catch((error) => {
          console.error('[app-feedback] Failed to send developer alert:', error.message);
        });
      }
      return res.status(result.created ? 201 : 200).json({
        ok: true,
        feedbackId: result.feedbackId,
        duplicate: !result.created,
      });
    } catch (error) {
      console.error('[app-feedback] Failed to save submission:', error.message);
      return res.status(500).json({ error: 'Failed to submit app feedback' });
    }
  });

  app.get('/api/app-feedback/access', (req, res) => {
    return res.json({ canManage: canManageAppFeedback(req, guardOptions) });
  });

  app.get('/api/app-feedback', async (req, res) => {
    if (!requireAppFeedbackAdmin(req, res, guardOptions)) return;
    const db = dbProvider();
    if (!db) return res.status(503).json({ error: 'Firestore not configured' });

    const requestedLimit = Number.parseInt(String(req.query?.limit || '50'), 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;
    const status = String(req.query?.status || 'open').trim().toLowerCase();
    if (!ALLOWED_STATUS_FILTERS.has(status)) {
      return res.status(400).json({ error: 'Choose a valid feedback status filter' });
    }
    const cursor = req.query?.cursor ? getFeedbackDocumentId(req.query.cursor) : null;
    if (req.query?.cursor && !cursor) {
      return res.status(400).json({ error: 'Invalid feedback cursor' });
    }
    try {
      const collection = db.collection(APP_FEEDBACK_COLLECTION);
      let query = collection;
      if (status === 'open') query = query.where('status', 'in', ['new', 'reviewed']);
      else if (status !== 'all') query = query.where('status', '==', status);
      query = query.orderBy('createdAt', 'desc');
      if (cursor) {
        const cursorDocument = await collection.doc(cursor).get();
        if (!cursorDocument.exists) return res.status(400).json({ error: 'Feedback cursor not found' });
        query = query.startAfter(cursorDocument);
      }
      const snapshot = await query.limit(limit + 1).get();
      const pageDocuments = snapshot.docs.slice(0, limit);
      const nextCursor = snapshot.docs.length > limit
        ? pageDocuments[pageDocuments.length - 1]?.id || null
        : null;
      return res.json({
        feedback: pageDocuments.map(serializeFeedbackDocument),
        nextCursor,
      });
    } catch (error) {
      console.error('[app-feedback] Failed to load inbox:', error.message);
      return res.status(500).json({ error: 'Failed to load app feedback' });
    }
  });

  app.patch('/api/app-feedback/:feedbackId', async (req, res) => {
    if (!requireAppFeedbackAdmin(req, res, guardOptions)) return;
    const db = dbProvider();
    if (!db) return res.status(503).json({ error: 'Firestore not configured' });

    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Choose a valid feedback status' });
    }

    const feedbackId = getFeedbackDocumentId(req.params.feedbackId);
    if (!feedbackId) {
      return res.status(400).json({ error: 'Invalid feedback ID' });
    }

    const timestamp = now();
    const update = {
      status,
      updatedAt: timestamp,
      reviewedBy: req.auth.uid,
      resolvedAt: status === 'resolved' ? timestamp : null,
    };
    try {
      const ref = db.collection(APP_FEEDBACK_COLLECTION).doc(feedbackId);
      const existing = await ref.get();
      if (!existing.exists) return res.status(404).json({ error: 'Feedback not found' });
      await ref.update(update);
      return res.json({ ok: true, feedback: { id: feedbackId, ...existing.data(), ...update } });
    } catch (error) {
      console.error('[app-feedback] Failed to update submission:', error.message);
      return res.status(500).json({ error: 'Failed to update app feedback' });
    }
  });

  app.delete('/api/app-feedback/:feedbackId', async (req, res) => {
    if (!requireAppFeedbackAdmin(req, res, guardOptions)) return;
    const db = dbProvider();
    if (!db) return res.status(503).json({ error: 'Firestore not configured' });

    const feedbackId = getFeedbackDocumentId(req.params.feedbackId);
    if (!feedbackId) return res.status(400).json({ error: 'Invalid feedback ID' });
    try {
      const ref = db.collection(APP_FEEDBACK_COLLECTION).doc(feedbackId);
      const existing = await ref.get();
      if (!existing.exists) return res.status(404).json({ error: 'Feedback not found' });
      await ref.delete();
      return res.status(204).send();
    } catch (error) {
      console.error('[app-feedback] Failed to delete submission:', error.message);
      return res.status(500).json({ error: 'Failed to delete app feedback' });
    }
  });
}

module.exports = {
  ALLOWED_CATEGORIES,
  ALLOWED_STATUSES,
  APP_FEEDBACK_COLLECTION,
  APP_FEEDBACK_RATE_LIMIT_COLLECTION,
  DEFAULT_FEEDBACK_RETENTION_DAYS,
  DEFAULT_RATE_LIMIT_RETENTION_DAYS,
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
  createFeedbackWithinQuota,
  createAppFeedbackSubmitLimiter,
  normalizeFeedbackInput,
  getIdempotentFeedbackDocumentId,
  parseRetentionDays,
  registerAppFeedbackRoutes,
  validateFeedbackInput,
};
