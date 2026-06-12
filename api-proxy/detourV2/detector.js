'use strict';

const {
  buildCumulativeDistances,
  enrichDetourMapStopImpacts,
} = require('../detourGeometry');
const { projectCoordinateToRoute, projectOntoPolyline } = require('../detour/projection');
const { haversineDistance, pointToPolylineDistance } = require('../geometry');
const {
  getRouteDetectorConfig,
  normalizeConfiguredDetourCorridor,
} = require('../detourRouteConfig');
const {
  makeEventId,
  buildInitialEventWindow,
  pointMatchesEventWindow,
  expandProvisionalEventWindow,
  freezeEventWindow,
  buildClearWindowForEvent,
  windowsOverlapOrNear,
} = require('./eventWindows');
const { applyRiderVisibilityGuard } = require('../detour/riderVisibilityGuard');

const DEFAULT_OFF_ROUTE_THRESHOLD_METERS = positiveNumber(
  process.env.DETOUR_OFF_ROUTE_THRESHOLD_METERS,
  40
);
const DEFAULT_ON_ROUTE_CLEAR_THRESHOLD_METERS = positiveNumber(
  process.env.DETOUR_ON_ROUTE_CLEAR_THRESHOLD_METERS,
  40
);
const MIN_OFF_ROUTE_POINTS = 3;
const MIN_UNIQUE_SIGNATURES = 2;
const MIN_SAFE_SPAN_METERS = 100;
const GEOMETRY_CLUSTER_GAP_METERS = positiveNumber(
  process.env.DETOUR_V2_GEOMETRY_CLUSTER_GAP_METERS,
  1000
);
const ALTERNATE_DETOUR_PATH_REPLACE_MIN_DISTANCE_METERS = positiveNumber(
  process.env.DETOUR_V2_ALTERNATE_PATH_REPLACE_MIN_DISTANCE_METERS,
  90
);
const ALTERNATE_DETOUR_PATH_REPLACE_MIN_FAR_POINTS = positiveInteger(
  process.env.DETOUR_V2_ALTERNATE_PATH_REPLACE_MIN_FAR_POINTS,
  2
);
const SPARSE_TRACE_MAX_TIME_GAP_MS = positiveNumber(
  process.env.DETOUR_V2_SPARSE_TRACE_MAX_TIME_GAP_MS,
  10 * 60 * 1000
);
const TRACE_REVERSAL_TOLERANCE_METERS = positiveNumber(
  process.env.DETOUR_V2_TRACE_REVERSAL_TOLERANCE_METERS,
  75
);
const LONG_CANDIDATE_MERGE_MIN_CORE_SPAN_METERS = positiveNumber(
  process.env.DETOUR_V2_LONG_CANDIDATE_MERGE_MIN_CORE_SPAN_METERS,
  500
);
const INFERRED_DETOUR_POINT_DEDUPE_METERS = positiveNumber(
  process.env.DETOUR_V2_INFERRED_POINT_DEDUPE_METERS,
  20
);
const MAX_INFERRED_DETOUR_POINT_GAP_METERS = positiveNumber(
  process.env.DETOUR_V2_MAX_INFERRED_POINT_GAP_METERS,
  1200
);
const MAX_INFERRED_DETOUR_AVERAGE_GAP_METERS = positiveNumber(
  process.env.DETOUR_V2_MAX_INFERRED_AVERAGE_GAP_METERS,
  900
);
const CONFIGURED_CORRIDOR_OUTLIER_DISTANCE_METERS = positiveNumber(
  process.env.DETOUR_V2_CONFIGURED_CORRIDOR_OUTLIER_DISTANCE_METERS,
  600
);
const MAX_INFERRED_DETOUR_POINTS = positiveInteger(
  process.env.DETOUR_V2_MAX_INFERRED_POINTS,
  16
);
const DEFAULT_CONFIGURED_CORRIDOR_PROGRESS_PADDING_METERS = positiveNumber(
  process.env.DETOUR_V2_CONFIGURED_CORRIDOR_PADDING_METERS ||
    process.env.DETOUR_V2_KNOWN_CORRIDOR_PADDING_METERS,
  150
);
const CLEAR_MIN_TRAVERSAL_RATIO = 0.6;
const CLEAR_MIN_TRAVERSAL_METERS = 100;
const CLEAR_WINDOW_MIN_METERS = positiveNumber(
  process.env.DETOUR_CLEAR_WINDOW_MIN_METERS,
  1000
);
const CLEAR_WINDOW_MIN_COVERAGE_RATIO = positiveNumber(
  process.env.DETOUR_CLEAR_WINDOW_MIN_COVERAGE_RATIO,
  0.75
);
const CLEAR_WINDOW_MAX_PROGRESS_GAP_METERS = positiveNumber(
  process.env.DETOUR_CLEAR_WINDOW_MAX_PROGRESS_GAP_METERS,
  700
);
const TINY_DETOUR_SOURCE_SPAN_METERS = positiveNumber(
  process.env.DETOUR_TINY_CLEAR_SOURCE_SPAN_METERS,
  250
);
const TINY_DETOUR_SOURCE_PADDING_METERS = positiveNumber(
  process.env.DETOUR_TINY_CLEAR_SOURCE_PADDING_METERS,
  75
);
const MARGINAL_OFF_ROUTE_RESET_GRACE_METERS = positiveNumber(
  process.env.DETOUR_CLEAR_RESET_OFF_ROUTE_GRACE_METERS,
  15
);
const OBSOLETE_SHAPE_GLOBAL_CLEAR_GRACE_MS = positiveNumber(
  process.env.DETOUR_OBSOLETE_SHAPE_GLOBAL_CLEAR_GRACE_MS,
  45 * 60 * 1000
);
const CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE = positiveInteger(
  process.env.DETOUR_V2_CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE,
  20
);
const ROUTE_400_STALE_SPARSE_EVIDENCE_MAX_AGE_MS = positiveNumber(
  process.env.DETOUR_ROUTE_400_STALE_SPARSE_EVIDENCE_MAX_AGE_MS,
  24 * 60 * 60 * 1000
);
const ROUTE_400_STALE_SPARSE_MAX_UNIQUE_SIGNATURES = positiveInteger(
  process.env.DETOUR_ROUTE_400_STALE_SPARSE_MAX_UNIQUE_SIGNATURES,
  2
);
const ROUTE_400_STALE_SPARSE_MIN_EVIDENCE_POINTS = positiveInteger(
  process.env.DETOUR_ROUTE_400_STALE_SPARSE_MIN_EVIDENCE_POINTS,
  6
);
const ROUTE_400_STALE_SPARSE_MAX_POINT_GAP_METERS = positiveNumber(
  process.env.DETOUR_ROUTE_400_STALE_SPARSE_MAX_POINT_GAP_METERS,
  400
);

function positiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toMillis(value, fallback = Date.now()) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getVehicleSampleTimeMs(vehicle) {
  if (vehicle?.timestampMs != null) {
    const value = Number(vehicle.timestampMs);
    return Number.isFinite(value) ? value : Date.now();
  }
  return toMillis(vehicle?.timestamp, Date.now());
}

function normalizeCoordinate(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizeRouteId(routeId) {
  return String(routeId || '').trim();
}

function evidenceSignature(vehicle = {}) {
  return String(vehicle.tripId || vehicle.id || vehicle.vehicleId || '').trim();
}

function vehicleId(vehicle = {}) {
  return String(vehicle.id || vehicle.vehicleId || vehicle.tripId || '').trim();
}

function sampleKey(vehicle, coordinate, timestampMs) {
  return [
    vehicleId(vehicle),
    evidenceSignature(vehicle),
    normalizeRouteId(vehicle.routeId),
    timestampMs,
    coordinate.latitude.toFixed(6),
    coordinate.longitude.toFixed(6),
  ].join('|');
}

function getPointAtProgress(polyline, cumulative, progressMeters) {
  if (!Array.isArray(polyline) || polyline.length === 0) return null;
  if (progressMeters <= 0) return polyline[0];
  const total = cumulative[cumulative.length - 1] || 0;
  if (progressMeters >= total) return polyline[polyline.length - 1];

  for (let index = 1; index < cumulative.length; index += 1) {
    if (cumulative[index] < progressMeters) continue;
    const prev = polyline[index - 1];
    const next = polyline[index];
    const segmentStart = cumulative[index - 1];
    const segmentLength = cumulative[index] - segmentStart;
    const ratio = segmentLength > 0 ? (progressMeters - segmentStart) / segmentLength : 0;
    return {
      latitude: prev.latitude + (next.latitude - prev.latitude) * ratio,
      longitude: prev.longitude + (next.longitude - prev.longitude) * ratio,
    };
  }

  return polyline[polyline.length - 1];
}

function getShapeSpan(polyline, startProgress, endProgress) {
  const cumulative = buildCumulativeDistances(polyline);
  const start = getPointAtProgress(polyline, cumulative, startProgress);
  const end = getPointAtProgress(polyline, cumulative, endProgress);
  if (!start || !end) return [];

  const points = [start];
  for (let index = 1; index < polyline.length - 1; index += 1) {
    if (cumulative[index] > startProgress && cumulative[index] < endProgress) {
      points.push(polyline[index]);
    }
  }
  points.push(end);
  return points;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getPolylineLengthMeters(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) return null;
  const cumulative = buildCumulativeDistances(polyline);
  const length = cumulative[cumulative.length - 1];
  return Number.isFinite(length) && length > 0 ? length : null;
}

function getShapeLengthMeters(shapes, shapeId) {
  if (!shapeId || !shapes?.get) return null;
  return getPolylineLengthMeters(shapes.get(shapeId));
}

function buildClearWindow(detourZone = {}, shapeLengthMeters = null) {
  const start = Number(detourZone.startProgressMeters);
  const end = Number(detourZone.endProgressMeters);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const normalizedStart = Math.min(start, end);
  const normalizedEnd = Math.max(start, end);
  const span = normalizedEnd - normalizedStart;
  if (!Number.isFinite(span) || span < 0) return null;

  const shapeLength = Number(shapeLengthMeters);
  const hasShapeLength = Number.isFinite(shapeLength) && shapeLength > 0;
  const targetSpan = hasShapeLength
    ? Math.min(Math.max(CLEAR_WINDOW_MIN_METERS, span), shapeLength)
    : Math.max(CLEAR_WINDOW_MIN_METERS, span);
  const padding = Math.max(0, (targetSpan - span) / 2);
  let windowStart = normalizedStart - padding;
  let windowEnd = normalizedEnd + padding;

  if (hasShapeLength) {
    if (windowStart < 0) {
      windowEnd = Math.min(shapeLength, windowEnd - windowStart);
      windowStart = 0;
    }
    if (windowEnd > shapeLength) {
      const overflow = windowEnd - shapeLength;
      windowStart = Math.max(0, windowStart - overflow);
      windowEnd = shapeLength;
    }
  } else {
    windowStart = Math.max(0, windowStart);
  }

  const windowSpan = windowEnd - windowStart;
  if (!Number.isFinite(windowSpan) || windowSpan <= 0) return null;

  return {
    startProgressMeters: windowStart,
    endProgressMeters: windowEnd,
    sourceStartProgressMeters: normalizedStart,
    sourceEndProgressMeters: normalizedEnd,
    minCoverageRatio: CLEAR_WINDOW_MIN_COVERAGE_RATIO,
    shapeId: detourZone.shapeId || null,
  };
}

function normalizeClearTrackSample(sample = {}) {
  const progressMeters = Number(sample.progressMeters);
  const timestampMs = Number(sample.timestampMs);
  if (!Number.isFinite(progressMeters) || !Number.isFinite(timestampMs)) return null;
  return {
    progressMeters,
    timestampMs,
    shapeId: sample.shapeId ? String(sample.shapeId) : null,
    vehicleId: sample.vehicleId ? String(sample.vehicleId) : null,
    signature: sample.signature ? String(sample.signature) : null,
  };
}

function getWindowBounds(window = {}) {
  const start = Number(window.startProgressMeters);
  const end = Number(window.endProgressMeters);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function progressInWindow(progressMeters, window = {}) {
  const bounds = getWindowBounds(window);
  const progress = Number(progressMeters);
  return Boolean(
    bounds &&
    Number.isFinite(progress) &&
    progress >= bounds.start &&
    progress <= bounds.end
  );
}

function pointMatchesProgressWindow(point = {}, window = {}, fallbackShapeId = null) {
  if (!point || !window) return false;
  const windowShapeId = window.shapeId ? String(window.shapeId) : null;
  const pointShapeId = point.shapeId ? String(point.shapeId) : (fallbackShapeId ? String(fallbackShapeId) : null);
  if (windowShapeId && pointShapeId && windowShapeId !== pointShapeId) return false;
  return progressInWindow(point.progressMeters, window);
}

function getClearWindowCoreBounds(clearWindow = {}) {
  const sourceStart = Number(clearWindow.sourceStartProgressMeters);
  const sourceEnd = Number(clearWindow.sourceEndProgressMeters);
  if (Number.isFinite(sourceStart) && Number.isFinite(sourceEnd) && sourceStart !== sourceEnd) {
    return {
      start: Math.min(sourceStart, sourceEnd),
      end: Math.max(sourceStart, sourceEnd),
    };
  }
  return getWindowBounds(clearWindow);
}

function getClearWindowMinCoverageRatio(clearWindow = {}) {
  const stored = Number(clearWindow.minCoverageRatio);
  if (!Number.isFinite(stored) || stored <= 0) {
    return CLEAR_WINDOW_MIN_COVERAGE_RATIO;
  }
  return Math.min(stored, CLEAR_WINDOW_MIN_COVERAGE_RATIO);
}

function isTinyRouteEdgeClearWindow(clearWindow = {}) {
  const sourceBounds = getClearWindowCoreBounds(clearWindow);
  if (!sourceBounds) return false;
  const sourceSpan = sourceBounds.end - sourceBounds.start;
  if (
    !Number.isFinite(sourceSpan) ||
    sourceSpan <= 0 ||
    sourceSpan > TINY_DETOUR_SOURCE_SPAN_METERS
  ) {
    return false;
  }

  const windowBounds = getWindowBounds(clearWindow);
  if (!windowBounds) return false;
  const nearRouteStart = sourceBounds.start - windowBounds.start <= TINY_DETOUR_SOURCE_PADDING_METERS;
  const nearRouteEnd = windowBounds.end - sourceBounds.end <= TINY_DETOUR_SOURCE_PADDING_METERS;
  return nearRouteStart || nearRouteEnd;
}

function getTinyRouteEdgeClearDirection(clearWindow = {}) {
  if (!isTinyRouteEdgeClearWindow(clearWindow)) return null;
  const sourceBounds = getClearWindowCoreBounds(clearWindow);
  const windowBounds = getWindowBounds(clearWindow);
  if (!sourceBounds || !windowBounds) return null;
  if (sourceBounds.start - windowBounds.start <= TINY_DETOUR_SOURCE_PADDING_METERS) return 'start';
  if (windowBounds.end - sourceBounds.end <= TINY_DETOUR_SOURCE_PADDING_METERS) return 'end';
  return null;
}

function sampleMatchesTinyClearSource(clearWindow = {}, sample = {}) {
  if (!isTinyRouteEdgeClearWindow(clearWindow)) return false;
  const sourceBounds = getClearWindowCoreBounds(clearWindow);
  const progress = Number(sample?.progressMeters);
  if (!sourceBounds || !Number.isFinite(progress)) return false;
  const windowShapeId = clearWindow.shapeId ? String(clearWindow.shapeId) : null;
  const sampleShapeId = sample.shapeId ? String(sample.shapeId) : null;
  if (windowShapeId && sampleShapeId && windowShapeId !== sampleShapeId) return false;
  return (
    progress >= sourceBounds.start - TINY_DETOUR_SOURCE_PADDING_METERS &&
    progress <= sourceBounds.end + TINY_DETOUR_SOURCE_PADDING_METERS
  );
}

function sampleMatchesTinyRouteEdgeDownstreamClear(clearWindow = {}, sample = {}) {
  const direction = getTinyRouteEdgeClearDirection(clearWindow);
  const sourceBounds = getClearWindowCoreBounds(clearWindow);
  const progress = Number(sample?.progressMeters);
  if (!direction || !sourceBounds || !Number.isFinite(progress)) return false;
  const windowShapeId = clearWindow.shapeId ? String(clearWindow.shapeId) : null;
  const sampleShapeId = sample.shapeId ? String(sample.shapeId) : null;
  if (windowShapeId && sampleShapeId && windowShapeId !== sampleShapeId) return false;
  if (!progressInWindow(progress, clearWindow)) return false;
  if (direction === 'start') {
    return progress >= sourceBounds.end + TINY_DETOUR_SOURCE_PADDING_METERS;
  }
  return progress <= sourceBounds.start - TINY_DETOUR_SOURCE_PADDING_METERS;
}

function sampleMatchesClearWindowCore(clearWindow, sample) {
  const coreBounds = getClearWindowCoreBounds(clearWindow);
  const progress = Number(sample?.progressMeters);
  return Boolean(
    coreBounds &&
    Number.isFinite(progress) &&
    progress >= coreBounds.start &&
    progress <= coreBounds.end
  );
}

function getMaxProgressGapMeters(clearWindow, samples) {
  const bounds = getWindowBounds(clearWindow);
  if (!bounds || !Array.isArray(samples) || samples.length === 0) return Infinity;
  const progresses = samples
    .map((sample) => Number(sample?.progressMeters))
    .filter(Number.isFinite)
    .map((progress) => Math.max(bounds.start, Math.min(bounds.end, progress)))
    .sort((a, b) => a - b);
  if (progresses.length === 0) return Infinity;

  const points = [bounds.start, ...progresses, bounds.end];
  let maxGap = 0;
  for (let index = 1; index < points.length; index += 1) {
    maxGap = Math.max(maxGap, points[index] - points[index - 1]);
  }
  return maxGap;
}

function getWindowOverlapMeters(a = {}, b = {}) {
  const first = getWindowBounds(a);
  const second = getWindowBounds(b);
  if (!first || !second) return 0;
  return Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start));
}

function getWindowSpanMeters(window = {}) {
  const bounds = getWindowBounds(window);
  return bounds ? Math.max(0, bounds.end - bounds.start) : 0;
}

function windowsDescribeSameSegment(a = {}, b = {}) {
  const overlap = getWindowOverlapMeters(a, b);
  if (overlap <= 0) return false;
  const smallerSpan = Math.min(getWindowSpanMeters(a), getWindowSpanMeters(b));
  return smallerSpan > 0 && overlap / smallerSpan >= 0.5;
}

function makeSegmentId(shapeId, startProgress, endProgress) {
  const start = Number.isFinite(Number(startProgress)) ? Math.round(Number(startProgress)) : 'x';
  const end = Number.isFinite(Number(endProgress)) ? Math.round(Number(endProgress)) : 'x';
  return `${shapeId || 'shape'}:${start}-${end}`;
}

function coordinateDistanceMeters(a, b) {
  if (!a || !b) return Infinity;
  return haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
}

function getPointStats(points = []) {
  const progressValues = points
    .map((point) => Number(point.progressMeters))
    .filter(Number.isFinite);
  const minProgressMeters = progressValues.length > 0 ? Math.min(...progressValues) : Infinity;
  const maxProgressMeters = progressValues.length > 0 ? Math.max(...progressValues) : -Infinity;
  const timestamps = points
    .map((point) => Number(point.timestampMs))
    .filter(Number.isFinite);

  return {
    points,
    pointCount: points.length,
    signatureCount: new Set(points.map((point) => point.signature).filter(Boolean)).size,
    minProgressMeters,
    maxProgressMeters,
    spanMeters: maxProgressMeters - minProgressMeters,
    lastEvidenceAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

function splitPointsByProgress(points = []) {
  const sorted = points
    .filter((point) => point?.coordinate && Number.isFinite(point.progressMeters))
    .sort((a, b) => {
      if (a.progressMeters !== b.progressMeters) return a.progressMeters - b.progressMeters;
      return (a.timestampMs || 0) - (b.timestampMs || 0);
    });
  const clusters = [];
  let current = [];

  for (const point of sorted) {
    const previous = current[current.length - 1];
    if (
      previous &&
      point.progressMeters - previous.progressMeters > GEOMETRY_CLUSTER_GAP_METERS
    ) {
      clusters.push(current);
      current = [];
    }
    current.push(point);
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

function hasSparseForwardTraceBridge(points = []) {
  const tracksBySignature = new Map();
  for (const point of points) {
    if (!point?.signature || !Number.isFinite(point.progressMeters)) continue;
    const track = tracksBySignature.get(point.signature) || [];
    track.push(point);
    tracksBySignature.set(point.signature, track);
  }

  for (const track of tracksBySignature.values()) {
    const sorted = track
      .filter((point) => Number.isFinite(point.progressMeters))
      .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));
    if (sorted.length < 2) continue;

    let runStart = sorted[0];
    let previous = sorted[0];
    for (let index = 1; index < sorted.length; index += 1) {
      const point = sorted[index];
      const timestampGap = Number(point.timestampMs || 0) - Number(previous.timestampMs || 0);
      const progressDelta = point.progressMeters - previous.progressMeters;
      if (
        timestampGap > SPARSE_TRACE_MAX_TIME_GAP_MS ||
        progressDelta < -TRACE_REVERSAL_TOLERANCE_METERS
      ) {
        runStart = point;
        previous = point;
        continue;
      }

      if (point.progressMeters - runStart.progressMeters > GEOMETRY_CLUSTER_GAP_METERS) {
        return true;
      }
      previous = point;
    }
  }

  return false;
}

function isPublishableGeometryStats(stats) {
  return stats.pointCount >= MIN_OFF_ROUTE_POINTS &&
    stats.signatureCount >= MIN_UNIQUE_SIGNATURES &&
    stats.spanMeters >= MIN_SAFE_SPAN_METERS;
}

function getRouteKeyedConfigValue(values, routeId) {
  if (!values || typeof values !== 'object') return null;
  const normalizedRouteId = normalizeRouteId(routeId);
  return values[normalizedRouteId] ||
    values[normalizedRouteId.toUpperCase()] ||
    values[normalizedRouteId.toLowerCase()] ||
    null;
}

function isConfiguredCorridorActive(corridor, nowMs = Date.now()) {
  if (!corridor || corridor.enabled === false) return false;
  if (Number.isFinite(corridor.startsAt) && nowMs < corridor.startsAt) return false;
  if (Number.isFinite(corridor.expiresAt) && nowMs > corridor.expiresAt) return false;
  return true;
}

function resolveConfiguredDetourCorridor(routeId, detectorConfig = {}) {
  const directConfig = getRouteKeyedConfigValue(
    detectorConfig.configuredDetourCorridors || detectorConfig.detourCorridors,
    routeId
  );
  const routeConfig = getRouteDetectorConfig(routeId, {});
  const corridor = normalizeConfiguredDetourCorridor(
    directConfig ||
    detectorConfig.configuredDetourCorridor ||
    routeConfig.configuredDetourCorridor ||
    routeConfig.detourCorridor
  );

  return isConfiguredCorridorActive(corridor) ? corridor : null;
}

function buildDirectionalShapeSpan(polyline, startProgress, endProgress, direction, entryPoint, exitPoint) {
  const shapeSpan = getShapeSpan(
    polyline,
    Math.min(startProgress, endProgress),
    Math.max(startProgress, endProgress)
  );
  if (direction < 0) shapeSpan.reverse();
  if (shapeSpan.length >= 2) {
    shapeSpan[0] = cloneJson(entryPoint);
    shapeSpan[shapeSpan.length - 1] = cloneJson(exitPoint);
  }
  return shapeSpan;
}

function selectConfiguredCorridorEvidence(candidate, polyline, corridor) {
  if (!corridor || !Array.isArray(polyline) || polyline.length < 2) return null;

  const entryProjection = projectOntoPolyline(corridor.entryPoint, polyline);
  const exitProjection = projectOntoPolyline(corridor.exitPoint, polyline);
  if (
    !Number.isFinite(entryProjection?.progressMeters) ||
    !Number.isFinite(exitProjection?.progressMeters)
  ) {
    return null;
  }

  const startProgress = Math.min(entryProjection.progressMeters, exitProjection.progressMeters);
  const endProgress = Math.max(entryProjection.progressMeters, exitProjection.progressMeters);
  const spanMeters = endProgress - startProgress;
  const paddingMeters = Number.isFinite(corridor.paddingMeters)
    ? corridor.paddingMeters
    : DEFAULT_CONFIGURED_CORRIDOR_PROGRESS_PADDING_METERS;
  const points = (candidate.points || []).filter((point) => (
    Number.isFinite(point?.progressMeters) &&
    point.progressMeters >= startProgress - paddingMeters &&
    point.progressMeters <= endProgress + paddingMeters
  ));
  const stats = getPointStats(points);
  if (
    stats.pointCount < MIN_OFF_ROUTE_POINTS ||
    stats.signatureCount < MIN_UNIQUE_SIGNATURES ||
    spanMeters < MIN_SAFE_SPAN_METERS
  ) {
    return null;
  }

  const direction = entryProjection.progressMeters <= exitProjection.progressMeters ? 1 : -1;
  return {
    ...stats,
    minProgressMeters: startProgress,
    maxProgressMeters: endProgress,
    spanMeters,
    entryPoint: cloneJson(corridor.entryPoint),
    exitPoint: cloneJson(corridor.exitPoint),
    skippedSegmentPolyline: buildDirectionalShapeSpan(
      polyline,
      entryProjection.progressMeters,
      exitProjection.progressMeters,
      direction,
      corridor.entryPoint,
      corridor.exitPoint
    ),
    progressSortDirection: direction,
    gpsSupersedesPreviousPath: true,
    configuredCorridorLabel: corridor.label || null,
    configuredCorridor: true,
  };
}

function compareGeometryStatsByQuality(a, b) {
  if ((b.lastEvidenceAt || 0) !== (a.lastEvidenceAt || 0)) {
    return (b.lastEvidenceAt || 0) - (a.lastEvidenceAt || 0);
  }
  if (b.signatureCount !== a.signatureCount) return b.signatureCount - a.signatureCount;
  if (b.pointCount !== a.pointCount) return b.pointCount - a.pointCount;
  return b.spanMeters - a.spanMeters;
}

function selectGeometryEvidenceSegments(candidate, polyline, detectorConfig) {
  const configuredCorridorStats = selectConfiguredCorridorEvidence(
    candidate,
    polyline,
    resolveConfiguredDetourCorridor(candidate.routeId, detectorConfig)
  );
  if (configuredCorridorStats) return [configuredCorridorStats];

  const allStats = getPointStats(candidate.points || []);
  const clusterStats = splitPointsByProgress(candidate.points || [])
    .map(getPointStats);
  const validClusters = clusterStats
    .filter(isPublishableGeometryStats)
    .sort((a, b) => a.minProgressMeters - b.minProgressMeters);

  if (validClusters.length > 0) return validClusters;

  if (clusterStats.length > 1) {
    if (
      isPublishableGeometryStats(allStats) &&
      hasSparseForwardTraceBridge(candidate.points || [])
    ) {
      return [{
        ...allStats,
        sparseForwardTraceBridge: true,
      }];
    }
    return [clusterStats.sort(compareGeometryStatsByQuality)[0]];
  }

  return [allStats];
}

function selectGeometryEvidence(candidate, polyline, detectorConfig) {
  return selectGeometryEvidenceSegments(candidate, polyline, detectorConfig)[0];
}

function thinPolyline(polyline, maxPoints = MAX_INFERRED_DETOUR_POINTS) {
  if (!Array.isArray(polyline) || polyline.length <= maxPoints) return polyline;
  const result = [];
  const lastIndex = polyline.length - 1;

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index * lastIndex) / (maxPoints - 1));
    const point = polyline[sourceIndex];
    const previous = result[result.length - 1];
    if (!previous || coordinateDistanceMeters(previous, point) > 0) {
      result.push(point);
    }
  }

  return result;
}

function buildInferredDetourPolyline(points = [], progressSortDirection = 1) {
  const sorted = points
    .filter((point) => point?.coordinate && Number.isFinite(point.progressMeters))
    .sort((a, b) => {
      if (a.progressMeters !== b.progressMeters) {
        return (a.progressMeters - b.progressMeters) * progressSortDirection;
      }
      return (a.timestampMs || 0) - (b.timestampMs || 0);
    });
  const deduped = [];

  for (const point of sorted) {
    const coordinate = cloneJson(point.coordinate);
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      coordinateDistanceMeters(previous, coordinate) <= INFERRED_DETOUR_POINT_DEDUPE_METERS
    ) {
      continue;
    }
    deduped.push(coordinate);
  }

  return thinPolyline(deduped);
}

function removeConfiguredCorridorOutliers(polyline, geometryEvidence = {}) {
  if (
    geometryEvidence.configuredCorridor !== true ||
    !geometryEvidence.entryPoint ||
    !geometryEvidence.exitPoint ||
    !Array.isArray(polyline) ||
    polyline.length < 3
  ) {
    return polyline;
  }

  const corridorLine = [geometryEvidence.entryPoint, geometryEvidence.exitPoint];
  const filtered = polyline.filter((point, index) => (
    index === 0 ||
    index === polyline.length - 1 ||
    pointToPolylineDistance(point, corridorLine) <= CONFIGURED_CORRIDOR_OUTLIER_DISTANCE_METERS
  ));

  return filtered.length >= 2 ? filtered : polyline;
}

function getPolylineGapStats(polyline = []) {
  if (!Array.isArray(polyline) || polyline.length < 2) {
    return {
      maxGapMeters: Infinity,
      averageGapMeters: Infinity,
    };
  }

  const gaps = [];
  for (let index = 1; index < polyline.length; index += 1) {
    gaps.push(coordinateDistanceMeters(polyline[index - 1], polyline[index]));
  }

  const totalGapMeters = gaps.reduce((sum, gap) => sum + gap, 0);
  return {
    maxGapMeters: Math.max(...gaps),
    averageGapMeters: totalGapMeters / gaps.length,
  };
}

function getInferredDetourPathSafety(polyline = []) {
  if (!Array.isArray(polyline) || polyline.length < MIN_OFF_ROUTE_POINTS) {
    return {
      safe: false,
      reason: 'insufficient-inferred-points',
      maxGapMeters: Infinity,
      averageGapMeters: Infinity,
    };
  }

  const stats = getPolylineGapStats(polyline);
  const safe = (
    stats.maxGapMeters <= MAX_INFERRED_DETOUR_POINT_GAP_METERS &&
    stats.averageGapMeters <= MAX_INFERRED_DETOUR_AVERAGE_GAP_METERS
  );
  return {
    safe,
    reason: safe ? null : 'jumpy-inferred-path',
    ...stats,
  };
}

function makeCandidate(routeId, shapeId) {
  return {
    routeId,
    shapeId,
    points: [],
    signatures: new Set(),
    vehicleIds: new Set(),
    minProgressMeters: Infinity,
    maxProgressMeters: -Infinity,
    firstSeenAt: null,
    lastSeenAt: null,
    triggerVehicleId: null,
  };
}

function addPointToCandidate(candidate, point) {
  candidate.points.push(point);
  candidate.signatures.add(point.signature);
  candidate.vehicleIds.add(point.vehicleId);
  candidate.minProgressMeters = Math.min(candidate.minProgressMeters, point.progressMeters);
  candidate.maxProgressMeters = Math.max(candidate.maxProgressMeters, point.progressMeters);
  candidate.firstSeenAt = candidate.firstSeenAt == null
    ? point.timestampMs
    : Math.min(candidate.firstSeenAt, point.timestampMs);
  candidate.lastSeenAt = Math.max(candidate.lastSeenAt || 0, point.timestampMs);
  candidate.triggerVehicleId = candidate.triggerVehicleId || point.vehicleId;
}

function hasEnoughEvidence(candidate) {
  return candidate.points.length >= MIN_OFF_ROUTE_POINTS &&
    candidate.signatures.size >= MIN_UNIQUE_SIGNATURES;
}

function getEventWindowCoreBounds(eventWindow = {}) {
  const start = Number(eventWindow.coreStartProgressMeters);
  const end = Number(eventWindow.coreEndProgressMeters);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function isTinyRouteEdgeEventWindow(eventWindow = {}, shapeLengthMeters = null) {
  const bounds = getEventWindowCoreBounds(eventWindow);
  if (!bounds) return false;
  const span = bounds.end - bounds.start;
  if (!Number.isFinite(span) || span <= 0 || span > TINY_DETOUR_SOURCE_SPAN_METERS) {
    return false;
  }
  const nearRouteStart = bounds.start <= TINY_DETOUR_SOURCE_PADDING_METERS;
  const shapeLength = Number(shapeLengthMeters);
  const nearRouteEnd = Number.isFinite(shapeLength) &&
    shapeLength - bounds.end <= TINY_DETOUR_SOURCE_PADDING_METERS;
  return nearRouteStart || nearRouteEnd;
}

function hasStrongOffRoutePoint(candidate, offRouteThresholdMeters = DEFAULT_OFF_ROUTE_THRESHOLD_METERS) {
  const strongThreshold = offRouteThresholdMeters + MARGINAL_OFF_ROUTE_RESET_GRACE_METERS;
  return (candidate?.points || []).some((point) => {
    const distanceMeters = Number(point?.distanceMeters);
    return Number.isFinite(distanceMeters) && distanceMeters > strongThreshold;
  });
}

function hasEnoughConfirmingEvidence(candidate, {
  offRouteThresholdMeters = DEFAULT_OFF_ROUTE_THRESHOLD_METERS,
  shapeLengthMeters = null,
} = {}) {
  if (!hasEnoughEvidence(candidate)) return false;
  if (
    isTinyRouteEdgeEventWindow(candidate?.eventWindow, shapeLengthMeters) &&
    !hasStrongOffRoutePoint(candidate, offRouteThresholdMeters)
  ) {
    return false;
  }
  return true;
}

function getEvidenceConfidence(evidence = {}) {
  return evidence.signatureCount >= 3 || evidence.pointCount >= 5 ? 'high' : 'medium';
}

function buildGeometrySegment(candidate, polyline, geometryEvidence, shapeLengthMeters = null) {
  const startProgress = geometryEvidence.minProgressMeters;
  const endProgress = geometryEvidence.maxProgressMeters;
  const hasSafeProgress =
    Number.isFinite(startProgress) &&
    Number.isFinite(endProgress) &&
    endProgress >= startProgress;
  const spanMeters = hasSafeProgress ? endProgress - startProgress : 0;
  const skippedSegmentPolyline = geometryEvidence.skippedSegmentPolyline || (
    hasSafeProgress && Array.isArray(polyline) && polyline.length >= 2
      ? getShapeSpan(polyline, startProgress, endProgress)
      : []
  );
  let inferredDetourPolyline = buildInferredDetourPolyline(
    geometryEvidence.points,
    geometryEvidence.progressSortDirection || 1
  );
  const entryPoint = geometryEvidence.entryPoint || skippedSegmentPolyline[0] || null;
  const exitPoint = geometryEvidence.exitPoint ||
    skippedSegmentPolyline[skippedSegmentPolyline.length - 1] ||
    null;
  if (
    geometryEvidence.entryPoint &&
    geometryEvidence.exitPoint &&
    inferredDetourPolyline.length >= 2
  ) {
    inferredDetourPolyline[0] = cloneJson(geometryEvidence.entryPoint);
    inferredDetourPolyline[inferredDetourPolyline.length - 1] = cloneJson(geometryEvidence.exitPoint);
  }
  inferredDetourPolyline = removeConfiguredCorridorOutliers(inferredDetourPolyline, geometryEvidence);
  if (
    geometryEvidence.entryPoint &&
    geometryEvidence.exitPoint &&
    inferredDetourPolyline.length >= 2
  ) {
    inferredDetourPolyline[0] = cloneJson(geometryEvidence.entryPoint);
    inferredDetourPolyline[inferredDetourPolyline.length - 1] = cloneJson(geometryEvidence.exitPoint);
  }
  const evidencePointCount = geometryEvidence.pointCount || candidate.points.length;
  const lastEvidenceAt = geometryEvidence.lastEvidenceAt || candidate.lastSeenAt;
  const inferredDetourPathSafety = getInferredDetourPathSafety(inferredDetourPolyline);
  const hasSafeInferredDetourPath = inferredDetourPathSafety.safe;
  const canShowDetourPath =
    spanMeters >= MIN_SAFE_SPAN_METERS &&
    skippedSegmentPolyline.length >= 2 &&
    hasSafeInferredDetourPath &&
    Boolean(entryPoint && exitPoint);
  const confidence = getEvidenceConfidence(geometryEvidence);
  const detourZone = {
    startProgressMeters: Number.isFinite(startProgress) ? startProgress : null,
    endProgressMeters: Number.isFinite(endProgress) ? endProgress : null,
    shapeId: candidate.shapeId,
  };

  return {
    segmentId: makeSegmentId(candidate.shapeId, startProgress, endProgress),
    shapeId: candidate.shapeId,
    state: 'active',
    skippedSegmentPolyline: canShowDetourPath ? skippedSegmentPolyline : null,
    inferredDetourPolyline: canShowDetourPath ? inferredDetourPolyline : null,
    likelyDetourPolyline: null,
    canShowDetourPath,
    entryPoint,
    exitPoint,
    confidence,
    evidencePointCount,
    lastEvidenceAt,
    startProgressMeters: Number.isFinite(startProgress) ? startProgress : null,
    endProgressMeters: Number.isFinite(endProgress) ? endProgress : null,
    detourZone,
    clearWindow: buildClearWindow(detourZone, shapeLengthMeters),
    gpsSupersedesPreviousPath: geometryEvidence.gpsSupersedesPreviousPath === true,
    configuredCorridorLabel: geometryEvidence.configuredCorridorLabel || null,
    geometryTrustBlockedReason: canShowDetourPath ? null : inferredDetourPathSafety.reason,
    inferredDetourPathStats: {
      maxGapMeters: Number.isFinite(inferredDetourPathSafety.maxGapMeters) ? inferredDetourPathSafety.maxGapMeters : null,
      averageGapMeters: Number.isFinite(inferredDetourPathSafety.averageGapMeters) ? inferredDetourPathSafety.averageGapMeters : null,
    },
  };
}

function buildGeometry(candidate, shapes, detectorConfig = {}) {
  const polyline = shapes.get(candidate.shapeId);
  const shapeLengthMeters = getPolylineLengthMeters(polyline);
  const evidenceSegments = selectGeometryEvidenceSegments(candidate, polyline, detectorConfig);
  const segments = evidenceSegments.map((geometryEvidence) => (
    buildGeometrySegment(candidate, polyline, geometryEvidence, shapeLengthMeters)
  ));
  const primarySegment = segments.find((segment) => segment.canShowDetourPath === true) ||
    segments[0] ||
    null;
  const canShowDetourPath = segments.some((segment) => segment.canShowDetourPath === true);
  const evidencePointCount = segments.reduce(
    (sum, segment) => sum + (Number(segment.evidencePointCount) || 0),
    0
  );
  const lastEvidenceAt = segments
    .map((segment) => Number(segment.lastEvidenceAt))
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), candidate.lastSeenAt || null);

  return {
    shapeId: primarySegment?.shapeId || candidate.shapeId,
    skippedSegmentPolyline: primarySegment?.skippedSegmentPolyline || null,
    inferredDetourPolyline: primarySegment?.inferredDetourPolyline || null,
    likelyDetourPolyline: null,
    canShowDetourPath,
    entryPoint: primarySegment?.entryPoint || null,
    exitPoint: primarySegment?.exitPoint || null,
    confidence: candidate.signatures.size >= 3 || candidate.points.length >= 5 ? 'high' : 'medium',
    evidencePointCount,
    lastEvidenceAt,
    startProgressMeters: primarySegment?.startProgressMeters ?? null,
    endProgressMeters: primarySegment?.endProgressMeters ?? null,
    gpsSupersedesPreviousPath: segments.some((segment) => segment.gpsSupersedesPreviousPath === true),
    configuredCorridorLabel: primarySegment?.configuredCorridorLabel || null,
    geometryTrustBlockedReason: canShowDetourPath ? null : (primarySegment?.geometryTrustBlockedReason || null),
    inferredDetourPathStats: primarySegment?.inferredDetourPathStats || {
      maxGapMeters: null,
      averageGapMeters: null,
    },
    segments,
  };
}

function normalizePolyline(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeCoordinate).filter(Boolean);
}

function addDetourPathPolyline(polylines, value) {
  const polyline = normalizePolyline(value);
  if (polyline.length >= 2) polylines.push(polyline);
}

function getGeometryDetourPathPolylines(geometry = {}) {
  if (!geometry || typeof geometry !== 'object') return [];
  const polylines = [];
  addDetourPathPolyline(polylines, geometry.likelyDetourPolyline);
  if (geometry.canShowDetourPath === true) {
    addDetourPathPolyline(polylines, geometry.inferredDetourPolyline);
  }
  for (const segment of Array.isArray(geometry.segments) ? geometry.segments : []) {
    addDetourPathPolyline(polylines, segment?.likelyDetourPolyline);
    if (segment?.canShowDetourPath === true) {
      addDetourPathPolyline(polylines, segment?.inferredDetourPolyline);
    }
  }
  return polylines;
}

function getGeometryEvidencePoints(geometry = {}) {
  const points = [];
  if (geometry?.canShowDetourPath === true) {
    points.push(...normalizePolyline(geometry.inferredDetourPolyline));
  }
  for (const segment of Array.isArray(geometry?.segments) ? geometry.segments : []) {
    if (segment?.canShowDetourPath === true) {
      points.push(...normalizePolyline(segment.inferredDetourPolyline));
    }
  }
  return points;
}

function getMinDistanceToPolylines(point, polylines = []) {
  let bestDistance = Infinity;
  for (const polyline of polylines) {
    const distance = pointToPolylineDistance(point, polyline);
    if (Number.isFinite(distance)) {
      bestDistance = Math.min(bestDistance, distance);
    }
  }
  return bestDistance;
}

function geometryDivergesFromPreviousPath(geometry, previousDetour) {
  if (geometry?.canShowDetourPath !== true) return false;
  const previousPaths = getGeometryDetourPathPolylines(previousDetour?.geometry);
  if (previousPaths.length === 0) return false;

  const points = getGeometryEvidencePoints(geometry);
  if (points.length === 0) return false;

  const distances = points
    .map((point) => getMinDistanceToPolylines(point, previousPaths))
    .filter(Number.isFinite);
  if (distances.length === 0) return false;

  const farPointCount = distances.filter(
    (distance) => distance >= ALTERNATE_DETOUR_PATH_REPLACE_MIN_DISTANCE_METERS
  ).length;
  return farPointCount >= Math.min(ALTERNATE_DETOUR_PATH_REPLACE_MIN_FAR_POINTS, distances.length);
}

function getCurrentVehicleCount(detour = {}) {
  const explicitCount = Number(detour.currentVehicleCount);
  if (Number.isFinite(explicitCount)) return explicitCount;
  if (detour.vehiclesOffRoute instanceof Set) return detour.vehiclesOffRoute.size;
  if (Array.isArray(detour.vehiclesOffRoute)) return detour.vehiclesOffRoute.length;
  return 0;
}

function getShapeIdFromDetour(detour = {}) {
  return detour.detourZone?.shapeId ||
    detour.geometry?.shapeId ||
    detour.geometry?.segments?.[0]?.shapeId ||
    null;
}

function getProgressBoundsFromValue(value = {}) {
  const start = Number(
    value.sourceStartProgressMeters ??
    value.startProgressMeters ??
    value.coreStartProgressMeters
  );
  const end = Number(
    value.sourceEndProgressMeters ??
    value.endProgressMeters ??
    value.coreEndProgressMeters
  );
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function getDetourProgressBounds(detour = {}) {
  const segment = Array.isArray(detour.geometry?.segments) ? detour.geometry.segments[0] : null;
  const candidates = [
    detour.detourZone,
    detour.geometry,
    segment?.detourZone,
    segment,
    detour.eventWindow,
    detour.clearWindow,
  ];
  for (const candidate of candidates) {
    const bounds = getProgressBoundsFromValue(candidate);
    if (bounds) return bounds;
  }
  return null;
}

function getCandidateProgressBounds(candidate = {}) {
  if (
    Number.isFinite(candidate.minProgressMeters) &&
    Number.isFinite(candidate.maxProgressMeters)
  ) {
    return {
      start: Math.min(candidate.minProgressMeters, candidate.maxProgressMeters),
      end: Math.max(candidate.minProgressMeters, candidate.maxProgressMeters),
    };
  }
  return getProgressBoundsFromValue(candidate.eventWindow);
}

function progressBoundsGapMeters(left, right) {
  if (!left || !right) return Infinity;
  if (left.end < right.start) return right.start - left.end;
  if (right.end < left.start) return left.start - right.end;
  return 0;
}

function candidateMatchesPreviousDetourWindow(candidate, previousDetour) {
  const candidateShapeId = candidate?.shapeId ? String(candidate.shapeId) : null;
  const previousShapeId = getShapeIdFromDetour(previousDetour);
  if (candidateShapeId && previousShapeId && candidateShapeId !== String(previousShapeId)) {
    return false;
  }
  if (
    candidate?.eventWindow &&
    previousDetour?.eventWindow &&
    windowsOverlapOrNear(candidate.eventWindow, previousDetour.eventWindow, GEOMETRY_CLUSTER_GAP_METERS)
  ) {
    return true;
  }
  return progressBoundsGapMeters(
    getCandidateProgressBounds(candidate),
    getDetourProgressBounds(previousDetour)
  ) <= GEOMETRY_CLUSTER_GAP_METERS;
}

function canSupersedePreviousDetour(candidate, detour, previousDetour) {
  if (!candidate || !detour || !previousDetour) return false;
  if (normalizeRouteId(candidate.routeId) !== normalizeRouteId(previousDetour.routeId)) return false;
  if (getCurrentVehicleCount(previousDetour) > 0) return false;
  if (!candidateMatchesPreviousDetourWindow(candidate, previousDetour)) return false;
  return geometryDivergesFromPreviousPath(detour.geometry, previousDetour);
}

function geometryHasGpsSupersedeFlag(geometry = {}) {
  return geometry?.gpsSupersedesPreviousPath === true ||
    (Array.isArray(geometry?.segments) &&
      geometry.segments.some((segment) => segment?.gpsSupersedesPreviousPath === true));
}

function markGeometrySupersedesPreviousPath(geometry = {}) {
  if (!geometry || typeof geometry !== 'object') return geometry;
  geometry.gpsSupersedesPreviousPath = true;
  if (Array.isArray(geometry.segments)) {
    geometry.segments = geometry.segments.map((segment) => (
      segment && typeof segment === 'object'
        ? { ...segment, gpsSupersedesPreviousPath: true }
        : segment
    ));
  }
  return geometry;
}

function getEvidenceAgeMs(candidate) {
  const firstSeenAt = Number(candidate?.firstSeenAt);
  const lastSeenAt = Number(candidate?.lastSeenAt);
  if (!Number.isFinite(firstSeenAt) || !Number.isFinite(lastSeenAt)) return 0;
  return Math.max(0, lastSeenAt - firstSeenAt);
}

function isRoute400StaleSparseEvidence(candidate, geometry, currentVehicleIds) {
  if (normalizeRouteId(candidate?.routeId) !== '400') return false;
  if (currentVehicleIds?.size > 0) return false;
  if (getEvidenceAgeMs(candidate) <= ROUTE_400_STALE_SPARSE_EVIDENCE_MAX_AGE_MS) return false;

  const uniqueSignatures = candidate?.signatures?.size || 0;
  if (uniqueSignatures > ROUTE_400_STALE_SPARSE_MAX_UNIQUE_SIGNATURES) return false;

  const evidencePointCount = Number(geometry?.evidencePointCount || candidate?.points?.length || 0);
  const maxGapMeters = Number(geometry?.inferredDetourPathStats?.maxGapMeters);
  return evidencePointCount < ROUTE_400_STALE_SPARSE_MIN_EVIDENCE_POINTS ||
    (Number.isFinite(maxGapMeters) && maxGapMeters > ROUTE_400_STALE_SPARSE_MAX_POINT_GAP_METERS);
}

function buildDetour(candidate, shapes, detectorConfig = {}, currentOffRouteVehicleIds = new Set()) {
  const geometry = buildGeometry(candidate, shapes, detectorConfig);
  const currentVehicleIds = new Set(currentOffRouteVehicleIds || []);
  const route400StaleSparseEvidence = isRoute400StaleSparseEvidence(
    candidate,
    geometry,
    currentVehicleIds
  );
  const riderVisible = geometry.canShowDetourPath === true && !route400StaleSparseEvidence;
  const riderVisibilityReason = riderVisible
    ? 'v2-confirmed'
    : route400StaleSparseEvidence
      ? 'stale-sparse-evidence'
      : 'insufficient-geometry';
  const shapeLengthMeters = getShapeLengthMeters(shapes, candidate.shapeId);
  const eventClearWindow = buildClearWindowForEvent(candidate.eventWindow, {
    shapeLengthMeters,
    quality: riderVisible ? 'normal' : 'weak',
  });
  const detourZone = {
    startProgressMeters: Number.isFinite(geometry.startProgressMeters)
      ? geometry.startProgressMeters
      : candidate.minProgressMeters,
    endProgressMeters: Number.isFinite(geometry.endProgressMeters)
      ? geometry.endProgressMeters
      : candidate.maxProgressMeters,
    shapeId: candidate.shapeId,
  };
  const clearWindows = Array.isArray(geometry.segments)
    ? geometry.segments
      .map((segment) => segment?.clearWindow)
      .filter(Boolean)
    : [];
  const detourSpanMeters = Number.isFinite(detourZone.startProgressMeters) && Number.isFinite(detourZone.endProgressMeters)
    ? Math.abs(detourZone.endProgressMeters - detourZone.startProgressMeters)
    : 0;
  const hiddenClearWindow = detourSpanMeters >= CLEAR_WINDOW_MIN_METERS && clearWindows[0]
    ? clearWindows[0]
    : eventClearWindow;
  return {
    eventId: candidate.eventId || candidate.routeId,
    routeId: candidate.routeId,
    detourVersion: 'v2',
    detourModel: 'event-window',
    eventWindow: freezeEventWindow(candidate.eventWindow),
    detectedAt: new Date(candidate.firstSeenAt),
    lastSeenAt: new Date(candidate.lastSeenAt),
    triggerVehicleId: candidate.triggerVehicleId,
    vehiclesOffRoute: currentVehicleIds,
    matchedVehicleIds: [...candidate.vehicleIds],
    vehicleCount: candidate.signatures.size,
    uniqueVehicleCount: candidate.signatures.size,
    currentVehicleCount: currentVehicleIds.size,
    state: 'active',
    confidence: geometry.confidence,
    riderVisible,
    riderVisibilityReason,
    staleForReview: !riderVisible,
    canShowDetourPath: riderVisible && geometry.canShowDetourPath === true,
    geometry,
    detourZone,
    clearWindow: riderVisible
      ? (clearWindows[0] || eventClearWindow || buildClearWindow(detourZone, shapeLengthMeters))
      : (hiddenClearWindow || clearWindows[0] || buildClearWindow(detourZone, shapeLengthMeters)),
    clearWindows: riderVisible
      ? (clearWindows.length > 0 ? clearWindows : [eventClearWindow].filter(Boolean))
      : [hiddenClearWindow || clearWindows[0]].filter(Boolean),
    clearedSegments: [],
    latestGpsEvidenceAt: candidate.lastSeenAt,
    geometryLastEvidenceAt: geometry.lastEvidenceAt,
    lastEvidenceAt: geometry.lastEvidenceAt,
  };
}

function snapshotDetour(detour) {
  return {
    ...detour,
    vehiclesOffRoute: new Set(detour.vehiclesOffRoute || []),
    matchedVehicleIds: [...(detour.matchedVehicleIds || [])],
    geometry: cloneJson(detour.geometry),
    detourZone: cloneJson(detour.detourZone),
    eventWindow: cloneJson(detour.eventWindow),
    clearWindow: cloneJson(detour.clearWindow),
    clearWindows: cloneJson(detour.clearWindows),
    clearedSegments: cloneJson(detour.clearedSegments) || [],
  };
}

function serializeDetour(detour) {
  return {
    ...detour,
    detectedAt: toMillis(detour.detectedAt, null),
    lastSeenAt: toMillis(detour.lastSeenAt, null),
    vehiclesOffRoute: [...(detour.vehiclesOffRoute || [])],
    geometry: cloneJson(detour.geometry),
    detourZone: cloneJson(detour.detourZone),
    eventWindow: cloneJson(detour.eventWindow),
    clearWindow: cloneJson(detour.clearWindow),
    clearWindows: cloneJson(detour.clearWindows),
    clearedSegments: cloneJson(detour.clearedSegments) || [],
  };
}

function getSourceProgressWindow(window = {}) {
  if (!window) return null;
  const shapeId = window.shapeId ? String(window.shapeId) : null;
  const sourceStart = Number(window.sourceStartProgressMeters ?? window.startProgressMeters);
  const sourceEnd = Number(window.sourceEndProgressMeters ?? window.endProgressMeters);
  if (!shapeId || !Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceStart === sourceEnd) {
    return null;
  }
  return {
    shapeId,
    start: Math.min(sourceStart, sourceEnd),
    end: Math.max(sourceStart, sourceEnd),
  };
}

function getRestoredProgressWindow(data = {}) {
  const segment = Array.isArray(data.geometry?.segments) ? data.geometry.segments[0] : null;
  const candidates = [
    data.detourZone,
    segment?.detourZone,
    data.clearWindow,
    segment?.clearWindow,
  ];
  for (const candidate of candidates) {
    const window = getSourceProgressWindow(candidate);
    if (window) return window;
  }
  return null;
}

function eventWindowMatchesProgressWindow(eventWindow = {}, progressWindow = {}) {
  if (!eventWindow || !progressWindow) return false;
  const eventShapeId = eventWindow.shapeId ? String(eventWindow.shapeId) : null;
  if (eventShapeId && eventShapeId !== progressWindow.shapeId) return false;
  const coreStart = Number(eventWindow.coreStartProgressMeters);
  const coreEnd = Number(eventWindow.coreEndProgressMeters);
  if (!Number.isFinite(coreStart) || !Number.isFinite(coreEnd) || coreStart === coreEnd) return false;
  const eventStart = Math.min(coreStart, coreEnd);
  const eventEnd = Math.max(coreStart, coreEnd);
  const gap = progressWindow.end < eventStart
    ? eventStart - progressWindow.end
    : progressWindow.start > eventEnd
      ? progressWindow.start - eventEnd
      : 0;
  return gap <= GEOMETRY_CLUSTER_GAP_METERS;
}

function buildEventWindowFromProgressWindow(routeId, priorEventWindow = {}, progressWindow = {}) {
  const start = Math.max(0, Number(progressWindow.start));
  const end = Math.max(start, Number(progressWindow.end));
  return {
    routeId,
    shapeId: progressWindow.shapeId,
    coreStartProgressMeters: start,
    coreEndProgressMeters: end,
    confirmStartProgressMeters: Math.max(0, start - 250),
    confirmEndProgressMeters: end + 250,
    clearStartProgressMeters: Math.max(0, start - 400),
    clearEndProgressMeters: end + 400,
    geoCenter: cloneJson(priorEventWindow?.geoCenter) || null,
    geoBounds: cloneJson(priorEventWindow?.geoBounds) || null,
    frozen: priorEventWindow?.frozen === true,
  };
}

function getProgressWindowFromPoints(shapeId, points = []) {
  const progresses = points
    .map((point) => Number(point?.progressMeters))
    .filter(Number.isFinite);
  if (progresses.length === 0) return null;
  return {
    shapeId: shapeId ? String(shapeId) : null,
    start: Math.min(...progresses),
    end: Math.max(...progresses),
  };
}

function repairRestoredEventWindow(routeId, eventWindow, data = {}) {
  const progressWindow = getRestoredProgressWindow(data);
  if (!progressWindow) return cloneJson(eventWindow);
  if (eventWindowMatchesProgressWindow(eventWindow, progressWindow)) {
    return cloneJson(eventWindow);
  }
  return buildEventWindowFromProgressWindow(routeId, eventWindow, progressWindow);
}

function restoreDetour(eventIdOrRouteId, data = {}) {
  const routeId = data.routeId || eventIdOrRouteId;
  const eventId = data.eventId || eventIdOrRouteId;
  const matchedVehicleIds = data.matchedVehicleIds || data.vehiclesOffRoute || [];
  const restoredClearPendingTick = data.state === 'clear-pending' ? 0 : data.clearPendingTick;
  const segmentClearWindows = Array.isArray(data.geometry?.segments)
    ? data.geometry.segments.map((segment) => (
      cloneJson(segment?.clearWindow) ||
      buildClearWindow(segment?.detourZone || segment)
    )).filter(Boolean)
    : [];
  const clearWindows = Array.isArray(data.clearWindows) && data.clearWindows.length > 0
    ? cloneJson(data.clearWindows)
    : segmentClearWindows;
  return {
    ...data,
    eventId,
    routeId,
    detectedAt: new Date(toMillis(data.detectedAt, Date.now())),
    lastSeenAt: new Date(toMillis(data.lastSeenAt, Date.now())),
    // Restored vehicle IDs are historical evidence, not fresh current off-route vehicles.
    vehiclesOffRoute: new Set(),
    matchedVehicleIds,
    currentVehicleCount: 0,
    clearPendingTick: restoredClearPendingTick,
    geometry: cloneJson(data.geometry),
    detourZone: cloneJson(data.detourZone),
    eventWindow: repairRestoredEventWindow(routeId, data.eventWindow, data),
    clearWindow: cloneJson(data.clearWindow) || clearWindows[0] || buildClearWindow(data.detourZone),
    clearWindows,
    clearedSegments: cloneJson(data.clearedSegments) || [],
  };
}

function createDetourV2Detector(config = {}) {
  const offRouteThresholdMeters =
    Number(config.offRouteThresholdMeters) || DEFAULT_OFF_ROUTE_THRESHOLD_METERS;
  const onRouteClearThresholdMeters =
    Number(config.onRouteClearThresholdMeters) || DEFAULT_ON_ROUTE_CLEAR_THRESHOLD_METERS;

  let tickId = 0;
  let lastVehicleCount = 0;
  let lastReportedDetours = {};
  const seenSamples = new Set();
  const eventCandidates = new Map();
  const activeDetours = new Map();
  const clearTracksByEvent = new Map();
  const pendingClearsByEvent = new Map();
  const projectionDiagnostics = new Map();

  function getRouteProjectionSummary(summaries, routeId) {
    const existing = summaries.get(routeId);
    if (existing) return existing;
    const created = {
      total: 0,
      onRouteClear: 0,
      deadband: 0,
      offRoute: 0,
      noProjection: 0,
      newestSampleMs: null,
    };
    summaries.set(routeId, created);
    return created;
  }

  function getActiveDetourShapeId(detour) {
    return detour?.detourZone?.shapeId || detour?.geometry?.shapeId || detour?.shapeId || null;
  }

  function hasCurrentRouteShape(routeId, shapeId, routeShapeMapping) {
    if (!routeId || !shapeId || !routeShapeMapping?.get) return false;
    const currentShapeIds = routeShapeMapping.get(routeId);
    return Array.isArray(currentShapeIds) && currentShapeIds.includes(shapeId);
  }

  function maybeApplyObsoleteShapeGlobalClear(routeId, detour, summary, currentTickId, routeShapeMapping) {
    if (!detour || detour.state === 'clear-pending') return false;

    const activeShapeId = getActiveDetourShapeId(detour);
    if (!activeShapeId || hasCurrentRouteShape(routeId, activeShapeId, routeShapeMapping)) return false;

    const latestEvidenceMs = Number(detour.latestGpsEvidenceAt || detour.lastEvidenceAt || 0);
    const newestSampleMs = Number(summary?.newestSampleMs || 0);
    if (!Number.isFinite(latestEvidenceMs) || !Number.isFinite(newestSampleMs)) return false;
    if (newestSampleMs - latestEvidenceMs < OBSOLETE_SHAPE_GLOBAL_CLEAR_GRACE_MS) return false;

    if (
      !summary ||
      summary.total <= 0 ||
      summary.onRouteClear !== summary.total ||
      summary.offRoute > 0 ||
      summary.deadband > 0 ||
      summary.noProjection > 0
    ) {
      return false;
    }

    detour.state = 'clear-pending';
    detour.clearReason = 'obsolete-shape-normal-route-observed';
    detour.clearPendingTick = currentTickId;
    detour.vehiclesOffRoute = new Set();
    detour.currentVehicleCount = 0;
    return true;
  }

  function clearVehicleState() {
    tickId = 0;
    lastVehicleCount = 0;
    lastReportedDetours = {};
    seenSamples.clear();
    eventCandidates.clear();
    activeDetours.clear();
    clearTracksByEvent.clear();
    pendingClearsByEvent.clear();
    projectionDiagnostics.clear();
  }

  function makeEventCandidate(routeId, shapeId, point, shapes) {
    const shapeLengthMeters = getShapeLengthMeters(shapes, shapeId);
    const eventWindow = buildInitialEventWindow({
      routeId,
      shapeId,
      progressMeters: point.progressMeters,
      coordinate: point.coordinate,
      shapeLengthMeters,
    });
    if (!eventWindow) return null;
    const eventId = makeEventId({
      routeId,
      shapeId,
      startProgressMeters: eventWindow.coreStartProgressMeters,
      endProgressMeters: eventWindow.coreEndProgressMeters,
    });
    return { ...makeCandidate(routeId, shapeId), eventId, eventWindow };
  }

  function pointGapFromEventWindowMeters(point, eventWindow) {
    const progress = Number(point?.progressMeters);
    const start = Number(eventWindow?.coreStartProgressMeters);
    const end = Number(eventWindow?.coreEndProgressMeters);
    if (!Number.isFinite(progress) || !Number.isFinite(start) || !Number.isFinite(end)) return Infinity;
    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);
    if (progress >= normalizedStart && progress <= normalizedEnd) return 0;
    return progress < normalizedStart ? normalizedStart - progress : progress - normalizedEnd;
  }

  function findMatchingEventCandidate(routeId, shapeId, point) {
    let nearest = null;
    let nearestGap = Infinity;
    for (const candidate of eventCandidates.values()) {
      if (candidate.routeId !== routeId || candidate.shapeId !== shapeId) continue;
      if (pointMatchesEventWindow(point, candidate.eventWindow, 'confirm')) return candidate;
      if (!canExtendCandidateOutsideConfirmWindow(candidate, point)) continue;
      const gap = pointGapFromEventWindowMeters(point, candidate.eventWindow);
      if (gap < nearestGap) {
        nearest = candidate;
        nearestGap = gap;
      }
    }
    return nearest || null;
  }

  function canExtendCandidateOutsideConfirmWindow(candidate, point) {
    const gap = pointGapFromEventWindowMeters(point, candidate?.eventWindow);
    if (!Number.isFinite(gap) || gap > GEOMETRY_CLUSTER_GAP_METERS) return false;

    const signature = point?.signature ? String(point.signature) : '';
    if (!signature || !candidate?.signatures?.has(signature)) return false;

    const timestampMs = Number(point?.timestampMs);
    const progressMeters = Number(point?.progressMeters);
    if (!Number.isFinite(timestampMs) || !Number.isFinite(progressMeters)) return false;

    const sameSignaturePoints = (candidate.points || [])
      .filter((candidatePoint) => (
        String(candidatePoint?.signature || '') === signature &&
        Number.isFinite(Number(candidatePoint?.timestampMs)) &&
        Number.isFinite(Number(candidatePoint?.progressMeters))
      ))
      .sort((a, b) => Number(a.timestampMs) - Number(b.timestampMs));

    if (sameSignaturePoints.length === 0) return false;
    const previousPoint = sameSignaturePoints
      .filter((candidatePoint) => Number(candidatePoint.timestampMs) <= timestampMs)
      .at(-1);
    if (!previousPoint) return false;

    const timestampGap = timestampMs - Number(previousPoint.timestampMs);
    if (timestampGap > SPARSE_TRACE_MAX_TIME_GAP_MS) return false;

    const progressDelta = progressMeters - Number(previousPoint.progressMeters);
    if (progressDelta < -TRACE_REVERSAL_TOLERANCE_METERS) return false;

    return true;
  }

  function refreshProvisionalCandidateEventId(candidate) {
    if (!candidate?.eventWindow || activeDetours.has(candidate.eventId)) return candidate;
    const nextEventId = makeEventId({
      routeId: candidate.routeId,
      shapeId: candidate.shapeId,
      startProgressMeters: candidate.eventWindow.coreStartProgressMeters,
      endProgressMeters: candidate.eventWindow.coreEndProgressMeters,
    });
    if (!nextEventId || nextEventId === candidate.eventId) return candidate;
    const existing = eventCandidates.get(nextEventId);
    if (existing && existing !== candidate) return candidate;
    eventCandidates.delete(candidate.eventId);
    candidate.eventId = nextEventId;
    eventCandidates.set(candidate.eventId, candidate);
    return candidate;
  }

  function getCandidateCoreSpanMeters(candidate) {
    const start = Number(candidate?.eventWindow?.coreStartProgressMeters);
    const end = Number(candidate?.eventWindow?.coreEndProgressMeters);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.abs(end - start);
  }

  function getCandidatePointKey(point = {}) {
    return [
      point.vehicleId,
      point.signature,
      point.timestampMs,
      Number.isFinite(Number(point.progressMeters)) ? Number(point.progressMeters).toFixed(2) : '',
    ].map((part) => String(part ?? '')).join('|');
  }

  function mergeCurrentOffRouteVehicleSets(targetEventId, sourceEventId, currentOffRouteVehicleIdsByEvent) {
    if (!targetEventId || !sourceEventId || targetEventId === sourceEventId) return;
    if (!(currentOffRouteVehicleIdsByEvent instanceof Map)) return;
    const targetSet = currentOffRouteVehicleIdsByEvent.get(targetEventId) || new Set();
    const sourceSet = currentOffRouteVehicleIdsByEvent.get(sourceEventId) || new Set();
    for (const vehicleId of sourceSet) targetSet.add(vehicleId);
    if (targetSet.size > 0) currentOffRouteVehicleIdsByEvent.set(targetEventId, targetSet);
    currentOffRouteVehicleIdsByEvent.delete(sourceEventId);
  }

  function mergeCandidateInto(target, source, { shapeLengthMeters, currentOffRouteVehicleIdsByEvent } = {}) {
    if (!target || !source || target === source) return target;
    const oldTargetEventId = target.eventId;
    const sourceEventId = source.eventId;
    const existingPointKeys = new Set((target.points || []).map(getCandidatePointKey));

    for (const point of source.points || []) {
      const pointKey = getCandidatePointKey(point);
      if (existingPointKeys.has(pointKey)) continue;
      existingPointKeys.add(pointKey);
      addPointToCandidate(target, point);
      target.eventWindow = expandProvisionalEventWindow(target.eventWindow, {
        ...point,
        coordinate: point.coordinate,
      }, { shapeLengthMeters });
    }

    eventCandidates.delete(sourceEventId);
    refreshProvisionalCandidateEventId(target);
    mergeCurrentOffRouteVehicleSets(oldTargetEventId, sourceEventId, currentOffRouteVehicleIdsByEvent);
    mergeCurrentOffRouteVehicleSets(target.eventId, oldTargetEventId, currentOffRouteVehicleIdsByEvent);
    return target;
  }

  function mergeNearbyLongCandidate(candidate, { shapeLengthMeters, currentOffRouteVehicleIdsByEvent } = {}) {
    if (!candidate?.eventWindow) return candidate;
    const activeCandidateDetour = activeDetours.get(candidate.eventId);
    if (activeCandidateDetour && activeCandidateDetour.riderVisible !== false) return candidate;
    if (getCandidateCoreSpanMeters(candidate) < LONG_CANDIDATE_MERGE_MIN_CORE_SPAN_METERS) return candidate;

    for (const other of [...eventCandidates.values()]) {
      const activeOtherDetour = activeDetours.get(other?.eventId);
      if (
        !other ||
        other === candidate ||
        other.routeId !== candidate.routeId ||
        other.shapeId !== candidate.shapeId ||
        (activeOtherDetour && activeOtherDetour.riderVisible !== false)
      ) {
        continue;
      }
      if (!windowsOverlapOrNear(candidate.eventWindow, other.eventWindow, GEOMETRY_CLUSTER_GAP_METERS)) continue;
      mergeCandidateInto(candidate, other, { shapeLengthMeters, currentOffRouteVehicleIdsByEvent });
    }
    return candidate;
  }

  function getEventCandidate(routeId, shapeId, point, shapes) {
    const existing = findMatchingEventCandidate(routeId, shapeId, point);
    if (existing) return existing;
    const candidate = makeEventCandidate(routeId, shapeId, point, shapes);
    if (!candidate) return null;
    eventCandidates.set(candidate.eventId, candidate);
    return candidate;
  }

  function getActiveEventsForRoute(routeId) {
    return [...activeDetours.values()].filter((detour) => detour.routeId === routeId);
  }

  function getPrimaryActiveEventForRoute(routeId) {
    const events = getActiveEventsForRoute(routeId);
    return events[0] || null;
  }

  function hasUsableEventWindow(detour) {
    const eventWindow = detour?.eventWindow;
    return Boolean(
      eventWindow &&
      typeof eventWindow === 'object' &&
      !Object.prototype.hasOwnProperty.call(eventWindow, 'nullValue') &&
      eventWindow.routeId &&
      eventWindow.shapeId
    );
  }

  function isLegacyRouteScopedDetour(key, detour) {
    const routeId = detour?.routeId || key;
    const eventId = detour?.eventId || key;
    return Boolean(routeId && eventId === routeId);
  }

  function pruneSupersededLegacyRouteDetours() {
    const routesWithEventWindowDetours = new Set();
    for (const [eventId, detour] of activeDetours.entries()) {
      if (!isLegacyRouteScopedDetour(eventId, detour) && hasUsableEventWindow(detour) && detour?.routeId) {
        routesWithEventWindowDetours.add(detour.routeId);
      }
    }

    for (const [eventId, detour] of [...activeDetours.entries()]) {
      if (isLegacyRouteScopedDetour(eventId, detour) && routesWithEventWindowDetours.has(detour.routeId || eventId)) {
        activeDetours.delete(eventId);
        clearTracksByEvent.delete(eventId);
        pendingClearsByEvent.delete(eventId);
      }
    }
  }

  function defineRouteAliases(detourMap) {
    const byRoute = new Map();
    for (const detour of Object.values(detourMap || {})) {
      if (!detour?.routeId) continue;
      const events = byRoute.get(detour.routeId) || [];
      events.push(detour);
      byRoute.set(detour.routeId, events);
    }
    for (const [routeId, events] of byRoute.entries()) {
      if (events.length > 0 && !Object.prototype.hasOwnProperty.call(detourMap, routeId)) {
        Object.defineProperty(detourMap, routeId, {
          value: events[0],
          enumerable: false,
          configurable: true,
        });
      }
    }
    return detourMap;
  }

  function serializeCandidate(candidate) {
    return {
      eventId: candidate.eventId,
      routeId: candidate.routeId,
      shapeId: candidate.shapeId,
      points: candidate.points,
      eventWindow: cloneJson(candidate.eventWindow),
    };
  }

  function restoreCandidate(item = {}, shapes = new Map()) {
    const points = Array.isArray(item.points) ? item.points : [];
    const firstPoint = points.find((point) => Number.isFinite(point?.progressMeters));
    const candidate = item.eventId && item.eventWindow
      ? { ...makeCandidate(item.routeId, item.shapeId), eventId: item.eventId, eventWindow: cloneJson(item.eventWindow) }
      : makeEventCandidate(item.routeId, item.shapeId, firstPoint || {
        progressMeters: 0,
        coordinate: null,
      }, shapes);
    if (!candidate) return null;
    for (const point of points) {
      addPointToCandidate(candidate, point);
      candidate.eventWindow = expandProvisionalEventWindow(candidate.eventWindow, point, {
        shapeLengthMeters: getShapeLengthMeters(shapes, candidate.shapeId),
      });
    }
    const pointWindow = getProgressWindowFromPoints(candidate.shapeId, candidate.points);
    if (pointWindow && !eventWindowMatchesProgressWindow(candidate.eventWindow, pointWindow)) {
      candidate.eventWindow = buildEventWindowFromProgressWindow(
        candidate.routeId,
        candidate.eventWindow,
        pointWindow
      );
    }
    candidate.eventId = item.eventId || candidate.eventId;
    return candidate;
  }

  function getDetourClearSegments(detour) {
    const segments = Array.isArray(detour?.geometry?.segments)
      ? detour.geometry.segments
      : [];
    if (segments.length > 0) {
      return segments
        .map((segment, index) => ({
          index,
          segment,
          clearWindow: segment?.clearWindow ||
            (Array.isArray(detour?.clearWindows) ? detour.clearWindows[index] : null) ||
            buildClearWindow(segment?.detourZone || segment),
        }))
        .filter((item) => (
          item.clearWindow &&
          item.segment?.state !== 'cleared' &&
          item.segment?.state !== 'clear-pending'
        ));
    }

    const fallback = detour?.clearWindow || buildClearWindow(detour?.detourZone);
    return fallback ? [{
      index: 0,
      segment: detour,
      clearWindow: fallback,
    }] : [];
  }

  function getDetourClearWindows(detour) {
    return getDetourClearSegments(detour).map((item) => item.clearWindow);
  }

  function getDetourClearWindow(detour) {
    return getDetourClearWindows(detour)[0] || null;
  }

  function getClearWindowMetrics(clearWindow, samples) {
    if (!clearWindow || !Array.isArray(samples) || samples.length < 2) return null;
    const start = Number(clearWindow.startProgressMeters);
    const end = Number(clearWindow.endProgressMeters);
    const span = end - start;
    if (!Number.isFinite(span) || span <= 0) return null;

    const progresses = samples
      .filter((sample) => sampleMatchesClearWindow(clearWindow, sample))
      .map((sample) => sample.progressMeters)
      .filter(Number.isFinite);
    if (progresses.length < 2) return null;
    const observedStart = Math.max(Math.min(...progresses), start);
    const observedEnd = Math.min(Math.max(...progresses), end);
    const overlapMeters = Math.max(0, observedEnd - observedStart);
    const movementMeters = Math.max(...progresses) - Math.min(...progresses);
    const minCoverageRatio = getClearWindowMinCoverageRatio(clearWindow);
    const requiredMovement = Math.max(
      Math.min(CLEAR_MIN_TRAVERSAL_METERS, span * CLEAR_MIN_TRAVERSAL_RATIO),
      span * minCoverageRatio
    );
    const inWindowSamples = samples.filter((sample) => sampleMatchesClearWindow(clearWindow, sample));
    const coreSampleCount = inWindowSamples
      .filter((sample) => sampleMatchesClearWindowCore(clearWindow, sample))
      .length;
    const maxProgressGapMeters = getMaxProgressGapMeters(clearWindow, inWindowSamples);

    return {
      span,
      overlapMeters,
      movementMeters,
      requiredMovement,
      minCoverageRatio,
      inWindowSampleCount: inWindowSamples.length,
      coreSampleCount,
      maxProgressGapMeters,
      maxAllowedProgressGapMeters: CLEAR_WINDOW_MAX_PROGRESS_GAP_METERS,
    };
  }

  function isClearWindowClearedByTrack(clearWindow, track) {
    const metrics = getClearWindowMetrics(clearWindow, track);
    if (!metrics) return false;
    return metrics.overlapMeters / metrics.span >= metrics.minCoverageRatio &&
      metrics.movementMeters >= metrics.requiredMovement &&
      metrics.coreSampleCount > 0 &&
      metrics.maxProgressGapMeters <= metrics.maxAllowedProgressGapMeters;
  }

  function isHiddenTinyRouteEdgeDetour(detour, clearWindow) {
    return Boolean(
      detour &&
      detour.riderVisible === false &&
      detour.canShowDetourPath === false &&
      isTinyRouteEdgeClearWindow(clearWindow)
    );
  }

  function isHiddenTinyRouteEdgeClearedByDownstreamTrack(detour, clearWindow, track) {
    if (!isHiddenTinyRouteEdgeDetour(detour, clearWindow)) return false;
    const latestEvidenceAt = Number(detour?.latestGpsEvidenceAt || 0);
    const samples = (Array.isArray(track) ? track : [])
      .map(normalizeClearTrackSample)
      .filter((sample) => sample && sample.timestampMs > latestEvidenceAt)
      .filter((sample) => sampleMatchesTinyRouteEdgeDownstreamClear(clearWindow, sample))
      .sort((a, b) => a.timestampMs - b.timestampMs);
    if (samples.length < 2) return false;
    const progresses = samples.map((sample) => sample.progressMeters).filter(Number.isFinite);
    if (progresses.length < 2) return false;
    return Math.max(...progresses) - Math.min(...progresses) >= CLEAR_MIN_TRAVERSAL_METERS;
  }

  function getClearableSegmentsFromTrack(detour, track) {
    return getDetourClearSegments(detour)
      .filter((item) => (
        isClearWindowClearedByTrack(item.clearWindow, track) ||
        isHiddenTinyRouteEdgeClearedByDownstreamTrack(detour, item.clearWindow, track)
      ));
  }

  function sampleMatchesClearWindow(clearWindow, sample) {
    if (!clearWindow || !sample) return false;
    if (clearWindow.shapeId && sample.shapeId && clearWindow.shapeId !== sample.shapeId) {
      return false;
    }
    return Number.isFinite(sample.progressMeters) &&
      Number.isFinite(sample.timestampMs) &&
      progressInWindow(sample.progressMeters, clearWindow);
  }

  function sampleMatchesDetourZone(detour, sample) {
    const clearWindows = getDetourClearWindows(detour);
    if (clearWindows.length === 0) return false;
    return clearWindows.some((clearWindow) => sampleMatchesClearWindow(clearWindow, sample));
  }

  function getUsableClearTrackSamples(detour, routeTracks) {
    const latestEvidenceAt = Number(detour?.latestGpsEvidenceAt || 0);
    const samples = [];
    for (const [signature, track] of routeTracks?.entries?.() || []) {
      for (const rawSample of Array.isArray(track) ? track : []) {
        const sample = normalizeClearTrackSample({
          ...rawSample,
          signature: rawSample?.signature || signature,
        });
        if (!sample || sample.timestampMs <= latestEvidenceAt) continue;
        if (!sampleMatchesDetourZone(detour, sample)) continue;
        samples.push(sample);
      }
    }
    return samples;
  }

  function hasEnoughCollectiveClearSources(samples) {
    const vehicleIds = new Set(samples.map((sample) => sample.vehicleId).filter(Boolean));
    if (vehicleIds.size > 0) return vehicleIds.size >= 2;
    const signatures = new Set(samples.map((sample) => sample.signature).filter(Boolean));
    return signatures.size >= 2;
  }

  function shouldClearWindowFromCollectiveSamples(clearWindow, samples) {
    const matchingSamples = samples.filter((sample) => sampleMatchesClearWindow(clearWindow, sample));
    if (!hasEnoughCollectiveClearSources(matchingSamples)) return false;
    const tinySourceSamples = matchingSamples.filter((sample) => (
      sampleMatchesTinyClearSource(clearWindow, sample)
    ));
    if (
      tinySourceSamples.length >= 2 &&
      hasEnoughCollectiveClearSources(tinySourceSamples)
    ) {
      return true;
    }
    const metrics = getClearWindowMetrics(clearWindow, matchingSamples);
    if (
      !metrics ||
      metrics.coreSampleCount <= 0 ||
      metrics.maxProgressGapMeters > metrics.maxAllowedProgressGapMeters
    ) {
      return false;
    }
    const start = Number(clearWindow.startProgressMeters);
    const end = Number(clearWindow.endProgressMeters);
    const span = end - start;
    if (!Number.isFinite(span) || span <= 0) return false;

    const intervals = [];
    const samplesBySignature = new Map();
    for (const sample of matchingSamples) {
      const signature = sample.signature || sample.vehicleId || 'unknown';
      const track = samplesBySignature.get(signature) || [];
      track.push(sample);
      samplesBySignature.set(signature, track);
    }

    for (const track of samplesBySignature.values()) {
      const metrics = getClearWindowMetrics(clearWindow, track);
      if (!metrics || metrics.overlapMeters <= 0) continue;
      const progresses = track.map((sample) => sample.progressMeters).filter(Number.isFinite);
      intervals.push([
        Math.max(Math.min(...progresses), start),
        Math.min(Math.max(...progresses), end),
      ]);
    }

    if (intervals.length < 2) return false;
    intervals.sort((a, b) => a[0] - b[0]);

    const merged = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1]) {
        last[1] = Math.max(last[1], interval[1]);
      } else {
        merged.push([...interval]);
      }
    }

    const overlapMeters = merged.reduce((sum, [intervalStart, intervalEnd]) => (
      sum + Math.max(0, intervalEnd - intervalStart)
    ), 0);
    const minCoverageRatio = getClearWindowMinCoverageRatio(clearWindow);

    return overlapMeters / span >= minCoverageRatio;
  }

  function getClearableSegmentsFromCollectiveTracks(detour, routeTracks) {
    const clearSegments = getDetourClearSegments(detour);
    if (clearSegments.length === 0) return [];
    const samples = getUsableClearTrackSamples(detour, routeTracks);
    if (!hasEnoughCollectiveClearSources(samples)) return [];
    return clearSegments.filter((item) => (
      shouldClearWindowFromCollectiveSamples(item.clearWindow, samples)
    ));
  }

  function markNormalRouteClearPending(detour, currentTickId) {
    detour.state = 'clear-pending';
    detour.clearReason = 'normal-route-observed';
    detour.clearPendingTick = currentTickId;
  }

  function enqueueSegmentClears(eventId, clearSegments, currentTickId, clearPendingAt) {
    if (!eventId || !Array.isArray(clearSegments) || clearSegments.length === 0) return;
    const entries = pendingClearsByEvent.get(eventId) || [];
    for (const item of clearSegments) {
      if (!item?.clearWindow) continue;
      if (entries.some((entry) => windowsDescribeSameSegment(entry.clearWindow, item.clearWindow))) {
        continue;
      }
      entries.push({
        clearWindow: cloneJson(item.clearWindow),
        segment: cloneJson(item.segment),
        clearReason: 'normal-route-observed',
        clearPendingTick: currentTickId,
        clearPendingAt,
      });
    }
    if (entries.length > 0) pendingClearsByEvent.set(eventId, entries);
  }

  function rebuildCandidateSummary(candidate) {
    candidate.signatures = new Set();
    candidate.vehicleIds = new Set();
    candidate.minProgressMeters = Infinity;
    candidate.maxProgressMeters = -Infinity;
    candidate.firstSeenAt = null;
    candidate.lastSeenAt = null;
    candidate.triggerVehicleId = null;

    for (const point of candidate.points || []) {
      candidate.signatures.add(point.signature);
      candidate.vehicleIds.add(point.vehicleId);
      candidate.minProgressMeters = Math.min(candidate.minProgressMeters, point.progressMeters);
      candidate.maxProgressMeters = Math.max(candidate.maxProgressMeters, point.progressMeters);
      candidate.firstSeenAt = candidate.firstSeenAt == null
        ? point.timestampMs
        : Math.min(candidate.firstSeenAt, point.timestampMs);
      candidate.lastSeenAt = Math.max(candidate.lastSeenAt || 0, point.timestampMs);
      candidate.triggerVehicleId = candidate.triggerVehicleId || point.vehicleId;
    }
  }

  function isMarginalOffRoutePoint(point = {}) {
    const distanceMeters = Number(point.distanceMeters);
    return (
      Number.isFinite(distanceMeters) &&
      distanceMeters <= offRouteThresholdMeters + MARGINAL_OFF_ROUTE_RESET_GRACE_METERS
    );
  }

  function currentOffRouteEvidenceMatchesWindow(points = [], clearWindow = {}) {
    return points.some((point) => (
      !isMarginalOffRoutePoint(point) &&
      pointMatchesProgressWindow(point, clearWindow)
    ));
  }

  function currentOffRouteEvidenceBlocksClearPending(detour, points = []) {
    const clearWindows = getDetourClearWindows(detour);
    if (clearWindows.length === 0) return points.length > 0;
    return clearWindows.some((clearWindow) => (
      currentOffRouteEvidenceMatchesWindow(points, clearWindow)
    ));
  }

  function resetClearTracksForOffRoutePoint(routeId, point = {}) {
    if (isMarginalOffRoutePoint(point)) return;
    const matchingEvents = getActiveEventsForRoute(routeId);
    if (matchingEvents.length === 0) return;

    for (const detour of matchingEvents) {
      const eventId = detour.eventId;
      const eventTracks = clearTracksByEvent.get(eventId);
      if (!eventTracks) continue;

      const clearWindows = getDetourClearWindows(detour);
      if (clearWindows.length === 0) {
        clearTracksByEvent.delete(eventId);
        continue;
      }

      const matchingWindows = clearWindows.filter((clearWindow) => (
        pointMatchesProgressWindow(point, clearWindow)
      ));
      if (matchingWindows.length === 0) continue;

      const prunedEventTracks = new Map();
      for (const [signature, track] of eventTracks.entries()) {
        const retainedSamples = (Array.isArray(track) ? track : [])
          .filter((sample) => !matchingWindows.some((clearWindow) => (
            sampleMatchesClearWindow(clearWindow, sample)
          )));
        if (retainedSamples.length > 0) {
          prunedEventTracks.set(signature, retainedSamples);
        }
      }

      if (prunedEventTracks.size > 0) {
        clearTracksByEvent.set(eventId, prunedEventTracks);
      } else {
        clearTracksByEvent.delete(eventId);
      }
    }
  }

  function appendClearedSegment(detour, pendingClear) {
    if (!detour || !pendingClear?.clearWindow) return;
    const sourceSegments = Array.isArray(detour.geometry?.segments)
      ? detour.geometry.segments
      : [];
    const matchingSegment = sourceSegments.find((segment) => (
      windowsDescribeSameSegment(
        segment?.clearWindow || buildClearWindow(segment?.detourZone || segment),
        pendingClear.clearWindow
      )
    ));
    const segmentSnapshot = cloneJson(matchingSegment || pendingClear.segment || {});
    const clearRecord = {
      ...segmentSnapshot,
      state: 'cleared',
      clearReason: pendingClear.clearReason,
      clearPendingTick: pendingClear.clearPendingTick,
      clearedAtTick: pendingClear.clearPendingTick,
      clearedAt: pendingClear.clearPendingAt || null,
      clearWindow: cloneJson(pendingClear.clearWindow),
    };
    const existing = Array.isArray(detour.clearedSegments) ? detour.clearedSegments : [];
    if (!existing.some((segment) => windowsDescribeSameSegment(segment?.clearWindow, clearRecord.clearWindow))) {
      detour.clearedSegments = [...existing, clearRecord];
    }
  }

  function pruneCandidateForClearedWindow(candidate, clearWindow, clearPendingAt) {
    if (!candidate || !clearWindow) return false;
    const before = candidate.points.length;
    candidate.points = candidate.points.filter((point) => {
      if (!pointMatchesProgressWindow(point, clearWindow, candidate.shapeId)) return true;
      const pointTimestamp = Number(point.timestampMs || 0);
      return Number.isFinite(pointTimestamp) && pointTimestamp > Number(clearPendingAt || 0);
    });
    if (candidate.points.length !== before) {
      rebuildCandidateSummary(candidate);
      return true;
    }
    return false;
  }

  function applyPendingSegmentClears(currentTickId, offRoutePointsByRoute) {
    for (const [eventId, pendingClears] of [...pendingClearsByEvent.entries()]) {
      const detour = activeDetours.get(eventId);
      const candidate = eventCandidates.get(eventId);
      if (!detour || detour.state === 'clear-pending') {
        pendingClearsByEvent.delete(eventId);
        continue;
      }

      const routeId = detour.routeId || candidate?.routeId || null;
      const currentOffRoutePoints = routeId ? (offRoutePointsByRoute.get(routeId) || []) : [];
      const applied = [];
      for (const pendingClear of pendingClears) {
        if (currentOffRouteEvidenceMatchesWindow(currentOffRoutePoints, pendingClear.clearWindow)) {
          continue;
        }
        appendClearedSegment(detour, pendingClear);
        pruneCandidateForClearedWindow(candidate, pendingClear.clearWindow, pendingClear.clearPendingAt);
        applied.push(pendingClear);
      }

      pendingClearsByEvent.delete(eventId);

      if (applied.length > 0 && (!candidate || !hasEnoughEvidence(candidate))) {
        markNormalRouteClearPending(detour, currentTickId);
      }
    }
  }

  function carryForwardDetourMetadata(detour, previousDetour) {
    if (!detour || !previousDetour) return detour;
    detour.detectedAt = previousDetour.detectedAt || detour.detectedAt;
    detour.triggerVehicleId = previousDetour.triggerVehicleId || detour.triggerVehicleId;
    if (geometryHasGpsSupersedeFlag(previousDetour.geometry)) {
      markGeometrySupersedesPreviousPath(detour.geometry);
    }
    const activeWindows = Array.isArray(detour.geometry?.segments)
      ? detour.geometry.segments
        .map((segment) => segment?.clearWindow)
        .filter(Boolean)
      : [];
    detour.clearedSegments = (cloneJson(previousDetour.clearedSegments) || [])
      .filter((segment) => !activeWindows.some((window) => (
        windowsDescribeSameSegment(segment?.clearWindow, window)
      )));
    return detour;
  }

  function findSupersededActiveDetourForCandidate(candidate, detour) {
    let best = null;
    for (const [eventId, previousDetour] of activeDetours.entries()) {
      if (!canSupersedePreviousDetour(candidate, detour, previousDetour)) continue;
      const score = progressBoundsGapMeters(
        getCandidateProgressBounds(candidate),
        getDetourProgressBounds(previousDetour)
      );
      if (!best || score < best.score) {
        best = { eventId, detour: previousDetour, score };
      }
    }
    return best;
  }

  function applyGpsPathSupersede(candidate, detour) {
    const superseded = findSupersededActiveDetourForCandidate(candidate, detour);
    if (!superseded) return null;

    markGeometrySupersedesPreviousPath(detour.geometry);
    if (superseded.eventId !== detour.eventId) {
      activeDetours.delete(superseded.eventId);
      eventCandidates.delete(superseded.eventId);
      clearTracksByEvent.delete(superseded.eventId);
      pendingClearsByEvent.delete(superseded.eventId);
    }
    return superseded.detour;
  }

  function normalizeSampleForDetourClear(detour, sample, signature, shapes) {
    const directSample = normalizeClearTrackSample({
      ...sample,
      signature,
    });
    if (directSample && sampleMatchesDetourZone(detour, directSample)) {
      return directSample;
    }

    const coordinate = normalizeCoordinate(sample?.coordinate);
    if (!coordinate || !shapes?.get) return null;

    const sourceShapeId = sample?.shapeId ? String(sample.shapeId) : null;
    for (const clearWindow of getDetourClearWindows(detour)) {
      const clearShapeId = clearWindow?.shapeId ? String(clearWindow.shapeId) : null;
      if (!clearShapeId || clearShapeId === sourceShapeId) continue;

      const clearShape = shapes.get(clearShapeId);
      if (!Array.isArray(clearShape) || clearShape.length < 2) continue;

      const clearProjection = projectOntoPolyline(coordinate, clearShape);
      if (
        !clearProjection ||
        !Number.isFinite(clearProjection.distanceMeters) ||
        clearProjection.distanceMeters > onRouteClearThresholdMeters
      ) {
        continue;
      }

      const reprojectedSample = normalizeClearTrackSample({
        ...sample,
        signature,
        progressMeters: clearProjection.progressMeters,
        shapeId: clearShapeId,
      });
      if (reprojectedSample && sampleMatchesClearWindow(clearWindow, reprojectedSample)) {
        return reprojectedSample;
      }
    }

    return null;
  }

  function trackClearSampleForEvent(eventId, detour, signature, sample, currentTickId, shapes) {
    if (!eventId || !detour || detour.state === 'clear-pending') return;
    if (sample.timestampMs <= Number(detour.latestGpsEvidenceAt || 0)) return;

    const eventTracks = clearTracksByEvent.get(eventId) || new Map();
    const track = eventTracks.get(signature) || [];
    const normalizedSample = normalizeSampleForDetourClear(detour, sample, signature, shapes);
    if (!normalizedSample || !sampleMatchesDetourZone(detour, normalizedSample)) return;
    track.push(normalizedSample);
    eventTracks.set(signature, track.slice(-CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE));
    clearTracksByEvent.set(eventId, eventTracks);

    const trackClearedSegments = getClearableSegmentsFromTrack(detour, track);
    if (trackClearedSegments.length > 0) {
      const clearPendingAt = track
        .map((item) => Number(item.timestampMs))
        .filter(Number.isFinite)
        .reduce((max, value) => Math.max(max, value), sample.timestampMs);
      enqueueSegmentClears(eventId, trackClearedSegments, currentTickId, clearPendingAt);
      return;
    }

    const collectivelyClearedSegments = getClearableSegmentsFromCollectiveTracks(detour, eventTracks);
    if (collectivelyClearedSegments.length > 0) {
      const samples = getUsableClearTrackSamples(detour, eventTracks);
      const clearPendingAt = samples
        .map((item) => Number(item.timestampMs))
        .filter(Number.isFinite)
        .reduce((max, value) => Math.max(max, value), sample.timestampMs);
      enqueueSegmentClears(eventId, collectivelyClearedSegments, currentTickId, clearPendingAt);
    }
  }

  function enqueueRestoredCollectiveClears(currentTickId) {
    for (const [eventId, detour] of activeDetours.entries()) {
      if (!eventId || !detour || detour.state === 'clear-pending') continue;
      const eventTracks = clearTracksByEvent.get(eventId);
      if (!eventTracks) continue;
      for (const track of eventTracks.values()) {
        const trackClearedSegments = getClearableSegmentsFromTrack(detour, track);
        if (trackClearedSegments.length === 0) continue;
        const clearPendingAt = track
          .map((item) => Number(item.timestampMs))
          .filter(Number.isFinite)
          .reduce((max, value) => Math.max(max, value), 0);
        enqueueSegmentClears(eventId, trackClearedSegments, currentTickId, clearPendingAt);
      }
      const collectivelyClearedSegments = getClearableSegmentsFromCollectiveTracks(detour, eventTracks);
      if (collectivelyClearedSegments.length === 0) continue;
      const samples = getUsableClearTrackSamples(detour, eventTracks);
      const clearPendingAt = samples
        .map((item) => Number(item.timestampMs))
        .filter(Number.isFinite)
        .reduce((max, value) => Math.max(max, value), 0);
      enqueueSegmentClears(eventId, collectivelyClearedSegments, currentTickId, clearPendingAt);
    }
  }

  function pruneWeakMarginalActiveDetours(shapes = new Map()) {
    for (const [eventId, detour] of [...activeDetours.entries()]) {
      if (!detour || detour.riderVisible === true) continue;
      const candidate = eventCandidates.get(eventId);
      if (!candidate || !hasEnoughEvidence(candidate)) continue;
      const shapeLengthMeters = getShapeLengthMeters(shapes, candidate.shapeId);
      if (hasEnoughConfirmingEvidence(candidate, { offRouteThresholdMeters, shapeLengthMeters })) {
        continue;
      }
      activeDetours.delete(eventId);
      clearTracksByEvent.delete(eventId);
      pendingClearsByEvent.delete(eventId);
    }
  }

  function trackClearSample(routeId, signature, sample, currentTickId, shapes) {
    for (const detour of getActiveEventsForRoute(routeId)) {
      trackClearSampleForEvent(detour.eventId, detour, signature, sample, currentTickId, shapes);
    }
  }

  function processVehicles(
    vehicles = [],
    shapes = new Map(),
    routeShapeMapping = new Map(),
    _tripMapping = null,
    stopImpactData = null
  ) {
    tickId += 1;
    lastVehicleCount = vehicles.length;
    const currentOffRouteVehicleIdsByRoute = new Map();
    const currentOffRouteVehicleIdsByEvent = new Map();
    const offRoutePointsThisTickByRoute = new Map();
    const routeProjectionSummaries = new Map();

    for (const vehicle of vehicles) {
      const routeId = normalizeRouteId(vehicle.routeId);
      const coordinate = normalizeCoordinate(vehicle.coordinate);
      const signature = evidenceSignature(vehicle);
      const id = vehicleId(vehicle);
      if (!routeId || !coordinate || !signature || !id) continue;

      const timestampMs = getVehicleSampleTimeMs(vehicle);
      const key = sampleKey(vehicle, coordinate, timestampMs);
      if (seenSamples.has(key)) continue;
      seenSamples.add(key);

      const routeSummary = getRouteProjectionSummary(routeProjectionSummaries, routeId);
      routeSummary.total += 1;
      routeSummary.newestSampleMs = Math.max(routeSummary.newestSampleMs || 0, timestampMs);

      const projection = projectCoordinateToRoute(
        routeId,
        coordinate,
        shapes,
        routeShapeMapping,
        vehicle.tripShapeId || null
      );
      if (!projection?.shapeId || !Number.isFinite(projection.progressMeters)) {
        routeSummary.noProjection += 1;
        continue;
      }

      const shape = shapes.get(projection.shapeId);
      if (!Array.isArray(shape) || shape.length < 2) {
        routeSummary.noProjection += 1;
        continue;
      }

      const classification = projection.distanceMeters > offRouteThresholdMeters
        ? 'off-route'
        : projection.distanceMeters <= onRouteClearThresholdMeters
          ? 'on-route-clear'
          : 'deadband';

      routeSummary[classification === 'off-route'
        ? 'offRoute'
        : classification === 'on-route-clear'
          ? 'onRouteClear'
          : 'deadband'] += 1;

      projectionDiagnostics.set(id, {
        routeId,
        vehicleId: id,
        tripId: vehicle.tripId || null,
        shapeId: projection.shapeId,
        distanceMeters: projection.distanceMeters,
        progressMeters: projection.progressMeters,
        sampledAt: timestampMs,
        classification,
      });

      if (projection.distanceMeters > offRouteThresholdMeters) {
        const offRoutePoints = offRoutePointsThisTickByRoute.get(routeId) || [];
        const offRoutePoint = {
          progressMeters: projection.progressMeters,
          distanceMeters: projection.distanceMeters,
          timestampMs,
          shapeId: projection.shapeId,
          vehicleId: id,
          signature,
        };
        offRoutePoints.push(offRoutePoint);
        offRoutePointsThisTickByRoute.set(routeId, offRoutePoints);
        resetClearTracksForOffRoutePoint(routeId, offRoutePoint);
        const currentOffRouteVehicleIds = currentOffRouteVehicleIdsByRoute.get(routeId) || new Set();
        currentOffRouteVehicleIds.add(id);
        currentOffRouteVehicleIdsByRoute.set(routeId, currentOffRouteVehicleIds);
        const candidate = getEventCandidate(routeId, projection.shapeId, {
          ...offRoutePoint,
          coordinate,
        }, shapes);
        if (!candidate) continue;
        addPointToCandidate(candidate, {
          vehicleId: id,
          signature,
          coordinate,
          progressMeters: projection.progressMeters,
          projectedPoint: projection.projectedPoint,
          distanceMeters: projection.distanceMeters,
          shapeId: projection.shapeId,
          timestampMs,
        });
        candidate.eventWindow = expandProvisionalEventWindow(candidate.eventWindow, {
          ...offRoutePoint,
          coordinate,
        }, {
          shapeLengthMeters: getShapeLengthMeters(shapes, projection.shapeId),
        });
        refreshProvisionalCandidateEventId(candidate);
        mergeNearbyLongCandidate(candidate, {
          shapeLengthMeters: getShapeLengthMeters(shapes, projection.shapeId),
          currentOffRouteVehicleIdsByEvent,
        });
        const currentEventOffRouteVehicleIds = currentOffRouteVehicleIdsByEvent.get(candidate.eventId) || new Set();
        currentEventOffRouteVehicleIds.add(id);
        currentOffRouteVehicleIdsByEvent.set(candidate.eventId, currentEventOffRouteVehicleIds);

        if (hasEnoughConfirmingEvidence(candidate, {
          offRouteThresholdMeters,
          shapeLengthMeters: getShapeLengthMeters(shapes, candidate.shapeId),
        })) {
          const previousDetour = activeDetours.get(candidate.eventId);
          const detour = buildDetour(
            candidate,
            shapes,
            config,
            currentOffRouteVehicleIdsByEvent.get(candidate.eventId)
          );
          applyGpsPathSupersede(candidate, detour);
          if (previousDetour) {
            carryForwardDetourMetadata(detour, previousDetour);
          }
          activeDetours.set(detour.eventId, detour);
        }
      } else if (projection.distanceMeters <= onRouteClearThresholdMeters) {
        trackClearSample(routeId, signature, {
          progressMeters: projection.progressMeters,
          timestampMs,
          shapeId: projection.shapeId,
          vehicleId: id,
          coordinate,
        }, tickId, shapes);
      }
    }

    pruneWeakMarginalActiveDetours(shapes);
    enqueueRestoredCollectiveClears(tickId);
    applyPendingSegmentClears(tickId, offRoutePointsThisTickByRoute);

    for (const [eventId, candidate] of eventCandidates.entries()) {
      if (!hasEnoughConfirmingEvidence(candidate, {
        offRouteThresholdMeters,
        shapeLengthMeters: getShapeLengthMeters(shapes, candidate.shapeId),
      })) continue;
      const previousDetour = activeDetours.get(eventId);
      if (previousDetour?.state === 'clear-pending') continue;
      const detour = buildDetour(
        candidate,
        shapes,
        config,
        currentOffRouteVehicleIdsByEvent.get(eventId)
      );
      applyGpsPathSupersede(candidate, detour);
      if (previousDetour) {
        carryForwardDetourMetadata(detour, previousDetour);
      }
      activeDetours.set(detour.eventId, detour);
    }

    for (const [eventId, detour] of activeDetours.entries()) {
      const routeId = detour.routeId || eventId;
      maybeApplyObsoleteShapeGlobalClear(
        routeId,
        detour,
        routeProjectionSummaries.get(routeId),
        tickId,
        routeShapeMapping
      );
    }

    for (const [eventId, detour] of [...activeDetours.entries()]) {
      const routeId = detour.routeId || eventId;
      if (
        detour.state === 'clear-pending' &&
        tickId > detour.clearPendingTick &&
        !currentOffRouteEvidenceBlocksClearPending(
          detour,
          offRoutePointsThisTickByRoute.get(routeId) || []
        )
      ) {
        activeDetours.delete(eventId);
        eventCandidates.delete(eventId);
        clearTracksByEvent.delete(eventId);
        pendingClearsByEvent.delete(eventId);
      }
    }

    lastReportedDetours = {};
    for (const [eventId, detour] of activeDetours.entries()) {
      lastReportedDetours[eventId] = snapshotDetour(detour);
    }
    for (const detour of Object.values(lastReportedDetours)) {
      if (detour?.routeId) {
        enrichDetourMapStopImpacts({ [detour.routeId]: detour }, shapes, stopImpactData);
        applyRiderVisibilityGuard(detour, detour.geometry);
      }
    }
    return defineRouteAliases(lastReportedDetours);
  }

  function getState() {
    const detours = Object.fromEntries(
      [...activeDetours.entries()].map(([eventId, detour]) => [eventId, {
        eventId,
        routeId: detour.routeId || null,
        vehicleCount: detour.vehicleCount || 0,
        uniqueVehicleCount: detour.uniqueVehicleCount || 0,
        currentVehicleCount: detour.currentVehicleCount || 0,
        detectedAt: new Date(detour.detectedAt).toISOString(),
        triggerVehicleId: detour.triggerVehicleId || null,
        state: detour.state || 'active',
        activeSegmentCount: Array.isArray(detour.geometry?.segments)
          ? detour.geometry.segments.length
          : 0,
        clearedSegmentCount: Array.isArray(detour.clearedSegments)
          ? detour.clearedSegments.length
          : 0,
      }])
    );
    const detoursByRoute = new Map();
    for (const detour of Object.values(detours)) {
      if (detour?.routeId && !detoursByRoute.has(detour.routeId)) detoursByRoute.set(detour.routeId, detour);
    }
    for (const [routeId, detour] of detoursByRoute.entries()) {
      if (!Object.prototype.hasOwnProperty.call(detours, routeId)) {
        Object.defineProperty(detours, routeId, { value: detour, enumerable: false, configurable: true });
      }
    }
    const candidateEvidence = Object.fromEntries(
      [...eventCandidates.entries()].map(([eventId, candidate]) => [eventId, {
        eventId,
        routeId: candidate.routeId,
        pointCount: candidate.points.length,
        uniqueSignatureCount: candidate.signatures.size,
        oldestMs: candidate.firstSeenAt,
        newestMs: candidate.lastSeenAt,
        shapeId: candidate.shapeId,
      }])
    );
    const evidenceByRoute = new Map();
    for (const candidate of eventCandidates.values()) {
      const existing = evidenceByRoute.get(candidate.routeId) || {
        routeId: candidate.routeId,
        pointCount: 0,
        uniqueSignatureCount: 0,
        oldestMs: null,
        newestMs: null,
        shapeId: candidate.shapeId,
      };
      existing.pointCount += candidate.points.length;
      const signatures = new Set([...(existing._signatures || []), ...candidate.signatures]);
      existing._signatures = signatures;
      existing.uniqueSignatureCount = signatures.size;
      existing.oldestMs = existing.oldestMs == null ? candidate.firstSeenAt : Math.min(existing.oldestMs, candidate.firstSeenAt);
      existing.newestMs = existing.newestMs == null ? candidate.lastSeenAt : Math.max(existing.newestMs, candidate.lastSeenAt);
      evidenceByRoute.set(candidate.routeId, existing);
    }
    for (const [routeId, evidence] of evidenceByRoute.entries()) {
      delete evidence._signatures;
      if (!Object.prototype.hasOwnProperty.call(candidateEvidence, routeId)) {
        Object.defineProperty(candidateEvidence, routeId, { value: evidence, enumerable: false, configurable: true });
      }
    }

    return {
      detourVersion: 'v2',
      vehicleCount: lastVehicleCount,
      activeDetourCount: Object.keys(detours).length,
      detours,
      detourStates: Object.fromEntries(
        Object.entries(detours).map(([routeId, detour]) => [routeId, detour.state])
      ),
      candidateEvidence,
    };
  }

  function getDetourEvidence() {
    return Object.fromEntries(
      [...eventCandidates.entries()].map(([eventId, candidate]) => [eventId, {
        pointCount: candidate.points.length,
        uniqueVehicles: candidate.vehicleIds.size,
        oldestMs: candidate.firstSeenAt,
        newestMs: candidate.lastSeenAt,
      }])
    );
  }

  function getRawDetourEvidence() {
    return Object.fromEntries(
      [...eventCandidates.entries()].map(([eventId, candidate]) => [eventId, {
        eventId,
        routeId: candidate.routeId,
        pointCount: candidate.points.length,
        uniqueVehicles: candidate.vehicleIds.size,
        points: candidate.points.map((point) => ({
          lat: point.coordinate.latitude,
          lon: point.coordinate.longitude,
          ts: point.timestampMs,
          v: point.vehicleId,
        })),
      }])
    );
  }

  function detoursForRouteSnapshot(routeId) {
    return Object.values(lastReportedDetours || {}).filter((detour) => detour.routeId === routeId);
  }

  function getRouteDebug(routeId) {
    const route = normalizeRouteId(routeId);
    return {
      routeId: route,
      candidateEvidence: getState().candidateEvidence[route] || null,
      snapshot: (lastReportedDetours[route] || detoursForRouteSnapshot(route)[0]) ? serializeDetour(lastReportedDetours[route] || detoursForRouteSnapshot(route)[0]) : null,
      projectionDiagnostics: [...projectionDiagnostics.values()]
        .filter((diagnostic) => diagnostic.routeId === route),
    };
  }

  function serializeClearTracksByEvent() {
    return Object.fromEntries(
      [...clearTracksByEvent.entries()].map(([eventId, eventTracks]) => [
        eventId,
        Object.fromEntries(
          [...eventTracks.entries()].map(([signature, track]) => [
            signature,
            (Array.isArray(track) ? track : [])
              .map(normalizeClearTrackSample)
              .filter(Boolean)
              .slice(-CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE),
          ])
        ),
      ])
    );
  }

  function serializeLegacyClearTracksByRoute() {
    const byRoute = new Map();
    for (const [eventId, eventTracks] of clearTracksByEvent.entries()) {
      const routeId = activeDetours.get(eventId)?.routeId || eventCandidates.get(eventId)?.routeId;
      if (!routeId) continue;
      const routeTracks = byRoute.get(routeId) || new Map();
      for (const [signature, track] of eventTracks.entries()) {
        const existing = routeTracks.get(signature) || [];
        routeTracks.set(signature, [...existing, ...(Array.isArray(track) ? track : [])]
          .slice(-CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE));
      }
      byRoute.set(routeId, routeTracks);
    }
    return Object.fromEntries(
      [...byRoute.entries()].map(([routeId, routeTracks]) => [
        routeId,
        Object.fromEntries([...routeTracks.entries()]),
      ])
    );
  }

  function hydrateEventTracks(eventId, detour, sourceTracks = {}) {
    if (!detour || detour.state === 'clear-pending') return;
    const hydratedEventTracks = new Map();
    for (const [signature, track] of Object.entries(sourceTracks || {})) {
      const samples = (Array.isArray(track) ? track : [])
        .map((sample) => normalizeClearTrackSample({
          ...sample,
          signature: sample?.signature || signature,
        }))
        .filter((sample) => (
          sample &&
          sample.timestampMs > Number(detour.latestGpsEvidenceAt || 0) &&
          sampleMatchesDetourZone(detour, sample)
        ))
        .slice(-CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE);
      if (samples.length > 0) {
        hydratedEventTracks.set(signature, samples);
      }
    }
    if (hydratedEventTracks.size > 0) {
      clearTracksByEvent.set(eventId, hydratedEventTracks);
    }
  }

  function hydrateClearTracks(snapshotClearTracks = {}, { eventKeyed = false } = {}) {
    if (eventKeyed) {
      for (const [eventId, eventTracks] of Object.entries(snapshotClearTracks || {})) {
        hydrateEventTracks(eventId, activeDetours.get(eventId), eventTracks);
      }
      return;
    }

    for (const [routeId, routeTracks] of Object.entries(snapshotClearTracks || {})) {
      for (const detour of getActiveEventsForRoute(routeId)) {
        hydrateEventTracks(detour.eventId, detour, routeTracks);
      }
    }
  }

  function serializeDetectorRuntimeState() {
    const activeEvents = Object.fromEntries(
      [...activeDetours.entries()].map(([eventId, detour]) => [eventId, serializeDetour(detour)])
    );
    const activeDetoursByRoute = {};
    for (const detour of Object.values(activeEvents)) {
      if (detour?.routeId && !activeDetoursByRoute[detour.routeId]) activeDetoursByRoute[detour.routeId] = detour;
    }
    return {
      detourVersion: 'v2',
      detourModel: 'event-window',
      eventCandidates: Object.fromEntries(
        [...eventCandidates.entries()].map(([eventId, candidate]) => [eventId, serializeCandidate(candidate)])
      ),
      candidates: [...eventCandidates.values()].map(serializeCandidate),
      activeEvents,
      activeDetours: activeDetoursByRoute,
      clearTracksByEvent: serializeClearTracksByEvent(),
      clearTracks: serializeLegacyClearTracksByRoute(),
      seenSamples: [...seenSamples].slice(-500),
    };
  }

  function hydrateRuntimeState(snapshot = {}) {
    clearVehicleState();
    (snapshot.seenSamples || []).forEach((key) => seenSamples.add(key));
    const candidateItems = snapshot.eventCandidates && typeof snapshot.eventCandidates === 'object'
      ? Object.values(snapshot.eventCandidates)
      : (Array.isArray(snapshot.candidates) ? snapshot.candidates : Object.values(snapshot.candidates || {}));
    for (const item of candidateItems) {
      const candidate = restoreCandidate(item, new Map());
      if (candidate?.eventId) eventCandidates.set(candidate.eventId, candidate);
    }
    const activeItems = snapshot.activeEvents && typeof snapshot.activeEvents === 'object'
      ? Object.entries(snapshot.activeEvents)
      : Object.entries(snapshot.activeDetours || {});
    for (const [key, detour] of activeItems) {
      const matchingCandidate = !detour?.eventId
        ? [...eventCandidates.values()].find((candidate) => candidate.routeId === (detour?.routeId || key))
        : null;
      const restored = restoreDetour(matchingCandidate?.eventId || key, {
        ...detour,
        eventId: detour?.eventId || matchingCandidate?.eventId,
        eventWindow: detour?.eventWindow || matchingCandidate?.eventWindow,
      });
      activeDetours.set(restored.eventId || key, restored);
    }
    pruneSupersededLegacyRouteDetours();
    if (snapshot.clearTracksByEvent) {
      hydrateClearTracks(snapshot.clearTracksByEvent, { eventKeyed: true });
    } else {
      hydrateClearTracks(snapshot.clearTracks || {}, { eventKeyed: false });
    }
    pruneSupersededLegacyRouteDetours();
  }

  function hydrateActiveDetourSnapshots(records = {}) {
    let count = 0;
    const hasEventWindowRecordForRoute = new Set();
    for (const [key, record] of Object.entries(records || {})) {
      const routeId = record?.routeId || key;
      if (routeId && !isLegacyRouteScopedDetour(key, record) && hasUsableEventWindow(record)) {
        hasEventWindowRecordForRoute.add(routeId);
      }
    }

    for (const [key, record] of Object.entries(records || {})) {
      const routeId = record?.routeId || key;
      if (isLegacyRouteScopedDetour(key, record) && hasEventWindowRecordForRoute.has(routeId)) {
        continue;
      }
      const restored = restoreDetour(key, {
        ...record,
        geometry: record.geometry || record,
        vehiclesOffRoute: record.matchedVehicleIds || [],
      });
      if (activeDetours.has(restored.eventId || key)) continue;
      activeDetours.set(restored.eventId || key, restored);
      count += 1;
    }
    pruneSupersededLegacyRouteDetours();
    return count;
  }

  return {
    processVehicles,
    clearVehicleState,
    getState,
    getDetourEvidence,
    getRawDetourEvidence,
    getRouteDebug,
    serializeDetectorRuntimeState,
    hydrateRuntimeState,
    hydrateActiveDetourSnapshots,
    getPersistentDetours: () => ({}),
    getPersistentDetourGeometries: () => ({}),
    hydratePersistentDetours: () => {},
    hydratePersistentDetourGeometries: () => {},
    clearRouteDetour: (routeId) => {
      // Route id is a legacy API; delete all matching event-scoped clear state below.
      let deleted = false;
      for (const [eventId, candidate] of [...eventCandidates.entries()]) {
        if (eventId === routeId || candidate.routeId === routeId) {
          eventCandidates.delete(eventId);
          clearTracksByEvent.delete(eventId);
          pendingClearsByEvent.delete(eventId);
          deleted = true;
        }
      }
      for (const [eventId, detour] of [...activeDetours.entries()]) {
        if (eventId === routeId || detour.routeId === routeId) {
          activeDetours.delete(eventId);
          clearTracksByEvent.delete(eventId);
          pendingClearsByEvent.delete(eventId);
          deleted = true;
        }
      }
      return deleted;
    },
  };
}

module.exports = {
  createDetourV2Detector,
};
