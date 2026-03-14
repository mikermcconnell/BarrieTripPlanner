const { pointToPolylineDistance } = require('./geometry');
const {
  buildGeometry,
  findClosestShapePoint,
  findAnchors,
  MIN_EVIDENCE_FOR_GEOMETRY,
  reconcileRouteFamilyGeometries,
} = require('./detourGeometry');
const { getRouteDetectorConfig, ROUTE_DETECTOR_OVERRIDES } = require('./detourRouteConfig');

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

const configuredClearConsecutive = Number.parseInt(process.env.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE || '6', 10);
const DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE =
  Number.isFinite(configuredClearConsecutive) && configuredClearConsecutive > 0
    ? configuredClearConsecutive
    : 6;

const configuredNoVehicleTimeoutMs = Number.parseFloat(
  process.env.DETOUR_NO_VEHICLE_TIMEOUT_MS || String(30 * 60 * 1000)
);
const DETOUR_NO_VEHICLE_TIMEOUT_MS =
  Number.isFinite(configuredNoVehicleTimeoutMs) && configuredNoVehicleTimeoutMs > 0
    ? configuredNoVehicleTimeoutMs
    : 30 * 60 * 1000;

const configuredConsecutiveReadings = Number.parseInt(process.env.DETOUR_CONSECUTIVE_READINGS || '4', 10);
const CONSECUTIVE_READINGS_REQUIRED =
  Number.isFinite(configuredConsecutiveReadings) && configuredConsecutiveReadings > 0
    ? configuredConsecutiveReadings
    : 4;
const STALE_VEHICLE_TIMEOUT_MS = 5 * 60 * 1000;
const configuredMinUniqueVehicles = Number.parseInt(process.env.DETOUR_MIN_UNIQUE_VEHICLES || '1', 10);
const DEFAULT_MIN_VEHICLES_FOR_DETOUR =
  Number.isFinite(configuredMinUniqueVehicles) && configuredMinUniqueVehicles > 0
    ? configuredMinUniqueVehicles
    : 1;
let MIN_VEHICLES_FOR_DETOUR = DEFAULT_MIN_VEHICLES_FOR_DETOUR;

const configuredEvidenceWindowMs = Number.parseFloat(
  process.env.DETOUR_EVIDENCE_WINDOW_MS || String(15 * 60 * 1000)
);
const EVIDENCE_WINDOW_MS =
  Number.isFinite(configuredEvidenceWindowMs) && configuredEvidenceWindowMs > 0
    ? configuredEvidenceWindowMs
    : 15 * 60 * 1000;

const SERVICE_START_HOUR = Number.parseInt(process.env.DETOUR_SERVICE_START_HOUR || '5', 10);
const SERVICE_END_HOUR = Number.parseInt(process.env.DETOUR_SERVICE_END_HOUR || '1', 10);
const SERVICE_TIMEZONE = process.env.DETOUR_SERVICE_TIMEZONE || 'America/Toronto';

const BASE_ROUTE_DETECTOR_CONFIG = Object.freeze({
  offRouteThresholdMeters: OFF_ROUTE_THRESHOLD_METERS,
  onRouteClearThresholdMeters: ON_ROUTE_CLEAR_THRESHOLD_METERS,
  consecutiveReadingsRequired: CONSECUTIVE_READINGS_REQUIRED,
  clearConsecutiveOnRoute: DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  clearGraceMs: DETOUR_CLEAR_GRACE_MS,
  noVehicleTimeoutMs: DETOUR_NO_VEHICLE_TIMEOUT_MS,
  evidenceWindowMs: EVIDENCE_WINDOW_MS,
});

function isWithinServiceHours(nowMs) {
  const d = new Date(nowMs);
  const hour = Number.parseInt(
    d.toLocaleString('en-US', { timeZone: SERVICE_TIMEZONE, hour: 'numeric', hour12: false }),
    10
  );
  if (SERVICE_START_HOUR > SERVICE_END_HOUR) {
    return hour >= SERVICE_START_HOUR || hour < SERVICE_END_HOUR;
  }
  return hour >= SERVICE_START_HOUR && hour < SERVICE_END_HOUR;
}

const vehicleState = new Map();
const activeDetours = new Map();
const detourEvidence = new Map();
let wasInService = true;
let lastReportedDetours = null;

function setMinVehicles(n) {
  MIN_VEHICLES_FOR_DETOUR = n;
}

function resolveRouteDetectorConfig(routeId) {
  return getRouteDetectorConfig(routeId, BASE_ROUTE_DETECTOR_CONFIG);
}

function clearVehicleState() {
  vehicleState.clear();
  activeDetours.clear();
  detourEvidence.clear();
  MIN_VEHICLES_FOR_DETOUR = DEFAULT_MIN_VEHICLES_FOR_DETOUR;
  wasInService = true;
  lastReportedDetours = null;
}

function isInDetourZoneCore(coordinate, detour, shapes) {
  if (!detour.detourZone) return false;
  const polyline = shapes.get(detour.detourZone.shapeId);
  if (!polyline || polyline.length < 2) return false;
  const result = findClosestShapePoint(coordinate, polyline);
  if (!result) return false;
  const clearThreshold = detour.routeConfig?.onRouteClearThresholdMeters || ON_ROUTE_CLEAR_THRESHOLD_METERS;
  if (result.distanceMeters > clearThreshold * 3) return false;
  return result.index >= detour.detourZone.coreStart && result.index <= detour.detourZone.coreEnd;
}

function clearDetoursForOutOfService() {
  vehicleState.clear();
  activeDetours.clear();
  detourEvidence.clear();
  lastReportedDetours = null;
}

function markDetourPublishedIfEligible(detour) {
  if (!detour || detour.isPublished) return;
  if (detour.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) {
    detour.isPublished = true;
  }
}

function getOrCreateDetourEvidence(routeId) {
  let evidence = detourEvidence.get(routeId);
  if (!evidence) {
    evidence = {
      points: [],
      entryCandidates: [],
      exitCandidates: [],
    };
    detourEvidence.set(routeId, evidence);
  } else {
    if (!Array.isArray(evidence.points)) evidence.points = [];
    if (!Array.isArray(evidence.entryCandidates)) evidence.entryCandidates = [];
    if (!Array.isArray(evidence.exitCandidates)) evidence.exitCandidates = [];
  }
  return evidence;
}

function pruneEvidenceWindow(evidence, cutoff) {
  if (!evidence || !Number.isFinite(cutoff)) return;

  for (const key of ['points', 'entryCandidates', 'exitCandidates']) {
    const items = Array.isArray(evidence[key]) ? evidence[key] : [];
    if (items.length === 0) {
      evidence[key] = [];
      continue;
    }

    const firstKeep = items.findIndex((item) => item.timestampMs >= cutoff);
    if (firstKeep > 0) {
      evidence[key] = items.slice(firstKeep);
    } else if (firstKeep === -1) {
      evidence[key] = [];
    } else {
      evidence[key] = items;
    }
  }
}

function recordBoundaryCandidate(routeId, candidateType, observation, vehicleId, routeConfig, tripShapeId = null) {
  if (!routeId || !observation?.coordinate || !Number.isFinite(observation.timestampMs)) return;

  const evidence = getOrCreateDetourEvidence(routeId);
  const listKey = candidateType === 'exit' ? 'exitCandidates' : 'entryCandidates';
  const candidates = evidence[listKey];
  const lastCandidate = candidates[candidates.length - 1];

  if (
    lastCandidate &&
    lastCandidate.vehicleId === vehicleId &&
    lastCandidate.timestampMs === observation.timestampMs
  ) {
    return;
  }

  candidates.push({
    latitude: observation.coordinate.latitude,
    longitude: observation.coordinate.longitude,
    timestampMs: observation.timestampMs,
    vehicleId,
    tripShapeId: tripShapeId || null,
  });

  const evidenceWindowMs = routeConfig?.evidenceWindowMs || EVIDENCE_WINDOW_MS;
  pruneEvidenceWindow(evidence, observation.timestampMs - evidenceWindowMs);
}

function clearExitCandidatesAfter(routeId, cutoffMs) {
  const evidence = detourEvidence.get(routeId);
  if (!evidence || !Array.isArray(evidence.exitCandidates) || !Number.isFinite(cutoffMs)) return;
  evidence.exitCandidates = evidence.exitCandidates.filter((candidate) => candidate.timestampMs < cutoffMs);
}

function processVehicles(vehicles, shapes, routeShapeMapping, tripMapping) {
  const now = Date.now();
  const inService = isWithinServiceHours(now);

  if (!inService) {
    if (wasInService) {
      clearDetoursForOutOfService();
      wasInService = false;
    }
    return getActiveDetours(shapes, routeShapeMapping);
  }

  if (!wasInService) {
    wasInService = true;
  }

  for (const [routeId, detour] of activeDetours) {
    const evidence = detourEvidence.get(routeId);
    if (!evidence || evidence.points.length < MIN_EVIDENCE_FOR_GEOMETRY) {
      detour.detourZone = null;
      continue;
    }
    const shapeIds = routeShapeMapping.get(routeId);
    if (!shapeIds || shapeIds.length === 0) {
      detour.detourZone = null;
      continue;
    }
    const anchors = findAnchors(evidence.points, shapes, shapeIds);
    if (!anchors) {
      detour.detourZone = null;
      continue;
    }
    const span = anchors.exitIndex - anchors.entryIndex;
    if (span < 2) {
      detour.detourZone = null;
      continue;
    }
    const shrink = Math.max(1, Math.floor(span * 0.25));
    detour.detourZone = {
      shapeId: anchors.shapeId,
      entryIndex: anchors.entryIndex,
      exitIndex: anchors.exitIndex,
      coreStart: anchors.entryIndex + shrink,
      coreEnd: anchors.exitIndex - shrink,
    };
  }

  for (const vehicle of vehicles) {
    const { id, routeId, coordinate } = vehicle;
    if (!routeId || !coordinate) continue;
    const routeConfig = resolveRouteDetectorConfig(routeId);

    const shapeIds = routeShapeMapping.get(routeId);
    if (!shapeIds || shapeIds.length === 0) continue;

    let minDist = Infinity;
    const tripData = vehicle.tripId && tripMapping ? tripMapping.get(vehicle.tripId) : null;
    const tripShapeId = tripData?.shapeId ?? null;

    if (tripShapeId) {
      const polyline = shapes.get(tripShapeId);
      if (polyline && polyline.length > 0) {
        minDist = pointToPolylineDistance(coordinate, polyline);
      }
    }

    if (minDist === Infinity) {
      for (const shapeId of shapeIds) {
        const polyline = shapes.get(shapeId);
        if (!polyline || polyline.length === 0) continue;
        const dist = pointToPolylineDistance(coordinate, polyline);
        if (dist < minDist) minDist = dist;
      }
    }

    let state = vehicleState.get(id);
    if (!state) {
      state = {
        routeId,
        consecutiveOffRoute: 0,
        consecutiveOnRoute: 0,
        lastCheckedAt: now,
        lastOnRouteObservation: null,
        offRouteStreakStart: null,
        onRouteStreakStart: null,
        tripShapeId: null,
      };
      vehicleState.set(id, state);
    }

    if (state.routeId !== routeId) {
      const oldDetour = activeDetours.get(state.routeId);
      if (oldDetour) {
        oldDetour.vehiclesOffRoute.delete(id);
      }
      state.routeId = routeId;
      state.consecutiveOffRoute = 0;
      state.consecutiveOnRoute = 0;
      state.lastOnRouteObservation = null;
      state.offRouteStreakStart = null;
      state.onRouteStreakStart = null;
      state.tripShapeId = null;
    }

    state.lastCheckedAt = now;
    state.tripShapeId = tripShapeId || null;

    if (minDist > routeConfig.offRouteThresholdMeters) {
      if (state.consecutiveOffRoute === 0) {
        state.offRouteStreakStart = {
          coordinate,
          timestampMs: now,
        };
      }

      state.consecutiveOffRoute++;
      state.consecutiveOnRoute = 0;
      state.onRouteStreakStart = null;

      if (state.consecutiveOffRoute >= routeConfig.consecutiveReadingsRequired) {
        addVehicleToDetour(id, routeId, coordinate, now, {
          entryObservation: state.lastOnRouteObservation || state.offRouteStreakStart,
          tripShapeId,
        });
      }
    } else if (minDist <= routeConfig.onRouteClearThresholdMeters) {
      state.consecutiveOffRoute = 0;
      state.offRouteStreakStart = null;
      state.lastOnRouteObservation = {
        coordinate,
        timestampMs: now,
      };

      const detour = activeDetours.get(routeId);
      if (detour && detour.vehiclesOffRoute.has(id)) {
        if (!detour.detourZone || isInDetourZoneCore(coordinate, detour, shapes)) {
          if (!state.onRouteStreakStart) {
            state.onRouteStreakStart = {
              coordinate,
              timestampMs: now,
            };
          }
          state.consecutiveOnRoute++;
          maybeRemoveVehicleFromDetour(
            id,
            routeId,
            state.consecutiveOnRoute,
            now,
            state.onRouteStreakStart,
            state.tripShapeId
          );
        } else {
          state.consecutiveOnRoute = 0;
          state.onRouteStreakStart = null;
        }
      } else {
        state.consecutiveOnRoute++;
        state.onRouteStreakStart = null;
      }
    } else {
      // Dead band (ON_ROUTE_CLEAR < minDist <= OFF_ROUTE) — hold current counts
    }
  }

  for (const [vehicleId, state] of vehicleState) {
    if (now - state.lastCheckedAt > STALE_VEHICLE_TIMEOUT_MS) {
      const detour = activeDetours.get(state.routeId);
      if (detour) {
        detour.vehiclesOffRoute.delete(vehicleId);
      }
      vehicleState.delete(vehicleId);
    }
  }

  tickClearPending(now);

  return getActiveDetours(shapes, routeShapeMapping);
}

function addVehicleToDetour(vehicleId, routeId, coordinate, now, boundarySignals = {}) {
  const routeConfig = resolveRouteDetectorConfig(routeId);
  let detour = activeDetours.get(routeId);
  if (!detour) {
    detour = {
      detectedAt: new Date(now || Date.now()),
      lastSeenAt: new Date(now || Date.now()),
      triggerVehicleId: vehicleId,
      vehiclesOffRoute: new Set(),
      state: 'active',
      clearPendingAt: null,
      lastOffRouteEvidenceAt: now || Date.now(),
      routeConfig,
      isPublished: MIN_VEHICLES_FOR_DETOUR <= 1,
    };
    activeDetours.set(routeId, detour);
  }

  const vehicleWasAlreadyOffRoute = detour.vehiclesOffRoute.has(vehicleId);
  detour.routeConfig = routeConfig;
  detour.vehiclesOffRoute.add(vehicleId);
  detour.lastSeenAt = new Date(now || Date.now());
  detour.lastOffRouteEvidenceAt = now || Date.now();
  markDetourPublishedIfEligible(detour);

  if (detour.state === 'clear-pending') {
    clearExitCandidatesAfter(routeId, detour.clearPendingAt);
    detour.state = 'active';
    detour.clearPendingAt = null;
  }

  if (!vehicleWasAlreadyOffRoute && boundarySignals.entryObservation) {
    recordBoundaryCandidate(
      routeId,
      'entry',
      boundarySignals.entryObservation,
      vehicleId,
      routeConfig,
      boundarySignals.tripShapeId
    );
  }

  if (coordinate) {
    const evidence = getOrCreateDetourEvidence(routeId);
    const ts = now || Date.now();
    evidence.points.push({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      timestampMs: ts,
      vehicleId,
      tripShapeId: boundarySignals.tripShapeId || null,
    });
    pruneEvidenceWindow(evidence, ts - routeConfig.evidenceWindowMs);
  }
}

function maybeRemoveVehicleFromDetour(
  vehicleId,
  routeId,
  consecutiveOnRoute,
  now,
  onRouteStartObservation = null,
  tripShapeId = null
) {
  const detour = activeDetours.get(routeId);
  if (!detour) return;
  const routeConfig = detour.routeConfig || BASE_ROUTE_DETECTOR_CONFIG;

  if (consecutiveOnRoute < routeConfig.clearConsecutiveOnRoute) return;

  const detourAgeMs = now - detour.detectedAt.getTime();
  if (detourAgeMs < routeConfig.clearGraceMs) return;

  detour.vehiclesOffRoute.delete(vehicleId);
  if (onRouteStartObservation) {
    recordBoundaryCandidate(routeId, 'exit', onRouteStartObservation, vehicleId, routeConfig, tripShapeId);
  }

  if (detour.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) return;

  if (!detour.isPublished) {
    activeDetours.delete(routeId);
    detourEvidence.delete(routeId);
    return;
  }

  if (detour.state !== 'clear-pending') {
    detour.state = 'clear-pending';
    detour.clearPendingAt = now;
  }
}

function tickClearPending(now) {
  for (const [routeId, detour] of activeDetours) {
    const routeConfig = detour.routeConfig || BASE_ROUTE_DETECTOR_CONFIG;

    if (detour.state === 'active' && detour.vehiclesOffRoute.size < MIN_VEHICLES_FOR_DETOUR) {
      const lastEvidence = detour.lastOffRouteEvidenceAt || detour.detectedAt.getTime();
      if (now - lastEvidence >= routeConfig.noVehicleTimeoutMs) {
        if (detour.isPublished) {
          detour.state = 'clear-pending';
          detour.clearPendingAt = now;
        } else {
          activeDetours.delete(routeId);
          detourEvidence.delete(routeId);
        }
      }
      continue;
    }

    if (detour.state !== 'clear-pending') continue;

    if (detour.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) {
      detour.state = 'active';
      detour.clearPendingAt = null;
      continue;
    }

    const detourAgeMs = now - detour.detectedAt.getTime();
    if (detourAgeMs < routeConfig.clearGraceMs) {
      continue;
    }

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
    if (!detour.isPublished) continue;
    const snapshot = { ...detour };
    delete snapshot.detourZone;
    delete snapshot.routeConfig;
    delete snapshot.isPublished;
    if (shapes && routeShapeMapping) {
      const evidence = detourEvidence.get(routeId);
      const detectedAtMs = detour.detectedAt instanceof Date
        ? detour.detectedAt.getTime()
        : Number(detour.detectedAt);
      snapshot.geometry = buildGeometry(
        routeId,
        evidence,
        shapes,
        routeShapeMapping,
        now,
        detectedAtMs
      );
    } else {
      snapshot.geometry = null;
    }
    result[routeId] = snapshot;
  }
  if (shapes && routeShapeMapping) {
    reconcileRouteFamilyGeometries(result, shapes, routeShapeMapping);
  }
  lastReportedDetours = result;
  return result;
}

function getState() {
  const reportedEntries = lastReportedDetours != null
    ? Object.entries(lastReportedDetours)
    : null;
  const publishedDetours = reportedEntries != null
    && (reportedEntries.length > 0 || activeDetours.size === 0)
    ? reportedEntries
    : [...activeDetours]
      .filter(([, detour]) => detour.isPublished)
      .map(([routeId, detour]) => [routeId, detour]);
  return {
    vehicleCount: vehicleState.size,
    activeDetourCount: publishedDetours.length,
    detours: Object.fromEntries(
      publishedDetours.map(([routeId, d]) => [routeId, {
        vehicleCount: d.vehiclesOffRoute?.size || d.vehicleCount || 0,
        detectedAt: (d.detectedAt instanceof Date ? d.detectedAt : new Date(d.detectedAt)).toISOString(),
        triggerVehicleId: d.triggerVehicleId,
        state: d.state || 'active',
      }])
    ),
    detourStates: Object.fromEntries(
      publishedDetours.map(([routeId, d]) => [routeId, d.state || 'active'])
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
      uniqueVehicles: new Set(evidence.points.map((p) => p.vehicleId)).size,
      entryCandidates: Array.isArray(evidence.entryCandidates)
        ? evidence.entryCandidates.map((p) => ({
          lat: p.latitude,
          lon: p.longitude,
          ts: p.timestampMs,
          v: p.vehicleId,
        }))
        : [],
      exitCandidates: Array.isArray(evidence.exitCandidates)
        ? evidence.exitCandidates.map((p) => ({
          lat: p.latitude,
          lon: p.longitude,
          ts: p.timestampMs,
          v: p.vehicleId,
        }))
        : [],
      points: evidence.points.map((p) => ({
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
  resolveRouteDetectorConfig,
  ROUTE_DETECTOR_OVERRIDES,
  isWithinServiceHours,
  OFF_ROUTE_THRESHOLD_METERS,
  ON_ROUTE_CLEAR_THRESHOLD_METERS,
  CONSECUTIVE_READINGS_REQUIRED,
  DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  DETOUR_CLEAR_GRACE_MS,
  DETOUR_NO_VEHICLE_TIMEOUT_MS,
  EVIDENCE_WINDOW_MS,
  SERVICE_START_HOUR,
  SERVICE_END_HOUR,
  SERVICE_TIMEZONE,
};
