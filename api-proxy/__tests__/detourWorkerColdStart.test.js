describe('detourWorker cold-start active snapshot fallback', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      DETOUR_REQUIRE_SAFE_BASELINE: 'true',
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env = ORIGINAL_ENV;
  });

  test('keeps retrying active snapshot fallback while runtime state has no active detours', async () => {
    const detectorState = { detours: {}, detourStates: {} };
    const loadActiveDetourSnapshots = jest.fn().mockResolvedValue({});
    const publishDetours = jest.fn().mockResolvedValue();

    jest.doMock('../gtfsLoader', () => ({
      getStaticData: jest.fn().mockResolvedValue({
        lastRefresh: 1,
        tripMapping: new Map(),
        stopsById: {},
        routeStopSequencesMapping: {},
        scheduleIndex: {},
      }),
    }));

    jest.doMock('../vehicleFetcher', () => ({
      fetchVehicles: jest.fn().mockResolvedValue([]),
      getVehicleFeedStatus: jest.fn(() => ({ freshness: { stale: false } })),
      errors: { fetchFailures: 0 },
    }));

    jest.doMock('../baselineManager', () => ({
      getBaselineData: jest.fn().mockResolvedValue({
        shapes: {},
        routeShapeMapping: {},
      }),
      getBaselineStatus: jest.fn(() => ({
        readyForDetours: true,
      })),
      logShapeDivergence: jest.fn(),
    }));

    jest.doMock('../detourDetector', () => ({
      processVehicles: jest.fn(() => ({})),
      getState: jest.fn(() => detectorState),
      hydratePersistentDetours: jest.fn(),
      hydratePersistentDetourGeometries: jest.fn(),
      getPersistentDetours: jest.fn(() => ({})),
      getPersistentDetourGeometries: jest.fn(() => ({})),
      serializeDetectorRuntimeState: jest.fn(() => ({ routes: [] })),
      hydrateRuntimeState: jest.fn(),
      hydrateActiveDetourSnapshots: jest.fn(() => 0),
    }));

    jest.doMock('../detourPublisher', () => ({
      publishDetours,
    }));

    jest.doMock('../persistentDetourStore', () => ({
      loadPersistentDetours: jest.fn().mockResolvedValue({}),
      loadPersistentDetourGeometries: jest.fn().mockResolvedValue({}),
      syncPersistentDetours: jest.fn().mockResolvedValue(),
    }));

    jest.doMock('../detourRuntimeStateStore', () => ({
      loadDetourRuntimeState: jest.fn().mockResolvedValue(null),
      saveDetourRuntimeState: jest.fn().mockResolvedValue(),
    }));

    jest.doMock('../activeDetourSnapshotStore', () => ({
      loadActiveDetourSnapshots,
    }));

    const worker = require('../detourWorker');

    await expect(worker.runTick({ source: 'test' })).resolves.toMatchObject({
      ok: true,
      activeSnapshotHydration: { attempted: true, hydratedCount: 0 },
    });
    await expect(worker.runTick({ source: 'test' })).resolves.toMatchObject({
      ok: true,
      activeSnapshotHydration: { attempted: true, hydratedCount: 0 },
    });

    expect(loadActiveDetourSnapshots).toHaveBeenCalledTimes(2);
    expect(publishDetours).toHaveBeenCalledTimes(2);
    for (const call of publishDetours.mock.calls) {
      expect(call[1]).toMatchObject({
        suppressDeletesWhenEmpty: true,
      });
    }
  });

  test('does not remove detector or persistent state from stale auto-clear metadata', async () => {
    const detectorState = { detours: { '8A': { state: 'active' } }, detourStates: { '8A': 'active' } };
    const clearRouteDetour = jest.fn();
    const syncPersistentDetours = jest.fn().mockResolvedValue();

    jest.doMock('../gtfsLoader', () => ({
      getStaticData: jest.fn().mockResolvedValue({
        lastRefresh: 1,
        tripMapping: new Map(),
        stopsById: {},
        routeStopSequencesMapping: {},
        scheduleIndex: {},
      }),
    }));

    jest.doMock('../vehicleFetcher', () => ({
      fetchVehicles: jest.fn().mockResolvedValue([{ id: 'bus-8a', routeId: '8A', coordinate: { latitude: 44.39, longitude: -79.69 } }]),
      getVehicleFeedStatus: jest.fn(() => ({ freshness: { stale: false } })),
      errors: { fetchFailures: 0 },
    }));

    jest.doMock('../baselineManager', () => ({
      getBaselineData: jest.fn().mockResolvedValue({ shapes: {}, routeShapeMapping: {} }),
      getBaselineStatus: jest.fn(() => ({ readyForDetours: true })),
      logShapeDivergence: jest.fn(),
    }));

    jest.doMock('../detourDetector', () => ({
      processVehicles: jest.fn(() => ({ '8A': { routeId: '8A', state: 'active' } })),
      getState: jest.fn(() => detectorState),
      hydratePersistentDetours: jest.fn(),
      hydratePersistentDetourGeometries: jest.fn(),
      getPersistentDetours: jest.fn(() => ({})),
      getPersistentDetourGeometries: jest.fn(() => ({})),
      clearRouteDetour,
      serializeDetectorRuntimeState: jest.fn(() => ({ routes: [] })),
      hydrateRuntimeState: jest.fn(),
      hydrateActiveDetourSnapshots: jest.fn(() => 0),
    }));

    jest.doMock('../detourPublisher', () => ({
      publishDetours: jest.fn().mockResolvedValue({ staleAutoClearedRouteIds: ['8A'] }),
    }));

    jest.doMock('../persistentDetourStore', () => ({
      loadPersistentDetours: jest.fn().mockResolvedValue({}),
      loadPersistentDetourGeometries: jest.fn().mockResolvedValue({}),
      syncPersistentDetours,
    }));

    jest.doMock('../detourRuntimeStateStore', () => ({
      loadDetourRuntimeState: jest.fn().mockResolvedValue({ routes: [{ routeId: '8A' }] }),
      saveDetourRuntimeState: jest.fn().mockResolvedValue(),
    }));

    jest.doMock('../activeDetourSnapshotStore', () => ({
      loadActiveDetourSnapshots: jest.fn().mockResolvedValue({}),
    }));

    const worker = require('../detourWorker');
    await expect(worker.runTick({ source: 'test' })).resolves.toMatchObject({ ok: true });

    expect(clearRouteDetour).not.toHaveBeenCalled();
    expect(syncPersistentDetours).toHaveBeenCalled();
  });

  test('hydrates missing active snapshots even when runtime already has other routes', async () => {
    const detectorState = { detours: { '12B': { state: 'active' } }, detourStates: { '12B': 'active' } };
    const loadActiveDetourSnapshots = jest.fn().mockResolvedValue({
      '12A': { routeId: '12A' },
      '12B': { routeId: '12B' },
    });
    const hydrateActiveDetourSnapshots = jest.fn(() => 1);

    jest.doMock('../gtfsLoader', () => ({
      getStaticData: jest.fn().mockResolvedValue({
        lastRefresh: 1,
        tripMapping: new Map(),
        stopsById: {},
        routeStopSequencesMapping: {},
        scheduleIndex: {},
      }),
    }));

    jest.doMock('../vehicleFetcher', () => ({
      fetchVehicles: jest.fn().mockResolvedValue([]),
      getVehicleFeedStatus: jest.fn(() => ({ freshness: { stale: false } })),
      errors: { fetchFailures: 0 },
    }));

    jest.doMock('../baselineManager', () => ({
      getBaselineData: jest.fn().mockResolvedValue({ shapes: {}, routeShapeMapping: {} }),
      getBaselineStatus: jest.fn(() => ({ readyForDetours: true })),
      logShapeDivergence: jest.fn(),
    }));

    jest.doMock('../detourDetector', () => ({
      processVehicles: jest.fn(() => ({ '12B': { routeId: '12B', state: 'active' } })),
      getState: jest.fn(() => detectorState),
      hydratePersistentDetours: jest.fn(),
      hydratePersistentDetourGeometries: jest.fn(),
      getPersistentDetours: jest.fn(() => ({})),
      getPersistentDetourGeometries: jest.fn(() => ({})),
      serializeDetectorRuntimeState: jest.fn(() => ({ routes: [{ routeId: '12B' }] })),
      hydrateRuntimeState: jest.fn(),
      hydrateActiveDetourSnapshots,
    }));

    jest.doMock('../detourPublisher', () => ({
      publishDetours: jest.fn().mockResolvedValue(),
    }));

    jest.doMock('../persistentDetourStore', () => ({
      loadPersistentDetours: jest.fn().mockResolvedValue({}),
      loadPersistentDetourGeometries: jest.fn().mockResolvedValue({}),
      syncPersistentDetours: jest.fn().mockResolvedValue(),
    }));

    jest.doMock('../detourRuntimeStateStore', () => ({
      loadDetourRuntimeState: jest.fn().mockResolvedValue({ routes: [{ routeId: '12B' }] }),
      saveDetourRuntimeState: jest.fn().mockResolvedValue(),
    }));

    jest.doMock('../activeDetourSnapshotStore', () => ({
      loadActiveDetourSnapshots,
    }));

    const worker = require('../detourWorker');

    await expect(worker.runTick({ source: 'test' })).resolves.toMatchObject({
      ok: true,
      activeSnapshotHydration: { attempted: true, snapshotCount: 2, hydratedCount: 1 },
    });

    expect(loadActiveDetourSnapshots).toHaveBeenCalledTimes(1);
    expect(hydrateActiveDetourSnapshots).toHaveBeenCalledWith({
      '12A': { routeId: '12A' },
      '12B': { routeId: '12B' },
    });
  });

});
