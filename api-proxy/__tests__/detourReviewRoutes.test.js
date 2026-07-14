const express = require('express');
const request = require('supertest');
const { registerDetourReviewRoutes } = require('../routes/detourReviewRoutes');

function makeApp(auth, reviewOps = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = auth; req.clientId = auth?.uid ? `uid:${auth.uid}` : null; next(); });
  registerDetourReviewRoutes(app, {
    reviewOps: {
      listCases: jest.fn().mockResolvedValue({ cases: [] }),
      getCase: jest.fn().mockResolvedValue(null),
      saveReview: jest.fn().mockResolvedValue({ status: 200, body: { review: {} } }),
      exportCase: jest.fn().mockResolvedValue(null),
      ...reviewOps,
    },
    isProd: true,
    env: { NODE_ENV: 'production', DETOUR_REVIEWER_UIDS: 'mike-uid' },
  });
  return app;
}

describe('detour review routes', () => {
  test('reports access only for the allowlisted detour admin', async () => {
    expect((await request(makeApp({ uid: 'mike-uid', detourAdmin: true })).get('/api/detour-reviews/access')).body)
      .toEqual({ canReview: true });
    expect((await request(makeApp({ uid: 'other', detourAdmin: true })).get('/api/detour-reviews/access')).body)
      .toEqual({ canReview: false });
  });

  test('blocks non-reviewers from reading the queue', async () => {
    const response = await request(makeApp({ uid: 'other', detourAdmin: true })).get('/api/detour-reviews/cases');
    expect(response.status).toBe(403);
  });

  test('passes audited review writes to the service', async () => {
    const saveReview = jest.fn().mockResolvedValue({ status: 200, body: { review: { revision: 1 } } });
    const response = await request(makeApp({ uid: 'mike-uid', detourAdmin: true }, { saveReview }))
      .put('/api/detour-reviews/cases/case-1/review')
      .send({ detectionLabel: 'uncertain', revision: 0 });
    expect(response.status).toBe(200);
    expect(saveReview).toHaveBeenCalledWith('case-1', expect.objectContaining({ detectionLabel: 'uncertain' }), {
      uid: 'mike-uid', email: null,
    });
  });
});
