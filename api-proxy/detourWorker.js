const { getStaticData } = require('./gtfsLoader');
const { fetchVehicles, errors: fetchErrors } = require('./vehicleFetcher');
const { processVehicles, clearVehicleState, getState } = require('./detourDetector');
const { publishDetours, getLastPublishedIds } = require('./detourPublisher');

const TICK_INTERVAL = 30_000;
const MAX_EVENTS = 20;

let interval = null;
let running = false;
let tickCount = 0;
let lastSuccessfulTick = null;
let lastDetourPublishAt = null;
let consecutiveFailureCount = 0;
let lastGtfsRefresh = null;
let tickInProgress = false;
let publishFailures = 0;
const recentEvents = [];

function addEvent(msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  recentEvents.push(`${msg} at ${ts}`);
  if (recentEvents.length > MAX_EVENTS) recentEvents.shift();
}

function detourKeys(detours) {
  return new Set(Object.keys(detours));
}

async function tick() {
  if (tickInProgress) return;
  tickInProgress = true;
  try {
    const data = await getStaticData();
    if (data.lastRefresh !== lastGtfsRefresh) {
      if (lastGtfsRefresh !== null) clearVehicleState();
      lastGtfsRefresh = data.lastRefresh;
    }

    const tripObj = Object.fromEntries(data.tripMapping);
    const vehicles = await fetchVehicles(tripObj);

    const prevKeys = detourKeys(getState().detours || {});
    const activeDetours = processVehicles(vehicles, data.shapes, data.routeShapeMapping);
    const currKeys = detourKeys(activeDetours);

    for (const k of currKeys) {
      if (!prevKeys.has(k)) addEvent(`Route ${k}: detour detected`);
    }
    for (const k of prevKeys) {
      if (!currKeys.has(k)) addEvent(`Route ${k}: detour cleared`);
    }

    try {
      await publishDetours(activeDetours);
      if (currKeys.size > 0) lastDetourPublishAt = new Date().toISOString();
    } catch (err) {
      publishFailures++;
      throw err;
    }

    tickCount++;
    lastSuccessfulTick = new Date().toISOString();
    consecutiveFailureCount = 0;
    const detourCount = Object.keys(activeDetours).length;
    console.log(`[detourWorker] tick #${tickCount}: ${vehicles.length} vehicles, ${detourCount} detours`);
  } catch (err) {
    consecutiveFailureCount++;
    console.error(`[detourWorker] tick failed (${consecutiveFailureCount} consecutive):`, err.message);
  } finally {
    tickInProgress = false;
  }
}

function start() {
  if (interval) return;
  running = true;
  console.log('[detourWorker] Starting detour detection loop (30s interval)');
  tick();
  interval = setInterval(tick, TICK_INTERVAL);
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
  for (const [routeId, d] of Object.entries(state.detours || {})) {
    detourSummary[routeId] = { vehicleCount: d.vehicleCount, detectedAt: d.detectedAt };
  }
  return {
    running,
    tickCount,
    lastSuccessfulTick,
    lastDetourPublishAt,
    consecutiveFailureCount,
    lastGtfsRefresh: lastGtfsRefresh ? new Date(lastGtfsRefresh).toISOString() : null,
    activeDetours: detourSummary,
    recentEvents: [...recentEvents],
    errors: { fetchFailures: fetchErrors.fetchFailures, publishFailures },
  };
}

module.exports = { start, stop, getStatus };
