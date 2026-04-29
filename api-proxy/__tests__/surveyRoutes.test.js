const request = require('supertest');

const ORIGINAL_ENV = process.env;
jest.setTimeout(20000);

// Mock Firestore
const mockGet = jest.fn();
const mockAdd = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGetAuth = jest.fn(() => null);
const mockGetSurveyInsights = jest.fn();
const mockGenerateAndStoreSurveyInsight = jest.fn();

const mockDocRef = {
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
};

const mockCollectionRef = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: mockGet,
  add: mockAdd,
  doc: jest.fn(() => mockDocRef),
};

jest.mock('../firebaseAdmin', () => ({
  getDb: jest.fn(() => ({
    collection: jest.fn(() => mockCollectionRef),
  })),
  getAuth: mockGetAuth,
}));

jest.mock('../surveyInsights', () => ({
  getSurveyInsights: (...args) => mockGetSurveyInsights(...args),
  generateAndStoreSurveyInsight: (...args) => mockGenerateAndStoreSurveyInsight(...args),
}));

const MOCK_SURVEY_CONFIG = {
  title: 'Test Survey',
  description: 'A test',
  version: 1,
  isActive: true,
  questions: [
    { id: 'q1', type: 'star_rating', text: 'Rate us', required: true, maxStars: 5 },
    { id: 'q2', type: 'single_select', text: 'Frequency', required: false, options: ['Daily', 'Weekly'] },
  ],
};

describe('surveyRoutes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: 'test',
      LOCATIONIQ_API_KEY: 'test-key',
      REQUIRE_API_AUTH: 'true',
      API_PROXY_TOKEN: 'test-proxy-token',
      REQUIRE_FIREBASE_AUTH: 'false',
      DETOUR_WORKER_ENABLED: 'false',
      NEWS_WORKER_ENABLED: 'false',
    };

    // Reset mock return values
    mockGet.mockReset();
    mockAdd.mockReset();
    mockSet.mockReset();
    mockUpdate.mockReset();
    mockVerifyIdToken.mockReset();
    mockGetAuth.mockReset();
    mockGetSurveyInsights.mockReset();
    mockGenerateAndStoreSurveyInsight.mockReset();
    mockGetAuth.mockReturnValue(null);
    mockGetSurveyInsights.mockResolvedValue(null);
    mockGenerateAndStoreSurveyInsight.mockResolvedValue({
      ok: false,
      skipped: true,
      reason: 'LOCAL_AI_DISABLED',
    });
    mockCollectionRef.where.mockReturnThis();
    mockCollectionRef.orderBy.mockReturnThis();
    mockCollectionRef.limit.mockReturnThis();
    mockCollectionRef.doc.mockReturnValue(mockDocRef);

    app = require('../index');
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('GET /api/survey/config', () => {
    test('returns active survey config', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'survey1', data: () => MOCK_SURVEY_CONFIG }],
      });

      const res = await request(app)
        .get('/api/survey/config')
        .set('x-api-token', 'test-proxy-token');

      expect(res.status).toBe(200);
      expect(res.body.survey).toBeDefined();
      expect(res.body.survey.id).toBe('survey1');
      expect(res.body.survey.title).toBe('Test Survey');
    });

    test('returns null when no active survey', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const res = await request(app)
        .get('/api/survey/config')
        .set('x-api-token', 'test-proxy-token');

      expect(res.status).toBe(200);
      expect(res.body.survey).toBeNull();
    });
  });

  describe('POST /api/survey/submit', () => {
    test('rejects without surveyId', async () => {
      const res = await request(app)
        .post('/api/survey/submit')
        .set('x-api-token', 'test-proxy-token')
        .set('x-device-id', 'device-123')
        .send({ answers: {} });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/surveyId/);
    });

    test('rejects without identity', async () => {
      const res = await request(app)
        .post('/api/survey/submit')
        .set('x-api-token', 'test-proxy-token')
        .send({ surveyId: 'survey1', answers: { q1: { value: 5 } } });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/device-id|logged in/i);
    });

    test('rejects duplicate submission', async () => {
      // Config lookup
      mockGet.mockResolvedValueOnce({ exists: true, data: () => MOCK_SURVEY_CONFIG });
      // Dedup check — already submitted
      mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'existing' }] });

      const res = await request(app)
        .post('/api/survey/submit')
        .set('x-api-token', 'test-proxy-token')
        .set('x-device-id', 'device-123')
        .send({ surveyId: 'survey1', answers: { q1: { value: 5 } } });

      expect(res.status).toBe(409);
      expect(res.body.alreadySubmitted).toBe(true);
    });

    test('accepts valid submission', async () => {
      // Config lookup
      mockGet.mockResolvedValueOnce({ exists: true, data: () => MOCK_SURVEY_CONFIG });
      // Dedup check — not submitted
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
      // Add response
      mockAdd.mockResolvedValueOnce({ id: 'resp-1' });
      // Get aggregates (first response)
      mockGet.mockResolvedValueOnce({ exists: false });
      // Set aggregates
      mockSet.mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/survey/submit')
        .set('x-api-token', 'test-proxy-token')
        .set('x-device-id', 'device-123')
        .send({
          surveyId: 'survey1',
          answers: { q1: { type: 'star_rating', value: 4 } },
          trigger: 'profile',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockAdd).toHaveBeenCalledTimes(1);
    });

    test('validates required questions', async () => {
      // Config lookup
      mockGet.mockResolvedValueOnce({ exists: true, data: () => MOCK_SURVEY_CONFIG });
      // Dedup check — not submitted
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const res = await request(app)
        .post('/api/survey/submit')
        .set('x-api-token', 'test-proxy-token')
        .set('x-device-id', 'device-123')
        .send({
          surveyId: 'survey1',
          answers: { q2: { value: 'Daily' } }, // Missing q1 which is required
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/q1.*required/i);
    });
  });

  describe('GET /api/survey/aggregates', () => {
    test('returns aggregates for a survey', async () => {
      const mockAggregates = {
        totalResponses: 10,
        questionStats: { q1: { average: 4.2, count: 10 } },
      };
      mockGet.mockResolvedValueOnce({ exists: true, data: () => mockAggregates });

      const res = await request(app)
        .get('/api/survey/aggregates?surveyId=survey1')
        .set('x-api-token', 'test-proxy-token');

      expect(res.status).toBe(200);
      expect(res.body.aggregates.totalResponses).toBe(10);
    });

    test('requires surveyId parameter', async () => {
      const res = await request(app)
        .get('/api/survey/aggregates')
        .set('x-api-token', 'test-proxy-token');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/survey/insights', () => {
    test('returns saved survey insights', async () => {
      mockGetSurveyInsights.mockResolvedValueOnce({
        summary: 'Most riders want better evening service.',
        themes: [{ label: 'Evening service', count: 5 }],
      });

      const res = await request(app)
        .get('/api/survey/insights?surveyId=survey1')
        .set('x-api-token', 'test-proxy-token');

      expect(res.status).toBe(200);
      expect(res.body.insights).toEqual(expect.objectContaining({
        summary: 'Most riders want better evening service.',
      }));
    });

    test('requires surveyId parameter', async () => {
      const res = await request(app)
        .get('/api/survey/insights')
        .set('x-api-token', 'test-proxy-token');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/survey/check-submitted', () => {
    test('returns submitted status', async () => {
      mockGet.mockResolvedValueOnce({ empty: false, docs: [{ id: 'resp-1' }] });

      const res = await request(app)
        .get('/api/survey/check-submitted?surveyId=survey1')
        .set('x-api-token', 'test-proxy-token')
        .set('x-device-id', 'device-123');

      expect(res.status).toBe(200);
      expect(res.body.submitted).toBe(true);
    });

    test('returns false when not submitted', async () => {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const res = await request(app)
        .get('/api/survey/check-submitted?surveyId=survey1')
        .set('x-api-token', 'test-proxy-token')
        .set('x-device-id', 'device-123');

      expect(res.status).toBe(200);
      expect(res.body.submitted).toBe(false);
    });
  });

  describe('Admin endpoints', () => {
    test('POST /admin/config still requires authenticated api access', async () => {
      const res = await request(app)
        .post('/api/survey/admin/config')
        .send({ title: 'Test', questions: [{ id: 'q1' }] });

      expect(res.status).toBe(401);
    });

    test('POST /admin/config creates survey for authenticated non-production callers', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      mockSet.mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/survey/admin/config')
        .set('x-api-token', 'test-proxy-token')
        .send({
          title: 'New Survey',
          questions: [{ id: 'q1', type: 'star_rating', text: 'Rate?', required: true }],
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.version).toBe(1);
    });

    test('POST /admin/toggle rejects unauthenticated callers', async () => {
      const res = await request(app)
        .post('/api/survey/admin/toggle?surveyId=survey1&active=false');

      expect(res.status).toBe(401);
    });

    test('POST /admin/toggle activates/deactivates survey for authenticated callers', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => MOCK_SURVEY_CONFIG });
      mockUpdate.mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/survey/admin/toggle?surveyId=survey1&active=false')
        .set('x-api-token', 'test-proxy-token');

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });

    test('POST /admin/config accepts Firebase bearer auth in production', async () => {
      process.env = {
        ...ORIGINAL_ENV,
        NODE_ENV: 'production',
        LOCATIONIQ_API_KEY: 'test-key',
        REQUIRE_API_AUTH: 'true',
        REQUIRE_FIREBASE_AUTH: 'true',
        ALLOW_SHARED_TOKEN_AUTH: 'false',
        DETOUR_WORKER_ENABLED: 'false',
        NEWS_WORKER_ENABLED: 'false',
        FIREBASE_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
      };

      mockGetAuth.mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'admin-user-1', surveyAdmin: true });
      mockGet.mockResolvedValueOnce({ exists: false });
      mockSet.mockResolvedValueOnce();

      jest.resetModules();
      app = require('../index');

      const res = await request(app)
        .post('/api/survey/admin/config')
        .set('authorization', 'Bearer production-admin-token')
        .send({
          title: 'Prod Survey',
          questions: [{ id: 'q1', type: 'star_rating', text: 'Rate?', required: true }],
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockVerifyIdToken).toHaveBeenCalledWith('production-admin-token');
    });

    test('POST /admin/config rejects non-admin Firebase users in production', async () => {
      process.env = {
        ...ORIGINAL_ENV,
        NODE_ENV: 'production',
        LOCATIONIQ_API_KEY: 'test-key',
        REQUIRE_API_AUTH: 'true',
        REQUIRE_FIREBASE_AUTH: 'true',
        ALLOW_SHARED_TOKEN_AUTH: 'false',
        DETOUR_WORKER_ENABLED: 'false',
        NEWS_WORKER_ENABLED: 'false',
        FIREBASE_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
      };

      mockGetAuth.mockReturnValue({ verifyIdToken: mockVerifyIdToken });
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'regular-user-1' });

      jest.resetModules();
      app = require('../index');

      const res = await request(app)
        .post('/api/survey/admin/config')
        .set('authorization', 'Bearer production-user-token')
        .send({
          title: 'Prod Survey',
          questions: [{ id: 'q1', type: 'star_rating', text: 'Rate?', required: true }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/authorized Firebase admin/i);
    });

    test('POST /admin/generate-summary validates numeric inputs', async () => {
      const res = await request(app)
        .post('/api/survey/admin/generate-summary')
        .set('x-api-token', 'test-proxy-token')
        .send({ surveyId: 'survey1', windowHours: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/windowHours/i);
    });

    test('POST /admin/generate-summary runs survey insights generation for authenticated callers', async () => {
      mockGenerateAndStoreSurveyInsight.mockResolvedValueOnce({
        ok: true,
        skipped: false,
        insight: {
          surveyId: 'survey1',
          responseCount: 12,
          summary: 'Riders are focused on reliability.',
        },
      });

      const res = await request(app)
        .post('/api/survey/admin/generate-summary')
        .set('x-api-token', 'test-proxy-token')
        .send({ surveyId: 'survey1', windowHours: 48, limit: 150 });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.insight.surveyId).toBe('survey1');
      expect(mockGenerateAndStoreSurveyInsight).toHaveBeenCalledWith(
        expect.anything(),
        {
          surveyId: 'survey1',
          windowHours: 48,
          limit: 150,
        }
      );
    });
  });
});
