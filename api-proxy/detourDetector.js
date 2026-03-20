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

const configuredPersistConsecutiveMatches = Number.parseInt(
  process.env.DETOUR_PERSIST_CONSECUTIVE_MATCHES || '10',
  10
);
const DETOUR_PERSIST_CONSECUTIVE_MATCHES =
  Number.isFinite(configuredPersistConsecutiveMatches) && configuredPersistConsecutiveMatches > 0
    ? configuredPersistConsecutiveMatches
    : 10;

const configuredPersistMinAgeMs = Number.parseFloat(
  process.env.DETOUR_PERSIST_MIN_AGE_MS || String(5 * 60 * 60 * 1000)
);
const DETOUR_PERSIST_MIN_AGE_MS =
  Number.isFinite(configuredPersistMinAgeMs) && configuredPersistMinAgeMs > 0
    ? configuredPersistMinAgeMs
    : 5 * 60 * 60 * 1000;

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
const persistentDetourCandidates = new Map();
const learnedPersistentDetours = new Map();
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
  persistentDetourCandidates.clear();
  learnedPersistentDetours.clear();
  MIN_VEHICLES_FOR_DETOUR = DEFAULT_MIN_VEHICLES_FOR_DETOUR;
  wasInService = true;
  lastReportedDetours = null;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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

function createRouteDetourState(routeId, routeConfig) {
  return {
    routeId,
    routeConfig,
    segments: new Map(),
    nextSegmentOrdinal: 1,
  };
}

function createSegmentState(segmentId, routeConfig, now, vehicleId, projection = null) {
  return {
    segmentId,
    detectedAt: new Date(now || Date.now()),
    lastSeenAt: new Date(now || Date.now()),
    triggerVehicleId: vehicleId,
    vehiclesOffRoute: new Set(),
    state: 'active',
    clearPendingAt: null,
    lastOffRouteEvidenceAt: now || Date.now(),
    routeConfig,
    isPublished: MIN_VEHICLES_FOR_DETOUR <= 1,
    isPersistent: false,
    persistentFingerprint: null,
    persistedGeometry: null,
    detourZone: null,
    evidence: {
      points: [],
      entryCandidates: [],
      exitCandidates: [],
    },
    shapeIdHint: projection?.shapeId || null,
    progressMinMeters: Number.isFinite(projection?.progressMeters) ? projection.progressMeters : null,
    progressMaxMeters: Number.isFinite(projection?.progressMeters) ? projection.progressMeters : null,
  };
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

function getSegmentCount(routeState) {
  return routeState?.segments instanceof Map ? routeState.segments.size : 0;
}

function getRouteVehicleCount(routeState) {
  if (!routeState?.segments) return 0;
  const unique = new Set();
  for (const segment of routeState.segments.values()) {
    for (const vehicleId of segment.vehiclesOffRoute || []) {
      unique.add(vehicleId);
    }
  }
  return unique.size;
}

function hasPublishedSegments(routeState) {
  if (!routeState?.segments) return false;
  for (const segment of routeState.segments.values()) {
    if (segment.isPublished) return true;
  }
  return false;
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
    evidence.points.push({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      timestampMs: ts,
      vehicleId,
      tripShapeId: boundarySignals.tripShapeId || null,
    });
    pruneEvidenceWindow(evidence, ts - routeConfig.evidenceWindowMs);
  }

  return segment.segmentId;
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
        onRouteStreakStart: null,
        tripShapeId: null,
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
      state.onRouteStreakStart = null;
      state.tripShapeId = null;
      state.hasReturnedOnRouteSinceDetour = false;
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
        state.detourSegmentId = addVehicleToDetour(id, routeId, coordinate, now, {
          entryObservation: state.lastOnRouteObservation || state.offRouteStreakStart,
          tripShapeId,
          projection: routeProjection,
          preferredSegmentId: state.detourSegmentId,
          allowSegmentSwitch: state.hasReturnedOnRouteSinceDetour,
        }, shapes, routeShapeMapping);
        state.hasReturnedOnRouteSinceDetour = false;
      }
    } else if (minDist <= routeConfig.onRouteClearThresholdMeters) {
      state.consecutiveOffRoute = 0;
      state.offRouteStreakStart = null;
      state.lastOnRouteObservation = {
        coordinate,
        timestampMs: now,
      };

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

function getActiveDetours(shapes, routeShapeMapping) {
  const now = Date.now();
  const result = {};

  for (const [routeId, routeState] of activeDetours) {
    const snapshot = buildRouteSnapshot(routeId, routeState, shapes, routeShapeMapping, now);
    if (!snapshot) continue;

    if (snapshot.isPersistent && snapshot.detourZone) {
      snapshot.detourZone = cloneJson(snapshot.detourZone);
    }

    if (getSegmentCount(routeState) === 1) {
      trackPersistentLearning(routeId, snapshot, snapshot.geometry, now);
    } else {
      resetPersistentCandidate(routeId);
    }

    result[routeId] = snapshot;
  }

  for (const routeId of [...persistentDetourCandidates.keys()]) {
    if (!result[routeId]) {
      persistentDetourCandidates.delete(routeId);
    }
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
      .filter(([, routeState]) => hasPublishedSegments(routeState))
      .map(([routeId, routeState]) => {
        const publishedSegments = [...routeState.segments.values()].filter((segment) => segment.isPublished);
        const earliestDetectedAt = publishedSegments.reduce((min, segment) => {
          const ts = segment.detectedAt?.getTime?.() ?? Date.parse(segment.detectedAt);
          return Number.isFinite(ts) ? Math.min(min, ts) : min;
        }, Infinity);
        const routeStateLabel = publishedSegments.some((segment) => segment.state === 'active')
          ? 'active'
          : 'clear-pending';
        return [routeId, {
          vehicleCount: getRouteVehicleCount(routeState),
          detectedAt: Number.isFinite(earliestDetectedAt) ? new Date(earliestDetectedAt) : new Date(),
          triggerVehicleId: publishedSegments[0]?.triggerVehicleId || null,
          state: routeStateLabel,
        }];
      });
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
  for (const [routeId, routeState] of activeDetours) {
    const pointEntries = [...routeState.segments.values()]
      .flatMap((segment) => Array.isArray(segment.evidence?.points) ? segment.evidence.points : [])
      .sort((a, b) => a.timestampMs - b.timestampMs);
    result[routeId] = {
      pointCount: pointEntries.length,
      oldestMs: pointEntries[0]?.timestampMs ?? null,
      newestMs: pointEntries[pointEntries.length - 1]?.timestampMs ?? null,
    };
  }
  return result;
}

function getRawDetourEvidence() {
  const result = {};
  for (const [routeId, routeState] of activeDetours) {
    const pointEntries = [];
    const entryCandidates = [];
    const exitCandidates = [];
    const segments = [];

    for (const segment of routeState.segments.values()) {
      const evidence = getOrCreateSegmentEvidence(segment);
      pointEntries.push(...evidence.points);
      entryCandidates.push(...evidence.entryCandidates);
      exitCandidates.push(...evidence.exitCandidates);
      segments.push({
        segmentId: segment.segmentId,
        state: segment.state,
        pointCount: evidence.points.length,
        oldestMs: evidence.points[0]?.timestampMs ?? null,
        newestMs: evidence.points[evidence.points.length - 1]?.timestampMs ?? null,
      });
    }

    pointEntries.sort((a, b) => a.timestampMs - b.timestampMs);
    entryCandidates.sort((a, b) => a.timestampMs - b.timestampMs);
    exitCandidates.sort((a, b) => a.timestampMs - b.timestampMs);

    result[routeId] = {
      pointCount: pointEntries.length,
      oldestMs: pointEntries[0]?.timestampMs ?? null,
      newestMs: pointEntries[pointEntries.length - 1]?.timestampMs ?? null,
      uniqueVehicles: new Set(pointEntries.map((p) => p.vehicleId)).size,
      segmentCount: segments.length,
      segments,
      entryCandidates: entryCandidates.map((p) => ({
          lat: p.latitude,
          lon: p.longitude,
          ts: p.timestampMs,
          v: p.vehicleId,
        })),
      exitCandidates: exitCandidates.map((p) => ({
          lat: p.latitude,
          lon: p.longitude,
          ts: p.timestampMs,
          v: p.vehicleId,
        })),
      points: pointEntries.map((p) => ({
        lat: p.latitude,
        lon: p.longitude,
        ts: p.timestampMs,
        v: p.vehicleId,
      })),
    };
  }
  return result;
}

function getPersistentDetours() {
  return Object.fromEntries(
    [...learnedPersistentDetours.entries()].map(([routeId, record]) => [routeId, cloneJson(record)])
  );
}

module.exports = {
  processVehicles,
  clearVehicleState,
  getActiveDetours,
  getState,
  getDetourEvidence,
  getRawDetourEvidence,
  getPersistentDetours,
  hydratePersistentDetours,
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
