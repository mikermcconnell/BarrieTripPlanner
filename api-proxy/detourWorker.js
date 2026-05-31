const { getStaticData } = require('./gtfsLoader');
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
const { getBaselineData, logShapeDivergence, getBaselineStatus } = require('./baselineManager');
const { createVehicleSampleFreshnessTracker } = require('./detour/vehicleSampleFreshness');
const { buildDetourStorageConfig } = require('./detour/storageConfig');
const { getDetectorForStorageConfig } = require('./detour/detectorSelector');

const TICK_INTERVAL = 30_000;
const MAX_EVENTS = 20;
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

    const data = await getStaticData();
    if (data.lastRefresh !== lastGtfsRefresh) {
      if (lastGtfsRefresh !== null) logShapeDivergence(data);
      lastGtfsRefresh = data.lastRefresh;
    }

    const baseline = await getBaselineData(data);
    const baselineStatus = getBaselineStatus();
    if (REQUIRE_SAFE_BASELINE && !baselineStatus.readyForDetours) {
      throw new Error(
        `Unsafe detour baseline: ${baselineStatus.reason}. ${baselineStatus.message} ` +
        'Set a trusted baseline before running auto-detour detection, or set DETOUR_REQUIRE_SAFE_BASELINE=false for diagnostics only.'
      );
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
    const activeDetours = processVehicles(
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
        storageConfig: detourStorageConfig,
        suppressDeletesWhenEmpty,
        suppressDeleteReason: suppressDeletesWhenEmpty
          ? 'runtime-and-active-snapshot-hydration-empty'
          : undefined,
      });
      if (detourStorageConfig.detourVersion !== 'v2') {
        await syncPersistentDetours(getPersistentDetours(), getPersistentDetourGeometries());
      }
      await saveDetourRuntimeState(serializeDetectorRuntimeState(), {
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
    console.log(
      `[detourWorker] tick #${tickCount} (${source}): ` +
      `${vehicles.length}/${fetchedVehicles.length} fresh vehicles, ${detourCount} detours`
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
    vehicleFeed: getVehicleFeedStatus(),
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
