const { getDb } = require('./firebaseAdmin');
const { DETOUR_PATH_LABEL, matchDetourGeometry } = require('./detourRoadMatcher');
const { shouldAutoClearStaleDetour } = require('./detour/staleClear');

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
  if (Array.isArray(source.likelyDetourPolyline) && source.likelyDetourPolyline.length >= 2) {
    return true;
  }
  return Array.isArray(source.segments) && source.segments.some((segment) => (
    Array.isArray(segment?.likelyDetourPolyline) &&
    segment.likelyDetourPolyline.length >= 2
  ));
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

function geometryBackfillSignature(geometry) {
  const segmentSignature = geometrySignatureFromSegments(geometry?.segments);
  if (segmentSignature) return segmentSignature;
  return polylineSignature(geometry?.inferredDetourPolyline);
}

function shouldAttemptRoadMatchBackfill(geometry, previousSnapshot, knownGeometry) {
  if (!hasTrustedInferredDetourPath(geometry)) return false;
  if (hasLikelyDetourPath(geometry) || hasLikelyDetourPath(previousSnapshot)) return false;

  const signature = geometryBackfillSignature(geometry);
  if (!signature) return false;
  return knownGeometry?.roadMatchBackfillAttemptedSignature !== signature;
}

function enforceGeometryTrustGate(geometry) {
  if (!geometry || typeof geometry !== 'object') return geometry;

  const next = cloneJson(geometry);
  const segments = Array.isArray(next.segments)
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
      }

      return normalized;
    })
    : [];

  if (Array.isArray(next.segments)) {
    next.segments = segments;
  }

  const primarySegment = segments.find(getRenderableSegment) || segments[0] || null;
  if (primarySegment) {
    next.skippedSegmentPolyline = primarySegment.skippedSegmentPolyline || null;
    if (primarySegment.canShowDetourPath != null) {
      next.canShowDetourPath = primarySegment.canShowDetourPath === true;
    }

    if (primarySegment.canShowDetourPath === false) {
      clearRoadMatchedPath(next);
    }
  } else if (next.canShowDetourPath === false) {
    clearRoadMatchedPath(next);
  }

  return next;
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
      const snapshot = await db.collection(ACTIVE_COLLECTION).get();
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const routeId = data.routeId || doc.id;
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
      });
      if (snapshot.size > 0) {
        console.log(`[detourPublisher] Hydrated ${snapshot.size} active detours`);
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
    return true;
  }));
  const currentIds = new Set(Object.keys(publishableDetours));

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
    };

    if (shouldUpdateLastSeen) {
      doc.lastSeenAt = toDate(detour.lastSeenAt, now);
    }

    // Geometry write throttle: only write geometry when criteria are met.
    // Optional road matching decorates the inferred GPS path as a rider-facing
    // "likely detour path" only when we are already going to write geometry,
    // so active detours do not generate map-matching traffic every tick.
    let geo = enforceGeometryTrustGate(detour.geometry);
    let detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
    applyGeometryMetadata(doc, geo);
    let writeGeo = hasRenderableGeometry(geo) &&
      (isNew || shouldWriteGeometry(routeId, detourForGeometry, previousSnapshot, now));
    const knownGeometry = lastKnownGeometry.get(routeId);
    const shouldBackfillRoadMatch = !writeGeo &&
      shouldAttemptRoadMatchBackfill(geo, previousSnapshot, knownGeometry);
    const roadMatchBackfillAttemptedSignature = shouldBackfillRoadMatch
      ? geometryBackfillSignature(geo)
      : null;

    if ((writeGeo || shouldBackfillRoadMatch) && geo) {
      try {
        geo = await matchDetourGeometry(geo);
        detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
      } catch (err) {
        console.warn('[detourPublisher] Road matching skipped:', err.message);
      }
      writeGeo = hasRenderableGeometry(geo) &&
        (isNew || shouldWriteGeometry(routeId, detourForGeometry, previousSnapshot, now));
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
  makeSnapshot,
  buildUpdatedEvent,
  buildDetectedEvent,
  buildClearedEvent,
  buildStaleClearedEvent,
};
