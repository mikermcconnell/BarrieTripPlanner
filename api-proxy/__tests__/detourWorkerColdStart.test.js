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

  test('passes V2 storage config through runtime, hydration, and publish paths', async () => {
    process.env.DETOUR_DETECTOR_VERSION = 'v2';
    const detectorState = { detours: {}, detourStates: {} };
    const loadDetourRuntimeState = jest.fn().mockResolvedValue(null);
    const saveDetourRuntimeState = jest.fn().mockResolvedValue();
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
      getBaselineData: jest.fn().mockResolvedValue({ shapes: {}, routeShapeMapping: {} }),
      getBaselineStatus: jest.fn(() => ({ readyForDetours: true })),
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

    jest.doMock('../detourPublisher', () => ({ publishDetours }));
    jest.doMock('../persistentDetourStore', () => ({
      loadPersistentDetours: jest.fn().mockResolvedValue({}),
      loadPersistentDetourGeometries: jest.fn().mockResolvedValue({}),
      syncPersistentDetours: jest.fn().mockResolvedValue(),
    }));
    jest.doMock('../detourRuntimeStateStore', () => ({
      loadDetourRuntimeState,
      saveDetourRuntimeState,
    }));
    jest.doMock('../activeDetourSnapshotStore', () => ({
      loadActiveDetourSnapshots,
    }));

    const worker = require('../detourWorker');
    await worker.runTick({ source: 'test' });

    const expectedStorageConfig = expect.objectContaining({
      detourVersion: 'v2',
      activeCollection: 'activeDetoursV2',
      historyCollection: 'detourHistoryV2',
      runtimeStateCollection: 'systemState',
      runtimeStateDoc: 'detourRuntimeV2',
    });

    expect(loadDetourRuntimeState).toHaveBeenCalledWith(
      expect.objectContaining({ storageConfig: expectedStorageConfig })
    );
    expect(loadActiveDetourSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ storageConfig: expectedStorageConfig })
    );
    expect(publishDetours.mock.calls[0][1]).toEqual(
      expect.objectContaining({ storageConfig: expectedStorageConfig })
    );
    expect(saveDetourRuntimeState.mock.calls[0][1]).toEqual(
      expect.objectContaining({ storageConfig: expectedStorageConfig })
    );
    expect(worker.getStatus()).toEqual(
      expect.objectContaining({
        detourVersion: 'v2',
        storage: expect.objectContaining({
          activeCollection: 'activeDetoursV2',
          historyCollection: 'detourHistoryV2',
          runtimeStateCollection: 'systemState',
          runtimeStateDoc: 'detourRuntimeV2',
        }),
      })
    );
  });

  test('runs the V2 detector when DETOUR_DETECTOR_VERSION is v2', async () => {
    process.env.DETOUR_DETECTOR_VERSION = 'v2';
    const v1ProcessVehicles = jest.fn(() => ({}));
    const v2ProcessVehicles = jest.fn(() => ({
      '8A': {
        routeId: '8A',
        detourVersion: 'v2',
        state: 'active',
        vehicleCount: 2,
        uniqueVehicleCount: 2,
        currentVehicleCount: 2,
        detectedAt: new Date('2026-05-31T10:00:00Z'),
      },
    }));
    const publishDetours = jest.fn().mockResolvedValue();
    const saveDetourRuntimeState = jest.fn().mockResolvedValue();
    const loadPersistentDetours = jest.fn().mockResolvedValue({});
    const loadPersistentDetourGeometries = jest.fn().mockResolvedValue({});
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
      fetchVehicles: jest.fn().mockResolvedValue([
        { id: 'bus-1', routeId: '8A', coordinate: { latitude: 44.39, longitude: -79.69 } },
      ]),
      getVehicleFeedStatus: jest.fn(() => ({ freshness: { stale: false } })),
      errors: { fetchFailures: 0 },
    }));

    jest.doMock('../baselineManager', () => ({
      getBaselineData: jest.fn().mockResolvedValue({ shapes: new Map(), routeShapeMapping: new Map() }),
      getBaselineStatus: jest.fn(() => ({ readyForDetours: true })),
      logShapeDivergence: jest.fn(),
    }));

    jest.doMock('../detourDetector', () => ({
      processVehicles: v1ProcessVehicles,
      getState: jest.fn(() => ({ detours: {}, detourStates: {} })),
      hydratePersistentDetours: jest.fn(),
      hydratePersistentDetourGeometries: jest.fn(),
      getPersistentDetours: jest.fn(() => ({})),
      getPersistentDetourGeometries: jest.fn(() => ({})),
      serializeDetectorRuntimeState: jest.fn(() => ({ detourVersion: 'v1', routes: [] })),
      hydrateRuntimeState: jest.fn(),
      hydrateActiveDetourSnapshots: jest.fn(() => 0),
    }));

    jest.doMock('../detourV2/workerAdapter', () => ({
      processVehicles: v2ProcessVehicles,
      getState: jest.fn(() => ({ detourVersion: 'v2', detours: {}, detourStates: {} })),
      hydratePersistentDetours: jest.fn(),
      hydratePersistentDetourGeometries: jest.fn(),
      getPersistentDetours: jest.fn(() => ({})),
      getPersistentDetourGeometries: jest.fn(() => ({})),
      serializeDetectorRuntimeState: jest.fn(() => ({ detourVersion: 'v2', activeDetours: {} })),
      hydrateRuntimeState: jest.fn(),
      hydrateActiveDetourSnapshots: jest.fn(() => 0),
    }));

    jest.doMock('../detourPublisher', () => ({ publishDetours }));
    jest.doMock('../persistentDetourStore', () => ({
      loadPersistentDetours,
      loadPersistentDetourGeometries,
      syncPersistentDetours,
    }));
    jest.doMock('../detourRuntimeStateStore', () => ({
      loadDetourRuntimeState: jest.fn().mockResolvedValue(null),
      saveDetourRuntimeState,
    }));
    jest.doMock('../activeDetourSnapshotStore', () => ({
      loadActiveDetourSnapshots: jest.fn().mockResolvedValue({}),
    }));

    const worker = require('../detourWorker');
    const result = await worker.runTick({ source: 'test' });

    expect(result).toMatchObject({ ok: true, detourCount: 1 });
    expect(v1ProcessVehicles).not.toHaveBeenCalled();
    expect(v2ProcessVehicles).toHaveBeenCalledTimes(1);
    expect(loadPersistentDetours).not.toHaveBeenCalled();
    expect(loadPersistentDetourGeometries).not.toHaveBeenCalled();
    expect(syncPersistentDetours).not.toHaveBeenCalled();
    expect(publishDetours.mock.calls[0][0]).toEqual(expect.objectContaining({
      '8A': expect.objectContaining({ detourVersion: 'v2' }),
    }));
    expect(saveDetourRuntimeState.mock.calls[0][0]).toEqual(
      expect.objectContaining({ detourVersion: 'v2' })
    );
  });

});
