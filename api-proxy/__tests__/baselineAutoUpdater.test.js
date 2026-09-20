describe('baselineAutoUpdater', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      BASELINE_AUTO_UPDATE_ENABLED: 'true',
      BASELINE_AUTO_UPDATE_STABILITY_MS: '0',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('adopts a route that was retired from live GTFS after refresh confirmation', async () => {
    const updater = require('../baselineAutoUpdater');
    const baselineData = {
      shapes: new Map([['kp1-shape', [{ latitude: 44.3, longitude: -79.7 }]]]),
      routeShapeMapping: new Map([['KP1', ['kp1-shape']]]),
    };
    const liveData = { shapes: new Map(), routeShapeMapping: new Map() };
    const setBaselineRoutes = jest.fn().mockResolvedValue({ removedRouteIds: ['KP1'] });
    const forceRefresh = jest.fn().mockResolvedValue(true);

    const result = await updater.evaluateBaselineAutoUpdate({
      baselineDivergence: {
        hasChanges: true,
        changedRouteIds: ['KP1'],
        removed: [{ routeId: 'KP1', note: 'route removed from live' }],
      },
      baselineData,
      liveData,
      forceRefresh,
      getStaticData: jest.fn().mockResolvedValue(liveData),
      setBaselineRoutes,
      loadPendingRoutes: jest.fn().mockResolvedValue(null),
      savePendingRoutes: jest.fn().mockResolvedValue(),
      nowMs: Date.parse('2026-08-31T12:00:00Z'),
    });

    expect(forceRefresh).toHaveBeenCalledTimes(1);
    expect(setBaselineRoutes).toHaveBeenCalledWith(
      liveData,
      ['KP1'],
      { source: 'auto-gtfs-refresh' }
    );
    expect(result.autoUpdatedRouteIds).toEqual(['KP1']);
  });

  test('continues the stability timer after a process restart', async () => {
    process.env.BASELINE_AUTO_UPDATE_STABILITY_MS = String(30 * 60 * 1000);
    const updater = require('../baselineAutoUpdater');
    const baselineData = {
      shapes: new Map([['kp1-shape', [{ latitude: 44.3, longitude: -79.7 }]]]),
      routeShapeMapping: new Map([['KP1', ['kp1-shape']]]),
    };
    const liveData = { shapes: new Map(), routeShapeMapping: new Map() };
    const divergence = { hasChanges: true, changedRouteIds: ['KP1'] };
    let storedRoutes = null;
    const savePendingRoutes = jest.fn(async (routes) => { storedRoutes = routes; });

    const firstSeenAt = Date.parse('2026-08-31T12:00:00Z');
    const first = await updater.evaluateBaselineAutoUpdate({
      baselineDivergence: divergence,
      baselineData,
      liveData,
      loadPendingRoutes: jest.fn().mockResolvedValue(null),
      savePendingRoutes,
      nowMs: firstSeenAt,
    });
    expect(first.pendingRouteIds).toEqual(['KP1']);
    expect(storedRoutes).toEqual([expect.objectContaining({
      routeId: 'KP1',
      firstSeenAt,
      dueAt: firstSeenAt + 30 * 60 * 1000,
    })]);

    updater.resetBaselineAutoUpdaterForTests();
    const setBaselineRoutes = jest.fn().mockResolvedValue();
    const second = await updater.evaluateBaselineAutoUpdate({
      baselineDivergence: divergence,
      baselineData,
      liveData,
      forceRefresh: jest.fn().mockResolvedValue(true),
      getStaticData: jest.fn().mockResolvedValue(liveData),
      setBaselineRoutes,
      loadPendingRoutes: jest.fn().mockResolvedValue(storedRoutes),
      savePendingRoutes,
      nowMs: firstSeenAt + 31 * 60 * 1000,
    });

    expect(setBaselineRoutes).toHaveBeenCalledWith(liveData, ['KP1'], { source: 'auto-gtfs-refresh' });
    expect(second.autoUpdatedRouteIds).toEqual(['KP1']);
  });
});
