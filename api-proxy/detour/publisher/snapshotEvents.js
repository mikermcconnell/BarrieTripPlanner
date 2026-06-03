'use strict';

const { DETOUR_PATH_LABEL } = require('../../detourRoadMatcher');

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
    'detourZone',
    'clearWindow',
    'clearWindows',
    'clearedSegments',
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
  const skippedSegmentPolyline = pickGeometryValue(doc, previousSnapshot, 'skippedSegmentPolyline', null);
  const inferredDetourPolyline = pickGeometryValue(doc, previousSnapshot, 'inferredDetourPolyline', null);
  const likelyDetourPolyline = pickGeometryValue(doc, previousSnapshot, 'likelyDetourPolyline', null);
  const canShowDetourPath = hasOwn(doc, 'canShowDetourPath')
    ? doc.canShowDetourPath
    : (previousSnapshot?.canShowDetourPath ?? null);
  const likelyDetourRoadNames = pickGeometryValue(doc, previousSnapshot, 'likelyDetourRoadNames', []);
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
  const detourZone = pickGeometryValue(doc, previousSnapshot, 'detourZone', null);
  const clearWindow = pickGeometryValue(doc, previousSnapshot, 'clearWindow', null);
  const clearWindows = pickGeometryValue(doc, previousSnapshot, 'clearWindows', []);
  const clearedSegments = pickGeometryValue(doc, previousSnapshot, 'clearedSegments', []);
  const confidence = hasOwn(doc, 'confidence')
    ? doc.confidence || null
    : (previousSnapshot?.confidence || null);
  const evidencePointCount = hasOwn(doc, 'evidencePointCount')
    ? (doc.evidencePointCount ?? null)
    : (previousSnapshot?.evidencePointCount ?? null);
  const lastEvidenceAt = hasOwn(doc, 'lastEvidenceAt')
    ? (toMillis(doc.lastEvidenceAt) ?? null)
    : (previousSnapshot?.lastEvidenceAt ?? null);
  const latestGpsEvidenceAt = hasOwn(doc, 'latestGpsEvidenceAt')
    ? (toMillis(doc.latestGpsEvidenceAt) ?? null)
    : (previousSnapshot?.latestGpsEvidenceAt ?? lastEvidenceAt);
  const geometryLastEvidenceAt = hasOwn(doc, 'geometryLastEvidenceAt')
    ? (toMillis(doc.geometryLastEvidenceAt) ?? null)
    : (previousSnapshot?.geometryLastEvidenceAt ?? lastEvidenceAt);

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
    riderVisible: hasOwn(doc, 'riderVisible')
      ? doc.riderVisible !== false
      : previousSnapshot?.riderVisible !== false,
    riderVisibilityReason: hasOwn(doc, 'riderVisibilityReason')
      ? doc.riderVisibilityReason || null
      : previousSnapshot?.riderVisibilityReason || null,
    staleForReview: hasOwn(doc, 'staleForReview')
      ? Boolean(doc.staleForReview)
      : Boolean(previousSnapshot?.staleForReview),
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
    detourZone,
    clearWindow,
    clearWindows,
    clearedSegments,
    detourEventId: hasOwn(doc, 'detourEventId')
      ? doc.detourEventId || null
      : previousSnapshot?.detourEventId || null,
    sharedDetourEventId: hasOwn(doc, 'sharedDetourEventId')
      ? doc.sharedDetourEventId || null
      : previousSnapshot?.sharedDetourEventId || null,
    sharedRouteIds: hasOwn(doc, 'sharedRouteIds')
      ? (Array.isArray(doc.sharedRouteIds) ? cloneJson(doc.sharedRouteIds) : [])
      : (Array.isArray(previousSnapshot?.sharedRouteIds) ? cloneJson(previousSnapshot.sharedRouteIds) : []),
    eventPrimaryRouteId: hasOwn(doc, 'eventPrimaryRouteId')
      ? doc.eventPrimaryRouteId || null
      : previousSnapshot?.eventPrimaryRouteId || null,
    eventRouteCount: hasOwn(doc, 'eventRouteCount')
      ? doc.eventRouteCount ?? null
      : previousSnapshot?.eventRouteCount ?? null,
    eventLocationLabel: hasOwn(doc, 'eventLocationLabel')
      ? doc.eventLocationLabel || null
      : previousSnapshot?.eventLocationLabel || null,
    eventConfidence: hasOwn(doc, 'eventConfidence')
      ? doc.eventConfidence || null
      : previousSnapshot?.eventConfidence || null,
    confidence,
    evidencePointCount,
    lastEvidenceAt,
    latestGpsEvidenceAt,
    geometryLastEvidenceAt,
    segments,
    segmentCount: Array.isArray(segments) ? segments.length : 0,
    geometrySignature: Array.isArray(segments)
      ? geometrySignatureFromSegments(segments)
      : (usePreviousGeometry ? previousSnapshot?.geometrySignature || '' : ''),
  };
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
    latestGpsEvidenceAt: current.latestGpsEvidenceAt ?? current.lastEvidenceAt ?? null,
    geometryLastEvidenceAt: current.geometryLastEvidenceAt ?? current.lastEvidenceAt ?? null,
    source: 'detour-worker-v2',
  };
  if (current.shapeId) event.shapeId = current.shapeId;
  if (current.entryPoint) event.entryPoint = cloneJson(current.entryPoint);
  if (current.exitPoint) event.exitPoint = cloneJson(current.exitPoint);
  if (current.skippedSegmentPolyline) event.skippedSegmentPolyline = cloneJson(current.skippedSegmentPolyline);
  if (current.inferredDetourPolyline) event.inferredDetourPolyline = cloneJson(current.inferredDetourPolyline);
  if (current.likelyDetourPolyline) event.likelyDetourPolyline = cloneJson(current.likelyDetourPolyline);
  if (current.likelyDetourRoadNames?.length) event.likelyDetourRoadNames = cloneJson(current.likelyDetourRoadNames);
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
  if ((previous.triggerVehicleId || null) !== (current.triggerVehicleId || null)) changedFields.push('triggerVehicleId');
  if ((previous.state || 'active') !== (current.state || 'active')) changedFields.push('state');
  if ((previous.confidence || null) !== (current.confidence || null)) changedFields.push('confidence');
  if ((previous.roadMatchConfidence || null) !== (current.roadMatchConfidence || null)) changedFields.push('roadMatchConfidence');
  if ((previous.evidencePointCount ?? null) !== (current.evidencePointCount ?? null)) changedFields.push('evidencePointCount');
  if ((previous.clearReason || null) !== (current.clearReason || null)) changedFields.push('clearReason');
  if ((previous.riderVisible !== false) !== (current.riderVisible !== false)) changedFields.push('riderVisible');
  if ((previous.riderVisibilityReason || null) !== (current.riderVisibilityReason || null)) changedFields.push('riderVisibilityReason');

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
    riderVisible: current.riderVisible !== false,
    riderVisibilityReason: current.riderVisibilityReason || null,
    staleForReview: Boolean(current.staleForReview),
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
    latestGpsEvidenceAt: previous?.latestGpsEvidenceAt ?? previous?.lastEvidenceAt ?? null,
    geometryLastEvidenceAt: previous?.geometryLastEvidenceAt ?? previous?.lastEvidenceAt ?? null,
    source: 'detour-worker-v2',
  };
  if (previous?.shapeId) event.shapeId = previous.shapeId;
  if (previous?.entryPoint) event.entryPoint = cloneJson(previous.entryPoint);
  if (previous?.exitPoint) event.exitPoint = cloneJson(previous.exitPoint);
  if (previous?.skippedSegmentPolyline) event.skippedSegmentPolyline = cloneJson(previous.skippedSegmentPolyline);
  if (previous?.inferredDetourPolyline) event.inferredDetourPolyline = cloneJson(previous.inferredDetourPolyline);
  if (previous?.likelyDetourPolyline) event.likelyDetourPolyline = cloneJson(previous.likelyDetourPolyline);
  if (previous?.likelyDetourRoadNames?.length) event.likelyDetourRoadNames = cloneJson(previous.likelyDetourRoadNames);
  if (previous?.roadMatchConfidence) event.roadMatchConfidence = previous.roadMatchConfidence;
  if (previous?.detourPathLabel) event.detourPathLabel = previous.detourPathLabel;
  if (previous?.segmentCount > 0) event.segmentCount = previous.segmentCount;
  return event;
}

module.exports = {
  buildClearedEvent,
  buildDetectedEvent,
  buildUpdatedEvent,
  makeSnapshot,
};
