const { pointToPolylineDistance } = require('./geometry');

const configuredThreshold = Number.parseFloat(process.env.DETOUR_OFF_ROUTE_THRESHOLD_METERS || '75');
const OFF_ROUTE_THRESHOLD_METERS = Number.isFinite(configuredThreshold) && configuredThreshold > 0
  ? configuredThreshold
  : 75;
const CONSECUTIVE_READINGS_REQUIRED = 3;
const STALE_VEHICLE_TIMEOUT_MS = 5 * 60 * 1000;
let MIN_VEHICLES_FOR_DETOUR = 1;

// State
const vehicleState = new Map();
const activeDetours = new Map();

function setMinVehicles(n) {
  MIN_VEHICLES_FOR_DETOUR = n;
}

function clearVehicleState() {
  vehicleState.clear();
  activeDetours.clear();
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
      state = { routeId, consecutiveOffRoute: 0, lastCheckedAt: now };
      vehicleState.set(id, state);
    }

    // Update route if changed
    if (state.routeId !== routeId) {
      // Vehicle switched routes — reset
      removeVehicleFromDetour(id, state.routeId);
      state.routeId = routeId;
      state.consecutiveOffRoute = 0;
    }

    state.lastCheckedAt = now;

    if (minDist > OFF_ROUTE_THRESHOLD_METERS) {
      state.consecutiveOffRoute++;
      if (state.consecutiveOffRoute >= CONSECUTIVE_READINGS_REQUIRED) {
        addVehicleToDetour(id, routeId);
      }
    } else {
      if (state.consecutiveOffRoute > 0) {
        state.consecutiveOffRoute = 0;
        removeVehicleFromDetour(id, routeId);
      }
    }
  }

  // Prune stale vehicles
  for (const [vehicleId, state] of vehicleState) {
    if (now - state.lastCheckedAt > STALE_VEHICLE_TIMEOUT_MS) {
      removeVehicleFromDetour(vehicleId, state.routeId);
      vehicleState.delete(vehicleId);
    }
  }

  return getActiveDetours();
}

function addVehicleToDetour(vehicleId, routeId) {
  let detour = activeDetours.get(routeId);
  if (!detour) {
    detour = {
      detectedAt: new Date(),
      lastSeenAt: new Date(),
      triggerVehicleId: vehicleId,
      vehiclesOffRoute: new Set(),
    };
    activeDetours.set(routeId, detour);
  }
  detour.vehiclesOffRoute.add(vehicleId);
  detour.lastSeenAt = new Date();
}

function removeVehicleFromDetour(vehicleId, routeId) {
  const detour = activeDetours.get(routeId);
  if (!detour) return;
  detour.vehiclesOffRoute.delete(vehicleId);
  if (detour.vehiclesOffRoute.size < MIN_VEHICLES_FOR_DETOUR) {
    activeDetours.delete(routeId);
  }
}

function getActiveDetours() {
  const result = {};
  for (const [routeId, detour] of activeDetours) {
    if (detour.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) {
      result[routeId] = { ...detour };
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
      }])
    ),
  };
}

module.exports = {
  processVehicles,
  clearVehicleState,
  getActiveDetours,
  getState,
  setMinVehicles,
  OFF_ROUTE_THRESHOLD_METERS,
  CONSECUTIVE_READINGS_REQUIRED,
};
