const { getStaticData, forceRefresh = async () => false } = require('./gtfsLoader');
const {
  fetchVehicles,
  getVehicleFeedStatus,
  errors: fetchErrors,
} = require('./vehicleFetcher');
const { publishDetours } = require('./detourPublisher');
const {
  loadPersistentDetours,
  loadPersistentDetourGeometries,
  syncPersistentDetours,
} = require('./persistentDetourStore');
const { loadActiveDetourSnapshots } = require('./activeDetourSnapshotStore');
const {
  loadDetourRuntimeState,
  saveDetourRuntimeState,
} = require('./detourRuntimeStateStore');
const {
  getBaselineData,
  logShapeDivergence,
  getBaselineStatus,
  setBaselineRoutes = async () => {},
} = require('./baselineManager');
const { buildBaselineDivergence } = require('./baselineDivergence');
const { evaluateBaselineAutoUpdate } = require('./baselineAutoUpdater');
const { createVehicleSampleFreshnessTracker } = require('./detour/vehicleSampleFreshness');
const { buildDetourStorageConfig } = require('./detour/storageConfig');
const { getDetectorForStorageConfig } = require('./detour/detectorSelector');
const { getRoadMatcherStats } = require('./detourRoadMatcher');

const TICK_INTERVAL = 30_000;
const MAX_EVENTS = 20;
const MAX_RECENT_TICK_SAMPLES = 120;
const SAMPLING_HEALTH_WINDOW_MS = 5 * 60 * 1000;
const REQUIRE_SAFE_BASELINE = process.env.DETOUR_REQUIRE_SAFE_BASELINE !== 'false';
const detourStorageConfig = buildDetourStorageConfig(process.env);
const detector = getDetectorForStorageConfig(detourStorageConfig);
const {
  processVehicles,
  getState,
  hydratePersistentDetours,
  hydratePersistentDetourGeometries,
  getPersistentDetours,
  getPersistentDetourGeometries,
  serializeDetectorRuntimeState,
  hydrateRuntimeState,
  hydrateActiveDetourSnapshots,
  clearRouteDetour = () => false,
} = detector;

let interval = null;
let running = false;
let tickCount = 0;
let lastSuccessfulTick = null;
let lastDetourPublishAt = null;
let consecutiveFailureCount = 0;
let lastGtfsRefresh = null;
let tickInProgress = false;
let publishFailures = 0;
let persistentDetoursHydrated = false;
let runtimeStateHydrated = false;
let lastTickStartedAt = null;
let lastTickFinishedAt = null;
let lastTickSource = null;
const vehicleSampleFreshness = createVehicleSampleFreshnessTracker();
const recentEvents = [];
const recentTickSamples = [];

function getWorkerMode() {
  return String(process.env.DETOUR_WORKER_MODE || 'interval').trim().toLowerCase();
}

function addEvent(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  recentEvents.push(`${msg} at ${ts}`);
  if (recentEvents.length > MAX_EVENTS) recentEvents.shift();
}

function detourKeys(detours) {
  return new Set(Object.keys(detours));
}

function recordTickSample(sample) {
  recentTickSamples.push({
    finishedAt: new Date().toISOString(),
    ...sample,
  });
  while (recentTickSamples.length > MAX_RECENT_TICK_SAMPLES) {
    recentTickSamples.shift();
  }
}

function summarizeSamplingHealth(nowMs = Date.now()) {
  const windowStartMs = nowMs - SAMPLING_HEALTH_WINDOW_MS;
  const samples = recentTickSamples.filter((sample) =>
    Date.parse(sample.finishedAt) >= windowStartMs
  );
  const bySource = {};

  for (const sample of samples) {
    const source = sample.source || 'unknown';
    const current = bySource[source] || {
      tickCount: 0,
      freshTickCount: 0,
      zeroFreshTickCount: 0,
      vehiclesFetched: 0,
      vehiclesProcessed: 0,
      duplicateVehicleSamplesSkipped: 0,
      failureCount: 0,
    };
    current.tickCount += 1;
    current.vehiclesFetched += sample.vehiclesFetched || 0;
    current.vehiclesProcessed += sample.vehiclesProcessed || 0;
    current.duplicateVehicleSamplesSkipped += sample.duplicateVehicleSamplesSkipped || 0;
    if (sample.ok === false) current.failureCount += 1;
    if ((sample.vehiclesProcessed || 0) > 0) current.freshTickCount += 1;
    if ((sample.vehiclesFetched || 0) > 0 && (sample.vehiclesProcessed || 0) === 0) {
      current.zeroFreshTickCount += 1;
    }
    bySource[source] = current;
  }

  const finishedTimes = samples
    .map((sample) => Date.parse(sample.finishedAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const intervalsMs = [];
  for (let i = 1; i < finishedTimes.length; i += 1) {
    intervalsMs.push(finishedTimes[i] - finishedTimes[i - 1]);
  }
  const vehiclesFetched = samples.reduce((sum, sample) => sum + (sample.vehiclesFetched || 0), 0);
  const duplicateVehicleSamplesSkipped = samples.reduce(
    (sum, sample) => sum + (sample.duplicateVehicleSamplesSkipped || 0),
    0
  );

  return {
    windowMs: SAMPLING_HEALTH_WINDOW_MS,
    tickCount: samples.length,
    freshTickCount: samples.filter((sample) => (sample.vehiclesProcessed || 0) > 0).length,
    zeroFreshTickCount: samples.filter((sample) =>
      (sample.vehiclesFetched || 0) > 0 && (sample.vehiclesProcessed || 0) === 0
    ).length,
    duplicateVehicleSamplesSkipped,
    duplicateVehicleSampleRate: vehiclesFetched > 0
      ? duplicateVehicleSamplesSkipped / vehiclesFetched
      : null,
    averageTickIntervalMs: intervalsMs.length > 0
      ? Math.round(intervalsMs.reduce((sum, value) => sum + value, 0) / intervalsMs.length)
      : null,
    bySource,
    recentTicks: samples.slice(-12),
  };
}

async function ensurePersistentDetoursHydrated({ force = false } = {}) {
  if (detourStorageConfig.detourVersion === 'v2') {
    persistentDetoursHydrated = true;
    return;
  }
  if (persistentDetoursHydrated && !force) return;
  const [records, geometryRecords] = await Promise.all([
    loadPersistentDetours({ force }),
    loadPersistentDetourGeometries({ force }),
  ]);
  hydratePersistentDetourGeometries(geometryRecords);
  hydratePersistentDetours(records);
  persistentDetoursHydrated = true;
}

async function ensureRuntimeStateHydrated({ force = false } = {}) {
  if (runtimeStateHydrated && !force) {
    const activeRouteCount = Object.keys(getState().detours || {}).length;
    return {
      attempted: false,
      snapshotLoaded: null,
      snapshotRouteCount: null,
      activeRouteCount,
      needsActiveSnapshotFallback: activeRouteCount === 0,
    };
  }
  const snapshot = await loadDetourRuntimeState({ force, storageConfig: detourStorageConfig });
  if (snapshot) {
    hydrateRuntimeState(snapshot);
  }
  runtimeStateHydrated = true;
  const snapshotRouteCount = Array.isArray(snapshot?.routes) ? snapshot.routes.length : 0;
  const activeRouteCount = Object.keys(getState().detours || {}).length;
  return {
    attempted: true,
    snapshotLoaded: Boolean(snapshot),
    snapshotRouteCount,
    activeRouteCount,
    needsActiveSnapshotFallback: !snapshot || snapshotRouteCount === 0 || activeRouteCount === 0,
  };
}

function recordStateTransitions(prevSnapshot, activeDetours) {
  const prevKeys = detourKeys(prevSnapshot.detours || {});
  const prevStates = prevSnapshot.detourStates || {};
  const currKeys = detourKeys(activeDetours);
  const currStates = {};
  for (const [routeId, value] of Object.entries(activeDetours)) {
    currStates[routeId] = value.state || 'active';
  }

  for (const routeId of currKeys) {
    if (!prevKeys.has(routeId)) {
      addEvent(`Route ${routeId}: detour detected`);
    } else if (prevStates[routeId] === 'active' && currStates[routeId] === 'clear-pending') {
      addEvent(`Route ${routeId}: detour clear-pending`);
    } else if (prevStates[routeId] === 'clear-pending' && currStates[routeId] === 'active') {
      addEvent(`Route ${routeId}: detour reactivated`);
    }
  }

  for (const routeId of prevKeys) {
    if (!currKeys.has(routeId)) {
      addEvent(`Route ${routeId}: detour cleared`);
    }
  }
}

function runtimeStateWithActiveRouteIds(runtimeState, activeDetours = {}) {
  if (!runtimeState || !Array.isArray(runtimeState.routes)) return runtimeState;

  const existingByRouteId = new Map();
  for (const route of runtimeState.routes) {
    const routeId = String(route?.routeId || '').trim();
    if (routeId) existingByRouteId.set(routeId, route);
  }

  const orderedActiveRoutes = [];
  const seenRouteIds = new Set();
  for (const [entryKey, detour] of Object.entries(activeDetours || {})) {
    const routeId = String(detour?.routeId || entryKey || '').trim();
    if (routeId && !seenRouteIds.has(routeId)) {
      seenRouteIds.add(routeId);
      orderedActiveRoutes.push(existingByRouteId.get(routeId) || { routeId });
    }
  }

  const inactiveRoutes = runtimeState.routes.filter((route) => {
    const routeId = String(route?.routeId || '').trim();
    return routeId && !seenRouteIds.has(routeId);
  });
  const routes = [...orderedActiveRoutes, ...inactiveRoutes];
  if (routes.length === runtimeState.routes.length && routes.every((route, index) => route === runtimeState.routes[index])) {
    return runtimeState;
  }
  return {
    ...runtimeState,
    routes,
  };
}

async function runTick({ source = 'manual', forceReloadState = false } = {}) {
  if (tickInProgress) {
    return {
      ok: false,
      skipped: true,
      reason: 'tick-in-progress',
      status: getStatus(),
    };
  }

  tickInProgress = true;
  lastTickSource = source;
  lastTickStartedAt = new Date().toISOString();
  const tickStartedAtMs = Date.now();

  try {
    await ensurePersistentDetoursHydrated({ force: forceReloadState });
    const runtimeHydration = await ensureRuntimeStateHydrated({ force: forceReloadState });
    let activeSnapshotHydration = {
      attempted: false,
      snapshotCount: 0,
      hydratedCount: 0,
    };
    if (runtimeHydration?.needsActiveSnapshotFallback || runtimeHydration?.attempted) {
      const activeSnapshots = await loadActiveDetourSnapshots({
        force: forceReloadState,
        storageConfig: detourStorageConfig,
      });
      activeSnapshotHydration = {
        attempted: true,
        snapshotCount: Object.keys(activeSnapshots || {}).length,
        hydratedCount: hydrateActiveDetourSnapshots(activeSnapshots),
      };
    }

    let data = await getStaticData();
    if (data.lastRefresh !== lastGtfsRefresh) {
      if (lastGtfsRefresh !== null) logShapeDivergence(data);
      lastGtfsRefresh = data.lastRefresh;
    }

    let baseline = await getBaselineData(data);
    const baselineStatus = getBaselineStatus();
    if (REQUIRE_SAFE_BASELINE && !baselineStatus.readyForDetours) {
      throw new Error(
        `Unsafe detour baseline: ${baselineStatus.reason}. ${baselineStatus.message} ` +
        'Set a trusted baseline before running auto-detour detection, or set DETOUR_REQUIRE_SAFE_BASELINE=false for diagnostics only.'
      );
    }
    let baselineDivergence = buildBaselineDivergence({
      baselineShapes: baseline.shapes,
      baselineRouteShapeMapping: baseline.routeShapeMapping,
      liveShapes: data.shapes,
      liveRouteShapeMapping: data.routeShapeMapping,
    });

    const baselineAutoUpdate = await evaluateBaselineAutoUpdate({
      baselineDivergence,
      baselineData: baseline,
      liveData: data,
      forceRefresh,
      getStaticData,
      setBaselineRoutes,
      nowMs: Date.now(),
    });
    data = baselineAutoUpdate.liveData || data;
    for (const routeId of baselineAutoUpdate.autoUpdatedRouteIds || []) {
      clearRouteDetour(routeId);
      addEvent(`Route ${routeId}: baseline auto-updated`);
    }
    if ((baselineAutoUpdate.autoUpdatedRouteIds || []).length > 0) {
      baseline = await getBaselineData(data);
      baselineDivergence = buildBaselineDivergence({
        baselineShapes: baseline.shapes,
        baselineRouteShapeMapping: baseline.routeShapeMapping,
        liveShapes: data.shapes,
        liveRouteShapeMapping: data.routeShapeMapping,
      });
      console.warn(
        `[detourWorker] Auto-updated GTFS baseline for route(s): ` +
        baselineAutoUpdate.autoUpdatedRouteIds.join(', ')
      );
    } else {
      baselineDivergence = baselineAutoUpdate.baselineDivergence || baselineDivergence;
    }

    const tripObj = Object.fromEntries(data.tripMapping);
    const fetchedVehicles = await fetchVehicles(tripObj);
    const vehicleFeedStatus = getVehicleFeedStatus();
    if (vehicleFeedStatus.freshness?.stale) {
      console.warn(
        '[detourWorker] Vehicle feed stale: ' +
        `${vehicleFeedStatus.positionedVehicleCount} positioned vehicles, ` +
        `${vehicleFeedStatus.usableVehicleCount} usable, ` +
        `${vehicleFeedStatus.staleFilteredCount} filtered as stale, ` +
        `newest age ${Math.round(vehicleFeedStatus.freshness.newestAgeMs / 1000)}s`
      );
    }
    const vehicles = vehicleSampleFreshness.filterFreshSamples(fetchedVehicles, { now: Date.now() });
    const vehicleSampleStats = vehicleSampleFreshness.getStats();

    const prevSnapshot = getState();
    let activeDetours = processVehicles(
      vehicles,
      baseline.shapes,
      baseline.routeShapeMapping,
      data.tripMapping,
      {
        stopsById: data.stopsById,
        routeStopSequencesMapping: data.routeStopSequencesMapping,
        scheduleIndex: data.scheduleIndex,
      }
    );
    recordStateTransitions(prevSnapshot, activeDetours);

    try {
      const suppressDeletesWhenEmpty =
        runtimeHydration?.needsActiveSnapshotFallback === true &&
        activeSnapshotHydration.attempted === true &&
        activeSnapshotHydration.hydratedCount === 0 &&
        Object.keys(activeDetours).length === 0;
      await publishDetours(activeDetours, {
        vehicles,
        scheduleIndex: data.scheduleIndex,
        shapes: baseline.shapes,
        gtfsData: data,
        storageConfig: detourStorageConfig,
        baselineDivergedRouteIds: baselineDivergence.changedRouteIds,
        baselinePendingRouteIds: baselineAutoUpdate.pendingRouteIds,
        baselineAutoUpdatedRouteIds: baselineAutoUpdate.autoUpdatedRouteIds,
        baselineDivergence,
        suppressDeletesWhenEmpty,
        suppressDeleteReason: suppressDeletesWhenEmpty
          ? 'runtime-and-active-snapshot-hydration-empty'
          : undefined,
      });
      if (detourStorageConfig.detourVersion !== 'v2') {
        await syncPersistentDetours(getPersistentDetours(), getPersistentDetourGeometries());
      }
      await saveDetourRuntimeState(runtimeStateWithActiveRouteIds(
        serializeDetectorRuntimeState(),
        activeDetours
      ), {
        storageConfig: detourStorageConfig,
      });
      if (Object.keys(activeDetours).length > 0) {
        lastDetourPublishAt = new Date().toISOString();
      }
    } catch (err) {
      publishFailures++;
      throw err;
    }

    tickCount++;
    lastSuccessfulTick = new Date().toISOString();
    consecutiveFailureCount = 0;
    const detourCount = Object.keys(activeDetours).length;
    const tickDurationMs = Date.now() - tickStartedAtMs;
    recordTickSample({
      ok: true,
      source,
      startedAt: lastTickStartedAt,
      durationMs: tickDurationMs,
      vehiclesFetched: fetchedVehicles.length,
      vehiclesProcessed: vehicles.length,
      duplicateVehicleSamplesSkipped: vehicleSampleStats.duplicateCount,
      detourCount,
    });
    console.log(
      JSON.stringify({
        event: 'detour_worker_tick',
        tickCount,
        source,
        vehiclesProcessed: vehicles.length,
        vehiclesFetched: fetchedVehicles.length,
        duplicateVehicleSamplesSkipped: vehicleSampleStats.duplicateCount,
        detourCount,
        durationMs: tickDurationMs,
      })
    );

    return {
      ok: true,
      skipped: false,
      vehiclesProcessed: vehicles.length,
      vehiclesFetched: fetchedVehicles.length,
      duplicateVehicleSamplesSkipped: vehicleSampleStats.duplicateCount,
      detourCount,
      activeSnapshotHydration,
      tickCount,
      status: getStatus(),
    };
  } catch (err) {
    consecutiveFailureCount++;
    recordTickSample({
      ok: false,
      source,
      startedAt: lastTickStartedAt,
      durationMs: Date.now() - tickStartedAtMs,
      error: err.message,
    });
    console.error(`[detourWorker] tick failed (${consecutiveFailureCount} consecutive):`, err.message);
    return {
      ok: false,
      skipped: false,
      error: err.message,
      status: getStatus(),
    };
  } finally {
    lastTickFinishedAt = new Date().toISOString();
    tickInProgress = false;
  }
}

function start() {
  if (interval) return;
  running = true;
  console.log('[detourWorker] Starting detour detection loop (30s interval)');
  void runTick({ source: 'interval' });
  interval = setInterval(() => {
    void runTick({ source: 'interval' });
  }, TICK_INTERVAL);
}

function stop() {
  if (interval) clearInterval(interval);
  interval = null;
  running = false;
  console.log('[detourWorker] Stopped');
}

function getStatus() {
  const state = getState();
  const detourSummary = {};
  for (const [routeId, detour] of Object.entries(state.detours || {})) {
    detourSummary[routeId] = {
      vehicleCount: detour.vehicleCount,
      detectedAt: detour.detectedAt,
      state: detour.state || 'active',
    };
  }

  return {
    running,
    mode: getWorkerMode(),
    detourVersion: detourStorageConfig.detourVersion,
    storage: {
      activeCollection: detourStorageConfig.activeCollection,
      historyCollection: detourStorageConfig.historyCollection,
      runtimeStateCollection: detourStorageConfig.runtimeStateCollection,
      runtimeStateDoc: detourStorageConfig.runtimeStateDoc,
    },
    tickCount,
    lastSuccessfulTick,
    lastDetourPublishAt,
    lastTickStartedAt,
    lastTickFinishedAt,
    lastTickSource,
    consecutiveFailureCount,
    runtimeStateHydrated,
    persistentDetoursHydrated,
    lastGtfsRefresh: lastGtfsRefresh ? new Date(lastGtfsRefresh).toISOString() : null,
    activeDetours: detourSummary,
    baseline: getBaselineStatus(),
    vehicleSamples: vehicleSampleFreshness.getStats(),
    samplingHealth: summarizeSamplingHealth(),
    vehicleFeed: getVehicleFeedStatus(),
    roadMatching: getRoadMatcherStats(),
    recentEvents: [...recentEvents],
    errors: { fetchFailures: fetchErrors.fetchFailures, publishFailures },
  };
}

module.exports = {
  start,
  stop,
  runTick,
  getStatus,
  getWorkerMode,
  TICK_INTERVAL,
};
