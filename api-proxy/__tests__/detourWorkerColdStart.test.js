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

  test('keeps baseline-diverged detours pending until the GTFS change is stable', async () => {
    const realDateNow = Date.now;
    Date.now = jest.fn(() => Date.parse('2026-06-09T14:00:00Z'));
    process.env.BASELINE_AUTO_UPDATE_STABILITY_MS = String(30 * 60 * 1000);

    const detectorState = { detours: { '8A': { state: 'active' }, '10': { state: 'active' } }, detourStates: { '8A': 'active', '10': 'active' } };
    const clearRouteDetour = jest.fn((routeId) => routeId === '8A');
    const publishDetours = jest.fn().mockResolvedValue();
    const saveDetourRuntimeState = jest.fn().mockResolvedValue();
    const setBaselineRoutes = jest.fn().mockResolvedValue();

    const baselineShapes = new Map([
      ['baseline-8a', [{ latitude: 44.1, longitude: -79.1 }, { latitude: 44.2, longitude: -79.2 }]],
      ['shape-10', [{ latitude: 44.3, longitude: -79.3 }, { latitude: 44.4, longitude: -79.4 }]],
    ]);
    const liveShapes = new Map([
      ['live-8a', [{ latitude: 44.5, longitude: -79.5 }, { latitude: 44.6, longitude: -79.6 }]],
      ['shape-10', [{ latitude: 44.3, longitude: -79.3 }, { latitude: 44.4, longitude: -79.4 }]],
    ]);

    jest.doMock('../gtfsLoader', () => ({
      forceRefresh: jest.fn().mockResolvedValue(false),
      getStaticData: jest.fn().mockResolvedValue({
        lastRefresh: 1,
        shapes: liveShapes,
        routeShapeMapping: new Map([
          ['8A', ['live-8a']],
          ['10', ['shape-10']],
        ]),
        tripMapping: new Map(),
        stopsById: {},
        routeStopSequencesMapping: {},
        scheduleIndex: {},
      }),
    }));

    jest.doMock('../vehicleFetcher', () => ({
      fetchVehicles: jest.fn().mockResolvedValue([
        { id: 'bus-8a', routeId: '8A', coordinate: { latitude: 44.39, longitude: -79.69 } },
        { id: 'bus-10', routeId: '10', coordinate: { latitude: 44.39, longitude: -79.69 } },
      ]),
      getVehicleFeedStatus: jest.fn(() => ({ freshness: { stale: false } })),
      errors: { fetchFailures: 0 },
    }));

    jest.doMock('../baselineManager', () => ({
      getBaselineData: jest.fn().mockResolvedValue({
        shapes: baselineShapes,
        routeShapeMapping: new Map([
          ['8A', ['baseline-8a']],
          ['10', ['shape-10']],
        ]),
      }),
      getBaselineStatus: jest.fn(() => ({ readyForDetours: true })),
      logShapeDivergence: jest.fn(),
      setBaselineRoutes,
    }));

    jest.doMock('../detourDetector', () => ({
      processVehicles: jest.fn(() => ({
        '8A:baseline-8a:0-100': { routeId: '8A', state: 'active' },
        '10:shape-10:0-100': { routeId: '10', state: 'active' },
      })),
      getState: jest.fn(() => detectorState),
      hydratePersistentDetours: jest.fn(),
      hydratePersistentDetourGeometries: jest.fn(),
      getPersistentDetours: jest.fn(() => ({})),
      getPersistentDetourGeometries: jest.fn(() => ({})),
      clearRouteDetour,
      serializeDetectorRuntimeState: jest.fn(() => ({ routes: [{ routeId: '10' }] })),
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
      loadDetourRuntimeState: jest.fn().mockResolvedValue({ routes: [{ routeId: '8A' }, { routeId: '10' }] }),
      saveDetourRuntimeState,
    }));

    jest.doMock('../activeDetourSnapshotStore', () => ({
      loadActiveDetourSnapshots: jest.fn().mockResolvedValue({}),
    }));

    try {
      const worker = require('../detourWorker');
      const result = await worker.runTick({ source: 'test' });

      expect(result).toMatchObject({ ok: true, detourCount: 2 });
      expect(setBaselineRoutes).not.toHaveBeenCalled();
      expect(clearRouteDetour).not.toHaveBeenCalled();
      expect(publishDetours.mock.calls[0][0]).toEqual({
        '8A:baseline-8a:0-100': { routeId: '8A', state: 'active' },
        '10:shape-10:0-100': { routeId: '10', state: 'active' },
      });
      expect(publishDetours.mock.calls[0][1]).toEqual(expect.objectContaining({
        baselineDivergedRouteIds: ['8A'],
        baselinePendingRouteIds: ['8A'],
      }));
      expect(saveDetourRuntimeState).toHaveBeenCalledWith(
        { routes: [{ routeId: '8A' }, { routeId: '10' }] },
        expect.any(Object)
      );
    } finally {
      Date.now = realDateNow;
    }
  });

  test('auto-updates stable changed route baselines and clears old route detour state', async () => {
    const realDateNow = Date.now;
    Date.now = jest.fn(() => Date.parse('2026-06-09T14:00:00Z'));
    process.env.BASELINE_AUTO_UPDATE_STABILITY_MS = '0';

    const detectorState = { detours: { '8A': { state: 'active' }, '10': { state: 'active' } }, detourStates: { '8A': 'active', '10': 'active' } };
    const clearRouteDetour = jest.fn((routeId) => routeId === '8A');
    const publishDetours = jest.fn().mockResolvedValue();
    const saveDetourRuntimeState = jest.fn().mockResolvedValue();
    const setBaselineRoutes = jest.fn().mockResolvedValue();
    const forceRefresh = jest.fn().mockResolvedValue(true);

    const baselineShapes = new Map([
      ['baseline-8a', [{ latitude: 44.1, longitude: -79.1 }, { latitude: 44.2, longitude: -79.2 }]],
      ['shape-10', [{ latitude: 44.3, longitude: -79.3 }, { latitude: 44.4, longitude: -79.4 }]],
    ]);
    const liveShapes = new Map([
      ['live-8a', [{ latitude: 44.5, longitude: -79.5 }, { latitude: 44.6, longitude: -79.6 }]],
      ['shape-10', [{ latitude: 44.3, longitude: -79.3 }, { latitude: 44.4, longitude: -79.4 }]],
    ]);
    const liveData = {
      lastRefresh: 1,
      shapes: liveShapes,
      routeShapeMapping: new Map([
        ['8A', ['live-8a']],
        ['10', ['shape-10']],
      ]),
      tripMapping: new Map(),
      stopsById: {},
      routeStopSequencesMapping: {},
      scheduleIndex: {},
    };

    jest.doMock('../gtfsLoader', () => ({
      forceRefresh,
      getStaticData: jest.fn().mockResolvedValue(liveData),
    }));

    jest.doMock('../vehicleFetcher', () => ({
      fetchVehicles: jest.fn().mockResolvedValue([
        { id: 'bus-8a', routeId: '8A', coordinate: { latitude: 44.39, longitude: -79.69 } },
        { id: 'bus-10', routeId: '10', coordinate: { latitude: 44.39, longitude: -79.69 } },
      ]),
      getVehicleFeedStatus: jest.fn(() => ({ freshness: { stale: false } })),
      errors: { fetchFailures: 0 },
    }));

    jest.doMock('../baselineManager', () => ({
      getBaselineData: jest.fn().mockResolvedValue({
        shapes: baselineShapes,
        routeShapeMapping: new Map([
          ['8A', ['baseline-8a']],
          ['10', ['shape-10']],
        ]),
      }),
      getBaselineStatus: jest.fn(() => ({ readyForDetours: true })),
      logShapeDivergence: jest.fn(),
      setBaselineRoutes,
    }));

    jest.doMock('../detourDetector', () => ({
      processVehicles: jest.fn(() => ({
        '10:shape-10:0-100': { routeId: '10', state: 'active' },
      })),
      getState: jest.fn(() => detectorState),
      hydratePersistentDetours: jest.fn(),
      hydratePersistentDetourGeometries: jest.fn(),
      getPersistentDetours: jest.fn(() => ({})),
      getPersistentDetourGeometries: jest.fn(() => ({})),
      clearRouteDetour,
      serializeDetectorRuntimeState: jest.fn(() => ({ routes: [{ routeId: '10' }] })),
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
      loadDetourRuntimeState: jest.fn().mockResolvedValue({ routes: [{ routeId: '8A' }, { routeId: '10' }] }),
      saveDetourRuntimeState,
    }));

    jest.doMock('../activeDetourSnapshotStore', () => ({
      loadActiveDetourSnapshots: jest.fn().mockResolvedValue({}),
    }));

    try {
      const worker = require('../detourWorker');
      const result = await worker.runTick({ source: 'test' });

      expect(result).toMatchObject({ ok: true, detourCount: 1 });
      expect(forceRefresh).toHaveBeenCalledTimes(1);
      expect(setBaselineRoutes).toHaveBeenCalledWith(
        liveData,
        ['8A'],
        expect.objectContaining({ source: 'auto-gtfs-refresh' })
      );
      expect(clearRouteDetour).toHaveBeenCalledWith('8A');
      expect(publishDetours.mock.calls[0][0]).toEqual({
        '10:shape-10:0-100': { routeId: '10', state: 'active' },
      });
      expect(publishDetours.mock.calls[0][1]).toEqual(expect.objectContaining({
        baselineAutoUpdatedRouteIds: ['8A'],
      }));
      expect(saveDetourRuntimeState).toHaveBeenCalledWith(
        { routes: [{ routeId: '10' }] },
        expect.any(Object)
      );
    } finally {
      Date.now = realDateNow;
    }
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
      activeCollection: 'activeDetourEventsV2',
      historyCollection: 'detourEventHistoryV2',
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
          activeCollection: 'activeDetourEventsV2',
          historyCollection: 'detourEventHistoryV2',
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
