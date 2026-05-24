const express = require('express');
const request = require('supertest');
const { registerDetourRoutes } = require('../routes/detourRoutes');

describe('detourRoutes', () => {
  test('passes scheduler trigger source into detour run-once ops', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.clientId = 'scheduler:detour-run-once';
      next();
    });
    const runOnce = jest.fn().mockResolvedValue({
      status: 200,
      body: { ok: true },
    });

    registerDetourRoutes(app, {
      detourWorker: {
        getStatus: () => ({ running: false }),
      },
      detourOps: {
        getStatus: jest.fn(),
        runOnce,
        getDebug: jest.fn(),
        getLogs: jest.fn(),
        getRolloutHealth: jest.fn(),
      },
      parseOptionalTimestamp: () => null,
    });

    const response = await request(app).post('/api/detour-run-once');

    expect(response.status).toBe(200);
    expect(runOnce).toHaveBeenCalledWith({ triggerSource: 'scheduler-primary' });
  });

  test('passes explicit offset trigger source into detour run-once ops', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.clientId = 'scheduler:detour-run-once';
      next();
    });
    const runOnce = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } });

    registerDetourRoutes(app, {
      detourWorker: { getStatus: () => ({ running: false }) },
      detourOps: {
        getStatus: jest.fn(),
        runOnce,
        getDebug: jest.fn(),
        getLogs: jest.fn(),
        getRolloutHealth: jest.fn(),
      },
      parseOptionalTimestamp: () => null,
    });

    const response = await request(app).post('/api/detour-run-once?source=offset-30s');

    expect(response.status).toBe(200);
    expect(runOnce).toHaveBeenCalledWith({ triggerSource: 'offset-30s' });
  });
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.unmock('../detourDetector');
  });

  test('detour-run-once returns 409 when worker is disabled', async () => {
    const app = express();
    registerDetourRoutes(app, {
      detourWorker: null,
      parseOptionalTimestamp: () => null,
    });

    const response = await request(app).post('/api/detour-run-once');
    expect(response.status).toBe(409);
    expect(response.body).toEqual(expect.objectContaining({
      ok: false,
      enabled: false,
    }));
  });

  test('detour-run-once triggers a single tick when worker is enabled', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.clientId = 'scheduler:detour-run-once';
      next();
    });
    const runTick = jest.fn().mockResolvedValue({
      ok: true,
      skipped: false,
      tickCount: 3,
      detourCount: 1,
      status: { running: false, mode: 'manual' },
    });

    registerDetourRoutes(app, {
      detourWorker: {
        runTick,
        getStatus: () => ({ running: false }),
      },
      parseOptionalTimestamp: () => null,
    });

    const response = await request(app).post('/api/detour-run-once');
    expect(response.status).toBe(200);
    expect(runTick).toHaveBeenCalledWith({
      source: 'api-run-once',
      forceReloadState: true,
    });
    expect(response.body).toEqual(expect.objectContaining({
      ok: true,
      tickCount: 3,
      detourCount: 1,
    }));
  });

  test('detour-run-once rejects non-admin client callers in production', async () => {
    const app = express();
    const runOnce = jest.fn().mockResolvedValue({
      status: 200,
      body: { ok: true },
    });

    app.use((req, _res, next) => {
      req.auth = { uid: 'ordinary-rider' };
      next();
    });

    registerDetourRoutes(app, {
      detourWorker: {
        getStatus: () => ({ running: false }),
      },
      detourOps: {
        getStatus: jest.fn(),
        runOnce,
        getDebug: jest.fn(),
        getLogs: jest.fn(),
        getRolloutHealth: jest.fn(),
      },
      parseOptionalTimestamp: () => null,
      isProd: true,
    });

    const response = await request(app).post('/api/detour-run-once');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/detour admin/i);
    expect(runOnce).not.toHaveBeenCalled();
  });

  test('detour-simulate publishes a simulated detour when enabled', async () => {
    const app = express();
    app.use(express.json());
    const create = jest.fn().mockResolvedValue({
      status: 200,
      body: { ok: true, routeId: '1', simulated: true },
    });

    registerDetourRoutes(app, {
      detourWorker: null,
      detourSimulationOps: {
        create,
        clear: jest.fn(),
      },
      parseOptionalTimestamp: () => null,
    });

    const response = await request(app)
      .post('/api/detour-simulate')
      .send({ routeId: '1' });

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith({ routeId: '1' });
    expect(response.body).toEqual({ ok: true, routeId: '1', simulated: true });
  });

  test('detour-simulate/clear clears a simulated detour when enabled', async () => {
    const app = express();
    app.use(express.json());
    const clear = jest.fn().mockResolvedValue({
      status: 200,
      body: { ok: true, routeId: '1' },
    });

    registerDetourRoutes(app, {
      detourWorker: null,
      detourSimulationOps: {
        create: jest.fn(),
        clear,
      },
      parseOptionalTimestamp: () => null,
    });

    const response = await request(app)
      .post('/api/detour-simulate/clear')
      .send({ routeId: '1' });

    expect(response.status).toBe(200);
    expect(clear).toHaveBeenCalledWith({ routeId: '1' });
    expect(response.body).toEqual({ ok: true, routeId: '1' });
  });

  test('detour-debug returns enriched route debug for a specific route', async () => {
    jest.doMock('../detourDetector', () => ({
      getRouteDebug: jest.fn().mockReturnValue({
        routeId: '8A',
        pointCount: 2,
        snapshot: {
          routeId: '8A',
          handoffSourceRouteId: '8B',
          geometry: {
            debug: {
              routeFamilyLeaderRouteId: '8B',
            },
          },
        },
        stateSegments: [
          {
            segmentId: 'seg-1',
            shapeIdHint: 'shape-8b',
          },
        ],
        points: [
          { latitude: 44.39, longitude: -79.698 },
          { latitude: 44.39, longitude: -79.694 },
        ],
      }),
      getRawDetourEvidence: jest.fn(),
      getDetourEvidence: jest.fn(),
    }));

    const app = express();
    registerDetourRoutes(app, {
      detourWorker: {
        getStatus: () => ({ running: false }),
      },
      parseOptionalTimestamp: () => null,
    });

    const response = await request(app).get('/api/detour-debug?routeId=8A');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      routeId: '8A',
      evidence: expect.objectContaining({
        routeId: '8A',
        snapshot: expect.objectContaining({
          handoffSourceRouteId: '8B',
        }),
        stateSegments: [
          expect.objectContaining({
            shapeIdHint: 'shape-8b',
          }),
        ],
      }),
    }));
  });

  test('detour-debug blocks route-specific evidence in production for non-admin callers', async () => {
    const app = express();
    const getDebug = jest.fn();

    registerDetourRoutes(app, {
      detourWorker: {
        getStatus: () => ({ running: false }),
      },
      detourOps: {
        getStatus: jest.fn(),
        runOnce: jest.fn(),
        getDebug,
        getLogs: jest.fn(),
        getRolloutHealth: jest.fn(),
      },
      parseOptionalTimestamp: () => null,
      isProd: true,
      allowDetailedRouteDebug: false,
    });

    const response = await request(app).get('/api/detour-debug?routeId=8A');
    expect(response.status).toBe(403);
    expect(getDebug).not.toHaveBeenCalled();
    expect(response.body).toEqual(expect.objectContaining({
      error: 'Detailed route debug is disabled in production',
    }));
  });

  test('detour-debug still allows production summary without routeId', async () => {
    const app = express();
    const getDebug = jest.fn().mockReturnValue({ routes: {}, count: 0 });

    registerDetourRoutes(app, {
      detourWorker: {
        getStatus: () => ({ running: false }),
      },
      detourOps: {
        getStatus: jest.fn(),
        runOnce: jest.fn(),
        getDebug,
        getLogs: jest.fn(),
        getRolloutHealth: jest.fn(),
      },
      parseOptionalTimestamp: () => null,
      isProd: true,
      allowDetailedRouteDebug: false,
    });

    const response = await request(app).get('/api/detour-debug');
    expect(response.status).toBe(200);
    expect(getDebug).toHaveBeenCalledWith(null);
    expect(response.body).toEqual({ routes: {}, count: 0 });
  });

  test('detour-debug allows production route details for admin callers', async () => {
    const app = express();
    const getDebug = jest.fn().mockReturnValue({
      routeId: '8A',
      evidence: { routeId: '8A', points: [] },
    });

    app.use((req, _res, next) => {
      req.auth = { admin: true };
      next();
    });

    registerDetourRoutes(app, {
      detourWorker: {
        getStatus: () => ({ running: false }),
      },
      detourOps: {
        getStatus: jest.fn(),
        runOnce: jest.fn(),
        getDebug,
        getLogs: jest.fn(),
        getRolloutHealth: jest.fn(),
      },
      parseOptionalTimestamp: () => null,
      isProd: true,
      allowDetailedRouteDebug: false,
    });

    const response = await request(app).get('/api/detour-debug?routeId=8A');
    expect(response.status).toBe(200);
    expect(getDebug).toHaveBeenCalledWith('8A');
    expect(response.body).toEqual({
      routeId: '8A',
      evidence: { routeId: '8A', points: [] },
    });
  });
});

