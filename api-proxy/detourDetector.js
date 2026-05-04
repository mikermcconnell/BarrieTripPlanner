const { haversineDistance } = require('./geometry');
const {
  buildGeometry,
  buildCumulativeDistances,
  findClosestShapePoint,
  findAnchors,
  MIN_EVIDENCE_FOR_GEOMETRY,
  pickPrimarySegment,
  reconcileRouteFamilyGeometries,
  SEGMENT_GAP_METERS,
} = require('./detourGeometry');
const { getRouteDetectorConfig, ROUTE_DETECTOR_OVERRIDES } = require('./detourRouteConfig');
const {
  vehicleState,
  activeDetours,
  detourEvidence,
  persistentDetourCandidates,
  learnedPersistentDetours,
  recurringShortDeviationCandidates,
  clearDetourState,
} = require('./detour/state');
const {
  OFF_ROUTE_THRESHOLD_METERS,
  ON_ROUTE_CLEAR_THRESHOLD_METERS,
  DETOUR_CLEAR_GRACE_MS,
  DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  DETOUR_NO_VEHICLE_TIMEOUT_MS,
  CONSECUTIVE_READINGS_REQUIRED,
  STALE_VEHICLE_TIMEOUT_MS,
  DEFAULT_MIN_VEHICLES_FOR_DETOUR,
  EVIDENCE_WINDOW_MS,
  DETOUR_PERSIST_CONSECUTIVE_MATCHES,
  DETOUR_PERSIST_MIN_AGE_MS,
  RECURRING_SHORT_DEVIATION_ENABLED,
  RECURRING_SHORT_DEVIATION_WINDOW_MS,
  RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS,
  RECURRING_SHORT_DEVIATION_MIN_UNIQUE_SIGNATURES,
  RECURRING_SHORT_DEVIATION_MAX_GAP_METERS,
  RECURRING_SHORT_DEVIATION_MAX_STREAK_READINGS,
  SERVICE_START_HOUR,
  SERVICE_END_HOUR,
  SERVICE_TIMEZONE,
  BASE_ROUTE_DETECTOR_CONFIG,
  isWithinServiceHours,
} = require('./detour/detectionConfig');
const { cloneJson, createDetectorReadModel } = require('./detour/readModel');
const { createRuntimeStatePersistence } = require('./detour/runtimeState');
const {
  createRouteDetourState,
  createSegmentState: createSegmentStateRecord,
  getSegmentCount,
  getRouteVehicleCount,
  hasPublishedSegments,
} = require('./detour/lifecycle');

let MIN_VEHICLES_FOR_DETOUR = DEFAULT_MIN_VEHICLES_FOR_DETOUR;
let wasInService = true;
let lastReportedDetours = null;

function setMinVehicles(n) {
  MIN_VEHICLES_FOR_DETOUR = n;
}

function resolveRouteDetectorConfig(routeId) {
  return getRouteDetectorConfig(routeId, BASE_ROUTE_DETECTOR_CONFIG);
}

function clearVehicleState() {
  clearDetourState();
  MIN_VEHICLES_FOR_DETOUR = DEFAULT_MIN_VEHICLES_FOR_DETOUR;
  wasInService = true;
  lastReportedDetours = null;
}

function toTimestampMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') {
    const dateValue = value.toDate();
    return dateValue instanceof Date ? dateValue.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateOrNow(value, fallback = Date.now()) {
  const timestampMs = toTimestampMs(value);
  return new Date(Number.isFinite(timestampMs) ? timestampMs : fallback);
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object') return null;
  const latitude = Number(point.latitude ?? point.lat);
  const longitude = Number(point.longitude ?? point.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function pointKey(point) {
  const normalized = normalizePoint(point);
  if (!normalized) return null;
  return `${normalized.latitude.toFixed(4)}:${normalized.longitude.toFixed(4)}`;
}

function normalizeObservation(observation) {
  if (!observation || typeof observation !== 'object') return null;
  const coordinate = normalizePoint(observation.coordinate);
  const timestampMs = toTimestampMs(observation.timestampMs);
  if (!coordinate || !Number.isFinite(timestampMs)) return null;
  return { coordinate, timestampMs };
}

function normalizeEvidenceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const latitude = Number(entry.latitude);
  const longitude = Number(entry.longitude);
  const timestampMs = toTimestampMs(entry.timestampMs);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(timestampMs)) {
    return null;
  }
  return {
    latitude,
    longitude,
    timestampMs,
    vehicleId: entry.vehicleId || null,
    tripShapeId: entry.tripShapeId || null,
    tripId: entry.tripId || null,
    recurringObservationId: entry.recurringObservationId || null,
  };
}

function makeEvidenceEntry(coordinate, timestampMs, vehicleId, tripShapeId = null) {
  const point = normalizePoint(coordinate);
  const ts = toTimestampMs(timestampMs);
  if (!point || !Number.isFinite(ts)) return null;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    timestampMs: ts,
    vehicleId: vehicleId || null,
    tripShapeId: tripShapeId || null,
  };
}

function appendEvidencePoint(points, entry) {
  const normalized = normalizeEvidenceEntry(entry);
  if (!normalized || !Array.isArray(points)) return;
  points.push(normalized);
}

function hasRenderableGeometry(geometry) {
  if (!geometry) return false;
  const segments = Array.isArray(geometry.segments) ? geometry.segments : [];
  if (segments.some((segment) =>
    (Array.isArray(segment?.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2) ||
    (Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2)
  )) {
    return true;
  }
  return (
    Array.isArray(geometry.skippedSegmentPolyline) && geometry.skippedSegmentPolyline.length >= 2
  ) || (
    Array.isArray(geometry.inferredDetourPolyline) && geometry.inferredDetourPolyline.length >= 2
  );
}

function createSegmentState(segmentId, routeConfig, now, vehicleId, projection = null) {
  return createSegmentStateRecord({
    segmentId,
    routeConfig,
    now,
    vehicleId,
    projection,
    minVehiclesForDetour: MIN_VEHICLES_FOR_DETOUR,
  });
}

function getOrCreateRouteDetourState(routeId, routeConfig) {
  let routeState = activeDetours.get(routeId);
  if (!routeState) {
    routeState = createRouteDetourState(routeId, routeConfig);
    activeDetours.set(routeId, routeState);
  } else {
    routeState.routeConfig = routeConfig;
  }
  return routeState;
}

function confidenceRank(confidence) {
  switch (String(confidence || '').toLowerCase()) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function projectOntoPolyline(coordinate, polyline) {
  if (!coordinate || !Array.isArray(polyline) || polyline.length < 2) return null;
  const closest = findClosestShapePoint(coordinate, polyline);
  if (!closest || !closest.projectedPoint) return null;
  const cumulative = buildCumulativeDistances(polyline);
  const segmentStart = polyline[closest.index];
  const progressMeters =
    cumulative[closest.index] +
    haversineDistance(
      segmentStart.latitude,
      segmentStart.longitude,
      closest.projectedPoint.latitude,
      closest.projectedPoint.longitude
    );

  return {
    index: closest.index,
    projectedPoint: closest.projectedPoint,
    distanceMeters: closest.distanceMeters,
    progressMeters,
  };
}

function projectCoordinateToRoute(routeId, coordinate, shapes, routeShapeMapping, tripShapeId = null) {
  const shapeIds = routeShapeMapping.get(routeId);
  if (!Array.isArray(shapeIds) || shapeIds.length === 0 || !coordinate) return null;

  let candidateShapeIds = shapeIds;
  if (tripShapeId && shapeIds.includes(tripShapeId)) {
    candidateShapeIds = [tripShapeId, ...shapeIds.filter((shapeId) => shapeId !== tripShapeId)];
  }

  let best = null;
  for (const shapeId of candidateShapeIds) {
    const polyline = shapes.get(shapeId);
    if (!polyline || polyline.length < 2) continue;
    const projection = projectOntoPolyline(coordinate, polyline);
    if (!projection) continue;

    if (!best || projection.distanceMeters < best.distanceMeters) {
      best = {
        ...projection,
        shapeId,
      };
    }

    if (tripShapeId && shapeId === tripShapeId) {
      break;
    }
  }

  return best;
}

function getSegmentProgressWindow(segment, shapes) {
  if (Number.isFinite(segment?.progressMinMeters) && Number.isFinite(segment?.progressMaxMeters)) {
    return {
      shapeId: segment.shapeIdHint || segment.detourZone?.shapeId || null,
      min: Math.min(segment.progressMinMeters, segment.progressMaxMeters),
      max: Math.max(segment.progressMinMeters, segment.progressMaxMeters),
    };
  }

  if (segment?.detourZone?.shapeId != null) {
    const polyline = shapes.get(segment.detourZone.shapeId);
    if (Array.isArray(polyline) && polyline.length > 1) {
      const cumulative = buildCumulativeDistances(polyline);
      const entryMeters = cumulative[Math.max(0, segment.detourZone.entryIndex)] ?? null;
      const exitMeters = cumulative[Math.max(0, segment.detourZone.exitIndex)] ?? null;
      if (Number.isFinite(entryMeters) && Number.isFinite(exitMeters)) {
        return {
          shapeId: segment.detourZone.shapeId,
          min: Math.min(entryMeters, exitMeters),
          max: Math.max(entryMeters, exitMeters),
        };
      }
    }
  }

  return {
    shapeId: segment?.shapeIdHint || segment?.detourZone?.shapeId || null,
    min: null,
    max: null,
  };
}

function findBestMatchingSegment(routeState, projection, shapes) {
  if (!routeState?.segments || !projection) return null;

  let best = null;
  for (const segment of routeState.segments.values()) {
    const distance = getProjectionDistanceToSegment(segment, projection, shapes);
    if (!Number.isFinite(distance)) continue;
    if (!best || distance < best.distance) {
      best = { segment, distance };
    }
  }

  return best?.segment || null;
}

function getProjectionDistanceToSegment(segment, projection, shapes) {
  const window = getSegmentProgressWindow(segment, shapes);
  if (window.shapeId && projection.shapeId && window.shapeId !== projection.shapeId) return Infinity;

  if (!Number.isFinite(window.min) || !Number.isFinite(window.max)) {
    return 0;
  }

  const bufferedMin = window.min - SEGMENT_GAP_METERS;
  const bufferedMax = window.max + SEGMENT_GAP_METERS;
  if (projection.progressMeters < bufferedMin || projection.progressMeters > bufferedMax) {
    return Infinity;
  }

  const center = (window.min + window.max) / 2;
  return Math.abs(projection.progressMeters - center);
}

function updateSegmentProjectionWindow(segment, projection) {
  if (!segment || !projection) return;
  segment.shapeIdHint = projection.shapeId || segment.shapeIdHint || null;
  if (!Number.isFinite(projection.progressMeters)) return;
  segment.progressMinMeters = Number.isFinite(segment.progressMinMeters)
    ? Math.min(segment.progressMinMeters, projection.progressMeters)
    : projection.progressMeters;
  segment.progressMaxMeters = Number.isFinite(segment.progressMaxMeters)
    ? Math.max(segment.progressMaxMeters, projection.progressMeters)
    : projection.progressMeters;
}

function buildDetourFingerprint(routeId, detour, geometry) {
  const primarySegment = Array.isArray(geometry?.segments) && geometry.segments.length > 0
    ? pickPrimarySegment(geometry.segments)
    : null;
  if (detour?.detourZone?.shapeId != null) {
    return `${routeId}:${detour.detourZone.shapeId}:${detour.detourZone.entryIndex}:${detour.detourZone.exitIndex}`;
  }

  const shapeId = primarySegment?.shapeId || geometry?.shapeId || detour?.detourZone?.shapeId || null;
  const entryKey = pointKey(primarySegment?.entryPoint || geometry?.entryPoint);
  const exitKey = pointKey(primarySegment?.exitPoint || geometry?.exitPoint);

  if (shapeId && entryKey && exitKey) {
    return `${routeId}:${shapeId}:${entryKey}:${exitKey}`;
  }

  return null;
}

function upsertLearnedPersistentDetour(routeId, detour, geometry, now) {
  const fingerprint = buildDetourFingerprint(routeId, detour, geometry);
  if (!fingerprint) return null;

  const existing = learnedPersistentDetours.get(routeId) || {};
  const record = {
    routeId,
    fingerprint,
    detectedAt: detour.detectedAt instanceof Date ? detour.detectedAt.getTime() : Number(detour.detectedAt) || now,
    learnedAt: existing.learnedAt || now,
    updatedAt: now,
    lastSeenAt: detour.lastSeenAt instanceof Date ? detour.lastSeenAt.getTime() : Number(detour.lastSeenAt) || now,
    lastEvidenceAt: detour.lastOffRouteEvidenceAt || now,
    triggerVehicleId: detour.triggerVehicleId || existing.triggerVehicleId || null,
    geometry: hasRenderableGeometry(geometry) ? cloneJson(geometry) : cloneJson(existing.geometry) || null,
    detourZone: detour.detourZone ? cloneJson(detour.detourZone) : cloneJson(existing.detourZone) || null,
  };

  learnedPersistentDetours.set(routeId, record);

  detour.isPersistent = true;
  detour.persistentFingerprint = fingerprint;
  detour.persistedGeometry = cloneJson(record.geometry);
  if (record.detourZone) {
    detour.detourZone = cloneJson(record.detourZone);
  }

  return record;
}

function seedPersistentDetours(now) {
  for (const [routeId, record] of learnedPersistentDetours) {
    const routeConfig = resolveRouteDetectorConfig(routeId);
    const routeState = getOrCreateRouteDetourState(routeId, routeConfig);
    if (getSegmentCount(routeState) > 0) {
      continue;
    }

    const segment = createSegmentState('persistent-1', routeConfig, now, record.triggerVehicleId || null);
    segment.detectedAt = new Date(record.detectedAt || now);
    segment.lastSeenAt = new Date(record.lastSeenAt || now);
    segment.lastOffRouteEvidenceAt = record.lastEvidenceAt || record.lastSeenAt || record.detectedAt || now;
    segment.isPublished = true;
    segment.isPersistent = true;
    segment.persistentFingerprint = record.fingerprint;
    segment.persistedGeometry = cloneJson(record.geometry);
    segment.detourZone = cloneJson(record.detourZone);
    segment.shapeIdHint = record.detourZone?.shapeId || record.geometry?.shapeId || null;
    routeState.segments.set(segment.segmentId, segment);
    routeState.nextSegmentOrdinal = 2;
  }
}

function resetPersistentCandidate(routeId) {
  persistentDetourCandidates.delete(routeId);
}

function finalizeSegment(routeId, segmentId) {
  const routeState = activeDetours.get(routeId);
  if (!routeState?.segments) return;
  const segment = routeState.segments.get(segmentId);
  routeState.segments.delete(segmentId);
  if (segment?.isPersistent) {
    learnedPersistentDetours.delete(routeId);
  }
  if (routeState.segments.size === 0) {
    finalizeDetour(routeId, { removeLearned: Boolean(segment?.isPersistent) });
  }
}

function finalizeDetour(routeId, options = {}) {
  const current = activeDetours.get(routeId);
  activeDetours.delete(routeId);
  persistentDetourCandidates.delete(routeId);
  const hasPersistentSegment = current?.segments instanceof Map
    ? [...current.segments.values()].some((segment) => segment.isPersistent)
    : false;
  if (options.removeLearned || hasPersistentSegment) {
    learnedPersistentDetours.delete(routeId);
  }
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
  persistentDetourCandidates.clear();
  recurringShortDeviationCandidates.clear();
  lastReportedDetours = null;
}

function markDetourPublishedIfEligible(detour) {
  if (!detour || detour.isPublished) return;
  if (detour.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) {
    detour.isPublished = true;
  }
}

function getOrCreateSegmentEvidence(segment) {
  if (!segment.evidence) {
    segment.evidence = {
      points: [],
      entryCandidates: [],
      exitCandidates: [],
    };
  } else {
    if (!Array.isArray(segment.evidence.points)) segment.evidence.points = [];
    if (!Array.isArray(segment.evidence.entryCandidates)) segment.evidence.entryCandidates = [];
    if (!Array.isArray(segment.evidence.exitCandidates)) segment.evidence.exitCandidates = [];
  }
  return segment.evidence;
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

function pruneOffRouteStreakPoints(state, cutoff) {
  if (!state || !Number.isFinite(cutoff)) return;
  const points = Array.isArray(state.offRouteStreakPoints) ? state.offRouteStreakPoints : [];
  state.offRouteStreakPoints = points.filter((point) => toTimestampMs(point?.timestampMs) >= cutoff);
}

function recordOffRouteStreakPoint(state, coordinate, timestampMs, tripShapeId, routeConfig) {
  if (!state) return;
  if (!Array.isArray(state.offRouteStreakPoints)) {
    state.offRouteStreakPoints = [];
  }

  appendEvidencePoint(
    state.offRouteStreakPoints,
    makeEvidenceEntry(coordinate, timestampMs, state.vehicleId || state.id, tripShapeId)
  );

  const evidenceWindowMs = routeConfig?.evidenceWindowMs || EVIDENCE_WINDOW_MS;
  pruneOffRouteStreakPoints(state, timestampMs - evidenceWindowMs);
}

function clearOffRouteStreakPoints(state) {
  if (state) state.offRouteStreakPoints = [];
}

function recordBoundaryCandidate(segment, candidateType, observation, vehicleId, routeConfig, tripShapeId = null) {
  if (!segment || !observation?.coordinate || !Number.isFinite(observation.timestampMs)) return;

  const evidence = getOrCreateSegmentEvidence(segment);
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

function clearExitCandidatesAfter(segment, cutoffMs) {
  const evidence = segment?.evidence;
  if (!evidence || !Array.isArray(evidence.exitCandidates) || !Number.isFinite(cutoffMs)) return;
  evidence.exitCandidates = evidence.exitCandidates.filter((candidate) => candidate.timestampMs < cutoffMs);
}

function trackPersistentLearning(routeId, detour, geometry, now) {
  if (!detour || detour.state !== 'active') {
    resetPersistentCandidate(routeId);
    return;
  }

  const fingerprint = buildDetourFingerprint(routeId, detour, geometry);
  if (!fingerprint) {
    resetPersistentCandidate(routeId);
    return;
  }

  const previous = persistentDetourCandidates.get(routeId);
  const next = previous && previous.fingerprint === fingerprint
    ? {
      fingerprint,
      consecutiveMatches: previous.consecutiveMatches + 1,
      lastMatchedAt: now,
    }
    : {
      fingerprint,
      consecutiveMatches: 1,
      lastMatchedAt: now,
    };

  persistentDetourCandidates.set(routeId, next);

  const detectedAtMs = detour.detectedAt instanceof Date
    ? detour.detectedAt.getTime()
    : Number(detour.detectedAt);
  const detourAgeMs = Number.isFinite(detectedAtMs) ? Math.max(0, now - detectedAtMs) : 0;
  const learned = learnedPersistentDetours.get(routeId);

  if (learned && learned.fingerprint === fingerprint) {
    upsertLearnedPersistentDetour(routeId, detour, geometry, now);
    return;
  }

  if (
    next.consecutiveMatches >= DETOUR_PERSIST_CONSECUTIVE_MATCHES &&
    detourAgeMs >= DETOUR_PERSIST_MIN_AGE_MS
  ) {
    upsertLearnedPersistentDetour(routeId, detour, geometry, now);
  }
}

function hydratePersistentDetours(records = {}) {
  learnedPersistentDetours.clear();
  for (const [routeId, record] of Object.entries(records || {})) {
    if (!record || typeof record !== 'object' || !record.fingerprint) continue;
    learnedPersistentDetours.set(routeId, {
      routeId,
      fingerprint: record.fingerprint,
      detectedAt: Number(record.detectedAt) || Date.now(),
      learnedAt: Number(record.learnedAt) || Date.now(),
      updatedAt: Number(record.updatedAt) || Date.now(),
      lastSeenAt: Number(record.lastSeenAt) || Number(record.detectedAt) || Date.now(),
      lastEvidenceAt: Number(record.lastEvidenceAt) || Number(record.lastSeenAt) || Number(record.detectedAt) || Date.now(),
      triggerVehicleId: record.triggerVehicleId || null,
      geometry: cloneJson(record.geometry) || null,
      detourZone: cloneJson(record.detourZone) || null,
    });
  }
}

const runtimeStatePersistence = createRuntimeStatePersistence({
  vehicleState,
  activeDetours,
  detourEvidence,
  persistentDetourCandidates,
  recurringShortDeviationCandidates,
  getMinVehiclesForDetour: () => MIN_VEHICLES_FOR_DETOUR,
  setMinVehiclesForDetour: (value) => { MIN_VEHICLES_FOR_DETOUR = value; },
  getWasInService: () => wasInService,
  setWasInService: (value) => { wasInService = value; },
  getLastReportedDetours: () => lastReportedDetours,
  setLastReportedDetours: (value) => { lastReportedDetours = value; },
  defaultMinVehiclesForDetour: DEFAULT_MIN_VEHICLES_FOR_DETOUR,
  resolveRouteDetectorConfig,
  getState: () => getState(),
  cloneJson,
  toTimestampMs,
  toDateOrNow,
  normalizeObservation,
  normalizeEvidenceEntry,
});

const {
  serializeDetectorRuntimeState,
  hydrateRuntimeState,
} = runtimeStatePersistence;

function createSegmentId(routeState) {
  const nextOrdinal = Number.isFinite(routeState?.nextSegmentOrdinal)
    ? routeState.nextSegmentOrdinal
    : 1;
  routeState.nextSegmentOrdinal = nextOrdinal + 1;
  return `segment-${nextOrdinal}`;
}

function removeVehicleFromAssignedSegment(state) {
  if (!state?.routeId || !state?.detourSegmentId) return;
  const routeState = activeDetours.get(state.routeId);
  const segment = routeState?.segments?.get(state.detourSegmentId);
  if (segment) {
    segment.vehiclesOffRoute.delete(state.vehicleId || state.id || null);
  }
  state.detourSegmentId = null;
}

function rebuildSegmentZone(routeId, segment, shapes, routeShapeMapping) {
  const evidence = segment?.evidence;
  if (!evidence || evidence.points.length < MIN_EVIDENCE_FOR_GEOMETRY) {
    if (!segment.isPersistent || !segment.detourZone) {
      segment.detourZone = null;
    }
    return;
  }

  const shapeIds = routeShapeMapping.get(routeId);
  if (!shapeIds || shapeIds.length === 0) {
    if (!segment.isPersistent || !segment.detourZone) {
      segment.detourZone = null;
    }
    return;
  }

  const candidateShapeIds = segment.shapeIdHint && shapeIds.includes(segment.shapeIdHint)
    ? [segment.shapeIdHint, ...shapeIds.filter((shapeId) => shapeId !== segment.shapeIdHint)]
    : shapeIds;
  const anchors = findAnchors(evidence.points, shapes, candidateShapeIds);
  if (!anchors) {
    if (!segment.isPersistent || !segment.detourZone) {
      segment.detourZone = null;
    }
    return;
  }

  const span = anchors.exitIndex - anchors.entryIndex;
  if (span < 2) {
    if (!segment.isPersistent || !segment.detourZone) {
      segment.detourZone = null;
    }
    return;
  }

  const shrink = Math.max(1, Math.floor(span * 0.25));
  segment.detourZone = {
    shapeId: anchors.shapeId,
    entryIndex: anchors.entryIndex,
    exitIndex: anchors.exitIndex,
    coreStart: anchors.entryIndex + shrink,
    coreEnd: anchors.exitIndex - shrink,
  };
}

function addVehicleToDetour(vehicleId, routeId, coordinate, now, boundarySignals = {}, shapes, routeShapeMapping) {
  const routeConfig = resolveRouteDetectorConfig(routeId);
  const routeState = getOrCreateRouteDetourState(routeId, routeConfig);
  const preferredSegmentId = boundarySignals.preferredSegmentId || null;
  const projection = boundarySignals.projection || null;
  const allowSegmentSwitch = Boolean(boundarySignals.allowSegmentSwitch);

  let segment = preferredSegmentId ? routeState.segments.get(preferredSegmentId) : null;
  if (segment && projection && allowSegmentSwitch) {
    const preferredDistance = getProjectionDistanceToSegment(segment, projection, shapes);
    if (!Number.isFinite(preferredDistance)) {
      segment = null;
    }
  }
  if (!segment && projection) {
    segment = findBestMatchingSegment(routeState, projection, shapes);
  }
  if (!segment) {
    const segmentId = createSegmentId(routeState);
    segment = createSegmentState(segmentId, routeConfig, now, vehicleId, projection);
    routeState.segments.set(segmentId, segment);
  }

  if (preferredSegmentId && preferredSegmentId !== segment.segmentId) {
    const previousSegment = routeState.segments.get(preferredSegmentId);
    if (previousSegment) {
      previousSegment.vehiclesOffRoute.delete(vehicleId);
    }
  }

  const vehicleWasAlreadyOffRoute = segment.vehiclesOffRoute.has(vehicleId);
  segment.routeConfig = routeConfig;
  segment.vehiclesOffRoute.add(vehicleId);
  segment.lastSeenAt = new Date(now || Date.now());
  segment.lastOffRouteEvidenceAt = now || Date.now();
  markDetourPublishedIfEligible(segment);
  updateSegmentProjectionWindow(segment, projection);

  if (segment.state === 'clear-pending') {
    clearExitCandidatesAfter(segment, segment.clearPendingAt);
    segment.state = 'active';
    segment.clearPendingAt = null;
  }

  if (!vehicleWasAlreadyOffRoute && boundarySignals.entryObservation) {
    recordBoundaryCandidate(
      segment,
      'entry',
      boundarySignals.entryObservation,
      vehicleId,
      routeConfig,
      boundarySignals.tripShapeId
    );
  }

  if (coordinate) {
    const evidence = getOrCreateSegmentEvidence(segment);
    const ts = now || Date.now();
    const streakPoints = Array.isArray(boundarySignals.offRouteStreakPoints)
      ? boundarySignals.offRouteStreakPoints
      : [];
    for (const point of streakPoints) {
      appendEvidencePoint(evidence.points, point);
    }
    if (streakPoints.length === 0) {
      appendEvidencePoint(
        evidence.points,
        makeEvidenceEntry(coordinate, ts, vehicleId, boundarySignals.tripShapeId || null)
      );
    }
    pruneEvidenceWindow(evidence, ts - routeConfig.evidenceWindowMs);
  }

  return segment.segmentId;
}

function makeRecurringObservationSignature(vehicleId, tripId) {
  if (tripId) return `trip:${tripId}`;
  return `vehicle:${vehicleId || 'unknown'}`;
}

function coordinateFromEvidencePoint(point) {
  const normalized = normalizeEvidenceEntry(point);
  if (!normalized) return null;
  return {
    latitude: normalized.latitude,
    longitude: normalized.longitude,
  };
}

function getProgressGapMeters(candidate, observation) {
  if (!candidate || !observation) return Infinity;
  if (candidate.shapeId && observation.shapeId && candidate.shapeId !== observation.shapeId) {
    return Infinity;
  }
  const candidateMin = Number.isFinite(candidate.progressMinMeters) ? candidate.progressMinMeters : null;
  const candidateMax = Number.isFinite(candidate.progressMaxMeters) ? candidate.progressMaxMeters : null;
  const observationMin = Number.isFinite(observation.progressMinMeters) ? observation.progressMinMeters : null;
  const observationMax = Number.isFinite(observation.progressMaxMeters) ? observation.progressMaxMeters : null;
  if (candidateMin == null || candidateMax == null || observationMin == null || observationMax == null) {
    return Infinity;
  }
  if (observationMin > candidateMax) return observationMin - candidateMax;
  if (candidateMin > observationMax) return candidateMin - observationMax;
  return 0;
}

function pruneRecurringShortDeviationCandidates(now) {
  const cutoff = now - RECURRING_SHORT_DEVIATION_WINDOW_MS;
  for (const [key, candidate] of recurringShortDeviationCandidates) {
    candidate.observations = (candidate.observations || [])
      .filter((observation) => observation.timestampMs >= cutoff);
    candidate.evidencePoints = (candidate.evidencePoints || [])
      .filter((point) => toTimestampMs(point?.timestampMs) >= cutoff);
    if (candidate.observations.length === 0 || candidate.evidencePoints.length === 0) {
      recurringShortDeviationCandidates.delete(key);
      continue;
    }

    candidate.progressMinMeters = Math.min(...candidate.observations.map((item) => item.progressMinMeters));
    candidate.progressMaxMeters = Math.max(...candidate.observations.map((item) => item.progressMaxMeters));
    candidate.lastSeenAt = Math.max(...candidate.observations.map((item) => item.timestampMs));
  }
}

function buildRecurringShortDeviationObservation(
  state,
  routeId,
  routeConfig,
  shapes,
  routeShapeMapping,
  now,
  returnObservation = null
) {
  if (!RECURRING_SHORT_DEVIATION_ENABLED || !state) return null;
  if (state.detourSegmentId) return null;
  if (state.consecutiveOffRoute <= 0) return null;
  if (state.consecutiveOffRoute > RECURRING_SHORT_DEVIATION_MAX_STREAK_READINGS) return null;

  const streakPoints = (state.offRouteStreakPoints || [])
    .map(normalizeEvidenceEntry)
    .filter(Boolean);
  if (streakPoints.length === 0) return null;

  const projectedPoints = streakPoints
    .map((point) => {
      const coordinate = coordinateFromEvidencePoint(point);
      const projection = projectCoordinateToRoute(
        routeId,
        coordinate,
        shapes,
        routeShapeMapping,
        state.tripShapeId
      );
      return projection ? { point, projection } : null;
    })
    .filter(Boolean);
  if (projectedPoints.length === 0) return null;

  const shapeId = state.tripShapeId || projectedPoints[0].projection.shapeId || null;
  const matchingProjectedPoints = shapeId
    ? projectedPoints.filter((item) => item.projection.shapeId === shapeId)
    : projectedPoints;
  if (matchingProjectedPoints.length === 0) return null;

  const progressValues = matchingProjectedPoints
    .map((item) => item.projection.progressMeters)
    .filter(Number.isFinite);
  if (progressValues.length === 0) return null;

  const signature = makeRecurringObservationSignature(state.vehicleId || state.id, state.tripId);
  const evidencePoints = streakPoints.map((point) => ({
    ...point,
    vehicleId: point.vehicleId || state.vehicleId || state.id || null,
    tripId: state.tripId || point.tripId || null,
    recurringObservationId: signature,
  }));

  return {
    routeId,
    shapeId,
    progressMinMeters: Math.min(...progressValues),
    progressMaxMeters: Math.max(...progressValues),
    timestampMs: now,
    vehicleId: state.vehicleId || state.id || null,
    tripId: state.tripId || null,
    tripShapeId: state.tripShapeId || null,
    signature,
    entryObservation: state.lastOnRouteObservation || state.offRouteStreakStart || null,
    exitObservation: returnObservation || state.lastOnRouteObservation || null,
    evidencePoints,
    lastCoordinate: coordinateFromEvidencePoint(evidencePoints[evidencePoints.length - 1]),
    routeConfig,
  };
}

function findRecurringShortDeviationCandidate(observation) {
  let best = null;
  for (const [key, candidate] of recurringShortDeviationCandidates) {
    if (candidate.routeId !== observation.routeId) continue;
    const gapMeters = getProgressGapMeters(candidate, observation);
    if (gapMeters > RECURRING_SHORT_DEVIATION_MAX_GAP_METERS) continue;
    if (!best || gapMeters < best.gapMeters) {
      best = { key, candidate, gapMeters };
    }
  }
  return best;
}

function appendRecurringObservationToSegment(segment, observation, routeConfig) {
  if (!segment || !observation) return;
  const evidence = getOrCreateSegmentEvidence(segment);
  for (const point of observation.evidencePoints || []) {
    appendEvidencePoint(evidence.points, point);
  }
  if (observation.entryObservation) {
    recordBoundaryCandidate(
      segment,
      'entry',
      observation.entryObservation,
      observation.vehicleId,
      routeConfig,
      observation.tripShapeId
    );
  }
  if (observation.exitObservation) {
    recordBoundaryCandidate(
      segment,
      'exit',
      observation.exitObservation,
      observation.vehicleId,
      routeConfig,
      observation.tripShapeId
    );
  }
  pruneEvidenceWindow(evidence, observation.timestampMs - routeConfig.evidenceWindowMs);
  segment.lastSeenAt = new Date(observation.timestampMs);
  segment.lastOffRouteEvidenceAt = observation.timestampMs;
  segment.isPublished = true;
  segment.recurringShortDeviation = true;
  segment.vehiclesOffRoute.delete(observation.vehicleId);
}

function findMatchingActiveSegmentForRecurringObservation(observation, shapes) {
  const routeState = activeDetours.get(observation.routeId);
  if (!routeState?.segments) return null;
  return findBestMatchingSegment(routeState, {
    shapeId: observation.shapeId,
    progressMeters: (observation.progressMinMeters + observation.progressMaxMeters) / 2,
  }, shapes);
}

function publishRecurringShortDeviationCandidate(candidate, observation, shapes, routeShapeMapping) {
  const midpoint = (candidate.progressMinMeters + candidate.progressMaxMeters) / 2;
  const coordinate = observation.lastCoordinate || coordinateFromEvidencePoint(candidate.evidencePoints.at(-1));
  if (!coordinate) return null;
  const candidateEvidencePoints = (candidate.observations || [])
    .flatMap((candidateObservation) => candidateObservation.evidencePoints || []);

  const segmentId = addVehicleToDetour(
    observation.vehicleId,
    observation.routeId,
    coordinate,
    observation.timestampMs,
    {
      entryObservation: candidate.observations[0]?.entryObservation || observation.entryObservation,
      offRouteStreakPoints: candidateEvidencePoints,
      tripShapeId: observation.tripShapeId,
      projection: {
        shapeId: observation.shapeId,
        progressMeters: midpoint,
        distanceMeters: (observation.routeConfig?.offRouteThresholdMeters || OFF_ROUTE_THRESHOLD_METERS) + 1,
      },
    },
    shapes,
    routeShapeMapping
  );

  const routeState = activeDetours.get(observation.routeId);
  const segment = routeState?.segments?.get(segmentId);
  if (segment) {
    for (const candidateObservation of candidate.observations || []) {
      if (candidateObservation.entryObservation) {
        recordBoundaryCandidate(
          segment,
          'entry',
          candidateObservation.entryObservation,
          candidateObservation.vehicleId,
          observation.routeConfig,
          candidateObservation.tripShapeId
        );
      }
      if (candidateObservation.exitObservation) {
        recordBoundaryCandidate(
          segment,
          'exit',
          candidateObservation.exitObservation,
          candidateObservation.vehicleId,
          observation.routeConfig,
          candidateObservation.tripShapeId
        );
      }
    }

    const evidence = getOrCreateSegmentEvidence(segment);
    evidence.points = [];
    for (const point of candidateEvidencePoints) {
      appendEvidencePoint(evidence.points, point);
    }
    pruneEvidenceWindow(
      evidence,
      observation.timestampMs - RECURRING_SHORT_DEVIATION_WINDOW_MS
    );

    segment.vehiclesOffRoute.delete(observation.vehicleId);
    segment.isPublished = true;
    segment.recurringShortDeviation = true;
    segment.lastSeenAt = new Date(observation.timestampMs);
    segment.lastOffRouteEvidenceAt = observation.timestampMs;
  }
  return segment;
}

function recordRecurringShortDeviationObservation(observation, shapes, routeShapeMapping) {
  if (!observation) return;
  pruneRecurringShortDeviationCandidates(observation.timestampMs);

  const activeSegment = findMatchingActiveSegmentForRecurringObservation(observation, shapes);
  if (activeSegment?.recurringShortDeviation) {
    appendRecurringObservationToSegment(activeSegment, observation, observation.routeConfig);
    return;
  }

  const match = findRecurringShortDeviationCandidate(observation);
  const key = match?.key || `${observation.routeId}:${observation.shapeId}:${Math.round(
    ((observation.progressMinMeters + observation.progressMaxMeters) / 2) /
    Math.max(1, RECURRING_SHORT_DEVIATION_MAX_GAP_METERS)
  )}:${observation.timestampMs}`;
  const candidate = match?.candidate || {
    routeId: observation.routeId,
    shapeId: observation.shapeId,
    progressMinMeters: observation.progressMinMeters,
    progressMaxMeters: observation.progressMaxMeters,
    observations: [],
    evidencePoints: [],
    lastSeenAt: observation.timestampMs,
  };

  candidate.observations.push(observation);
  candidate.evidencePoints.push(...(observation.evidencePoints || []));
  candidate.progressMinMeters = Math.min(candidate.progressMinMeters, observation.progressMinMeters);
  candidate.progressMaxMeters = Math.max(candidate.progressMaxMeters, observation.progressMaxMeters);
  candidate.lastSeenAt = observation.timestampMs;
  recurringShortDeviationCandidates.set(key, candidate);

  const signatures = new Set(candidate.observations.map((item) => item.signature).filter(Boolean));
  if (
    candidate.observations.length >= RECURRING_SHORT_DEVIATION_MIN_OBSERVATIONS &&
    signatures.size >= RECURRING_SHORT_DEVIATION_MIN_UNIQUE_SIGNATURES
  ) {
    publishRecurringShortDeviationCandidate(candidate, observation, shapes, routeShapeMapping);
    recurringShortDeviationCandidates.delete(key);
  }
}

function maybeRemoveVehicleFromDetour(
  vehicleId,
  routeId,
  segmentId,
  consecutiveOnRoute,
  now,
  onRouteStartObservation = null,
  tripShapeId = null
) {
  const routeState = activeDetours.get(routeId);
  const segment = routeState?.segments?.get(segmentId);
  if (!segment) return;
  const routeConfig = segment.routeConfig || BASE_ROUTE_DETECTOR_CONFIG;

  if (consecutiveOnRoute < routeConfig.clearConsecutiveOnRoute) return;

  const detourAgeMs = now - segment.detectedAt.getTime();
  if (detourAgeMs < routeConfig.clearGraceMs) return;

  segment.vehiclesOffRoute.delete(vehicleId);
  if (onRouteStartObservation) {
    recordBoundaryCandidate(segment, 'exit', onRouteStartObservation, vehicleId, routeConfig, tripShapeId);
  }

  if (segment.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) return;

  if (!segment.isPublished) {
    finalizeSegment(routeId, segmentId);
    return;
  }

  if (segment.state !== 'clear-pending') {
    segment.state = 'clear-pending';
    segment.clearPendingAt = now;
  }
}

function tickClearPending(now) {
  for (const [routeId, routeState] of activeDetours) {
    for (const [segmentId, segment] of routeState.segments) {
      const routeConfig = segment.routeConfig || BASE_ROUTE_DETECTOR_CONFIG;

      if (!segment.isPersistent && segment.state === 'active' && segment.vehiclesOffRoute.size < MIN_VEHICLES_FOR_DETOUR) {
        const lastEvidence = segment.lastOffRouteEvidenceAt || segment.detectedAt.getTime();
        if (now - lastEvidence >= routeConfig.noVehicleTimeoutMs) {
          if (segment.isPublished) {
            segment.state = 'clear-pending';
            segment.clearPendingAt = now;
          } else {
            finalizeSegment(routeId, segmentId);
          }
        }
        continue;
      }

      if (segment.state !== 'clear-pending') continue;

      if (segment.vehiclesOffRoute.size >= MIN_VEHICLES_FOR_DETOUR) {
        segment.state = 'active';
        segment.clearPendingAt = null;
        continue;
      }

      const detourAgeMs = now - segment.detectedAt.getTime();
      if (detourAgeMs < routeConfig.clearGraceMs) {
        continue;
      }

      if (segment.clearPendingAt != null && now > segment.clearPendingAt) {
        finalizeSegment(routeId, segmentId);
      }
    }

    if (getSegmentCount(routeState) === 0) {
      finalizeDetour(routeId);
    }
  }
}

function buildRouteSnapshot(routeId, routeState, shapes, routeShapeMapping, now) {
  if (!routeState?.segments || routeState.segments.size === 0) return null;

  const publishedSegments = [];
  const vehiclesOffRoute = new Set();

  for (const segment of routeState.segments.values()) {
    if (!segment.isPublished) continue;

    const detectedAtMs = segment.detectedAt instanceof Date
      ? segment.detectedAt.getTime()
      : Number(segment.detectedAt);
    const geometry = shapes && routeShapeMapping
      ? (() => {
        const computedGeometry = buildGeometry(
          routeId,
          getOrCreateSegmentEvidence(segment),
          shapes,
          routeShapeMapping,
          now,
          detectedAtMs
        );
        return hasRenderableGeometry(computedGeometry)
          ? computedGeometry
          : cloneJson(segment.persistedGeometry) || computedGeometry;
      })()
      : null;

    if (hasRenderableGeometry(geometry)) {
      segment.persistedGeometry = cloneJson(geometry);
      segment.shapeIdHint = geometry.shapeId || segment.shapeIdHint || null;
    }

    for (const vehicleId of segment.vehiclesOffRoute || []) {
      vehiclesOffRoute.add(vehicleId);
    }

    publishedSegments.push({
      ...segment,
      geometry,
    });
  }

  if (publishedSegments.length === 0) return null;

  const flattenedGeometrySegments = publishedSegments.flatMap((segment) => {
    const geometrySegments = Array.isArray(segment.geometry?.segments) ? segment.geometry.segments : [];
    if (geometrySegments.length > 0) {
      return geometrySegments;
    }
    if (
      Array.isArray(segment.geometry?.skippedSegmentPolyline) ||
      Array.isArray(segment.geometry?.inferredDetourPolyline)
    ) {
      return [{
        shapeId: segment.geometry?.shapeId || null,
        skippedSegmentPolyline: segment.geometry?.skippedSegmentPolyline || null,
        inferredDetourPolyline: segment.geometry?.inferredDetourPolyline || null,
        entryPoint: segment.geometry?.entryPoint || null,
        exitPoint: segment.geometry?.exitPoint || null,
        confidence: segment.geometry?.confidence || 'low',
        evidencePointCount: segment.geometry?.evidencePointCount || 0,
        lastEvidenceAt: segment.geometry?.lastEvidenceAt || null,
        spanMeters: 0,
        entryIndex: 0,
        exitIndex: 0,
      }];
    }
    return [];
  });
  const primarySegment = pickPrimarySegment(flattenedGeometrySegments);
  const routeDetectedAtMs = Math.min(...publishedSegments.map((segment) => segment.detectedAt.getTime()));
  const routeLastSeenAtMs = Math.max(...publishedSegments.map((segment) => segment.lastSeenAt.getTime()));
  const routeLastEvidenceAt = Math.max(
    ...publishedSegments.map((segment) => segment.lastOffRouteEvidenceAt || 0),
    0
  ) || null;
  const routeStateLabel = publishedSegments.some((segment) => segment.state === 'active')
    ? 'active'
    : 'clear-pending';
  const aggregateConfidence = publishedSegments.reduce((best, segment) => {
    const confidence = segment.geometry?.confidence || 'low';
    return confidenceRank(confidence) > confidenceRank(best) ? confidence : best;
  }, 'low');
  const aggregateEvidencePointCount = publishedSegments.reduce(
    (sum, segment) => sum + (segment.geometry?.evidencePointCount || 0),
    0
  );
  const leadSegment = publishedSegments
    .slice()
    .sort((a, b) => {
      if (a.detectedAt.getTime() !== b.detectedAt.getTime()) {
        return a.detectedAt.getTime() - b.detectedAt.getTime();
      }
      return String(a.segmentId).localeCompare(String(b.segmentId));
    })[0];
  const routeGeometry = shapes && routeShapeMapping
    ? {
      shapeId: primarySegment?.shapeId ?? publishedSegments[0]?.geometry?.shapeId ?? null,
      segments: flattenedGeometrySegments,
      skippedSegmentPolyline: primarySegment?.skippedSegmentPolyline ?? null,
      inferredDetourPolyline: primarySegment?.inferredDetourPolyline ?? null,
      entryPoint: primarySegment?.entryPoint ?? null,
      exitPoint: primarySegment?.exitPoint ?? null,
      confidence: aggregateConfidence,
      evidencePointCount: aggregateEvidencePointCount,
      lastEvidenceAt: routeLastEvidenceAt,
    }
    : null;

  return {
    detectedAt: new Date(routeDetectedAtMs),
    lastSeenAt: new Date(routeLastSeenAtMs),
    triggerVehicleId: primarySegment
      ? publishedSegments.find((segment) =>
        Array.isArray(segment.geometry?.segments) && segment.geometry.segments.includes(primarySegment)
      )?.triggerVehicleId || leadSegment?.triggerVehicleId || null
      : leadSegment?.triggerVehicleId || null,
    vehiclesOffRoute,
    vehicleCount: vehiclesOffRoute.size,
    state: routeStateLabel,
    isPersistent: publishedSegments.length === 1 ? Boolean(publishedSegments[0].isPersistent) : false,
    detourZone: publishedSegments.length === 1 ? cloneJson(publishedSegments[0].detourZone) : null,
    geometry: routeGeometry,
  };
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

  seedPersistentDetours(now);

  for (const [routeId, routeState] of activeDetours) {
    for (const segment of routeState.segments.values()) {
      rebuildSegmentZone(routeId, segment, shapes, routeShapeMapping);
    }
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
    const routeProjection = projectCoordinateToRoute(routeId, coordinate, shapes, routeShapeMapping, tripShapeId);
    if (routeProjection) {
      minDist = routeProjection.distanceMeters;
    }

    let state = vehicleState.get(id);
    if (!state) {
      state = {
        id,
        vehicleId: id,
        routeId,
        detourSegmentId: null,
        consecutiveOffRoute: 0,
        consecutiveOnRoute: 0,
        lastCheckedAt: now,
        lastOnRouteObservation: null,
        offRouteStreakStart: null,
        offRouteStreakPoints: [],
        onRouteStreakStart: null,
        tripShapeId: null,
        tripId: null,
        hasReturnedOnRouteSinceDetour: false,
      };
      vehicleState.set(id, state);
    }

    if (state.routeId !== routeId) {
      removeVehicleFromAssignedSegment(state);
      state.routeId = routeId;
      state.consecutiveOffRoute = 0;
      state.consecutiveOnRoute = 0;
      state.lastOnRouteObservation = null;
      state.offRouteStreakStart = null;
      clearOffRouteStreakPoints(state);
      state.onRouteStreakStart = null;
      state.tripShapeId = null;
      state.tripId = null;
      state.hasReturnedOnRouteSinceDetour = false;
    }

    state.lastCheckedAt = now;
    state.tripShapeId = tripShapeId || null;
    state.tripId = vehicle.tripId || null;

    if (minDist > routeConfig.offRouteThresholdMeters) {
      if (state.consecutiveOffRoute === 0) {
        state.offRouteStreakStart = {
          coordinate,
          timestampMs: now,
        };
        clearOffRouteStreakPoints(state);
      }

      state.consecutiveOffRoute++;
      recordOffRouteStreakPoint(state, coordinate, now, tripShapeId, routeConfig);
      state.consecutiveOnRoute = 0;
      state.onRouteStreakStart = null;

      if (state.consecutiveOffRoute >= routeConfig.consecutiveReadingsRequired) {
        state.detourSegmentId = addVehicleToDetour(id, routeId, coordinate, now, {
          entryObservation: state.lastOnRouteObservation || state.offRouteStreakStart,
          offRouteStreakPoints: state.offRouteStreakPoints,
          tripShapeId,
          projection: routeProjection,
          preferredSegmentId: state.detourSegmentId,
          allowSegmentSwitch: state.hasReturnedOnRouteSinceDetour,
        }, shapes, routeShapeMapping);
        clearOffRouteStreakPoints(state);
        state.hasReturnedOnRouteSinceDetour = false;
      }
    } else if (minDist <= routeConfig.onRouteClearThresholdMeters) {
      const currentOnRouteObservation = {
        coordinate,
        timestampMs: now,
      };
      recordRecurringShortDeviationObservation(
        buildRecurringShortDeviationObservation(
          state,
          routeId,
          routeConfig,
          shapes,
          routeShapeMapping,
          now,
          currentOnRouteObservation
        ),
        shapes,
        routeShapeMapping
      );
      state.consecutiveOffRoute = 0;
      state.offRouteStreakStart = null;
      clearOffRouteStreakPoints(state);
      state.lastOnRouteObservation = currentOnRouteObservation;

      const routeState = activeDetours.get(routeId);
      const segment = routeState?.segments?.get(state.detourSegmentId)
        || (routeState && routeProjection ? findBestMatchingSegment(routeState, routeProjection, shapes) : null);
      if (segment && (segment.vehiclesOffRoute.has(id) || segment.isPersistent)) {
        if (!state.detourSegmentId) {
          state.detourSegmentId = segment.segmentId;
        }
        state.hasReturnedOnRouteSinceDetour = true;
        const shouldTrackOnRoute =
          !segment.detourZone ||
          isInDetourZoneCore(coordinate, segment, shapes) ||
          Boolean(state.onRouteStreakStart);
        if (shouldTrackOnRoute) {
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
            segment.segmentId,
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
        state.detourSegmentId = null;
        state.consecutiveOnRoute++;
        state.onRouteStreakStart = null;
      }
    } else {
      // Dead band (ON_ROUTE_CLEAR < minDist <= OFF_ROUTE) — hold current counts
    }
  }

  for (const [vehicleId, state] of vehicleState) {
    if (now - state.lastCheckedAt > STALE_VEHICLE_TIMEOUT_MS) {
      removeVehicleFromAssignedSegment(state);
      vehicleState.delete(vehicleId);
    }
  }

  tickClearPending(now);

  return getActiveDetours(shapes, routeShapeMapping);
}

const detectorReadModel = createDetectorReadModel({
  vehicleState,
  activeDetours,
  persistentDetourCandidates,
  learnedPersistentDetours,
  getLastReportedDetours: () => lastReportedDetours,
  setLastReportedDetours: (value) => { lastReportedDetours = value; },
  getSegmentCount,
  getRouteVehicleCount,
  hasPublishedSegments,
  getOrCreateSegmentEvidence,
  trackPersistentLearning,
  resetPersistentCandidate,
  buildRouteSnapshot,
  reconcileRouteFamilyGeometries,
  toTimestampMs,
});

const {
  getActiveDetours,
  getState,
  getDetourEvidence,
  getRawDetourEvidence,
  getRouteDebug,
  getPersistentDetours,
} = detectorReadModel;

module.exports = {
  processVehicles,
  clearVehicleState,
  getActiveDetours,
  getState,
  getDetourEvidence,
  getRawDetourEvidence,
  getRouteDebug,
  getPersistentDetours,
  hydratePersistentDetours,
  serializeDetectorRuntimeState,
  hydrateRuntimeState,
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
  DETOUR_PERSIST_CONSECUTIVE_MATCHES,
  DETOUR_PERSIST_MIN_AGE_MS,
  SERVICE_START_HOUR,
  SERVICE_END_HOUR,
  SERVICE_TIMEZONE,
};
