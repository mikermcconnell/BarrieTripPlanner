const { getStaticData } = require('./gtfsLoader');
const { fetchVehicles, errors: fetchErrors } = require('./vehicleFetcher');
const {
  processVehicles,
  getState,
  hydratePersistentDetours,
  getPersistentDetours,
  serializeDetectorRuntimeState,
  hydrateRuntimeState,
} = require('./detourDetector');
const { publishDetours } = require('./detourPublisher');
const { loadPersistentDetours, syncPersistentDetours } = require('./persistentDetourStore');
const {
  loadDetourRuntimeState,
  saveDetourRuntimeState,
} = require('./detourRuntimeStateStore');
const { getBaselineData, logShapeDivergence, getBaselineStatus } = require('./baselineManager');

const TICK_INTERVAL = 30_000;
const MAX_EVENTS = 20;
const REQUIRE_SAFE_BASELINE = process.env.DETOUR_REQUIRE_SAFE_BASELINE !== 'false';

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

async function ensurePersistentDetoursHydrated() {
  if (persistentDetoursHydrated) return;
  const records = await loadPersistentDetours();
  hydratePersistentDetours(records);
  persistentDetoursHydrated = true;
}

async function ensureRuntimeStateHydrated({ force = false } = {}) {
  if (runtimeStateHydrated && !force) return;
  const snapshot = await loadDetourRuntimeState();
  if (snapshot) {
    hydrateRuntimeState(snapshot);
  }
  runtimeStateHydrated = true;
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
    await ensurePersistentDetoursHydrated();
    await ensureRuntimeStateHydrated({ force: forceReloadState });

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
    const vehicles = await fetchVehicles(tripObj);

    const prevSnapshot = getState();
    const activeDetours = processVehicles(vehicles, baseline.shapes, baseline.routeShapeMapping, data.tripMapping);
    recordStateTransitions(prevSnapshot, activeDetours);

    try {
      await publishDetours(activeDetours, {
        vehicles,
        scheduleIndex: data.scheduleIndex,
      });
      await syncPersistentDetours(getPersistentDetours());
      await saveDetourRuntimeState(serializeDetectorRuntimeState());
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
      `[detourWorker] tick #${tickCount} (${source}): ${vehicles.length} vehicles, ${detourCount} detours`
    );

    return {
      ok: true,
      skipped: false,
      vehiclesProcessed: vehicles.length,
      detourCount,
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
