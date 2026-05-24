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
      getPersistentDetours: jest.fn(() => new Map()),
      serializeDetectorRuntimeState: jest.fn(() => ({ routes: [] })),
      hydrateRuntimeState: jest.fn(),
      hydrateActiveDetourSnapshots: jest.fn(() => 0),
    }));

    jest.doMock('../detourPublisher', () => ({
      publishDetours,
    }));

    jest.doMock('../persistentDetourStore', () => ({
      loadPersistentDetours: jest.fn().mockResolvedValue({}),
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
});
