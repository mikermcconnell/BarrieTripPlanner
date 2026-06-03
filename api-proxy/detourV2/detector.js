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
const SPARSE_TRACE_MAX_TIME_GAP_MS = positiveNumber(
  process.env.DETOUR_V2_SPARSE_TRACE_MAX_TIME_GAP_MS,
  10 * 60 * 1000
);
const TRACE_REVERSAL_TOLERANCE_METERS = positiveNumber(
  process.env.DETOUR_V2_TRACE_REVERSAL_TOLERANCE_METERS,
  75
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
  0.95
);
const CLEAR_WINDOW_MAX_PROGRESS_GAP_METERS = positiveNumber(
  process.env.DETOUR_CLEAR_WINDOW_MAX_PROGRESS_GAP_METERS,
  700
);
const OBSOLETE_SHAPE_GLOBAL_CLEAR_GRACE_MS = positiveNumber(
  process.env.DETOUR_OBSOLETE_SHAPE_GLOBAL_CLEAR_GRACE_MS,
  45 * 60 * 1000
);
const CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE = positiveInteger(
  process.env.DETOUR_V2_CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE,
  20
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

function buildDetour(candidate, shapes, detectorConfig = {}, currentOffRouteVehicleIds = new Set()) {
  const geometry = buildGeometry(candidate, shapes, detectorConfig);
  const riderVisible = geometry.canShowDetourPath === true;
  const currentVehicleIds = new Set(currentOffRouteVehicleIds || []);
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
  return {
    routeId: candidate.routeId,
    detourVersion: 'v2',
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
    riderVisibilityReason: riderVisible ? 'v2-confirmed' : 'insufficient-geometry',
    staleForReview: !riderVisible,
    canShowDetourPath: geometry.canShowDetourPath,
    geometry,
    detourZone,
    clearWindow: clearWindows[0] ||
      buildClearWindow(detourZone, getShapeLengthMeters(shapes, candidate.shapeId)),
    clearWindows,
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
    clearWindow: cloneJson(detour.clearWindow),
    clearWindows: cloneJson(detour.clearWindows),
    clearedSegments: cloneJson(detour.clearedSegments) || [],
  };
}

function restoreDetour(routeId, data = {}) {
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
  const candidates = new Map();
  const activeDetours = new Map();
  const clearTracks = new Map();
  const pendingSegmentClears = new Map();
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
    candidates.clear();
    activeDetours.clear();
    clearTracks.clear();
    pendingSegmentClears.clear();
    projectionDiagnostics.clear();
  }

  function getCandidate(routeId, shapeId) {
    const existing = candidates.get(routeId);
    if (existing && existing.shapeId === shapeId) return existing;
    const candidate = makeCandidate(routeId, shapeId);
    candidates.set(routeId, candidate);
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
    const minCoverageRatio = Number.isFinite(Number(clearWindow.minCoverageRatio))
      ? Number(clearWindow.minCoverageRatio)
      : CLEAR_WINDOW_MIN_COVERAGE_RATIO;
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

  function getClearableSegmentsFromTrack(detour, track) {
    return getDetourClearSegments(detour)
      .filter((item) => isClearWindowClearedByTrack(item.clearWindow, track));
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
    const minCoverageRatio = Number.isFinite(Number(clearWindow.minCoverageRatio))
      ? Number(clearWindow.minCoverageRatio)
      : CLEAR_WINDOW_MIN_COVERAGE_RATIO;

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

  function enqueueSegmentClears(routeId, clearSegments, currentTickId, clearPendingAt) {
    if (!routeId || !Array.isArray(clearSegments) || clearSegments.length === 0) return;
    const entries = pendingSegmentClears.get(routeId) || [];
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
    if (entries.length > 0) pendingSegmentClears.set(routeId, entries);
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

  function currentOffRouteEvidenceMatchesWindow(points = [], clearWindow = {}) {
    return points.some((point) => pointMatchesProgressWindow(point, clearWindow));
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
    for (const [routeId, pendingClears] of [...pendingSegmentClears.entries()]) {
      const detour = activeDetours.get(routeId);
      const candidate = candidates.get(routeId);
      if (!detour || detour.state === 'clear-pending') {
        pendingSegmentClears.delete(routeId);
        continue;
      }

      const currentOffRoutePoints = offRoutePointsByRoute.get(routeId) || [];
      const applied = [];
      for (const pendingClear of pendingClears) {
        if (currentOffRouteEvidenceMatchesWindow(currentOffRoutePoints, pendingClear.clearWindow)) {
          continue;
        }
        appendClearedSegment(detour, pendingClear);
        pruneCandidateForClearedWindow(candidate, pendingClear.clearWindow, pendingClear.clearPendingAt);
        applied.push(pendingClear);
      }

      pendingSegmentClears.delete(routeId);

      if (applied.length > 0 && (!candidate || !hasEnoughEvidence(candidate))) {
        markNormalRouteClearPending(detour, currentTickId);
      }
    }
  }

  function carryForwardDetourMetadata(detour, previousDetour) {
    if (!detour || !previousDetour) return detour;
    detour.detectedAt = previousDetour.detectedAt || detour.detectedAt;
    detour.triggerVehicleId = previousDetour.triggerVehicleId || detour.triggerVehicleId;
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

  function trackClearSample(routeId, signature, sample, currentTickId) {
    const detour = activeDetours.get(routeId);
    if (!detour || detour.state === 'clear-pending') return;
    if (sample.timestampMs <= Number(detour.latestGpsEvidenceAt || 0)) return;

    const routeTracks = clearTracks.get(routeId) || new Map();
    const track = routeTracks.get(signature) || [];
    const normalizedSample = normalizeClearTrackSample({
      ...sample,
      signature,
    });
    if (!normalizedSample || !sampleMatchesDetourZone(detour, normalizedSample)) return;
    track.push(normalizedSample);
    routeTracks.set(signature, track.slice(-CLEAR_TRACK_MAX_SAMPLES_PER_SIGNATURE));
    clearTracks.set(routeId, routeTracks);

    const trackClearedSegments = getClearableSegmentsFromTrack(detour, track);
    if (trackClearedSegments.length > 0) {
      const clearPendingAt = track
        .map((item) => Number(item.timestampMs))
        .filter(Number.isFinite)
        .reduce((max, value) => Math.max(max, value), sample.timestampMs);
      enqueueSegmentClears(routeId, trackClearedSegments, currentTickId, clearPendingAt);
      return;
    }

    const collectivelyClearedSegments = getClearableSegmentsFromCollectiveTracks(detour, routeTracks);
    if (collectivelyClearedSegments.length > 0) {
      const samples = getUsableClearTrackSamples(detour, routeTracks);
      const clearPendingAt = samples
        .map((item) => Number(item.timestampMs))
        .filter(Number.isFinite)
        .reduce((max, value) => Math.max(max, value), sample.timestampMs);
      enqueueSegmentClears(routeId, collectivelyClearedSegments, currentTickId, clearPendingAt);
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
    const offRouteThisTick = new Set();
    const currentOffRouteVehicleIdsByRoute = new Map();
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
        offRouteThisTick.add(routeId);
        clearTracks.delete(routeId);
        const offRoutePoints = offRoutePointsThisTickByRoute.get(routeId) || [];
        offRoutePoints.push({
          progressMeters: projection.progressMeters,
          timestampMs,
          shapeId: projection.shapeId,
          vehicleId: id,
          signature,
        });
        offRoutePointsThisTickByRoute.set(routeId, offRoutePoints);
        const currentOffRouteVehicleIds = currentOffRouteVehicleIdsByRoute.get(routeId) || new Set();
        currentOffRouteVehicleIds.add(id);
        currentOffRouteVehicleIdsByRoute.set(routeId, currentOffRouteVehicleIds);
        const candidate = getCandidate(routeId, projection.shapeId);
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

        if (hasEnoughEvidence(candidate)) {
          const previousDetour = activeDetours.get(routeId);
          const detour = buildDetour(
            candidate,
            shapes,
            config,
            currentOffRouteVehicleIdsByRoute.get(routeId)
          );
          if (previousDetour) {
            carryForwardDetourMetadata(detour, previousDetour);
          }
          activeDetours.set(routeId, detour);
        }
      } else if (projection.distanceMeters <= onRouteClearThresholdMeters) {
        trackClearSample(routeId, signature, {
          progressMeters: projection.progressMeters,
          timestampMs,
          shapeId: projection.shapeId,
          vehicleId: id,
        }, tickId);
      }
    }

    applyPendingSegmentClears(tickId, offRoutePointsThisTickByRoute);

    for (const [routeId, candidate] of candidates.entries()) {
      if (!hasEnoughEvidence(candidate)) continue;
      const previousDetour = activeDetours.get(routeId);
      if (previousDetour?.state === 'clear-pending') continue;
      const detour = buildDetour(
        candidate,
        shapes,
        config,
        currentOffRouteVehicleIdsByRoute.get(routeId)
      );
      if (previousDetour) {
        carryForwardDetourMetadata(detour, previousDetour);
      }
      activeDetours.set(routeId, detour);
    }

    for (const [routeId, detour] of activeDetours.entries()) {
      maybeApplyObsoleteShapeGlobalClear(
        routeId,
        detour,
        routeProjectionSummaries.get(routeId),
        tickId,
        routeShapeMapping
      );
    }

    for (const [routeId, detour] of [...activeDetours.entries()]) {
      if (
        detour.state === 'clear-pending' &&
        tickId > detour.clearPendingTick &&
        !offRouteThisTick.has(routeId)
      ) {
        activeDetours.delete(routeId);
        candidates.delete(routeId);
        clearTracks.delete(routeId);
        pendingSegmentClears.delete(routeId);
      }
    }

    lastReportedDetours = {};
    for (const [routeId, detour] of activeDetours.entries()) {
      lastReportedDetours[routeId] = snapshotDetour(detour);
    }
    enrichDetourMapStopImpacts(lastReportedDetours, shapes, stopImpactData);
    return lastReportedDetours;
  }

  function getState() {
    const detours = Object.fromEntries(
      [...activeDetours.entries()].map(([routeId, detour]) => [routeId, {
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
    const candidateEvidence = Object.fromEntries(
      [...candidates.entries()].map(([routeId, candidate]) => [routeId, {
        routeId,
        pointCount: candidate.points.length,
        uniqueSignatureCount: candidate.signatures.size,
        oldestMs: candidate.firstSeenAt,
        newestMs: candidate.lastSeenAt,
        shapeId: candidate.shapeId,
      }])
    );

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
      [...candidates.entries()].map(([routeId, candidate]) => [routeId, {
        pointCount: candidate.points.length,
        uniqueVehicles: candidate.vehicleIds.size,
        oldestMs: candidate.firstSeenAt,
        newestMs: candidate.lastSeenAt,
      }])
    );
  }

  function getRawDetourEvidence() {
    return Object.fromEntries(
      [...candidates.entries()].map(([routeId, candidate]) => [routeId, {
        routeId,
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

  function getRouteDebug(routeId) {
    const route = normalizeRouteId(routeId);
    return {
      routeId: route,
      candidateEvidence: getState().candidateEvidence[route] || null,
      snapshot: lastReportedDetours[route] ? serializeDetour(lastReportedDetours[route]) : null,
      projectionDiagnostics: [...projectionDiagnostics.values()]
        .filter((diagnostic) => diagnostic.routeId === route),
    };
  }

  function serializeClearTracks() {
    return Object.fromEntries(
      [...clearTracks.entries()].map(([routeId, routeTracks]) => [
        routeId,
        Object.fromEntries(
          [...routeTracks.entries()].map(([signature, track]) => [
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

  function hydrateClearTracks(snapshotClearTracks = {}) {
    for (const [routeId, routeTracks] of Object.entries(snapshotClearTracks || {})) {
      const detour = activeDetours.get(routeId);
      if (!detour || detour.state === 'clear-pending') continue;

      const hydratedRouteTracks = new Map();
      for (const [signature, track] of Object.entries(routeTracks || {})) {
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
          hydratedRouteTracks.set(signature, samples);
        }
      }

      if (hydratedRouteTracks.size > 0) {
        clearTracks.set(routeId, hydratedRouteTracks);
      }
    }
  }

  function serializeDetectorRuntimeState() {
    return {
      detourVersion: 'v2',
      candidates: [...candidates.entries()].map(([routeId, candidate]) => ({
        routeId,
        shapeId: candidate.shapeId,
        points: candidate.points,
      })),
      activeDetours: Object.fromEntries(
        [...activeDetours.entries()].map(([routeId, detour]) => [routeId, serializeDetour(detour)])
      ),
      clearTracks: serializeClearTracks(),
      seenSamples: [...seenSamples].slice(-500),
    };
  }

  function hydrateRuntimeState(snapshot = {}) {
    clearVehicleState();
    (snapshot.seenSamples || []).forEach((key) => seenSamples.add(key));
    for (const item of snapshot.candidates || []) {
      const candidate = makeCandidate(item.routeId, item.shapeId);
      for (const point of item.points || []) {
        addPointToCandidate(candidate, point);
      }
      candidates.set(item.routeId, candidate);
    }
    for (const [routeId, detour] of Object.entries(snapshot.activeDetours || {})) {
      activeDetours.set(routeId, restoreDetour(routeId, detour));
    }
    hydrateClearTracks(snapshot.clearTracks || {});
  }

  function hydrateActiveDetourSnapshots(records = {}) {
    let count = 0;
    for (const [routeId, record] of Object.entries(records || {})) {
      if (activeDetours.has(routeId)) continue;
      activeDetours.set(routeId, restoreDetour(routeId, {
        ...record,
        geometry: record.geometry || record,
        vehiclesOffRoute: record.matchedVehicleIds || [],
      }));
      count += 1;
    }
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
      pendingSegmentClears.delete(routeId);
      clearTracks.delete(routeId);
      candidates.delete(routeId);
      return activeDetours.delete(routeId);
    },
  };
}

module.exports = {
  createDetourV2Detector,
};
