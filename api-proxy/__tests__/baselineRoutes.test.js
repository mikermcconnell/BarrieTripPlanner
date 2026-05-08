const express = require('express');
const request = require('supertest');
const { registerBaselineRoutes } = require('../routes/baselineRoutes');

describe('baselineRoutes authorization', () => {
  function makeApp(auth, baselineOps = {}) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (auth) req.auth = auth;
      next();
    });
    registerBaselineRoutes(app, {
      baselineOps: {
        getBaselineStatusWithDivergence: jest.fn().mockResolvedValue({ loaded: true }),
        setBaselineFromLiveGtfs: jest.fn().mockResolvedValue({ ok: true }),
        setRouteBaselinesFromLiveGtfs: jest.fn().mockResolvedValue({ ok: true }),
        clearCurrentBaseline: jest.fn().mockResolvedValue({ ok: true }),
        ...baselineOps,
      },
    });
    return app;
  }

  test('allows baseline-status for authenticated non-admin callers', async () => {
    const getBaselineStatusWithDivergence = jest.fn().mockResolvedValue({ loaded: true });
    const app = makeApp({ uid: 'ordinary-rider' }, { getBaselineStatusWithDivergence });

    const response = await request(app).get('/api/baseline-status');

    expect(response.status).toBe(200);
    expect(response.body.loaded).toBe(true);
    expect(getBaselineStatusWithDivergence).toHaveBeenCalledTimes(1);
  });

  test('rejects baseline mutation for non-admin callers', async () => {
    const setBaselineFromLiveGtfs = jest.fn().mockResolvedValue({ ok: true });
    const app = makeApp({ uid: 'ordinary-rider' }, { setBaselineFromLiveGtfs });

    const response = await request(app).post('/api/baseline/set');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/detour admin/i);
    expect(setBaselineFromLiveGtfs).not.toHaveBeenCalled();
  });

  test('allows baseline mutation for detour admins', async () => {
    const setRouteBaselinesFromLiveGtfs = jest.fn().mockResolvedValue({ ok: true, updatedRoutes: ['8A'] });
    const app = makeApp({ uid: 'ops-user', detourAdmin: true }, { setRouteBaselinesFromLiveGtfs });

    const response = await request(app)
      .post('/api/baseline/routes')
      .send({ routeIds: ['8A'] });

    expect(response.status).toBe(200);
    expect(setRouteBaselinesFromLiveGtfs).toHaveBeenCalledWith(['8A']);
  });
});
