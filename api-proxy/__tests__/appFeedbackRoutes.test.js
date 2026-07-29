const express = require('express');
const request = require('supertest');
const { registerAppFeedbackRoutes } = require('../routes/appFeedbackRoutes');

function buildApp({
  auth = null,
  clientId = 'auto',
  listDocuments,
  now = 1_800_000_000_000,
  feedbackNotifier = jest.fn().mockResolvedValue({ sent: true }),
} = {}) {
  const documents = listDocuments || [
    { id: 'feedback-1', data: () => ({ message: 'Saved feedback', status: 'new', createdAt: now }) },
  ];
  const update = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const getDocument = jest.fn().mockResolvedValue({
    exists: true,
    id: 'feedback-1',
    data: () => ({ status: 'new', message: 'Original feedback', createdAt: now }),
  });
  const getList = jest.fn().mockResolvedValue({ docs: documents });
  const limit = jest.fn(() => queryApi);
  const startAfter = jest.fn(() => queryApi);
  const orderBy = jest.fn(() => queryApi);
  const where = jest.fn(() => queryApi);
  const queryApi = { get: getList, limit, orderBy, startAfter, where };
  const existingFeedbackRef = { id: 'feedback-1', get: getDocument, update, delete: remove };
  const newFeedbackRef = { id: 'feedback-new', path: 'appFeedback/feedback-new' };
  const idempotentRefs = new Map();
  const feedbackDoc = jest.fn((id) => {
    if (!id) return newFeedbackRef;
    if (id === 'feedback-1') return existingFeedbackRef;
    if (!idempotentRefs.has(id)) {
      idempotentRefs.set(id, { id, path: `appFeedback/${id}` });
    }
    return idempotentRefs.get(id);
  });
  const feedbackCollection = { ...queryApi, doc: feedbackDoc };

  let quotaState = null;
  const savedIdempotentFeedback = new Set();
  const quotaRef = { path: 'appFeedbackRateLimits/client-hash' };
  const quotaDoc = jest.fn(() => quotaRef);
  const transactionGet = jest.fn(async (ref) => {
    if (ref === quotaRef) {
      return { exists: Boolean(quotaState), data: () => quotaState };
    }
    return { exists: savedIdempotentFeedback.has(ref.id), data: () => ({}) };
  });
  const transactionSet = jest.fn((ref, data) => {
    if (ref === quotaRef) quotaState = data;
    else if (ref.id && ref !== newFeedbackRef) savedIdempotentFeedback.add(ref.id);
  });
  const runTransaction = jest.fn(async (operation) => operation({
    get: transactionGet,
    set: transactionSet,
  }));
  const collection = jest.fn((name) => (
    name === 'appFeedbackRateLimits' ? { doc: quotaDoc } : feedbackCollection
  ));
  const db = { collection, runTransaction };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = auth;
    req.clientId = clientId === 'auto' ? (auth?.uid ? `uid:${auth.uid}` : 'token:local') : clientId;
    next();
  });
  registerAppFeedbackRoutes(app, {
    dbProvider: () => db,
    env: { NODE_ENV: 'production', APP_FEEDBACK_ADMIN_UIDS: 'mike-uid' },
    isProd: true,
    now: () => now,
    submitLimiter: (_req, _res, next) => next(),
    feedbackNotifier,
  });
  return {
    app,
    collection,
    feedbackDoc,
    feedbackNotifier,
    getDocument,
    getList,
    limit,
    orderBy,
    remove,
    runTransaction,
    startAfter,
    transactionSet,
    update,
    where,
  };
}

const validFeedback = {
  category: 'bug',
  message: 'The map button stopped responding.',
  platform: 'android',
  appVersion: '1.0.6',
  source: 'profile',
};

describe('app feedback routes', () => {
  test('requires authenticated API access for submissions', async () => {
    const setup = buildApp({ clientId: null });
    const response = await request(setup.app).post('/api/app-feedback').send(validFeedback);
    expect(response.status).toBe(401);
    expect(setup.feedbackDoc).not.toHaveBeenCalled();
  });

  test('stores only normalized feedback fields without rider identity or email', async () => {
    const setup = buildApp({ auth: { uid: 'rider-1', email: 'rider@example.com' } });
    const response = await request(setup.app).post('/api/app-feedback').send({
      ...validFeedback,
      category: 'BUG',
      message: '  The map button stopped responding.  ',
      email: 'should-not-be-stored@example.com',
      status: 'resolved',
    });

    expect(response.status).toBe(201);
    expect(setup.transactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'feedback-new' }),
      {
        ...validFeedback,
        status: 'new',
        createdAt: 1_800_000_000_000,
        updatedAt: 1_800_000_000_000,
        expiresAt: expect.any(Date),
      }
    );
    expect(setup.runTransaction).toHaveBeenCalledTimes(1);
    expect(setup.feedbackNotifier).toHaveBeenCalledWith(
      validFeedback,
      'feedback-new',
      expect.objectContaining({ env: expect.any(Object) })
    );
  });

  test('rejects invalid types instead of coercing them to strings', async () => {
    const setup = buildApp();
    expect((await request(setup.app).post('/api/app-feedback').send({ ...validFeedback, category: {} })).status).toBe(400);
    expect((await request(setup.app).post('/api/app-feedback').send({ ...validFeedback, message: 1234567890 })).status).toBe(400);
    expect(setup.feedbackDoc).not.toHaveBeenCalled();
  });

  test('rejects feedback shorter than the displayed ten-character minimum', async () => {
    const setup = buildApp();
    const response = await request(setup.app).post('/api/app-feedback').send({
      ...validFeedback,
      message: 'Test',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Feedback must be between 10 and 2,000 characters');
  });

  test('enforces a durable five-submission quota through Firestore', async () => {
    const setup = buildApp({ auth: { uid: 'rider-1' } });
    for (let index = 0; index < 5; index += 1) {
      expect((await request(setup.app).post('/api/app-feedback').send(validFeedback)).status).toBe(201);
    }
    expect((await request(setup.app).post('/api/app-feedback').send(validFeedback)).status).toBe(429);
    expect(setup.feedbackDoc).toHaveBeenCalledTimes(5);
    expect(setup.transactionSet).toHaveBeenCalledTimes(10);
  });

  test('returns the original result for a retried submission without saving or alerting twice', async () => {
    const setup = buildApp({ auth: { uid: 'rider-1' } });
    const body = { ...validFeedback, submissionId: 'feedback-submission-test-id' };

    const first = await request(setup.app).post('/api/app-feedback').send(body);
    const retry = await request(setup.app).post('/api/app-feedback').send(body);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({
      ok: true,
      feedbackId: first.body.feedbackId,
      duplicate: true,
    });
    expect(setup.feedbackNotifier).toHaveBeenCalledTimes(1);
    expect(setup.transactionSet).toHaveBeenCalledTimes(2);
  });

  test('requires the dedicated feedback allowlist and claim', async () => {
    expect((await request(buildApp({ auth: { uid: 'mike-uid', appFeedbackAdmin: true } }).app).get('/api/app-feedback/access')).body)
      .toEqual({ canManage: true });
    expect((await request(buildApp({ auth: { uid: 'other', appFeedbackAdmin: true } }).app).get('/api/app-feedback/access')).body)
      .toEqual({ canManage: false });
    expect((await request(buildApp({ auth: { uid: 'mike-uid', detourAdmin: true } }).app).get('/api/app-feedback/access')).body)
      .toEqual({ canManage: false });
  });

  test('blocks non-developers from reading, updating, or deleting feedback', async () => {
    const setup = buildApp({ auth: { uid: 'other', admin: true } });
    expect((await request(setup.app).get('/api/app-feedback')).status).toBe(403);
    expect((await request(setup.app).patch('/api/app-feedback/feedback-1').send({ status: 'resolved' })).status).toBe(403);
    expect((await request(setup.app).delete('/api/app-feedback/feedback-1')).status).toBe(403);
    expect(setup.update).not.toHaveBeenCalled();
    expect(setup.remove).not.toHaveBeenCalled();
  });

  test('filters and paginates the inbox without losing older open feedback', async () => {
    const documents = [
      { id: 'feedback-2', data: () => ({ status: 'new', createdAt: 2 }) },
      { id: 'feedback-1', data: () => ({ status: 'reviewed', createdAt: 1 }) },
    ];
    const setup = buildApp({ auth: { uid: 'mike-uid', admin: true }, listDocuments: documents });
    const response = await request(setup.app).get('/api/app-feedback?status=open&limit=1');
    expect(response.status).toBe(200);
    expect(setup.where).toHaveBeenCalledWith('status', 'in', ['new', 'reviewed']);
    expect(setup.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(setup.limit).toHaveBeenCalledWith(2);
    expect(response.body.feedback).toHaveLength(1);
    expect(response.body.nextCursor).toBe('feedback-2');
  });

  test('lets the developer update and permanently delete feedback', async () => {
    const setup = buildApp({ auth: { uid: 'mike-uid', admin: true } });
    const updateResponse = await request(setup.app)
      .patch('/api/app-feedback/feedback-1')
      .send({ status: 'resolved' });
    expect(updateResponse.status).toBe(200);
    expect(setup.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'resolved',
      reviewedBy: 'mike-uid',
      resolvedAt: 1_800_000_000_000,
    }));

    expect((await request(setup.app).delete('/api/app-feedback/feedback-1')).status).toBe(204);
    expect(setup.remove).toHaveBeenCalledTimes(1);
  });
});
