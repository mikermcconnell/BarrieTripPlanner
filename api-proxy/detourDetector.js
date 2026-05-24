const { haversineDistance } = require('./geometry');
const {
  buildGeometry,
  buildCumulativeDistances,
  findClosestShapePoint,
  findAnchors,
  MIN_EVIDENCE_FOR_GEOMETRY,
  pickPrimarySegment,
  reconcileRouteFamilyGeometries,
  enrichDetourMapStopImpacts,
  SEGMENT_GAP_METERS,
} = require('./detourGeometry');
const { getRouteDetectorConfig, ROUTE_DETECTOR_OVERRIDES } = require('./detourRouteConfig');
const {
  vehicleState,
  activeDetours,
  detourEvidence,
  persistentDetourCandidates,
  learnedPersistentDetours,
  normalDetourCandidates,
  recurringShortDeviationCandidates,
  clearDetourState,
} = require('./detour/state');
const {
  OFF_ROUTE_THRESHOLD_METERS,
  ON_ROUTE_CLEAR_THRESHOLD_METERS,
  DETOUR_CLEAR_GRACE_MS,
  DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  DETOUR_NO_VEHICLE_TIMEOUT_MS,
  DETOUR_CANDIDATE_EVIDENCE_TTL_MS,
  CONSECUTIVE_READINGS_REQUIRED,
  STALE_VEHICLE_TIMEOUT_MS,
  DEFAULT_MIN_VEHICLES_FOR_DETOUR,
  EVIDENCE_WINDOW_MS,
  DETOUR_VEHICLE_TRACE_WINDOW_MS,
  DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS,
  DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER,
  DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS,
  DETOUR_CANDIDATE_CONFIRMATION_MAX_MS,
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
const { estimateRouteHeadwayMs } = require('./detour/routeSchedule');
const {
  makeCandidateObservationSignature,
  upsertCandidateObservation,
  pruneExpiredCandidates,
  hasEnoughUniqueEvidence,
} = require('./detour/candidateMemory');
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

function getVehicleSampleTimeMs(vehicle, fallbackMs = Date.now()) {
  const rawTimestamp = vehicle?.timestampMs ?? vehicle?.timestamp;
  const numericTimestamp = Number(rawTimestamp);
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return fallbackMs;
  const sampleTimeMs = numericTimestamp < 1_000_000_000_000
    ? numericTimestamp * 1000
    : numericTimestamp;
  if (Math.abs(fallbackMs - sampleTimeMs) > STALE_VEHICLE_TIMEOUT_MS) {
    return fallbackMs;
  }
  return sampleTimeMs;
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

function getPersistedGeometryProgressWindow(segment, shapes) {
  const geometry = segment?.persistedGeometry;
  if (!geometry || !shapes) return null;

  const geometrySegments = Array.isArray(geometry.segments) ? geometry.segments : [];
  const primarySegment = geometrySegments.length > 0 ? pickPrimarySegment(geometrySegments) : null;
  const shapeId = primarySegment?.shapeId || geometry.shapeId || segment.shapeIdHint || null;
  if (!shapeId) return null;

  const routePolyline = shapes.get(shapeId);
  if (!Array.isArray(routePolyline) || routePolyline.length < 2) return null;

  const skippedPolyline = Array.isArray(primarySegment?.skippedSegmentPolyline)
    ? primarySegment.skippedSegmentPolyline
    : Array.isArray(geometry.skippedSegmentPolyline)
      ? geometry.skippedSegmentPolyline
      : [];
  const entryPoint = normalizePoint(skippedPolyline[0]) ||
    normalizePoint(primarySegment?.entryPoint) ||
    normalizePoint(geometry.entryPoint);
  const exitPoint = normalizePoint(skippedPolyline[skippedPolyline.length - 1]) ||
    normalizePoint(primarySegment?.exitPoint) ||
    normalizePoint(geometry.exitPoint);

  const entryProjection = projectOntoPolyline(entryPoint, routePolyline);
  const exitProjection = projectOntoPolyline(exitPoint, routePolyline);
  if (
    !Number.isFinite(entryProjection?.progressMeters) ||
    !Number.isFinite(exitProjection?.progressMeters)
  ) {
    return null;
  }

  return {
    shapeId,
    min: Math.min(entryProjection.progressMeters, exitProjection.progressMeters),
    max: Math.max(entryProjection.progressMeters, exitProjection.progressMeters),
  };
}

function getSegmentProgressWindow(segment, shapes) {
  if (Number.isFinite(segment?.progressMinMeters) && Number.isFinite(segment?.progressMaxMeters)) {
    const min = Math.min(segment.progressMinMeters, segment.progressMaxMeters);
    const max = Math.max(segment.progressMinMeters, segment.progressMaxMeters);
    if (max > min) {
      return {
        shapeId: segment.shapeIdHint || segment.detourZone?.shapeId || null,
        min,
        max,
      };
    }
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

  const persistedGeometryWindow = getPersistedGeometryProgressWindow(segment, shapes);
  if (persistedGeometryWindow) {
    return persistedGeometryWindow;
  }

  if (Number.isFinite(segment?.progressMinMeters) && Number.isFinite(segment?.progressMaxMeters)) {
    return {
      shapeId: segment.shapeIdHint || segment.detourZone?.shapeId || null,
      min: Math.min(segment.progressMinMeters, segment.progressMaxMeters),
      max: Math.max(segment.progressMinMeters, segment.progressMaxMeters),
    };
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

function projectCoordinateToShape(shapeId, coordinate, shapes) {
  if (!shapeId || !coordinate || !shapes) return null;
  const polyline = shapes.get(shapeId);
  if (!Array.isArray(polyline) || polyline.length < 2) return null;
  const projection = projectOntoPolyline(coordinate, polyline);
  return projection ? { ...projection, shapeId } : null;
}

function getProjectionForSegmentClear(routeId, coordinate, segment, projection, shapes, routeShapeMapping, routeConfig) {
  if (!segment) return projection || null;

  if (isProjectionInClearWindow(projection, segment, shapes)) {
    return projection;
  }

  const window = getUsableSegmentProgressWindow(segment, shapes);
  const shapeIds = routeShapeMapping.get(routeId) || [];
  const segmentShapeId = window?.shapeId || segment.shapeIdHint || segment.detourZone?.shapeId || null;
  if (!segmentShapeId || !shapeIds.includes(segmentShapeId) || projection?.shapeId === segmentShapeId) {
    return projection || null;
  }

  const alternateProjection = projectCoordinateToShape(segmentShapeId, coordinate, shapes);
  const clearThreshold = routeConfig?.onRouteClearThresholdMeters || ON_ROUTE_CLEAR_THRESHOLD_METERS;
  if (!alternateProjection || alternateProjection.distanceMeters > clearThreshold) {
    return projection || null;
  }

  return alternateProjection;
}

function findBestMatchingSegmentForClear(routeState, routeId, coordinate, projection, shapes, routeShapeMapping, routeConfig) {
  if (!routeState?.segments) return null;

  let segment = projection ? findBestMatchingSegment(routeState, projection, shapes) : null;
  let clearProjection = segment
    ? getProjectionForSegmentClear(routeId, coordinate, segment, projection, shapes, routeShapeMapping, routeConfig)
    : projection;

  if (segment && isProjectionInClearWindow(clearProjection, segment, shapes)) {
    return { segment, projection: clearProjection };
  }

  const shapeIds = routeShapeMapping.get(routeId) || [];
  const clearThreshold = routeConfig?.onRouteClearThresholdMeters || ON_ROUTE_CLEAR_THRESHOLD_METERS;
  let best = null;

  for (const candidateSegment of routeState.segments.values()) {
    const window = getUsableSegmentProgressWindow(candidateSegment, shapes);
    const shapeId = window?.shapeId || candidateSegment.shapeIdHint || candidateSegment.detourZone?.shapeId || null;
    if (!shapeId || !shapeIds.includes(shapeId) || shapeId === projection?.shapeId) continue;

    const candidateProjection = projectCoordinateToShape(shapeId, coordinate, shapes);
    if (!candidateProjection || candidateProjection.distanceMeters > clearThreshold) continue;

    const distance = getProjectionDistanceToSegment(candidateSegment, candidateProjection, shapes);
    if (!Number.isFinite(distance)) continue;
    if (!best || distance < best.distance) {
      best = {
        segment: candidateSegment,
        projection: candidateProjection,
        distance,
      };
    }
  }

  return best
    ? { segment: best.segment, projection: best.projection }
    : (segment ? { segment, projection: clearProjection || projection } : null);
}

function getUsableSegmentProgressWindow(segment, shapes) {
  const window = getSegmentProgressWindow(segment, shapes);
  if (!Number.isFinite(window.min) || !Number.isFinite(window.max)) return null;
  const min = Math.min(window.min, window.max);
  const max = Math.max(window.min, window.max);
  if (max <= min) return null;
  return {
    shapeId: window.shapeId || null,
    min,
    max,
    spanMeters: max - min,
  };
}

function resetOnRouteClearTraversal(state) {
  if (!state) return;
  state.onRouteStreakStart = null;
  state.onRouteStreakShapeId = null;
  state.onRouteStreakMinProgressMeters = null;
  state.onRouteStreakMaxProgressMeters = null;
  state.onRouteStreakPointCount = 0;
}

function isProjectionInClearWindow(projection, segment, shapes) {
  if (!projection || !Number.isFinite(projection.progressMeters)) return false;
  const window = getUsableSegmentProgressWindow(segment, shapes);
  if (!window) return false;
  if (window.shapeId && projection.shapeId && window.shapeId !== projection.shapeId) return false;
  return projection.progressMeters >= window.min && projection.progressMeters <= window.max;
}

function updateOnRouteClearTraversal(state, projection, timestampMs = Date.now()) {
  if (!state || !projection || !Number.isFinite(projection.progressMeters)) return;

  const shapeId = projection.shapeId || null;
  if (state.onRouteStreakShapeId && shapeId && state.onRouteStreakShapeId !== shapeId) {
    resetOnRouteClearTraversal(state);
  }

  if (!state.onRouteStreakStart) {
    state.onRouteStreakStart = {
      coordinate: projection.projectedPoint || null,
      timestampMs,
    };
  }
  state.onRouteStreakShapeId = shapeId || state.onRouteStreakShapeId || null;
  state.onRouteStreakMinProgressMeters = Number.isFinite(state.onRouteStreakMinProgressMeters)
    ? Math.min(state.onRouteStreakMinProgressMeters, projection.progressMeters)
    : projection.progressMeters;
  state.onRouteStreakMaxProgressMeters = Number.isFinite(state.onRouteStreakMaxProgressMeters)
    ? Math.max(state.onRouteStreakMaxProgressMeters, projection.progressMeters)
    : projection.progressMeters;
  state.onRouteStreakPointCount = (Number(state.onRouteStreakPointCount) || 0) + 1;
}

function hasRegularRouteTraversalForClear(state, segment, projection, shapes, routeConfig) {
  const window = getUsableSegmentProgressWindow(segment, shapes);
  if (!window) return false;
  if (window.shapeId && projection?.shapeId && window.shapeId !== projection.shapeId) return false;
  if (window.shapeId && state?.onRouteStreakShapeId && window.shapeId !== state.onRouteStreakShapeId) {
    return false;
  }

  const minProgress = state?.onRouteStreakMinProgressMeters;
  const maxProgress = state?.onRouteStreakMaxProgressMeters;
  if (!Number.isFinite(minProgress) || !Number.isFinite(maxProgress)) return false;

  const observedMin = Math.min(minProgress, maxProgress);
  const observedMax = Math.max(minProgress, maxProgress);
  const observedSpan = observedMax - observedMin;
  const overlapMeters = Math.max(0, Math.min(observedMax, window.max) - Math.max(observedMin, window.min));
  const ratio = Math.min(Math.max(Number(routeConfig?.clearMinTraversalRatio) || 0.6, 0), 1);
  const minTraversalMeters = Math.max(Number(routeConfig?.clearMinTraversalMeters) || 0, 0);
  const requiredOverlapMeters = window.spanMeters * ratio;
  const requiredSpanMeters = Math.min(minTraversalMeters, requiredOverlapMeters);

  return overlapMeters >= requiredOverlapMeters && observedSpan >= requiredSpanMeters;
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

function resolvePersistentLastEvidenceAt(detour, geometry, existing, now) {
  return (
    toTimestampMs(detour?.lastOffRouteEvidenceAt) ||
    toTimestampMs(geometry?.lastEvidenceAt) ||
    toTimestampMs(existing?.lastEvidenceAt) ||
    toTimestampMs(detour?.lastSeenAt) ||
    now
  );
}

function upsertLearnedPersistentDetour(routeId, detour, geometry, now, routeState = null) {
  const fingerprint = buildDetourFingerprint(routeId, detour, geometry);
  if (!fingerprint) return null;

  const existing = learnedPersistentDetours.get(routeId) || {};
  const currentEvidence = routeState ? collectLearnedEvidenceFromRouteState(routeState) : null;
  const evidence = normalizeLearnedEvidence({
    points: [
      ...(existing.evidence?.points || []),
      ...(currentEvidence?.points || []),
    ],
    confidencePoints: [
      ...(existing.evidence?.confidencePoints || []),
      ...(currentEvidence?.confidencePoints || []),
    ],
    entryCandidates: [
      ...(existing.evidence?.entryCandidates || []),
      ...(currentEvidence?.entryCandidates || []),
    ],
    exitCandidates: [
      ...(existing.evidence?.exitCandidates || []),
      ...(currentEvidence?.exitCandidates || []),
    ],
  });
  const record = {
    routeId,
    fingerprint,
    detectedAt: detour.detectedAt instanceof Date ? detour.detectedAt.getTime() : Number(detour.detectedAt) || now,
    learnedAt: existing.learnedAt || now,
    updatedAt: now,
    lastSeenAt: detour.lastSeenAt instanceof Date ? detour.lastSeenAt.getTime() : Number(detour.lastSeenAt) || now,
    lastEvidenceAt: resolvePersistentLastEvidenceAt(detour, geometry, existing, now),
    triggerVehicleId: detour.triggerVehicleId || existing.triggerVehicleId || null,
    geometry: hasRenderableGeometry(geometry) ? cloneJson(geometry) : cloneJson(existing.geometry) || null,
    detourZone: detour.detourZone ? cloneJson(detour.detourZone) : cloneJson(existing.detourZone) || null,
    evidence,
  };

  learnedPersistentDetours.set(routeId, record);

  detour.isPersistent = true;
  detour.persistentFingerprint = fingerprint;
  detour.persistedGeometry = cloneJson(record.geometry);
  if (routeState?.segments) {
    for (const segment of routeState.segments.values()) {
      segment.learnedEvidence = cloneJson(record.evidence);
    }
  }
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
    segment.learnedEvidence = cloneJson(record.evidence) || {
      points: [],
      confidencePoints: [],
      entryCandidates: [],
      exitCandidates: [],
    };
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

function clearLearnedPersistentDetour(routeId) {
  learnedPersistentDetours.delete(routeId);
  persistentDetourCandidates.delete(routeId);
}

function doesSegmentMatchLearnedPersistentDetour(routeId, segment) {
  const learned = learnedPersistentDetours.get(routeId);
  if (!learned?.fingerprint || !segment || segment.isPersistent) return false;
  if (segment.persistentFingerprint && segment.persistentFingerprint === learned.fingerprint) {
    return true;
  }

  const fingerprint = buildDetourFingerprint(
    routeId,
    { detourZone: segment.detourZone || null },
    segment.persistedGeometry || null
  );
  return Boolean(fingerprint && fingerprint === learned.fingerprint);
}

function clearLearnedPersistentDetourIfUnconfirmed(routeId, segment) {
  if (!doesSegmentMatchLearnedPersistentDetour(routeId, segment)) return;
  if (getSegmentUniqueVehicleCount(segment) >= MIN_VEHICLES_FOR_DETOUR) return;
  clearLearnedPersistentDetour(routeId);
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

function retainDetoursForOutOfService() {
  vehicleState.clear();

  for (const routeState of activeDetours.values()) {
    if (!routeState?.segments) continue;
    for (const segment of routeState.segments.values()) {
      ensureSegmentEvidenceSets(segment);
      if (segment.vehiclesOffRoute instanceof Set) {
        segment.vehiclesOffRoute.clear();
      } else {
        segment.vehiclesOffRoute = new Set();
      }
      if (segment.state !== 'clear-pending') {
        segment.state = 'active';
        segment.clearPendingAt = null;
        segment.clearReason = null;
      }
    }
  }

  recurringShortDeviationCandidates.clear();
}

function markDetourPublishedIfEligible(detour) {
  if (!detour || detour.isPublished) return;
  const matchedVehicleCount = getSegmentUniqueVehicleCount(detour);
  if (matchedVehicleCount >= MIN_VEHICLES_FOR_DETOUR) {
    detour.isPublished = true;
  }
}

function ensureSegmentEvidenceSets(segment) {
  if (!segment) return;
  if (!(segment.matchedVehicleIds instanceof Set)) {
    segment.matchedVehicleIds = new Set((segment.matchedVehicleIds || []).filter(Boolean));
  }
  if (!(segment.candidateConfirmationIds instanceof Set)) {
    segment.candidateConfirmationIds = new Set((segment.candidateConfirmationIds || []).filter(Boolean));
  }
  if (!(segment.normalRouteVehicleIds instanceof Set)) {
    segment.normalRouteVehicleIds = new Set((segment.normalRouteVehicleIds || []).filter(Boolean));
  }
}

function addEvidenceVehicleIds(ids, items) {
  for (const item of Array.isArray(items) ? items : []) {
    const vehicleId = item?.vehicleId;
    if (vehicleId) ids.add(vehicleId);
  }
}

function getEvidenceBackedVehicleIds(segment) {
  ensureSegmentEvidenceSets(segment);
  const ids = new Set();
  const evidence = segment?.evidence || {};

  addEvidenceVehicleIds(ids, evidence.points);
  addEvidenceVehicleIds(ids, evidence.confidencePoints);

  for (const vehicleId of segment?.vehiclesOffRoute || []) {
    if (vehicleId) ids.add(vehicleId);
  }

  return ids;
}

function getSegmentConfirmationVehicleIds(segment) {
  ensureSegmentEvidenceSets(segment);
  const evidenceBackedVehicleIds = getEvidenceBackedVehicleIds(segment);
  const ids = new Set([
    ...evidenceBackedVehicleIds,
    ...(segment?.candidateConfirmationIds || []),
  ].filter(Boolean));
  if (ids.size > 0) return ids;
  return new Set([
    ...(segment?.matchedVehicleIds || []),
    ...(segment?.vehiclesOffRoute || []),
  ].filter(Boolean));
}

function shouldUseEvidenceBackedConfirmation(segment) {
  return !segment?.isPersistent && MIN_VEHICLES_FOR_DETOUR > 1;
}

function syncMatchedVehicleIdsToCurrentEvidence(segment) {
  if (!shouldUseEvidenceBackedConfirmation(segment)) return;
  const confirmationVehicleIds = getSegmentConfirmationVehicleIds(segment);
  if (confirmationVehicleIds.size > 0) {
    segment.matchedVehicleIds = confirmationVehicleIds;
  }
}

function getSegmentUniqueVehicleCount(segment) {
  ensureSegmentEvidenceSets(segment);
  if (shouldUseEvidenceBackedConfirmation(segment)) {
    return getSegmentConfirmationVehicleIds(segment).size;
  }
  return segment?.matchedVehicleIds?.size || segment?.vehiclesOffRoute?.size || 0;
}

function getSegmentCurrentVehicleCount(segment) {
  return segment?.vehiclesOffRoute?.size || 0;
}

function promoteConfidenceForVehicleEvidence(confidence, uniqueVehicleCount) {
  if (uniqueVehicleCount >= 2 && confidenceRank(confidence) < confidenceRank('medium')) {
    return 'medium';
  }
  return confidence || 'low';
}

function getOrCreateSegmentEvidence(segment) {
  if (!segment.evidence) {
    segment.evidence = {
      points: [],
      confidencePoints: [],
      entryCandidates: [],
      exitCandidates: [],
    };
  } else {
    if (!Array.isArray(segment.evidence.points)) segment.evidence.points = [];
    if (!Array.isArray(segment.evidence.confidencePoints)) segment.evidence.confidencePoints = [];
    if (!Array.isArray(segment.evidence.entryCandidates)) segment.evidence.entryCandidates = [];
    if (!Array.isArray(segment.evidence.exitCandidates)) segment.evidence.exitCandidates = [];
  }
  return segment.evidence;
}

const LEARNED_EVIDENCE_MAX_POINTS = 240;
const LEARNED_EVIDENCE_MAX_BOUNDARY_CANDIDATES = 80;

function getOrCreateLearnedEvidence(segment) {
  if (!segment.learnedEvidence) {
    segment.learnedEvidence = {
      points: [],
      confidencePoints: [],
      entryCandidates: [],
      exitCandidates: [],
    };
  } else {
    if (!Array.isArray(segment.learnedEvidence.points)) segment.learnedEvidence.points = [];
    if (!Array.isArray(segment.learnedEvidence.confidencePoints)) segment.learnedEvidence.confidencePoints = [];
    if (!Array.isArray(segment.learnedEvidence.entryCandidates)) segment.learnedEvidence.entryCandidates = [];
    if (!Array.isArray(segment.learnedEvidence.exitCandidates)) segment.learnedEvidence.exitCandidates = [];
  }
  return segment.learnedEvidence;
}

function evidenceItemKey(item) {
  const normalized = normalizeEvidenceEntry(item);
  if (!normalized) return null;
  return [
    normalized.vehicleId || '',
    normalized.timestampMs,
    normalized.latitude.toFixed(6),
    normalized.longitude.toFixed(6),
  ].join('|');
}

function dedupeEvidenceItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    const normalized = normalizeEvidenceEntry(item);
    const key = evidenceItemKey(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result.sort((a, b) => a.timestampMs - b.timestampMs);
}

function trimEvidenceItems(items, maxItems) {
  const deduped = dedupeEvidenceItems(items);
  if (deduped.length <= maxItems) return deduped;
  return deduped.slice(deduped.length - maxItems);
}

function appendLearnedEvidenceItem(segment, key, item) {
  const learned = getOrCreateLearnedEvidence(segment);
  const normalized = normalizeEvidenceEntry(item);
  if (!normalized || !Array.isArray(learned[key])) return;
  learned[key] = trimEvidenceItems(
    [...learned[key], normalized],
    key === 'points' || key === 'confidencePoints'
      ? LEARNED_EVIDENCE_MAX_POINTS
      : LEARNED_EVIDENCE_MAX_BOUNDARY_CANDIDATES
  );
}

function normalizeLearnedEvidence(evidence = {}) {
  return {
    points: trimEvidenceItems(evidence.points, LEARNED_EVIDENCE_MAX_POINTS),
    confidencePoints: trimEvidenceItems(evidence.confidencePoints, LEARNED_EVIDENCE_MAX_POINTS),
    entryCandidates: trimEvidenceItems(evidence.entryCandidates, LEARNED_EVIDENCE_MAX_BOUNDARY_CANDIDATES),
    exitCandidates: trimEvidenceItems(evidence.exitCandidates, LEARNED_EVIDENCE_MAX_BOUNDARY_CANDIDATES),
  };
}

function mergeEvidenceForGeometry(currentEvidence = {}, learnedEvidence = {}) {
  const learned = normalizeLearnedEvidence(learnedEvidence);
  const points = trimEvidenceItems(
    [
      ...(learned.points || []),
      ...(currentEvidence.points || []),
    ],
    LEARNED_EVIDENCE_MAX_POINTS
  );
  const confidencePoints = trimEvidenceItems(
    [
      ...(learned.confidencePoints || []),
      ...(learned.points || []),
      ...(currentEvidence.confidencePoints || []),
      ...(currentEvidence.points || []),
    ],
    LEARNED_EVIDENCE_MAX_POINTS
  );

  return {
    points,
    confidencePoints,
    entryCandidates: trimEvidenceItems(
      [
        ...(learned.entryCandidates || []),
        ...(currentEvidence.entryCandidates || []),
      ],
      LEARNED_EVIDENCE_MAX_BOUNDARY_CANDIDATES
    ),
    exitCandidates: trimEvidenceItems(
      [
        ...(learned.exitCandidates || []),
        ...(currentEvidence.exitCandidates || []),
      ],
      LEARNED_EVIDENCE_MAX_BOUNDARY_CANDIDATES
    ),
  };
}

function collectLearnedEvidenceFromRouteState(routeState) {
  const combined = {
    points: [],
    confidencePoints: [],
    entryCandidates: [],
    exitCandidates: [],
  };
  for (const segment of routeState?.segments?.values?.() || []) {
    const current = segment.evidence || {};
    const learned = segment.learnedEvidence || {};
    combined.points.push(...(learned.points || []), ...(current.points || []));
    combined.confidencePoints.push(
      ...(learned.confidencePoints || []),
      ...(learned.points || []),
      ...(current.confidencePoints || []),
      ...(current.points || [])
    );
    combined.entryCandidates.push(...(learned.entryCandidates || []), ...(current.entryCandidates || []));
    combined.exitCandidates.push(...(learned.exitCandidates || []), ...(current.exitCandidates || []));
  }
  return normalizeLearnedEvidence(combined);
}

function pruneEvidenceWindow(evidence, cutoff) {
  if (!evidence || !Number.isFinite(cutoff)) return;

  for (const key of ['points', 'confidencePoints', 'entryCandidates', 'exitCandidates']) {
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

  pruneOffRouteStreakPoints(state, timestampMs - DETOUR_VEHICLE_TRACE_WINDOW_MS);
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

  const candidate = {
    latitude: observation.coordinate.latitude,
    longitude: observation.coordinate.longitude,
    timestampMs: observation.timestampMs,
    vehicleId,
    tripShapeId: tripShapeId || null,
  };
  candidates.push(candidate);
  appendLearnedEvidenceItem(segment, listKey, candidate);

  const evidenceWindowMs = routeConfig?.evidenceWindowMs || EVIDENCE_WINDOW_MS;
  pruneEvidenceWindow(evidence, observation.timestampMs - evidenceWindowMs);
}

function clearExitCandidatesAfter(segment, cutoffMs) {
  const evidence = segment?.evidence;
  if (!evidence || !Array.isArray(evidence.exitCandidates) || !Number.isFinite(cutoffMs)) return;
  evidence.exitCandidates = evidence.exitCandidates.filter((candidate) => candidate.timestampMs < cutoffMs);
}

function trackPersistentLearning(routeId, detour, geometry, now, routeState = null) {
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
    upsertLearnedPersistentDetour(routeId, detour, geometry, now, routeState);
    return;
  }

  if (
    next.consecutiveMatches >= DETOUR_PERSIST_CONSECUTIVE_MATCHES &&
    detourAgeMs >= DETOUR_PERSIST_MIN_AGE_MS
  ) {
    upsertLearnedPersistentDetour(routeId, detour, geometry, now, routeState);
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
      evidence: normalizeLearnedEvidence(record.evidence || {}),
    });
  }
}

function getSnapshotConfirmationIds(routeId, record = {}) {
  const explicitIds = Array.isArray(record.matchedVehicleIds)
    ? record.matchedVehicleIds.filter(Boolean)
    : [];
  if (explicitIds.length > 0) return explicitIds;

  const vehicleCount = Math.max(Number(record.vehicleCount) || 0, 0);
  return Array.from({ length: vehicleCount }, (_, index) => `snapshot:${routeId}:${index + 1}`);
}

function hydrateActiveDetourSnapshots(records = {}) {
  let hydratedCount = 0;
  for (const [recordRouteId, record] of Object.entries(records || {})) {
    const routeId = record?.routeId || recordRouteId;
    if (!routeId) continue;

    const existingRouteState = activeDetours.get(routeId);
    if (existingRouteState?.segments?.size > 0) continue;

    const routeConfig = resolveRouteDetectorConfig(routeId);
    const routeState = getOrCreateRouteDetourState(routeId, routeConfig);
    const now = Date.now();
    const segment = createSegmentState('active-snapshot-1', routeConfig, record.detectedAt || now, record.triggerVehicleId || null);
    const confirmationIds = getSnapshotConfirmationIds(routeId, record);

    segment.detectedAt = toDateOrNow(record.detectedAt, now);
    segment.lastSeenAt = toDateOrNow(record.lastSeenAt, now);
    segment.lastOffRouteEvidenceAt = toTimestampMs(record.lastEvidenceAt) ||
      toTimestampMs(record.lastSeenAt) ||
      toTimestampMs(record.detectedAt) ||
      now;
    segment.vehiclesOffRoute = new Set();
    segment.matchedVehicleIds = new Set(confirmationIds);
    segment.candidateConfirmationIds = new Set(confirmationIds);
    segment.normalRouteVehicleIds = new Set();
    segment.state = 'active';
    segment.clearPendingAt = null;
    segment.clearReason = null;
    segment.isPublished = true;
    segment.isPersistent = true;
    segment.persistentFingerprint = null;
    segment.persistedGeometry = cloneJson(record.geometry) || null;
    segment.detourZone = cloneJson(record.detourZone) || null;
    segment.learnedEvidence = {
      points: [],
      confidencePoints: [],
      entryCandidates: [],
      exitCandidates: [],
    };
    segment.shapeIdHint = record.detourZone?.shapeId || record.geometry?.shapeId || null;
    segment.progressMinMeters = null;
    segment.progressMaxMeters = null;

    routeState.segments.set(segment.segmentId, segment);
    routeState.nextSegmentOrdinal = 2;
    hydratedCount++;
  }

  if (hydratedCount > 0) {
    lastReportedDetours = null;
  }
  return hydratedCount;
}

const runtimeStatePersistence = createRuntimeStatePersistence({
  vehicleState,
  activeDetours,
  detourEvidence,
  persistentDetourCandidates,
  normalDetourCandidates,
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

function reconcileActiveDetourVehicleMembership() {
  for (const [routeId, routeState] of activeDetours) {
    if (!routeState?.segments) continue;
    for (const [segmentId, segment] of routeState.segments) {
      if (!(segment.vehiclesOffRoute instanceof Set)) {
        segment.vehiclesOffRoute = new Set((segment.vehiclesOffRoute || []).filter(Boolean));
      }

      for (const vehicleId of [...segment.vehiclesOffRoute]) {
        const state = vehicleState.get(vehicleId);
        if (
          !state ||
          state.routeId !== routeId ||
          state.detourSegmentId !== segmentId
        ) {
          segment.vehiclesOffRoute.delete(vehicleId);
        }
      }
    }
  }
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

  ensureSegmentEvidenceSets(segment);
  const vehicleWasAlreadyOffRoute = segment.vehiclesOffRoute.has(vehicleId);
  segment.routeConfig = routeConfig;
  if (vehicleId) {
    segment.vehiclesOffRoute.add(vehicleId);
    segment.matchedVehicleIds.add(vehicleId);
  }
  segment.lastSeenAt = new Date(now || Date.now());
  segment.lastOffRouteEvidenceAt = now || Date.now();
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
      appendLearnedEvidenceItem(segment, 'points', point);
      appendLearnedEvidenceItem(segment, 'confidencePoints', point);
    }
    if (streakPoints.length === 0) {
      const point = makeEvidenceEntry(coordinate, ts, vehicleId, boundarySignals.tripShapeId || null);
      appendEvidencePoint(evidence.points, point);
      appendLearnedEvidenceItem(segment, 'points', point);
      appendLearnedEvidenceItem(segment, 'confidencePoints', point);
    }
    pruneEvidenceWindow(evidence, ts - routeConfig.evidenceWindowMs);
  }

  syncMatchedVehicleIdsToCurrentEvidence(segment);
  markDetourPublishedIfEligible(segment);

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

function getNormalCandidateWindowMs(routeId, scheduleIndex, nowMs) {
  const fallbackWindowMs = DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS;
  const estimate = estimateRouteHeadwayMs(routeId, scheduleIndex, nowMs);
  const headwayMs = estimate?.headwayMs;
  if (!Number.isFinite(headwayMs) || headwayMs <= 0) return fallbackWindowMs;

  const headwayWindowMs =
    headwayMs * DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER +
    DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS;

  return Math.min(
    DETOUR_CANDIDATE_CONFIRMATION_MAX_MS,
    Math.max(fallbackWindowMs, headwayWindowMs)
  );
}

function buildNormalDetourCandidateObservation(
  state,
  routeId,
  routeConfig,
  shapes,
  routeShapeMapping,
  now
) {
  if (!state) return null;

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

  const vehicleId = state.vehicleId || state.id || null;
  const signature = makeCandidateObservationSignature({ vehicleId, tripId: state.tripId });
  const evidencePoints = streakPoints.map((point) => ({
    ...point,
    vehicleId: point.vehicleId || vehicleId,
    tripId: state.tripId || point.tripId || null,
  }));

  return {
    routeId,
    shapeId,
    progressMinMeters: Math.min(...progressValues),
    progressMaxMeters: Math.max(...progressValues),
    timestampMs: now,
    vehicleId,
    tripId: state.tripId || null,
    tripShapeId: state.tripShapeId || null,
    signature,
    entryObservation: state.lastOnRouteObservation || state.offRouteStreakStart || null,
    evidencePoints,
    lastCoordinate: coordinateFromEvidencePoint(evidencePoints[evidencePoints.length - 1]),
    routeConfig,
  };
}

function getCandidateConfirmationId(observation) {
  if (observation?.vehicleId) return observation.vehicleId;
  if (observation?.tripId) return `trip:${observation.tripId}`;
  const signature = observation?.signature || makeCandidateObservationSignature(observation);
  if (!signature || signature === 'unknown') return null;
  if (signature.startsWith('vehicle:')) return signature.slice('vehicle:'.length);
  return signature;
}

function deleteNormalDetourCandidate(candidate) {
  for (const [key, storedCandidate] of normalDetourCandidates) {
    if (storedCandidate === candidate) {
      normalDetourCandidates.delete(key);
      return;
    }
  }
}

function publishNormalDetourCandidate(candidate, observation, shapes, routeShapeMapping) {
  const midpoint = (candidate.progressMinMeters + candidate.progressMaxMeters) / 2;
  const coordinate = observation.lastCoordinate || coordinateFromEvidencePoint(candidate.evidencePoints.at(-1));
  if (!coordinate || !Number.isFinite(midpoint)) return null;

  const routeConfig = observation.routeConfig || resolveRouteDetectorConfig(observation.routeId);
  const candidateEvidencePoints = (candidate.observations || [])
    .flatMap((candidateObservation) => candidateObservation.evidencePoints || []);

  const segmentId = addVehicleToDetour(
    observation.vehicleId || null,
    observation.routeId,
    coordinate,
    observation.timestampMs,
    {
      entryObservation: candidate.observations?.[0]?.entryObservation || observation.entryObservation,
      offRouteStreakPoints: candidateEvidencePoints,
      tripShapeId: observation.tripShapeId,
      projection: {
        shapeId: observation.shapeId,
        progressMeters: midpoint,
        distanceMeters: (routeConfig?.offRouteThresholdMeters || OFF_ROUTE_THRESHOLD_METERS) + 1,
      },
    },
    shapes,
    routeShapeMapping
  );

  const routeState = activeDetours.get(observation.routeId);
  const segment = routeState?.segments?.get(segmentId);
  if (!segment) return null;

  ensureSegmentEvidenceSets(segment);
  for (const candidateObservation of candidate.observations || []) {
    const confirmationId = getCandidateConfirmationId(candidateObservation);
    if (confirmationId) segment.candidateConfirmationIds.add(confirmationId);
    if (candidateObservation.vehicleId) segment.matchedVehicleIds.add(candidateObservation.vehicleId);

    if (candidateObservation.entryObservation) {
      recordBoundaryCandidate(
        segment,
        'entry',
        candidateObservation.entryObservation,
        candidateObservation.vehicleId,
        routeConfig,
        candidateObservation.tripShapeId
      );
    }
  }

  segment.normalCandidateDetour = true;
  segment.lastSeenAt = new Date(observation.timestampMs);
  segment.lastOffRouteEvidenceAt = observation.timestampMs;
  syncMatchedVehicleIdsToCurrentEvidence(segment);
  markDetourPublishedIfEligible(segment);
  return segmentId;
}

function recordNormalDetourCandidateObservation(
  observation,
  shapes,
  routeShapeMapping,
  scheduleIndex = null
) {
  if (!observation) return null;

  pruneExpiredCandidates(normalDetourCandidates, {
    nowMs: observation.timestampMs,
    windowMs: getNormalCandidateWindowMs(observation.routeId, scheduleIndex, observation.timestampMs),
    routeId: observation.routeId,
  });

  const candidate = upsertCandidateObservation(normalDetourCandidates, observation, {
    maxGapMeters: RECURRING_SHORT_DEVIATION_MAX_GAP_METERS,
  });

  if (!hasEnoughUniqueEvidence(candidate, { minUniqueSignatures: MIN_VEHICLES_FOR_DETOUR })) {
    return null;
  }

  const segmentId = publishNormalDetourCandidate(candidate, observation, shapes, routeShapeMapping);
  if (segmentId) {
    deleteNormalDetourCandidate(candidate);
  }
  return segmentId;
}

function getRecurringFamilyConfig(routeId, routeConfig = null) {
  const config = routeConfig || resolveRouteDetectorConfig(routeId);
  const familyId = typeof config?.recurringShortDeviationFamilyId === 'string'
    ? config.recurringShortDeviationFamilyId.trim()
    : '';
  if (!familyId) return null;

  return {
    familyId,
    minRoutes: Math.max(Number(config.recurringShortDeviationFamilyMinRoutes) || 2, 1),
    minObservations: Math.max(Number(config.recurringShortDeviationFamilyMinObservations) || 2, 1),
    maxDistanceMeters: Math.max(Number(config.recurringShortDeviationFamilyMaxDistanceMeters) || 500, 1),
  };
}

function getObservationReferenceCoordinate(observation) {
  const coordinates = (observation?.evidencePoints || [])
    .map(coordinateFromEvidencePoint)
    .filter(Boolean);
  if (coordinates.length > 0) {
    return averageCoordinate(coordinates);
  }
  return observation?.lastCoordinate || observation?.entryObservation?.coordinate || null;
}

function averageCoordinate(coordinates) {
  const valid = (coordinates || []).filter((coordinate) =>
    Number.isFinite(coordinate?.latitude) && Number.isFinite(coordinate?.longitude)
  );
  if (valid.length === 0) return null;
  return {
    latitude: valid.reduce((sum, coordinate) => sum + coordinate.latitude, 0) / valid.length,
    longitude: valid.reduce((sum, coordinate) => sum + coordinate.longitude, 0) / valid.length,
  };
}

function getCandidateReferenceCoordinate(candidate) {
  const coordinates = (candidate?.observations || [])
    .map(getObservationReferenceCoordinate)
    .filter(Boolean);
  if (coordinates.length > 0) return averageCoordinate(coordinates);
  return averageCoordinate((candidate?.evidencePoints || []).map(coordinateFromEvidencePoint).filter(Boolean));
}

function coordinateGapMeters(a, b) {
  if (
    !Number.isFinite(a?.latitude) ||
    !Number.isFinite(a?.longitude) ||
    !Number.isFinite(b?.latitude) ||
    !Number.isFinite(b?.longitude)
  ) {
    return Infinity;
  }
  return haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
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
  const recurringFamily = getRecurringFamilyConfig(routeId, routeConfig);

  return {
    routeId,
    shapeId,
    recurringFamilyId: recurringFamily?.familyId || null,
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
  ensureSegmentEvidenceSets(segment);
  const evidence = getOrCreateSegmentEvidence(segment);
  for (const point of observation.evidencePoints || []) {
    appendEvidencePoint(evidence.points, point);
    appendLearnedEvidenceItem(segment, 'points', point);
    appendLearnedEvidenceItem(segment, 'confidencePoints', point);
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
  segment.recurringShortDeviation = true;
  segment.vehiclesOffRoute.delete(observation.vehicleId);
  if (observation.vehicleId) segment.matchedVehicleIds.add(observation.vehicleId);
  syncMatchedVehicleIdsToCurrentEvidence(segment);
  markDetourPublishedIfEligible(segment);
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
  const confidenceEvidencePoints = Array.isArray(candidate.confidenceEvidencePoints)
    ? candidate.confidenceEvidencePoints
    : candidateEvidencePoints;

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
    ensureSegmentEvidenceSets(segment);
    for (const candidateObservation of candidate.observations || []) {
      if (candidateObservation.vehicleId) segment.matchedVehicleIds.add(candidateObservation.vehicleId);
    }
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
      appendLearnedEvidenceItem(segment, 'points', point);
    }
    evidence.confidencePoints = [];
    for (const point of confidenceEvidencePoints) {
      appendEvidencePoint(evidence.confidencePoints, point);
      appendLearnedEvidenceItem(segment, 'confidencePoints', point);
    }
    pruneEvidenceWindow(
      evidence,
      observation.timestampMs - RECURRING_SHORT_DEVIATION_WINDOW_MS
    );

    segment.vehiclesOffRoute.delete(observation.vehicleId);
    if (observation.vehicleId) segment.matchedVehicleIds.add(observation.vehicleId);
    segment.recurringShortDeviation = true;
    syncMatchedVehicleIdsToCurrentEvidence(segment);
    markDetourPublishedIfEligible(segment);
    segment.lastSeenAt = new Date(observation.timestampMs);
    segment.lastOffRouteEvidenceAt = observation.timestampMs;
  }
  return segment;
}

function getCandidateRecurringFamilyConfig(candidate) {
  if (!candidate?.routeId) return null;
  const config = getRecurringFamilyConfig(candidate.routeId);
  if (!config) return null;
  return {
    ...config,
    familyId: candidate.recurringFamilyId || config.familyId,
  };
}

function getRecurringFamilyGroups() {
  const groups = [];

  for (const [key, candidate] of recurringShortDeviationCandidates) {
    const familyConfig = getCandidateRecurringFamilyConfig(candidate);
    if (!familyConfig) continue;

    const referenceCoordinate = getCandidateReferenceCoordinate(candidate);
    if (!referenceCoordinate) continue;

    let bestGroup = null;
    let bestGapMeters = Infinity;
    for (const group of groups) {
      if (group.familyConfig.familyId !== familyConfig.familyId) continue;
      const gapMeters = coordinateGapMeters(group.referenceCoordinate, referenceCoordinate);
      const maxDistanceMeters = Math.min(
        group.familyConfig.maxDistanceMeters,
        familyConfig.maxDistanceMeters
      );
      if (gapMeters <= maxDistanceMeters && gapMeters < bestGapMeters) {
        bestGroup = group;
        bestGapMeters = gapMeters;
      }
    }

    if (bestGroup) {
      bestGroup.items.push({ key, candidate, referenceCoordinate, familyConfig });
      bestGroup.referenceCoordinate = averageCoordinate(
        bestGroup.items.map((item) => item.referenceCoordinate)
      );
      bestGroup.familyConfig = {
        familyId: familyConfig.familyId,
        minRoutes: Math.max(bestGroup.familyConfig.minRoutes, familyConfig.minRoutes),
        minObservations: Math.max(bestGroup.familyConfig.minObservations, familyConfig.minObservations),
        maxDistanceMeters: Math.min(bestGroup.familyConfig.maxDistanceMeters, familyConfig.maxDistanceMeters),
      };
    } else {
      groups.push({
        familyConfig,
        referenceCoordinate,
        items: [{ key, candidate, referenceCoordinate, familyConfig }],
      });
    }
  }

  return groups;
}

function getFamilyGroupObservations(group) {
  return group.items
    .flatMap((item) => item.candidate?.observations || [])
    .filter((observation) => observation?.routeId);
}

function publishRecurringShortDeviationFamilyGroup(group, shapes, routeShapeMapping) {
  const familyObservations = getFamilyGroupObservations(group);
  const familyConfidenceEvidencePoints = familyObservations
    .flatMap((observation) => observation.evidencePoints || []);
  const observationsByRoute = new Map();
  for (const observation of familyObservations) {
    const routeObservations = observationsByRoute.get(observation.routeId) || [];
    routeObservations.push(observation);
    observationsByRoute.set(observation.routeId, routeObservations);
  }

  for (const [routeId, observations] of observationsByRoute) {
    const sorted = [...observations].sort((a, b) => a.timestampMs - b.timestampMs);
    const latestObservation = sorted[sorted.length - 1];
    const evidencePoints = sorted.flatMap((observation) => observation.evidencePoints || []);
    const progressMinMeters = Math.min(...sorted.map((observation) => observation.progressMinMeters));
    const progressMaxMeters = Math.max(...sorted.map((observation) => observation.progressMaxMeters));

    if (!latestObservation || evidencePoints.length === 0) continue;

    publishRecurringShortDeviationCandidate(
      {
        routeId,
        shapeId: latestObservation.shapeId,
        recurringFamilyId: group.familyConfig.familyId,
        progressMinMeters,
        progressMaxMeters,
        observations: sorted,
        evidencePoints,
        confidenceEvidencePoints: familyConfidenceEvidencePoints,
        lastSeenAt: latestObservation.timestampMs,
      },
      latestObservation,
      shapes,
      routeShapeMapping
    );
  }
}

function promoteMatureRecurringFamilyCandidates(now, shapes, routeShapeMapping) {
  pruneRecurringShortDeviationCandidates(now);

  for (const group of getRecurringFamilyGroups()) {
    const observations = getFamilyGroupObservations(group);
    const routeIds = new Set(observations.map((observation) => observation.routeId).filter(Boolean));
    const signatures = new Set(observations.map((observation) => observation.signature).filter(Boolean));

    if (
      observations.length >= group.familyConfig.minObservations &&
      routeIds.size >= group.familyConfig.minRoutes &&
      signatures.size >= group.familyConfig.minRoutes
    ) {
      publishRecurringShortDeviationFamilyGroup(group, shapes, routeShapeMapping);
      for (const item of group.items) {
        recurringShortDeviationCandidates.delete(item.key);
      }
    }
  }
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
    recurringFamilyId: observation.recurringFamilyId || null,
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
  now,
  onRouteStartObservation = null,
  tripShapeId = null,
  hasClearTraversal = false
) {
  const routeState = activeDetours.get(routeId);
  const segment = routeState?.segments?.get(segmentId);
  if (!segment) return;
  const routeConfig = segment.routeConfig || BASE_ROUTE_DETECTOR_CONFIG;

  if (!hasClearTraversal) return;

  const detourAgeMs = now - segment.detectedAt.getTime();
  if (detourAgeMs < routeConfig.clearGraceMs) return;

  ensureSegmentEvidenceSets(segment);
  segment.vehiclesOffRoute.delete(vehicleId);
  if (vehicleId) segment.normalRouteVehicleIds.add(vehicleId);
  if (onRouteStartObservation) {
    recordBoundaryCandidate(segment, 'exit', onRouteStartObservation, vehicleId, routeConfig, tripShapeId);
  }

  if (getSegmentCurrentVehicleCount(segment) > 0) return;

  if (segment.state !== 'clear-pending') {
    segment.state = 'clear-pending';
    segment.clearPendingAt = now;
    segment.clearReason = 'normal-route-observed';
  }
}

function tickClearPending(now) {
  for (const [routeId, routeState] of activeDetours) {
    for (const [segmentId, segment] of routeState.segments) {
      ensureSegmentEvidenceSets(segment);

      if (!segment.isPersistent && segment.state === 'active' && getSegmentCurrentVehicleCount(segment) === 0) {
        continue;
      }

      if (segment.state !== 'clear-pending') continue;
      const routeConfig = segment.routeConfig || BASE_ROUTE_DETECTOR_CONFIG;

      if (getSegmentCurrentVehicleCount(segment) > 0) {
        segment.state = 'active';
        segment.clearPendingAt = null;
        segment.clearReason = null;
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

function buildRouteSnapshot(routeId, routeState, shapes, routeShapeMapping, now, stopImpactData = null) {
  if (!routeState?.segments || routeState.segments.size === 0) return null;

  const publishedSegments = [];
  const vehiclesOffRoute = new Set();
  const matchedVehicleIds = new Set();
  const normalRouteVehicleIds = new Set();

  for (const segment of routeState.segments.values()) {
    ensureSegmentEvidenceSets(segment);
    syncMatchedVehicleIdsToCurrentEvidence(segment);
    if (
      segment.isPublished &&
      !segment.isPersistent &&
      getSegmentUniqueVehicleCount(segment) < MIN_VEHICLES_FOR_DETOUR
    ) {
      clearLearnedPersistentDetourIfUnconfirmed(routeId, segment);
      segment.isPublished = false;
    }
    if (!segment.isPublished) {
      clearLearnedPersistentDetourIfUnconfirmed(routeId, segment);
      continue;
    }

    const detectedAtMs = segment.detectedAt instanceof Date
      ? segment.detectedAt.getTime()
      : Number(segment.detectedAt);
    const geometry = shapes && routeShapeMapping
      ? (() => {
        const currentEvidence = getOrCreateSegmentEvidence(segment);
        const shouldUseLearnedEvidence =
          segment.isPersistent || doesSegmentMatchLearnedPersistentDetour(routeId, segment);
        const geometryEvidence = shouldUseLearnedEvidence
          ? mergeEvidenceForGeometry(currentEvidence, segment.learnedEvidence)
          : currentEvidence;
        const computedGeometry = buildGeometry(
          routeId,
          geometryEvidence,
          shapes,
          routeShapeMapping,
          now,
          detectedAtMs,
          stopImpactData
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
    const segmentMatchedVehicleIds = shouldUseEvidenceBackedConfirmation(segment)
      ? getSegmentConfirmationVehicleIds(segment)
      : segment.matchedVehicleIds || new Set();
    for (const vehicleId of segmentMatchedVehicleIds) {
      matchedVehicleIds.add(vehicleId);
    }
    for (const vehicleId of segment.normalRouteVehicleIds || []) {
      normalRouteVehicleIds.add(vehicleId);
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
    const confidence = promoteConfidenceForVehicleEvidence(
      segment.geometry?.confidence || 'low',
      getSegmentUniqueVehicleCount(segment)
    );
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
      canShowDetourPath: primarySegment?.canShowDetourPath === true,
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
    matchedVehicleIds,
    normalRouteVehicleIds,
    uniqueVehicleCount: matchedVehicleIds.size,
    currentVehicleCount: vehiclesOffRoute.size,
    vehicleCount: matchedVehicleIds.size,
    state: routeStateLabel,
    clearReason: publishedSegments.find((segment) => segment.clearReason)?.clearReason || null,
    isPersistent: publishedSegments.length === 1 ? Boolean(publishedSegments[0].isPersistent) : false,
    detourZone: publishedSegments.length === 1 ? cloneJson(publishedSegments[0].detourZone) : null,
    geometry: routeGeometry,
  };
}

function processVehicles(vehicles, shapes, routeShapeMapping, tripMapping, stopImpactData = null) {
  const now = Date.now();
  const inService = isWithinServiceHours(now);

  if (!inService) {
    if (wasInService) {
      retainDetoursForOutOfService();
      wasInService = false;
    }
    return getActiveDetours(shapes, routeShapeMapping, {
      trackPersistentLearning: false,
      stopImpactData,
    });
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

  reconcileActiveDetourVehicleMembership();

  for (const vehicle of vehicles) {
    const { id, routeId, coordinate } = vehicle;
    if (!routeId || !coordinate) continue;
    const routeConfig = resolveRouteDetectorConfig(routeId);
    const sampleTimeMs = getVehicleSampleTimeMs(vehicle, now);

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
        onRouteStreakShapeId: null,
        onRouteStreakMinProgressMeters: null,
        onRouteStreakMaxProgressMeters: null,
        onRouteStreakPointCount: 0,
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
      resetOnRouteClearTraversal(state);
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
          timestampMs: sampleTimeMs,
        };
        clearOffRouteStreakPoints(state);
      }

      state.consecutiveOffRoute++;
      recordOffRouteStreakPoint(state, coordinate, sampleTimeMs, tripShapeId, routeConfig);
      state.consecutiveOnRoute = 0;
      resetOnRouteClearTraversal(state);

      if (state.consecutiveOffRoute >= routeConfig.consecutiveReadingsRequired) {
        const normalCandidateSegmentId = MIN_VEHICLES_FOR_DETOUR > 1
          ? recordNormalDetourCandidateObservation(
            buildNormalDetourCandidateObservation(
              state,
              routeId,
              routeConfig,
              shapes,
              routeShapeMapping,
              sampleTimeMs
            ),
            shapes,
            routeShapeMapping,
            stopImpactData?.scheduleIndex || null
          )
          : null;
        state.detourSegmentId = normalCandidateSegmentId || addVehicleToDetour(id, routeId, coordinate, sampleTimeMs, {
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
        timestampMs: sampleTimeMs,
      };
      recordRecurringShortDeviationObservation(
        buildRecurringShortDeviationObservation(
          state,
          routeId,
          routeConfig,
          shapes,
          routeShapeMapping,
          sampleTimeMs,
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
      let segment = routeState?.segments?.get(state.detourSegmentId) || null;
      let clearProjection = routeProjection;
      if (segment) {
        clearProjection = getProjectionForSegmentClear(
          routeId,
          coordinate,
          segment,
          routeProjection,
          shapes,
          routeShapeMapping,
          routeConfig
        ) || routeProjection;
      } else if (routeState) {
        const match = findBestMatchingSegmentForClear(
          routeState,
          routeId,
          coordinate,
          routeProjection,
          shapes,
          routeShapeMapping,
          routeConfig
        );
        segment = match?.segment || null;
        clearProjection = match?.projection || routeProjection;
      }
      if (segment && segment.isPublished) {
        if (!state.detourSegmentId) {
          state.detourSegmentId = segment.segmentId;
        }
        state.hasReturnedOnRouteSinceDetour = true;
        const shouldTrackOnRoute =
          isProjectionInClearWindow(clearProjection, segment, shapes) ||
          Boolean(state.onRouteStreakStart);
        if (shouldTrackOnRoute) {
          if (!state.onRouteStreakStart) {
            state.onRouteStreakStart = {
              coordinate,
              timestampMs: sampleTimeMs,
            };
          }
          updateOnRouteClearTraversal(state, clearProjection, sampleTimeMs);
          state.consecutiveOnRoute++;
          maybeRemoveVehicleFromDetour(
            id,
            routeId,
            segment.segmentId,
            now,
            state.onRouteStreakStart,
            state.tripShapeId,
            hasRegularRouteTraversalForClear(state, segment, clearProjection, shapes, routeConfig)
          );
        } else {
          state.consecutiveOnRoute = 0;
          resetOnRouteClearTraversal(state);
        }
      } else {
        state.detourSegmentId = null;
        state.consecutiveOnRoute = 0;
        resetOnRouteClearTraversal(state);
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
  reconcileActiveDetourVehicleMembership();

  promoteMatureRecurringFamilyCandidates(now, shapes, routeShapeMapping);
  tickClearPending(now);

  return getActiveDetours(shapes, routeShapeMapping, { stopImpactData });
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
  enrichDetourMapStopImpacts,
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
  hydrateActiveDetourSnapshots,
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
  DETOUR_CANDIDATE_EVIDENCE_TTL_MS,
  EVIDENCE_WINDOW_MS,
  DETOUR_VEHICLE_TRACE_WINDOW_MS,
  DETOUR_CANDIDATE_CONFIRMATION_WINDOW_MS,
  DETOUR_CANDIDATE_CONFIRMATION_HEADWAY_MULTIPLIER,
  DETOUR_CANDIDATE_CONFIRMATION_BUFFER_MS,
  DETOUR_CANDIDATE_CONFIRMATION_MAX_MS,
  DETOUR_PERSIST_CONSECUTIVE_MATCHES,
  DETOUR_PERSIST_MIN_AGE_MS,
  SERVICE_START_HOUR,
  SERVICE_END_HOUR,
  SERVICE_TIMEZONE,
};
