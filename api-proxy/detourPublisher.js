const { getDb } = require('./firebaseAdmin');
const { DETOUR_PATH_LABEL, matchDetourGeometry } = require('./detourRoadMatcher');
const { shouldAutoClearStaleDetour } = require('./detour/staleClear');
const { normalizeDetourGeometryOrientation } = require('./detour/geometry/pathOrientation');
const { filterNonClosureSelfLoopSegments } = require('./detour/geometry/segmentValidity');

const ACTIVE_COLLECTION = 'activeDetours';
const HISTORY_COLLECTION = 'detourHistory';
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const HISTORY_MAX_LIMIT = 200;
const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_RETENTION_DAYS = Number.parseInt(process.env.DETOUR_HISTORY_RETENTION_DAYS || '30', 10);
const HISTORY_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const HISTORY_ENABLED = process.env.DETOUR_HISTORY_ENABLED
  ? process.env.DETOUR_HISTORY_ENABLED === 'true'
  : true;

const configuredGeoThrottleMs = Number.parseFloat(
  process.env.DETOUR_GEOMETRY_WRITE_THROTTLE_MS || '120000'
);
const GEOMETRY_WRITE_THROTTLE_MS =
  Number.isFinite(configuredGeoThrottleMs) && configuredGeoThrottleMs >= 0
    ? configuredGeoThrottleMs
    : 120_000;
// Minimum point count change to trigger a geometry write within throttle window
const GEOMETRY_POINT_CHANGE_THRESHOLD = 5;

const lastPublishedIds = new Set();
const lastPublishedState = new Map();
const lastSeenUpdateTime = new Map();
const lastGeometryWriteTime = new Map();
const lastKnownGeometry = new Map(); // Tracks geometry state for throttle decisions
let hydratePromise = null;
let lastHistoryPruneAt = 0;

function getRouteFamilyId(routeId) {
  const normalized = String(routeId || '').trim().toUpperCase();
  const match = normalized.match(/^(\d+)[A-Z]$/);
  return match ? match[1] : normalized;
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') {
    const dateValue = value.toDate();
    return dateValue instanceof Date ? dateValue.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value, fallbackMs) {
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();

  const valueMs = toMillis(value);
  if (valueMs != null) return new Date(valueMs);

  if (Number.isFinite(fallbackMs)) return new Date(fallbackMs);
  return new Date();
}

function normalizeVehicleCount(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableHash(value) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getPointKey(point, precision = 3) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${latitude.toFixed(precision)},${longitude.toFixed(precision)}`;
}

function getClosedSegmentSignature(segment) {
  const skipped = Array.isArray(segment?.skippedSegmentPolyline)
    ? segment.skippedSegmentPolyline.filter(Boolean)
    : [];
  const points = skipped.length >= 2
    ? [skipped[0], skipped[skipped.length - 1]]
    : [segment?.entryPoint, segment?.exitPoint];
  const keys = points.map((point) => getPointKey(point)).filter(Boolean).sort();
  return keys.length >= 2 ? `closed:${keys.join('|')}` : '';
}

function getRoadSignature(segment) {
  const names = Array.isArray(segment?.likelyDetourRoadNames)
    ? segment.likelyDetourRoadNames
    : [];
  const normalized = names
    .map((roadName) => String(roadName || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return normalized.length > 0 ? `roads:${[...new Set(normalized)].join('|')}` : '';
}

function buildDetourEventId(routeId, segment = {}) {
  const familyId = getRouteFamilyId(routeId) || 'unknown';
  const signature =
    getClosedSegmentSignature(segment) ||
    getRoadSignature(segment) ||
    `route:${familyId}:unknown`;
  return `detour-event-${stableHash(signature)}`;
}

function buildNormalizedDetourEventId(routeId, segment = {}) {
  if (segment?.debug?.sharedLocationHandoffEnabled && segment?.detourEventId) {
    return segment.detourEventId;
  }
  const physicalSignature = getClosedSegmentSignature(segment) || getRoadSignature(segment);
  if (physicalSignature) return `detour-event-${stableHash(physicalSignature)}`;
  return segment?.detourEventId || buildDetourEventId(routeId, segment);
}

function withDetourEventIds(routeId, geo = {}) {
  const segments = Array.isArray(geo?.segments) ? geo.segments : [];
  const annotatedSegments = segments.map((segment) => ({
    ...segment,
    detourEventId: buildNormalizedDetourEventId(routeId, segment),
  }));
  const primarySegment = annotatedSegments[0] || null;
  return {
    ...geo,
    detourEventId:
      primarySegment?.detourEventId ||
      buildNormalizedDetourEventId(routeId, geo),
    segments: annotatedSegments,
  };
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

function hasGeometryPayload(source) {
  return [
    'shapeId',
    'segments',
    'entryPoint',
    'exitPoint',
    'skippedSegmentPolyline',
    'inferredDetourPolyline',
    'canShowDetourPath',
    'likelyDetourPolyline',
    'likelyDetourRoadNames',
    'roadMatchConfidence',
    'detourPathLabel',
  ].some((key) => hasOwn(source, key));
}

function polylineSignature(polyline) {
  if (!Array.isArray(polyline) || polyline.length === 0) return '';
  const first = polyline[0] || {};
  const last = polyline[polyline.length - 1] || {};
  return [
    polyline.length,
    first.latitude ?? first.lat ?? '',
    first.longitude ?? first.lon ?? '',
    last.latitude ?? last.lat ?? '',
    last.longitude ?? last.lon ?? '',
  ].join(':');
}

function geometrySignatureFromSegments(segments) {
  if (!Array.isArray(segments)) return '';
  return segments
    .map((segment) => {
      const entry = segment?.entryPoint;
      const exit = segment?.exitPoint;
      return [
        segment?.shapeId || '',
        entry?.latitude ?? entry?.lat ?? '',
        entry?.longitude ?? entry?.lon ?? '',
        exit?.latitude ?? exit?.lat ?? '',
        exit?.longitude ?? exit?.lon ?? '',
        segment?.canShowDetourPath === true ? 'show-path' : segment?.canShowDetourPath === false ? 'hide-path' : '',
        segment?.detourEventId || '',
        polylineSignature(segment?.skippedSegmentPolyline),
        polylineSignature(segment?.likelyDetourPolyline),
        polylineSignature(segment?.inferredDetourPolyline),
        (segment?.likelyDetourRoadNames || []).join(','),
      ].join(':');
    })
    .join('|');
}

function hasBoundaryDebug(segment) {
  const debug = segment?.debug || {};
  return [
    'entryCandidateCount',
    'exitCandidateCount',
    'hasEntryBoundaryCandidate',
    'hasExitBoundaryCandidate',
    'entryAnchorSource',
    'exitAnchorSource',
  ].some((key) => hasOwn(debug, key));
}

function hasConfirmedBoundaryAnchorPair(segment) {
  if (!segment?.entryPoint || !segment?.exitPoint) return false;
  if (!hasBoundaryDebug(segment)) return true;

  const debug = segment.debug || {};
  if (debug.entryCandidateCount === 0 || debug.hasEntryBoundaryCandidate === false) {
    return false;
  }
  if (debug.entryAnchorSource === 'projected-evidence-fallback') {
    return false;
  }
  if (debug.exitCandidateCount === 0 || debug.hasExitBoundaryCandidate === false) {
    return false;
  }
  if (debug.exitAnchorSource === 'projected-evidence-fallback') {
    return false;
  }

  return true;
}

function clearRoadMatchedPath(target) {
  target.likelyDetourPolyline = null;
  target.likelyDetourRoadNames = [];
  target.roadMatchConfidence = null;
  target.roadMatchRawConfidence = null;
  target.roadMatchSource = null;
}

function getRenderableSegment(segment) {
  if (!segment) return false;
  return (
    Array.isArray(segment.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2
  ) || (
    Array.isArray(segment.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2
  ) || (
    Array.isArray(segment.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 2
  );
}

function hasLikelyDetourPath(source) {
  if (!source || typeof source !== 'object') return false;
  if (hasTrustedLikelyDetourPath(source)) {
    return true;
  }
  return Array.isArray(source.segments) && source.segments.some(hasTrustedLikelyDetourPath);
}

function hasTrustedLikelyDetourPath(source) {
  if (
    !source ||
    typeof source !== 'object' ||
    !Array.isArray(source.likelyDetourPolyline) ||
    source.likelyDetourPolyline.length < 2
  ) {
    return false;
  }

  const rawConfidence = Number(source.roadMatchRawConfidence);
  const confidenceLabel = String(source.roadMatchConfidence || '').toLowerCase();
  const roadMatchSource = String(source.roadMatchSource || '').toLowerCase();
  const endpointMismatchMeters = Number(source.debug?.untrustedPathEndpointMismatchMeters);
  if (Number.isFinite(endpointMismatchMeters) && endpointMismatchMeters > 45) return false;
  if (confidenceLabel === 'low') return false;
  if (Number.isFinite(rawConfidence) && rawConfidence < 0.45) return false;
  if (
    roadMatchSource === 'osrm-match' &&
    !['medium', 'high'].includes(confidenceLabel)
  ) {
    return false;
  }
  return true;
}

function getTrustedDetourPathSnapshot(source) {
  if (!source || typeof source !== 'object') return null;

  const rawSegments = Array.isArray(source.segments) ? source.segments : null;
  const segments = filterNonClosureSelfLoopSegments(rawSegments || []);
  if (rawSegments && rawSegments.length > 0 && segments.length === 0) return null;

  const trustedLikelySegment = segments.find(hasTrustedLikelyDetourPath);
  const trustedSegment = trustedLikelySegment || segments.find((segment) => (
    segment?.canShowDetourPath === true &&
    Array.isArray(segment?.inferredDetourPolyline) &&
    segment.inferredDetourPolyline.length >= 2
  ));

  const canUseTopLevelLikelyPath =
    hasTrustedLikelyDetourPath(source) &&
    (!rawSegments || rawSegments.length === 0 || Boolean(trustedLikelySegment));
  const likelyDetourPolyline =
    canUseTopLevelLikelyPath
      ? source.likelyDetourPolyline
      : trustedLikelySegment?.likelyDetourPolyline;
  const inferredDetourPolyline =
    Array.isArray(source.inferredDetourPolyline) && source.inferredDetourPolyline.length >= 2
      ? source.inferredDetourPolyline
      : trustedSegment?.inferredDetourPolyline;
  const path = likelyDetourPolyline || inferredDetourPolyline;

  if (!Array.isArray(path) || path.length < 2) return null;

  return {
    likelyDetourPolyline: cloneJson(likelyDetourPolyline || null),
    inferredDetourPolyline: cloneJson(inferredDetourPolyline || path),
    likelyDetourRoadNames: cloneJson(
      likelyDetourPolyline && source.likelyDetourRoadNames?.length
        ? source.likelyDetourRoadNames
        : likelyDetourPolyline
          ? trustedLikelySegment?.likelyDetourRoadNames || []
          : []
    ),
    roadMatchConfidence: likelyDetourPolyline
      ? source.roadMatchConfidence || trustedLikelySegment?.roadMatchConfidence || null
      : null,
    roadMatchRawConfidence: likelyDetourPolyline
      ? source.roadMatchRawConfidence ?? trustedLikelySegment?.roadMatchRawConfidence ?? null
      : null,
    roadMatchSource: likelyDetourPolyline
      ? source.roadMatchSource || trustedLikelySegment?.roadMatchSource || null
      : null,
    detourPathLabel: source.detourPathLabel || trustedSegment?.detourPathLabel || DETOUR_PATH_LABEL,
    segment: trustedSegment ? cloneJson(trustedSegment) : null,
  };
}

function hasTrustedInferredDetourPath(geometry) {
  if (!geometry || typeof geometry !== 'object') return false;
  if (
    geometry.canShowDetourPath === true &&
    Array.isArray(geometry.inferredDetourPolyline) &&
    geometry.inferredDetourPolyline.length >= 2
  ) {
    return true;
  }
  return Array.isArray(geometry.segments) && geometry.segments.some((segment) => (
    segment?.canShowDetourPath === true &&
    Array.isArray(segment.inferredDetourPolyline) &&
    segment.inferredDetourPolyline.length >= 2
  ));
}

function hasNonClosureSelfLoopSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  return filterNonClosureSelfLoopSegments(segments).length !== segments.length;
}

function clearUntrustedLikelyDetourPath(target) {
  if (
    target &&
    typeof target === 'object' &&
    Array.isArray(target.likelyDetourPolyline) &&
    target.likelyDetourPolyline.length >= 2 &&
    !hasTrustedLikelyDetourPath(target)
  ) {
    clearRoadMatchedPath(target);
  }
}

const TRUSTED_PATH_PRESERVE_MAX_ANCHOR_DISTANCE_METERS = 1000;
const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function distanceMeters(a, b) {
  if (
    !Number.isFinite(a?.latitude) ||
    !Number.isFinite(a?.longitude) ||
    !Number.isFinite(b?.latitude) ||
    !Number.isFinite(b?.longitude)
  ) {
    return Infinity;
  }
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function normalizeCoordinate(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function addPolylineEndpoints(points, polyline) {
  if (!Array.isArray(polyline) || polyline.length === 0) return;
  const first = normalizeCoordinate(polyline[0]);
  const last = normalizeCoordinate(polyline[polyline.length - 1]);
  if (first) points.push(first);
  if (last) points.push(last);
}

function collectGeometryAnchorPoints(source) {
  const points = [];
  if (!source || typeof source !== 'object') return points;

  for (const key of ['entryPoint', 'exitPoint']) {
    const point = normalizeCoordinate(source[key]);
    if (point) points.push(point);
  }
  for (const key of ['skippedSegmentPolyline', 'inferredDetourPolyline', 'likelyDetourPolyline']) {
    addPolylineEndpoints(points, source[key]);
  }
  for (const segment of Array.isArray(source.segments) ? source.segments : []) {
    points.push(...collectGeometryAnchorPoints(segment));
  }

  return points;
}

function geometryMatchesTrustedPathLocation(geometry, previousSnapshot, trusted) {
  const currentPoints = collectGeometryAnchorPoints(geometry);
  const previousPoints = collectGeometryAnchorPoints(previousSnapshot);
  addPolylineEndpoints(previousPoints, trusted?.likelyDetourPolyline);
  addPolylineEndpoints(previousPoints, trusted?.inferredDetourPolyline);

  if (currentPoints.length === 0 || previousPoints.length === 0) return true;

  const currentStart = currentPoints[0];
  const currentEnd = currentPoints[currentPoints.length - 1];
  const previousStart = previousPoints[0];
  const previousEnd = previousPoints[previousPoints.length - 1];
  const directMax = Math.max(
    distanceMeters(currentStart, previousStart),
    distanceMeters(currentEnd, previousEnd)
  );
  const reverseMax = Math.max(
    distanceMeters(currentStart, previousEnd),
    distanceMeters(currentEnd, previousStart)
  );

  return Math.min(directMax, reverseMax) <= TRUSTED_PATH_PRESERVE_MAX_ANCHOR_DISTANCE_METERS;
}

function preserveTrustedDetourPath(geometry, previousSnapshot, detour = {}) {
  if (!geometry || typeof geometry !== 'object') return geometry;
  if (detour?.state === 'clear-pending' || geometry?.state === 'clear-pending') return geometry;
  if (hasLikelyDetourPath(geometry)) return geometry;

  const trusted = getTrustedDetourPathSnapshot(previousSnapshot);
  if (!trusted) return geometry;
  if (!geometryMatchesTrustedPathLocation(geometry, previousSnapshot, trusted)) return geometry;

  const previousSegments = filterNonClosureSelfLoopSegments(
    Array.isArray(previousSnapshot?.segments)
      ? cloneJson(previousSnapshot.segments)
      : []
  );
  const next = {
    ...cloneJson(geometry),
    shapeId: previousSnapshot?.shapeId || geometry.shapeId || null,
    skippedSegmentPolyline: cloneJson(previousSnapshot?.skippedSegmentPolyline) || geometry.skippedSegmentPolyline || null,
    entryPoint: cloneJson(previousSnapshot?.entryPoint) || geometry.entryPoint || null,
    exitPoint: cloneJson(previousSnapshot?.exitPoint) || geometry.exitPoint || null,
    confidence: previousSnapshot?.confidence || geometry.confidence || null,
    evidencePointCount: previousSnapshot?.evidencePointCount ?? geometry.evidencePointCount ?? null,
    lastEvidenceAt: previousSnapshot?.lastEvidenceAt ?? geometry.lastEvidenceAt ?? null,
    segments: previousSegments,
  };
  next.preservedTrustedDetourPath = true;
  next.canShowDetourPath = true;
  next.likelyDetourPolyline = trusted.likelyDetourPolyline;
  next.inferredDetourPolyline =
    Array.isArray(previousSnapshot?.inferredDetourPolyline) && previousSnapshot.inferredDetourPolyline.length >= 2
      ? cloneJson(previousSnapshot.inferredDetourPolyline)
      : trusted.inferredDetourPolyline;
  next.likelyDetourRoadNames = trusted.likelyDetourRoadNames;
  next.roadMatchConfidence = trusted.roadMatchConfidence;
  next.roadMatchRawConfidence = trusted.roadMatchRawConfidence;
  next.roadMatchSource = trusted.roadMatchSource;
  next.detourPathLabel = trusted.detourPathLabel;

  const preservedSegment = {
    ...(trusted.segment || {}),
    canShowDetourPath: true,
    likelyDetourPolyline: trusted.likelyDetourPolyline,
    inferredDetourPolyline: trusted.inferredDetourPolyline,
    likelyDetourRoadNames: trusted.likelyDetourRoadNames,
    roadMatchConfidence: trusted.roadMatchConfidence,
    roadMatchRawConfidence: trusted.roadMatchRawConfidence,
    roadMatchSource: trusted.roadMatchSource,
    detourPathLabel: trusted.detourPathLabel,
  };

  if (Array.isArray(next.segments) && next.segments.length > 0) {
    const targetIndex = next.segments.findIndex((segment) => (
      !hasLikelyDetourPath(segment) && !hasTrustedInferredDetourPath(segment)
    ));
    const index = targetIndex >= 0 ? targetIndex : 0;
    next.segments[index] = {
      ...next.segments[index],
      ...preservedSegment,
      skippedSegmentPolyline: preservedSegment.skippedSegmentPolyline || next.segments[index]?.skippedSegmentPolyline || null,
      entryPoint: preservedSegment.entryPoint || next.segments[index]?.entryPoint || null,
      exitPoint: preservedSegment.exitPoint || next.segments[index]?.exitPoint || null,
      shapeId: preservedSegment.shapeId || next.segments[index]?.shapeId || next.shapeId || null,
    };
  } else if (trusted.segment) {
    next.segments = [{
      ...preservedSegment,
      shapeId: preservedSegment.shapeId || next.shapeId || null,
      skippedSegmentPolyline: next.skippedSegmentPolyline || preservedSegment.skippedSegmentPolyline || null,
      entryPoint: next.entryPoint || preservedSegment.entryPoint || null,
      exitPoint: next.exitPoint || preservedSegment.exitPoint || null,
    }];
  }

  return normalizeDetourGeometryOrientation(next);
}

function geometryBackfillSignature(geometry) {
  const segmentSignature = geometrySignatureFromSegments(geometry?.segments);
  if (segmentSignature) return segmentSignature;
  return polylineSignature(geometry?.inferredDetourPolyline);
}

function getRoadMatchBackfillSignatures(geometry) {
  if (!geometry || typeof geometry !== 'object') return [];

  const segments = filterNonClosureSelfLoopSegments(
    Array.isArray(geometry.segments) ? geometry.segments : []
  );
  const signatures = [];

  if (segments.length > 0) {
    for (const segment of segments) {
      if (
        segment?.canShowDetourPath === true &&
        Array.isArray(segment.inferredDetourPolyline) &&
        segment.inferredDetourPolyline.length >= 2 &&
        !hasTrustedLikelyDetourPath(segment)
      ) {
        const signature = polylineSignature(segment.inferredDetourPolyline);
        if (signature) signatures.push(signature);
      }
    }
  } else if (
    hasTrustedInferredDetourPath(geometry) &&
    !hasTrustedLikelyDetourPath(geometry)
  ) {
    const signature = geometryBackfillSignature(geometry);
    if (signature) signatures.push(signature);
  }

  return [...new Set(signatures)];
}

function shouldAttemptRoadMatchBackfill(geometry, previousSnapshot, knownGeometry) {
  const signatures = getRoadMatchBackfillSignatures(geometry);
  if (signatures.length === 0) return false;

  const segmentCount = Array.isArray(geometry?.segments)
    ? filterNonClosureSelfLoopSegments(geometry.segments).length
    : 0;
  if (segmentCount <= 1 && hasLikelyDetourPath(previousSnapshot)) {
    const trustedPreviousPath = getTrustedDetourPathSnapshot(previousSnapshot);
    if (
      trustedPreviousPath &&
      geometryMatchesTrustedPathLocation(geometry, previousSnapshot, trustedPreviousPath)
    ) {
      return false;
    }
  }

  const attempted = new Set(
    Array.isArray(knownGeometry?.roadMatchBackfillAttemptedSignatures)
      ? knownGeometry.roadMatchBackfillAttemptedSignatures
      : []
  );
  if (knownGeometry?.roadMatchBackfillAttemptedSignature) {
    attempted.add(knownGeometry.roadMatchBackfillAttemptedSignature);
  }

  return signatures.some(signature => !attempted.has(signature));
}

function enforceGeometryTrustGate(geometry) {
  if (!geometry || typeof geometry !== 'object') return geometry;

  const next = cloneJson(geometry);
  const originalSegmentCount = Array.isArray(next.segments) ? next.segments.length : 0;
  const segments = filterNonClosureSelfLoopSegments(Array.isArray(next.segments)
    ? next.segments.map((segment) => {
      const normalized = { ...segment };
      const hasConfirmedBoundaries = hasConfirmedBoundaryAnchorPair(normalized);

      if (!hasConfirmedBoundaries && hasBoundaryDebug(normalized)) {
        normalized.skippedSegmentPolyline = null;
      }

      if (normalized.canShowDetourPath !== true) {
        normalized.canShowDetourPath =
          normalized.canShowDetourPath === false || !hasConfirmedBoundaries
            ? false
            : normalized.canShowDetourPath;
      }

      if (normalized.canShowDetourPath === false) {
        clearRoadMatchedPath(normalized);
      } else {
        clearUntrustedLikelyDetourPath(normalized);
      }

      return normalized;
    })
    : []);

  if (Array.isArray(next.segments)) {
    next.segments = segments;
  }

  const primarySegment = segments.find(getRenderableSegment) || segments[0] || null;
  if (primarySegment) {
    next.skippedSegmentPolyline = primarySegment.skippedSegmentPolyline || null;
    next.inferredDetourPolyline = primarySegment.inferredDetourPolyline || null;
    next.entryPoint = primarySegment.entryPoint || null;
    next.exitPoint = primarySegment.exitPoint || null;

    if (Array.isArray(primarySegment.likelyDetourPolyline) && primarySegment.likelyDetourPolyline.length >= 2) {
      next.likelyDetourPolyline = primarySegment.likelyDetourPolyline;
      next.likelyDetourRoadNames = Array.isArray(primarySegment.likelyDetourRoadNames)
        ? primarySegment.likelyDetourRoadNames
        : [];
      next.roadMatchConfidence = primarySegment.roadMatchConfidence;
      next.roadMatchRawConfidence = primarySegment.roadMatchRawConfidence;
      next.roadMatchSource = primarySegment.roadMatchSource;
    } else {
      clearRoadMatchedPath(next);
    }

    if (primarySegment.canShowDetourPath != null) {
      next.canShowDetourPath = primarySegment.canShowDetourPath === true;
    }

    if (primarySegment.canShowDetourPath === false) {
      clearRoadMatchedPath(next);
    } else {
      clearUntrustedLikelyDetourPath(next);
    }
  } else if (originalSegmentCount > 0 && segments.length === 0) {
    next.canShowDetourPath = false;
    next.skippedSegmentPolyline = null;
    next.inferredDetourPolyline = null;
    next.entryPoint = null;
    next.exitPoint = null;
    clearRoadMatchedPath(next);
  } else if (next.canShowDetourPath === false) {
    clearRoadMatchedPath(next);
  } else {
    clearUntrustedLikelyDetourPath(next);
  }

  if (
    Array.isArray(next.segments) &&
    next.segments.length > 0 &&
    Array.isArray(next.likelyDetourPolyline) &&
    next.likelyDetourPolyline.length >= 2 &&
    !next.segments.some(hasTrustedLikelyDetourPath)
  ) {
    clearRoadMatchedPath(next);
  }

  return normalizeDetourGeometryOrientation(next);
}

function pickGeometryValue(doc, previousSnapshot, key, fallback = null) {
  if (hasOwn(doc, key)) return cloneJson(doc[key]) ?? fallback;
  if (hasOwn(previousSnapshot, key)) return cloneJson(previousSnapshot[key]) ?? fallback;
  return fallback;
}

function makeSnapshot(doc, previousSnapshot = null) {
  const usePreviousGeometry = !hasGeometryPayload(doc) && previousSnapshot;
  const segments = pickGeometryValue(doc, previousSnapshot, 'segments', []);
  const shapeId = pickGeometryValue(doc, previousSnapshot, 'shapeId', null);
  const entryPoint = pickGeometryValue(doc, previousSnapshot, 'entryPoint', null);
  const exitPoint = pickGeometryValue(doc, previousSnapshot, 'exitPoint', null);
  const skippedSegmentPolyline = pickGeometryValue(
    doc,
    previousSnapshot,
    'skippedSegmentPolyline',
    null
  );
  const inferredDetourPolyline = pickGeometryValue(
    doc,
    previousSnapshot,
    'inferredDetourPolyline',
    null
  );
  const likelyDetourPolyline = pickGeometryValue(
    doc,
    previousSnapshot,
    'likelyDetourPolyline',
    null
  );
  const canShowDetourPath = hasOwn(doc, 'canShowDetourPath')
    ? doc.canShowDetourPath
    : (previousSnapshot?.canShowDetourPath ?? null);
  const likelyDetourRoadNames = pickGeometryValue(
    doc,
    previousSnapshot,
    'likelyDetourRoadNames',
    []
  );
  const roadMatchConfidence = hasOwn(doc, 'roadMatchConfidence')
    ? doc.roadMatchConfidence || null
    : (previousSnapshot?.roadMatchConfidence || null);
  const roadMatchRawConfidence = hasOwn(doc, 'roadMatchRawConfidence')
    ? (doc.roadMatchRawConfidence ?? null)
    : (previousSnapshot?.roadMatchRawConfidence ?? null);
  const roadMatchSource = hasOwn(doc, 'roadMatchSource')
    ? doc.roadMatchSource || null
    : (previousSnapshot?.roadMatchSource || null);
  const detourPathLabel = hasOwn(doc, 'detourPathLabel')
    ? doc.detourPathLabel || DETOUR_PATH_LABEL
    : (previousSnapshot?.detourPathLabel || DETOUR_PATH_LABEL);
  const confidence = hasOwn(doc, 'confidence')
    ? doc.confidence || null
    : (previousSnapshot?.confidence || null);
  const evidencePointCount = hasOwn(doc, 'evidencePointCount')
    ? (doc.evidencePointCount ?? null)
    : (previousSnapshot?.evidencePointCount ?? null);
  const lastEvidenceAt = hasOwn(doc, 'lastEvidenceAt')
    ? (toMillis(doc.lastEvidenceAt) ?? null)
    : (previousSnapshot?.lastEvidenceAt ?? null);

  return {
    routeId: doc.routeId,
    detectedAtMs: toMillis(doc.detectedAt),
    lastSeenAtMs: toMillis(doc.lastSeenAt),
    updatedAtMs: toMillis(doc.updatedAt),
    triggerVehicleId: doc.triggerVehicleId || null,
    vehicleCount: normalizeVehicleCount(doc.vehicleCount),
    uniqueVehicleCount: normalizeVehicleCount(doc.uniqueVehicleCount ?? doc.vehicleCount),
    currentVehicleCount: normalizeVehicleCount(doc.currentVehicleCount ?? doc.vehicleCount),
    state: doc.state || 'active',
    clearReason: doc.clearReason || null,
    isPersistent: Boolean(doc.isPersistent),
    handoffSourceRouteId: hasOwn(doc, 'handoffSourceRouteId')
      ? doc.handoffSourceRouteId || null
      : previousSnapshot?.handoffSourceRouteId || null,
    shapeId,
    entryPoint,
    exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    canShowDetourPath,
    likelyDetourPolyline,
    likelyDetourRoadNames,
    roadMatchConfidence,
    roadMatchRawConfidence,
    roadMatchSource,
    detourPathLabel,
    detourEventId: hasOwn(doc, 'detourEventId')
      ? doc.detourEventId || null
      : previousSnapshot?.detourEventId || null,
    confidence,
    evidencePointCount,
    lastEvidenceAt,
    segments,
    segmentCount: Array.isArray(segments) ? segments.length : 0,
    geometrySignature: Array.isArray(segments)
      ? geometrySignatureFromSegments(segments)
      : (usePreviousGeometry ? previousSnapshot?.geometrySignature || '' : ''),
  };
}

function hasRenderableGeometry(geo) {
  if (!geo) return false;

  const segments = Array.isArray(geo.segments) ? geo.segments : [];
  if (segments.some((segment) =>
    (segment?.skippedSegmentPolyline?.length >= 2) ||
    (segment?.inferredDetourPolyline?.length >= 2) ||
    (segment?.likelyDetourPolyline?.length >= 2)
  )) {
    return true;
  }

  return (
    Array.isArray(geo.skippedSegmentPolyline) && geo.skippedSegmentPolyline.length >= 2
  ) || (
    Array.isArray(geo.inferredDetourPolyline) && geo.inferredDetourPolyline.length >= 2
  ) || (
    Array.isArray(geo.likelyDetourPolyline) && geo.likelyDetourPolyline.length >= 2
  );
}

function applyGeometryMetadata(doc, geo) {
  if (!geo || typeof geo !== 'object') return;

  if (hasOwn(geo, 'canShowDetourPath')) {
    doc.canShowDetourPath = geo.canShowDetourPath ?? null;
  }
  if (hasOwn(geo, 'confidence')) {
    doc.confidence = geo.confidence || null;
  }
  if (hasOwn(geo, 'evidencePointCount')) {
    doc.evidencePointCount = geo.evidencePointCount ?? null;
  }
  if (hasOwn(geo, 'lastEvidenceAt')) {
    doc.lastEvidenceAt = geo.lastEvidenceAt ?? null;
  }

  if (geo.canShowDetourPath === false) {
    doc.likelyDetourPolyline = null;
    doc.likelyDetourRoadNames = [];
    doc.roadMatchConfidence = null;
    doc.roadMatchRawConfidence = null;
    doc.roadMatchSource = null;
  }
}

/**
 * Determine if geometry should be written to Firestore this tick.
 * Writes are throttled to avoid write amplification on every 30s tick.
 * Uses lastKnownGeometry (not lastPublishedState) to avoid false positives
 * when geometry was suppressed on a previous tick.
 */
function shouldWriteGeometry(routeId, detour, previousSnapshot, now) {
  const lastGeoWrite = lastGeometryWriteTime.get(routeId) || 0;
  const timeSinceLastWrite = now - lastGeoWrite;
  const geo = detour.geometry;

  // No geometry to write
  if (!geo) return false;
  if (hasNonClosureSelfLoopSegments(previousSnapshot?.segments)) return true;

  // Always write on state change
  const prevState = previousSnapshot?.state || 'active';
  const currState = detour.state || 'active';
  if (prevState !== currState) return true;

  // Use the last-known geometry state (tracks actual geometry, not just what was written)
  const prevGeo = lastKnownGeometry.get(routeId);

  // Always write on confidence change
  const prevConfidence = prevGeo?.confidence || null;
  if (prevConfidence !== geo.confidence) return true;

  const prevRoadMatchConfidence = prevGeo?.roadMatchConfidence || null;
  if (prevRoadMatchConfidence !== (geo.roadMatchConfidence || null)) return true;

  const currentSegmentCount = Array.isArray(geo.segments) ? geo.segments.length : 0;
  const prevSegmentCount = prevGeo?.segmentCount ?? 0;
  if (currentSegmentCount !== prevSegmentCount) return true;

  const currentSignature = Array.isArray(geo.segments)
    ? geometrySignatureFromSegments(geo.segments)
    : '';
  if ((prevGeo?.geometrySignature || '') !== currentSignature) return true;

  // Write if point count changed significantly since last write
  const prevPointCount = prevGeo?.evidencePointCount ?? 0;
  const pointCountDelta = Math.abs((geo.evidencePointCount || 0) - prevPointCount);
  if (pointCountDelta >= GEOMETRY_POINT_CHANGE_THRESHOLD) return true;

  // Write if throttle window elapsed
  if (timeSinceLastWrite >= GEOMETRY_WRITE_THROTTLE_MS) return true;

  return false;
}

function buildDetectedEvent(routeId, current, now) {
  const detectedAt = current?.detectedAtMs ?? toMillis(current.detectedAt) ?? now;
  const event = {
    eventType: 'DETOUR_DETECTED',
    routeId,
    occurredAt: now,
    detectedAt,
    lastSeenAt: current?.lastSeenAtMs ?? toMillis(current.lastSeenAt) ?? detectedAt,
    triggerVehicleId: current.triggerVehicleId || null,
    vehicleCount: current.vehicleCount,
    uniqueVehicleCount: current.uniqueVehicleCount ?? current.vehicleCount,
    currentVehicleCount: current.currentVehicleCount ?? current.vehicleCount,
    confidence: current.confidence || null,
    evidencePointCount: current.evidencePointCount ?? null,
    lastEvidenceAt: current.lastEvidenceAt ?? null,
    source: 'detour-worker-v2',
  };
  if (current.shapeId) event.shapeId = current.shapeId;
  if (current.entryPoint) event.entryPoint = cloneJson(current.entryPoint);
  if (current.exitPoint) event.exitPoint = cloneJson(current.exitPoint);
  if (current.skippedSegmentPolyline) {
    event.skippedSegmentPolyline = cloneJson(current.skippedSegmentPolyline);
  }
  if (current.inferredDetourPolyline) {
    event.inferredDetourPolyline = cloneJson(current.inferredDetourPolyline);
  }
  if (current.likelyDetourPolyline) {
    event.likelyDetourPolyline = cloneJson(current.likelyDetourPolyline);
  }
  if (current.likelyDetourRoadNames?.length) {
    event.likelyDetourRoadNames = cloneJson(current.likelyDetourRoadNames);
  }
  if (current.roadMatchConfidence) event.roadMatchConfidence = current.roadMatchConfidence;
  if (current.detourPathLabel) event.detourPathLabel = current.detourPathLabel;
  if (current.segmentCount > 0) event.segmentCount = current.segmentCount;
  return event;
}

function buildUpdatedEvent(routeId, previous, current, now) {
  if (!previous) return null;

  const changedFields = [];
  if (previous.vehicleCount !== current.vehicleCount) changedFields.push('vehicleCount');
  if ((previous.uniqueVehicleCount ?? previous.vehicleCount) !== (current.uniqueVehicleCount ?? current.vehicleCount)) {
    changedFields.push('uniqueVehicleCount');
  }
  if ((previous.currentVehicleCount ?? previous.vehicleCount) !== (current.currentVehicleCount ?? current.vehicleCount)) {
    changedFields.push('currentVehicleCount');
  }
  if ((previous.triggerVehicleId || null) !== (current.triggerVehicleId || null)) {
    changedFields.push('triggerVehicleId');
  }
  if ((previous.state || 'active') !== (current.state || 'active')) changedFields.push('state');
  if ((previous.confidence || null) !== (current.confidence || null)) changedFields.push('confidence');
  if ((previous.roadMatchConfidence || null) !== (current.roadMatchConfidence || null)) {
    changedFields.push('roadMatchConfidence');
  }
  if ((previous.evidencePointCount ?? null) !== (current.evidencePointCount ?? null)) {
    changedFields.push('evidencePointCount');
  }
  if ((previous.clearReason || null) !== (current.clearReason || null)) {
    changedFields.push('clearReason');
  }

  if (changedFields.length === 0) return null;
  const detectedAt = current?.detectedAtMs ?? toMillis(current.detectedAt) ?? previous.detectedAtMs ?? now;

  return {
    eventType: 'DETOUR_UPDATED',
    routeId,
    occurredAt: now,
    detectedAt,
    lastSeenAt: current?.lastSeenAtMs ?? toMillis(current.lastSeenAt) ?? previous.lastSeenAtMs ?? detectedAt,
    triggerVehicleId: current.triggerVehicleId || null,
    previousTriggerVehicleId: previous.triggerVehicleId || null,
    vehicleCount: current.vehicleCount,
    previousVehicleCount: previous.vehicleCount,
    uniqueVehicleCount: current.uniqueVehicleCount ?? current.vehicleCount,
    currentVehicleCount: current.currentVehicleCount ?? current.vehicleCount,
    clearReason: current.clearReason || null,
    changedFields,
    source: 'detour-worker-v2',
  };
}

function buildClearedEvent(routeId, previous, now) {
  const detectedAt = previous?.detectedAtMs ?? null;
  const event = {
    eventType: 'DETOUR_CLEARED',
    routeId,
    occurredAt: now,
    detectedAt,
    clearedAt: now,
    durationMs: detectedAt != null ? Math.max(0, now - detectedAt) : null,
    triggerVehicleId: previous?.triggerVehicleId || null,
    previousVehicleCount: previous?.vehicleCount ?? 0,
    uniqueVehicleCount: previous?.uniqueVehicleCount ?? previous?.vehicleCount ?? 0,
    currentVehicleCount: previous?.currentVehicleCount ?? previous?.vehicleCount ?? 0,
    clearReason: previous?.clearReason || 'detector-cleared',
    confidence: previous?.confidence || null,
    evidencePointCount: previous?.evidencePointCount ?? null,
    lastEvidenceAt: previous?.lastEvidenceAt ?? null,
    source: 'detour-worker-v2',
  };
  if (previous?.shapeId) event.shapeId = previous.shapeId;
  if (previous?.entryPoint) event.entryPoint = cloneJson(previous.entryPoint);
  if (previous?.exitPoint) event.exitPoint = cloneJson(previous.exitPoint);
  if (previous?.skippedSegmentPolyline) {
    event.skippedSegmentPolyline = cloneJson(previous.skippedSegmentPolyline);
  }
  if (previous?.inferredDetourPolyline) {
    event.inferredDetourPolyline = cloneJson(previous.inferredDetourPolyline);
  }
  if (previous?.likelyDetourPolyline) {
    event.likelyDetourPolyline = cloneJson(previous.likelyDetourPolyline);
  }
  if (previous?.likelyDetourRoadNames?.length) {
    event.likelyDetourRoadNames = cloneJson(previous.likelyDetourRoadNames);
  }
  if (previous?.roadMatchConfidence) event.roadMatchConfidence = previous.roadMatchConfidence;
  if (previous?.detourPathLabel) event.detourPathLabel = previous.detourPathLabel;
  if (previous?.segmentCount > 0) event.segmentCount = previous.segmentCount;
  return event;
}

function buildStaleClearedEvent(routeId, previous, now, staleDecision = {}) {
  return {
    ...buildClearedEvent(routeId, previous, now),
    eventType: 'DETOUR_AUTO_CLEARED_STALE',
    clearReason: staleDecision.reason || 'stale-evidence',
    staleAgeMs: staleDecision.staleAgeMs ?? null,
    staleThresholdMs: staleDecision.thresholdMs ?? null,
    scheduledHeadwayMs: staleDecision.headwayMs ?? null,
    scheduleSource: staleDecision.scheduleSource || null,
    serviceDate: staleDecision.serviceDate || null,
  };
}

function rememberPublishedDetour(routeId, data = {}) {
  const normalized = {
    routeId,
    detectedAt: data.detectedAt || null,
    lastSeenAt: data.lastSeenAt || null,
    updatedAt: data.updatedAt || null,
    triggerVehicleId: data.triggerVehicleId || null,
    vehicleCount: normalizeVehicleCount(data.vehicleCount),
    uniqueVehicleCount: normalizeVehicleCount(data.uniqueVehicleCount ?? data.vehicleCount),
    currentVehicleCount: normalizeVehicleCount(data.currentVehicleCount ?? data.vehicleCount),
    state: data.state || 'active',
    clearReason: data.clearReason || null,
    handoffSourceRouteId: data.handoffSourceRouteId || null,
    confidence: data.confidence || null,
    roadMatchConfidence: data.roadMatchConfidence || null,
    roadMatchRawConfidence: data.roadMatchRawConfidence ?? null,
    roadMatchSource: data.roadMatchSource || null,
    detourPathLabel: data.detourPathLabel || DETOUR_PATH_LABEL,
    likelyDetourRoadNames: Array.isArray(data.likelyDetourRoadNames)
      ? data.likelyDetourRoadNames
      : [],
    evidencePointCount: data.evidencePointCount ?? null,
    lastEvidenceAt: data.lastEvidenceAt || null,
    segments: Array.isArray(data.segments) ? data.segments : [],
    shapeId: data.shapeId || null,
    skippedSegmentPolyline: data.skippedSegmentPolyline || null,
    inferredDetourPolyline: data.inferredDetourPolyline || null,
    likelyDetourPolyline: data.likelyDetourPolyline || null,
    canShowDetourPath: data.canShowDetourPath ?? null,
    entryPoint: data.entryPoint || null,
    exitPoint: data.exitPoint || null,
    detourEventId: data.detourEventId || null,
  };

  lastPublishedIds.add(routeId);
  lastPublishedState.set(routeId, makeSnapshot(normalized));

  const updatedAtMs = toMillis(normalized.updatedAt);
  if (updatedAtMs != null) {
    lastSeenUpdateTime.set(routeId, updatedAtMs);
    lastGeometryWriteTime.set(routeId, updatedAtMs);
  }

  const hydratedGeometry = {
    shapeId: data.shapeId || null,
    segments: Array.isArray(data.segments) ? data.segments : [],
    skippedSegmentPolyline: data.skippedSegmentPolyline || null,
    inferredDetourPolyline: data.inferredDetourPolyline || null,
    likelyDetourPolyline: data.likelyDetourPolyline || null,
    likelyDetourRoadNames: Array.isArray(data.likelyDetourRoadNames)
      ? data.likelyDetourRoadNames
      : [],
    confidence: data.confidence || null,
    roadMatchConfidence: data.roadMatchConfidence || null,
    roadMatchRawConfidence: data.roadMatchRawConfidence ?? null,
    roadMatchSource: data.roadMatchSource || null,
    detourPathLabel: data.detourPathLabel || DETOUR_PATH_LABEL,
    evidencePointCount: data.evidencePointCount ?? null,
    lastEvidenceAt: data.lastEvidenceAt || null,
  };
  if (hasRenderableGeometry(hydratedGeometry)) {
    lastKnownGeometry.set(routeId, {
      confidence: hydratedGeometry.confidence,
      roadMatchConfidence: hydratedGeometry.roadMatchConfidence,
      evidencePointCount: hydratedGeometry.evidencePointCount,
      lastEvidenceAt: hydratedGeometry.lastEvidenceAt,
      segmentCount: hydratedGeometry.segments.length,
      geometrySignature: geometrySignatureFromSegments(hydratedGeometry.segments),
    });
  }
}

async function refreshPublishedDetoursFromFirestore(db) {
  const snapshot = await db.collection(ACTIVE_COLLECTION).get();
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const routeId = data.routeId || doc.id;
    rememberPublishedDetour(routeId, data);
  });
  return snapshot.size;
}

async function writeHistoryEvent(db, event) {
  if (!HISTORY_ENABLED || !event) return;
  const suffix = Math.random().toString(36).slice(2, 8);
  const docId = `${event.occurredAt}-${event.routeId}-${event.eventType}-${suffix}`;
  await db.collection(HISTORY_COLLECTION).doc(docId).set(event);
}

async function hydratePublisherState(db) {
  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    try {
      const count = await refreshPublishedDetoursFromFirestore(db);
      if (count > 0) {
        console.log(`[detourPublisher] Hydrated ${count} active detours`);
      }
    } catch (err) {
      console.error('[detourPublisher] Failed to hydrate existing detours:', err.message);
    }
  })();

  await hydratePromise;
}

async function pruneHistoryIfNeeded(db, now) {
  if (!HISTORY_ENABLED) return;
  if (!Number.isFinite(HISTORY_RETENTION_DAYS) || HISTORY_RETENTION_DAYS <= 0) return;
  if ((now - lastHistoryPruneAt) < HISTORY_PRUNE_INTERVAL_MS) return;

  lastHistoryPruneAt = now;
  const cutoff = now - (HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    let totalDeleted = 0;
    for (let i = 0; i < 10; i++) {
      const snapshot = await db
        .collection(HISTORY_COLLECTION)
        .where('occurredAt', '<', cutoff)
        .orderBy('occurredAt', 'asc')
        .limit(200)
        .get();

      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += snapshot.size;

      if (snapshot.size < 200) break;
    }

    if (totalDeleted > 0) {
      console.log(
        `[detourPublisher] Pruned ${totalDeleted} detour history records older than ${HISTORY_RETENTION_DAYS} days`
      );
    }
  } catch (err) {
    console.error('[detourPublisher] Failed to prune detour history:', err.message);
  }
}

function normalizeHistoryDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...data,
    occurredAt: toMillis(data.occurredAt),
    detectedAt: toMillis(data.detectedAt),
    lastSeenAt: toMillis(data.lastSeenAt),
    clearedAt: toMillis(data.clearedAt),
  };
}

async function deletePublishedDetour(db, routeId, event, logPrefix = 'delete') {
  try {
    await db.collection(ACTIVE_COLLECTION).doc(routeId).delete();
    await writeHistoryEvent(db, event);
    lastPublishedIds.delete(routeId);
    lastPublishedState.delete(routeId);
    lastSeenUpdateTime.delete(routeId);
    lastGeometryWriteTime.delete(routeId);
    lastKnownGeometry.delete(routeId);
    return true;
  } catch (err) {
    console.error(`[detourPublisher] Failed to ${logPrefix} ${routeId}:`, err.message);
    return false;
  }
}

async function publishDetours(activeDetours, options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[detourPublisher] Firestore not configured — skipping publish');
    return;
  }
  await hydratePublisherState(db);

  const now = options.now || Date.now();
  const vehicles = Array.isArray(options.vehicles) ? options.vehicles : [];
  const scheduleIndex = options.scheduleIndex || options.gtfsData?.scheduleIndex || null;
  const activeEntries = Object.entries(activeDetours || {});
  const staleSuppressedDetours = new Map();
  const stalePublishSuppressedIds = new Set();
  const publishableDetours = Object.fromEntries(activeEntries.filter(([routeId, detour]) => {
    const staleDecision = shouldAutoClearStaleDetour({
      routeId,
      detour,
      previousSnapshot: lastPublishedState.get(routeId),
      vehicles,
      scheduleIndex,
      now,
    });
    if (staleDecision.shouldClear) {
      staleSuppressedDetours.set(routeId, staleDecision);
      return false;
    }
    if (staleDecision.validationOnly === true && staleDecision.reason === 'gps-clear-required') {
      // Low-confidence validation-only stale outputs are monitoring evidence.
      // Do not publish them as rider-facing active detours, and do not clear an
      // existing detour without normal-route GPS proof.
      stalePublishSuppressedIds.add(routeId);
      return false;
    }
    return true;
  }));
  const currentIds = new Set([
    ...Object.keys(publishableDetours),
    ...stalePublishSuppressedIds,
  ]);

  // Master cleanup pass: re-scan Firestore every publish cycle so orphaned
  // activeDetours docs are cleared even if they appeared after this process
  // finished its initial hydration.
  try {
    await refreshPublishedDetoursFromFirestore(db);
  } catch (err) {
    console.error('[detourPublisher] Failed to refresh active detours before cleanup:', err.message);
  }

  if (
    options.suppressDeletesWhenEmpty === true &&
    Object.keys(publishableDetours).length === 0 &&
    stalePublishSuppressedIds.size === 0
  ) {
    console.warn(
      `[detourPublisher] Suppressing activeDetours deletion: ${options.suppressDeleteReason || 'unknown'}`
    );
    return;
  }

  const removedIds = [...lastPublishedIds].filter(id => !currentIds.has(id));
  for (const routeId of removedIds) {
    const previous = lastPublishedState.get(routeId);
    const staleDecision = staleSuppressedDetours.get(routeId) || shouldAutoClearStaleDetour({
      routeId,
      detour: null,
      previousSnapshot: previous,
      vehicles,
      scheduleIndex,
      now,
    });
    const wasNormalRouteClear = previous?.clearReason === 'normal-route-observed';
    const event = staleDecision.shouldClear && !wasNormalRouteClear
      ? buildStaleClearedEvent(routeId, previous, now, staleDecision)
      : buildClearedEvent(routeId, previous, now);
    await deletePublishedDetour(db, routeId, event);
  }

  for (const [routeId, detour] of Object.entries(publishableDetours)) {
    const isNew = !lastPublishedIds.has(routeId);
    const lastUpdate = lastSeenUpdateTime.get(routeId) || 0;
    const shouldUpdateLastSeen = isNew || (now - lastUpdate >= LAST_SEEN_THROTTLE_MS);
    const previousSnapshot = lastPublishedState.get(routeId);

    const doc = {
      routeId,
      detectedAt: toDate(detour.detectedAt, now),
      updatedAt: now,
      triggerVehicleId: detour.triggerVehicleId || null,
      vehicleCount: detour.vehiclesOffRoute && detour.vehiclesOffRoute.size > 0
        ? normalizeVehicleCount(detour.vehicleCount ?? detour.vehiclesOffRoute.size)
        : normalizeVehicleCount(detour.vehicleCount),
      uniqueVehicleCount: normalizeVehicleCount(detour.uniqueVehicleCount ?? detour.vehicleCount),
      currentVehicleCount: detour.vehiclesOffRoute && detour.vehiclesOffRoute.size >= 0
        ? detour.vehiclesOffRoute.size
        : normalizeVehicleCount(detour.currentVehicleCount ?? 0),
      state: detour.state || 'active',
      clearReason: detour.clearReason || null,
      isPersistent: Boolean(detour.isPersistent),
      handoffSourceRouteId: detour.handoffSourceRouteId || null,
    };

    if (shouldUpdateLastSeen) {
      doc.lastSeenAt = toDate(detour.lastSeenAt, now);
    }

    // Geometry write throttle: only write geometry when criteria are met.
    // Optional road matching decorates the inferred GPS path as a rider-facing
    // "likely detour path" only when we are already going to write geometry,
    // so active detours do not generate map-matching traffic every tick.
    let geo = preserveTrustedDetourPath(
      enforceGeometryTrustGate(detour.geometry),
      previousSnapshot,
      detour
    );
    if (hasRenderableGeometry(geo)) {
      geo = withDetourEventIds(routeId, geo);
    }
    let detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
    applyGeometryMetadata(doc, geo);
    let writeGeo = hasRenderableGeometry(geo) &&
      (isNew || shouldWriteGeometry(routeId, detourForGeometry, previousSnapshot, now));
    if (
      geo?.preservedTrustedDetourPath === true &&
      previousSnapshot &&
      !hasNonClosureSelfLoopSegments(previousSnapshot?.segments) &&
      now - (lastGeometryWriteTime.get(routeId) || 0) < GEOMETRY_WRITE_THROTTLE_MS
    ) {
      writeGeo = false;
    }
    const knownGeometry = lastKnownGeometry.get(routeId);
    const shouldBackfillRoadMatch = !writeGeo &&
      shouldAttemptRoadMatchBackfill(geo, previousSnapshot, knownGeometry);
    const roadMatchBackfillAttemptedSignatures = shouldBackfillRoadMatch
      ? getRoadMatchBackfillSignatures(geo)
      : [];
    const roadMatchBackfillAttemptedSignature = roadMatchBackfillAttemptedSignatures[0] || null;

    if ((writeGeo || shouldBackfillRoadMatch) && geo) {
      try {
        geo = await matchDetourGeometry(geo);
        detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
      } catch (err) {
        console.warn('[detourPublisher] Road matching skipped:', err.message);
      }
      geo = preserveTrustedDetourPath(geo, previousSnapshot, detour);
      if (hasRenderableGeometry(geo)) {
        geo = withDetourEventIds(routeId, geo);
      }
      detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
      writeGeo = hasRenderableGeometry(geo) &&
        (isNew || shouldWriteGeometry(routeId, detourForGeometry, previousSnapshot, now));
      if (
        geo?.preservedTrustedDetourPath === true &&
        previousSnapshot &&
        !hasNonClosureSelfLoopSegments(previousSnapshot?.segments) &&
        now - (lastGeometryWriteTime.get(routeId) || 0) < GEOMETRY_WRITE_THROTTLE_MS
      ) {
        writeGeo = false;
      }
    }
    if (writeGeo && geo) {
      doc.shapeId = geo.shapeId || null;
      doc.segments = geo.segments || [];
      doc.skippedSegmentPolyline = geo.skippedSegmentPolyline || null;
      doc.inferredDetourPolyline = geo.inferredDetourPolyline || null;
      doc.canShowDetourPath = geo.canShowDetourPath ?? null;
      doc.likelyDetourPolyline = geo.likelyDetourPolyline || null;
      doc.likelyDetourRoadNames = Array.isArray(geo.likelyDetourRoadNames)
        ? geo.likelyDetourRoadNames
        : [];
      doc.roadMatchConfidence = geo.roadMatchConfidence || null;
      doc.roadMatchRawConfidence = geo.roadMatchRawConfidence ?? null;
      doc.roadMatchSource = geo.roadMatchSource || null;
      doc.detourPathLabel = geo.detourPathLabel || DETOUR_PATH_LABEL;
      doc.detourEventId = geo.detourEventId || null;
      doc.entryPoint = geo.entryPoint || null;
      doc.exitPoint = geo.exitPoint || null;
      doc.confidence = geo.confidence || null;
      doc.evidencePointCount = geo.evidencePointCount ?? null;
      doc.lastEvidenceAt = geo.lastEvidenceAt ?? null;
    }

    try {
      await db.collection(ACTIVE_COLLECTION).doc(routeId).set(doc, { merge: true });
      const currentSnapshot = makeSnapshot(doc, previousSnapshot);
      if (isNew) {
        await writeHistoryEvent(db, buildDetectedEvent(routeId, currentSnapshot, now));
      } else {
        await writeHistoryEvent(db, buildUpdatedEvent(routeId, previousSnapshot, currentSnapshot, now));
      }
      lastPublishedIds.add(routeId);
      lastPublishedState.set(routeId, currentSnapshot);
      if (shouldUpdateLastSeen) {
        lastSeenUpdateTime.set(routeId, now);
      }
      if (writeGeo && geo) {
        lastGeometryWriteTime.set(routeId, now);
      }
      // Always track geometry state for accurate throttle decisions on next tick
      if (geo) {
        lastKnownGeometry.set(routeId, {
          confidence: geo.confidence,
          roadMatchConfidence: geo.roadMatchConfidence || null,
          evidencePointCount: geo.evidencePointCount,
          lastEvidenceAt: geo.lastEvidenceAt,
          segmentCount: Array.isArray(geo.segments) ? geo.segments.length : 0,
          geometrySignature: Array.isArray(geo.segments)
            ? geometrySignatureFromSegments(geo.segments)
            : '',
          roadMatchBackfillAttemptedSignature: geo.roadMatchSource
            ? null
            : (
              roadMatchBackfillAttemptedSignature ||
              knownGeometry?.roadMatchBackfillAttemptedSignature ||
              null
            ),
          roadMatchBackfillAttemptedSignatures: geo.roadMatchSource
            ? roadMatchBackfillAttemptedSignatures
            : (
              roadMatchBackfillAttemptedSignatures.length > 0
                ? roadMatchBackfillAttemptedSignatures
                : (
                  Array.isArray(knownGeometry?.roadMatchBackfillAttemptedSignatures)
                    ? knownGeometry.roadMatchBackfillAttemptedSignatures
                    : []
                )
            ),
        });
      }
    } catch (err) {
      console.error(`[detourPublisher] Failed to write ${routeId}:`, err.message);
    }
  }

  await pruneHistoryIfNeeded(db, now);
}

async function getDetourHistory(options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[detourPublisher] Firestore not configured — detour history unavailable');
    return [];
  }

  const parsedLimit = Number.parseInt(String(options.limit ?? HISTORY_DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), HISTORY_MAX_LIMIT)
    : HISTORY_DEFAULT_LIMIT;

  const routeId = options.routeId ? String(options.routeId).trim() : '';
  const eventTypes = Array.isArray(options.eventTypes)
    ? options.eventTypes
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean)
    : [];

  const startMs = Number.isFinite(options.startMs) ? options.startMs : null;
  const endMs = Number.isFinite(options.endMs) ? options.endMs : null;

  let query = db.collection(HISTORY_COLLECTION).orderBy('occurredAt', 'desc');
  if (startMs != null) {
    query = query.where('occurredAt', '>=', startMs);
  }
  if (endMs != null) {
    query = query.where('occurredAt', '<=', endMs);
  }

  const needsFilter = Boolean(routeId) || eventTypes.length > 0;
  const fetchLimit = needsFilter
    ? Math.min(1000, Math.max(limit * 10, limit))
    : limit;

  const snapshot = await query.limit(fetchLimit).get();
  let logs = snapshot.docs.map(normalizeHistoryDoc);

  if (routeId) {
    logs = logs.filter((entry) => entry.routeId === routeId);
  }

  if (eventTypes.length > 0) {
    const allowedTypes = new Set(eventTypes);
    logs = logs.filter((entry) => allowedTypes.has(String(entry.eventType || '').toUpperCase()));
  }

  return logs.slice(0, limit);
}

function getLastPublishedIds() {
  return new Set(lastPublishedIds);
}

module.exports = {
  publishDetours,
  getLastPublishedIds,
  getDetourHistory,
  HISTORY_MAX_LIMIT,
  GEOMETRY_WRITE_THROTTLE_MS,
  // Exported for testing
  shouldWriteGeometry,
  shouldAttemptRoadMatchBackfill,
  enforceGeometryTrustGate,
  preserveTrustedDetourPath,
  buildDetourEventId,
  makeSnapshot,
  buildUpdatedEvent,
  buildDetectedEvent,
  buildClearedEvent,
  buildStaleClearedEvent,
};
