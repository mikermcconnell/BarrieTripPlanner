const { pointToPolylineDistance } = require('./geometry');
const { buildGeometry } = require('./detourGeometry');

const configuredThreshold = Number.parseFloat(process.env.DETOUR_OFF_ROUTE_THRESHOLD_METERS || '75');
const OFF_ROUTE_THRESHOLD_METERS = Number.isFinite(configuredThreshold) && configuredThreshold > 0
  ? configuredThreshold
  : 75;

const configuredOnRouteThreshold = Number.parseFloat(process.env.DETOUR_ON_ROUTE_CLEAR_THRESHOLD_METERS || '40');
const ON_ROUTE_CLEAR_THRESHOLD_METERS =
  Number.isFinite(configuredOnRouteThreshold) && configuredOnRouteThreshold > 0
    ? configuredOnRouteThreshold
    : 40;

const configuredClearGraceMs = Number.parseFloat(process.env.DETOUR_CLEAR_GRACE_MS || '600000');
const DETOUR_CLEAR_GRACE_MS =
  Number.isFinite(configuredClearGraceMs) && configuredClearGraceMs >= 0
    ? configuredClearGraceMs
    : 600_000;

const configuredMinActiveMs = Number.parseFloat(process.env.DETOUR_MIN_ACTIVE_MS || '300000');
const DETOUR_MIN_ACTIVE_MS =
  Number.isFinite(configuredMinActiveMs) && configuredMinActiveMs >= 0
    ? configuredMinActiveMs
    : 300_000;

const configuredClearConsecutive = Number.parseInt(process.env.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE || '6', 10);
const DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE =
  Number.isFinite(configuredClearConsecutive) && configuredClearConsecutive > 0
    ? configuredClearConsecutive
    : 6;

const CONSECUTIVE_READINGS_REQUIRED = 3;
const STALE_VEHICLE_TIMEOUT_MS = 5 * 60 * 1000;
let MIN_VEHICLES_FOR_DETOUR = 1;

const configuredEvidenceWindowMs = Number.parseFloat(
  process.env.DETOUR_EVIDENCE_WINDOW_MS || String(15 * 60 * 1000)
);
const EVIDENCE_WINDOW_MS =
  Number.isFinite(configuredEvidenceWindowMs) && configuredEvidenceWindowMs > 0
    ? configuredEvidenceWindowMs
    : 15 * 60 * 1000;

// State
const vehicleState = new Map();
const activeDetours = new Map();
const detourEvidence = new Map();

function setMinVehicles(n) {
  MIN_VEHICLES_FOR_DETOUR = n;
}

function clearVehicleState() {
  vehicleState.clear();
  activeDetours.clear();
  detourEvidence.clear();
}

function processVehicles(vehicles, shapes, routeShapeMapping) {
  const now = Date.now();

  // Track which vehicles we've seen this tick
  const seenVehicles = new Set();

  for (const vehicle of vehicles) {
    const { id, routeId, coordinate } = vehicle;
    if (!routeId || !coordinate) continue;

    seenVehicles.add(id);

    const shapeIds = routeShapeMapping.get(routeId);
    if (!shapeIds || shapeIds.length === 0) continue;

    // Find minimum distance across all shapes for this route
    let minDist = Infinity;
    for (const shapeId of shapeIds) {
      const polyline = shapes.get(shapeId);
      if (!polyline || polyline.length === 0) continue;
      const dist = pointToPolylineDistance(coordinate, polyline);
      if (dist < minDist) minDist = dist;
    }

    // Get or create vehicle state
    let state = vehicleState.get(id);
    if (!state) {
      state = { routeId, consecutiveOffRoute: 0, consecutiveOnRoute: 0, lastCheckedAt: now };
      vehicleState.set(id, state);
    }

    // Update route if changed
    if (state.routeId !== routeId) {
      // Vehicle switched routes — remove from old route's detour
      removeVehicleFromDetour(id, state.routeId, now);
      state.routeId = routeId;
      state.consecutiveOffRoute = 0;
      state.consecutiveOnRoute = 0;
    }

    state.lastCheckedAt = now;

    if (minDist > OFF_ROUTE_THRESHOLD_METERS) {
      // Vehicle is off-route
      state.consecutiveOffRoute++;
      state.consecutiveOnRoute = 0;
      if (state.consecutiveOffRoute >= CONSECUTIVE_READINGS_REQUIRED) {
        addVehicleToDetour(id, routeId, coordinate, now);
      }
    } else if (minDist <= ON_ROUTE_CLEAR_THRESHOLD_METERS) {
      // Vehicle is within the tighter clearing threshold
      state.consecutiveOffRoute = 0;
      state.consecutiveOnRoute++;
      const detour = activeDetours.get(routeId);
      if (detour && detour.vehiclesOffRoute.has(id)) {
        maybeRemoveVehicleFromDetour(id, routeId, state.consecutiveOnRoute, now);
      }
    } else {
      // Dead band (ON_ROUTE_CLEAR < minDist <= OFF_ROUTE) — hold current counts
    }
  }

  // Prune stale vehicles
  for (const [vehicleId, state] of vehicleState) {
    if (now - state.lastCheckedAt > STALE_VEHICLE_TIMEOUT_MS) {
      removeVehicleFromDetour(vehicleId, state.routeId, now);
      vehicleState.delete(vehicleId);
    }
  }

  tickClearPending(now);

  return getActiveDetours(shapes, routeShapeMapping);
}

function addVehicleToDetour(vehicleId, routeId, coordinate, now) {
  let detour = activeDetours.get(routeId);
  if (!detour) {
    detour = {
      detectedAt: new Date(),
      lastSeenAt: new Date(),
      triggerVehicleId: vehicleId,
      vehiclesOffRoute: new Set(),
      state: 'active',
      clearPendingAt: null,
    };
    activeDetours.set(routeId, detour);
  }
  detour.vehiclesOffRoute.add(vehicleId);
  detour.lastSeenAt = new Date();
  // If a vehicle returns off-route during clear-pending, reactivate
  if (detour.state === 'clear-pending') {
    detour.state = 'active';
    detour.clearPendingAt = null;
  }

  // Evidence capture
  if (coordinate) {
    let evidence = detourEvidence.get(routeId);
    if (!evidence) {
      evidence = { points: [] };
      detourEvidence.set(routeId, evidence);
    }
    const ts = now || Date.now();
    evidence.points.push({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      timestampMs: ts,
      vehicleId,
    });
    // Prune evidence older than the window
    const cutoff = ts - EVIDENCE_WINDOW_MS;
    if (evidence.points.length > 0 && evidence.points[0].timestampMs < cutoff) {
      const firstKeep = evidence.points.findIndex(p => p.timestampMs >= cutoff);
      if (firstKeep > 0) {
        evidence.points = evidence.points.slice(firstKeep);
      } else if (firstKeep === -1) {
        evidence.points = [];
      }
    }
  }
}

// Hard removal — used for route-switch and stale prune.
// Transitions to clear-pending instead of instant delete to respect grace period.
function removeVehicleFromDetour(vehicleId, routeId, now) {
  const detour = activeDetours.get(routeId);
  if (!detour) return;
  detour.vehiclesOffRoute.delete(vehicleId);
  if (detour.vehiclesOffRoute.size < MIN_VEHICLES_FOR_DETOUR) {
    if (detour.state !== 'clear-pending') {
      detour.state = 'clear-pending';
      detour.clearPendingAt = now || Date.now();
    }
  }
}

// Soft removal — used when a vehicle sustains on-route readings.
// Respects consecutive on-route threshold and grace period.
function maybeRemoveVehicleFromDetour(vehicleId, routeId, consecutiveOnRoute, now) {
  const detour = activeDetours.get(routeId);
  if (!detour) return;

  // Vehicle hasn't sustained enough on-route readings yet
  if (consecutiveOnRoute < DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE) return;

  // Check grace period BEFORE removing from the set.
  // During grace, vehicle stays in vehiclesOffRoute to keep the detour genuinely active.
  const detourAgeMs = now - detour.detectedAt.getTime();
  if (detourAgeMs < DETOUR_CLEAR_GRACE_MS) return;

  // Grace passed — remove vehicle from the set
  detour.vehiclesOffRoute.delete(vehicleId);

  // Other vehicles are still off-route — detour stays active
  if (detour.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) return;

  // All vehicles cleared — transition to clear-pending
  if (detour.state !== 'clear-pending') {
    detour.state = 'clear-pending';
    detour.clearPendingAt = now;
  }
}

// Runs at end of each tick to finalize or hold clear-pending detours.
function tickClearPending(now) {
  for (const [routeId, detour] of activeDetours) {
    if (detour.state !== 'clear-pending') continue;

    // If vehicles came back off-route, reactivate
    if (detour.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) {
      detour.state = 'active';
      detour.clearPendingAt = null;
      continue;
    }

    // If detour is within grace period, hold it (don't finalize)
    const detourAgeMs = now - detour.detectedAt.getTime();
    if (detourAgeMs < DETOUR_CLEAR_GRACE_MS) {
      continue;
    }

    // Grace period elapsed and no vehicles — require at least one tick in clear-pending
    // before finalizing (so the state is observable by worker and publisher)
    if (detour.clearPendingAt != null && now > detour.clearPendingAt) {
      activeDetours.delete(routeId);
      detourEvidence.delete(routeId);
    }
  }
}

function getActiveDetours(shapes, routeShapeMapping) {
  const now = Date.now();
  const result = {};
  for (const [routeId, detour] of activeDetours) {
    if (detour.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR ||
        detour.state === 'clear-pending') {
      const snapshot = { ...detour };
      if (shapes && routeShapeMapping) {
        const evidence = detourEvidence.get(routeId);
        const detectedAtMs = detour.detectedAt instanceof Date
          ? detour.detectedAt.getTime()
          : Number(detour.detectedAt);
        snapshot.geometry = buildGeometry(
          routeId, evidence, shapes, routeShapeMapping, now, detectedAtMs
        );
      } else {
        snapshot.geometry = null;
      }
      result[routeId] = snapshot;
    }
  }
  return result;
}

function getState() {
  return {
    vehicleCount: vehicleState.size,
    activeDetourCount: activeDetours.size,
    detours: Object.fromEntries(
      [...activeDetours].map(([routeId, d]) => [routeId, {
        vehicleCount: d.vehiclesOffRoute.size,
        detectedAt: d.detectedAt.toISOString(),
        triggerVehicleId: d.triggerVehicleId,
        state: d.state || 'active',
      }])
    ),
    detourStates: Object.fromEntries(
      [...activeDetours].map(([routeId, d]) => [routeId, d.state || 'active'])
    ),
  };
}

function getDetourEvidence() {
  const result = {};
  for (const [routeId, evidence] of detourEvidence) {
    result[routeId] = {
      pointCount: evidence.points.length,
      oldestMs: evidence.points[0]?.timestampMs ?? null,
      newestMs: evidence.points[evidence.points.length - 1]?.timestampMs ?? null,
    };
  }
  return result;
}

function getRawDetourEvidence() {
  const result = {};
  for (const [routeId, evidence] of detourEvidence) {
    result[routeId] = {
      pointCount: evidence.points.length,
      oldestMs: evidence.points[0]?.timestampMs ?? null,
      newestMs: evidence.points[evidence.points.length - 1]?.timestampMs ?? null,
      uniqueVehicles: new Set(evidence.points.map(p => p.vehicleId)).size,
      points: evidence.points.map(p => ({
        lat: p.latitude,
        lon: p.longitude,
        ts: p.timestampMs,
        v: p.vehicleId,
      })),
    };
  }
  return result;
}

module.exports = {
  processVehicles,
  clearVehicleState,
  getActiveDetours,
  getState,
  getDetourEvidence,
  getRawDetourEvidence,
  setMinVehicles,
  OFF_ROUTE_THRESHOLD_METERS,
  ON_ROUTE_CLEAR_THRESHOLD_METERS,
  CONSECUTIVE_READINGS_REQUIRED,
  DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  DETOUR_CLEAR_GRACE_MS,
  DETOUR_MIN_ACTIVE_MS,
  EVIDENCE_WINDOW_MS,
};
