const express = require('express');
const request = require('supertest');
const { registerOfficialBaselineImpactRoutes } = require('../routes/officialBaselineImpactRoutes');

describe('officialBaselineImpactRoutes', () => {
  function makeApp({ auth, clientId, worker, promoteOfficialImpacts, isProd = true } = {}) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (auth) req.auth = auth;
      if (clientId) req.clientId = clientId;
      next();
    });
    registerOfficialBaselineImpactRoutes(app, {
      officialBaselineImpactWorker: worker,
      promoteOfficialImpacts,
      isProd,
    });
    return app;
  }

  test('reports disabled status when the worker is not enabled', async () => {
    const app = makeApp();

    const response = await request(app).get('/api/official-impact-status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false });
  });

  test('rejects run-once for non-admin callers', async () => {
    const worker = {
      runOnce: jest.fn().mockResolvedValue({ ok: true }),
      getStatus: jest.fn(() => ({ running: false })),
    };
    const app = makeApp({ auth: { uid: 'rider' }, worker });

    const response = await request(app).post('/api/official-impact-run-once');

    expect(response.status).toBe(403);
    expect(worker.runOnce).not.toHaveBeenCalled();
  });

  test('allows trusted scheduler to run one scan', async () => {
    const worker = {
      runOnce: jest.fn().mockResolvedValue({ ok: true, candidateCount: 1 }),
      getStatus: jest.fn(() => ({ running: false, lastResult: null })),
    };
    const app = makeApp({ clientId: 'scheduler:official-impact-run-once', worker });

    const response = await request(app)
      .post('/api/official-impact-run-once')
      .send({ publishCandidates: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, candidateCount: 1 });
    expect(worker.runOnce).toHaveBeenCalledWith({ publishCandidates: true });
  });

  test('allows detour admin to promote reviewed candidates', async () => {
    const promoteOfficialImpacts = jest.fn().mockResolvedValue({
      ok: true,
      promotedCount: 1,
      missingIds: [],
      skippedIds: [],
    });
    const worker = {
      runOnce: jest.fn(),
      getStatus: jest.fn(() => ({ running: false })),
    };
    const app = makeApp({
      auth: { uid: 'admin', detourAdmin: true },
      worker,
      promoteOfficialImpacts,
    });

    const response = await request(app)
      .post('/api/official-impact-promote')
      .send({ candidateIds: ['baseline-detour-12b-1652'] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      promotedCount: 1,
      missingIds: [],
      skippedIds: [],
    });
    expect(promoteOfficialImpacts).toHaveBeenCalledWith(['baseline-detour-12b-1652']);
  });
});
