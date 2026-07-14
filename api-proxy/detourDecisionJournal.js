'use strict';

const MAX_RECENT_DECISIONS = 100;
const lastDecisionSignatureById = new Map();
const recentDecisions = [];

function toTimestampMs(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
  const parsedDate = Date.parse(value);
  return Number.isFinite(parsedDate) ? parsedDate : null;
}

function countPolylinePoints(polyline) {
  return Array.isArray(polyline) ? polyline.length : 0;
}

function summarizeSegment(segment = {}) {
  const geometryGate = segment.geometryGate || null;
  const geometryGateReason = geometryGate?.reason || segment.geometryTrustBlockedReason || null;
  return {
    eventId: segment.detourEventId || segment.sharedDetourEventId || null,
    confidence: segment.confidence || null,
    canShowDetourPath: segment.canShowDetourPath ?? null,
    detourPathSuppressedReason: segment.detourPathSuppressedReason || null,
    geometryTrustBlockedReason: segment.geometryTrustBlockedReason || null,
    geometryGateReason,
    geometryGatePassed: geometryGate?.passed ?? null,
    spanMeters: geometryGate?.spanMeters ?? null,
    hasSkippedSegment: geometryGate?.hasSkippedSegment ?? null,
    hasEntryPoint: geometryGate?.hasEntryPoint ?? Boolean(segment.entryPoint),
    hasExitPoint: geometryGate?.hasExitPoint ?? Boolean(segment.exitPoint),
    skippedStopCount: Array.isArray(segment.skippedStopIds) ? segment.skippedStopIds.length : 0,
    affectedStopCount: Array.isArray(segment.affectedStops) ? segment.affectedStops.length : 0,
    inferredPointCount: countPolylinePoints(segment.inferredDetourPolyline),
    likelyPointCount: countPolylinePoints(segment.likelyDetourPolyline),
    skippedPointCount: countPolylinePoints(segment.skippedSegmentPolyline),
    roadMatchSource: segment.roadMatchSource || null,
    evidencePointCount: segment.evidencePointCount ?? null,
  };
}

function summarizeGeometry(geometry = null) {
  const segments = Array.isArray(geometry?.segments) ? geometry.segments : [];
  const segmentSummaries = segments.map(summarizeSegment);
  const geometryGate = geometry?.geometryGate || null;
  const geometryGateReason = geometryGate?.reason || geometry?.geometryTrustBlockedReason || null;
  const hiddenSegments = segmentSummaries.filter((segment) =>
    segment.canShowDetourPath === false ||
    segment.detourPathSuppressedReason ||
    segment.geometryGateReason
  );
  const hiddenSegmentReasons = new Set(hiddenSegments
    .map((segment) => (
      segment.detourPathSuppressedReason ||
      segment.geometryGateReason ||
      segment.geometryTrustBlockedReason ||
      'path-hidden'
    ))
    .filter(Boolean));
  if (geometryGateReason) hiddenSegmentReasons.add(geometryGateReason);

  return {
    hasGeometry: Boolean(geometry),
    confidence: geometry?.confidence || null,
    canShowDetourPath: geometry?.canShowDetourPath ?? null,
    detourPathSuppressedReason: geometry?.detourPathSuppressedReason || null,
    geometryTrustBlockedReason: geometry?.geometryTrustBlockedReason || null,
    geometryGateReason,
    geometryGatePassed: geometryGate?.passed ?? null,
    spanMeters: geometryGate?.spanMeters ?? null,
    hasSkippedSegment: geometryGate?.hasSkippedSegment ?? null,
    segmentCount: segments.length,
    renderableSegmentCount: segmentSummaries.filter((segment) =>
      segment.canShowDetourPath === true &&
      (segment.likelyPointCount >= 2 || segment.inferredPointCount >= 2)
    ).length,
    hiddenSegmentCount: hiddenSegments.length,
    hiddenSegmentReasons: [...hiddenSegmentReasons],
    skippedStopCount: Array.isArray(geometry?.skippedStopIds) ? geometry.skippedStopIds.length : 0,
    inferredPointCount: countPolylinePoints(geometry?.inferredDetourPolyline),
    likelyPointCount: countPolylinePoints(geometry?.likelyDetourPolyline),
    skippedPointCount: countPolylinePoints(geometry?.skippedSegmentPolyline),
    roadMatchSource: geometry?.roadMatchSource || null,
    roadMatchConfidence: geometry?.roadMatchConfidence || null,
    hasEntryPoint: Boolean(geometry?.entryPoint),
    hasExitPoint: Boolean(geometry?.exitPoint),
    evidencePointCount: geometry?.evidencePointCount ?? null,
    segments: segmentSummaries.slice(0, 8),
  };
}

function buildDecision({ publishId, routeId, doc = {}, detour = {}, geometry = null, previousSnapshot = null, writeGeo = false, isNew = false, now = Date.now() }) {
  const latestGpsEvidenceAt = toTimestampMs(doc.latestGpsEvidenceAt ?? detour.latestGpsEvidenceAt);
  const geometryLastEvidenceAt = toTimestampMs(doc.geometryLastEvidenceAt ?? detour.geometryLastEvidenceAt);
  const geometrySummary = summarizeGeometry(geometry);
  const riderVisible = doc.riderVisible !== false;
  const previousVisible = previousSnapshot ? previousSnapshot.riderVisible !== false : null;
  const visibilityChanged = previousVisible != null && previousVisible !== riderVisible;
  const reasonChanged = previousSnapshot &&
    (previousSnapshot.riderVisibilityReason || null) !== (doc.riderVisibilityReason || null);

  let decision = riderVisible ? 'rider_visible' : 'rider_hidden';
  if (!isNew && riderVisible && !visibilityChanged && !reasonChanged) {
    decision = 'active_monitored';
  }
  if (doc.clearReason) decision = 'clear_pending';

  return {
    event: 'detour_detector_decision',
    decision,
    publishId,
    routeId,
    eventId: doc.eventId || doc.detourEventId || geometry?.detourEventId || null,
    sharedDetourEventId: doc.sharedDetourEventId || geometry?.sharedDetourEventId || null,
    state: doc.state || detour.state || 'active',
    riderVisible,
    riderVisibilityReason: doc.riderVisibilityReason || null,
    staleForReview: Boolean(doc.staleForReview),
    confidence: doc.confidence || geometrySummary.confidence || null,
    vehicleCount: doc.vehicleCount ?? detour.vehicleCount ?? null,
    currentVehicleCount: doc.currentVehicleCount ?? detour.currentVehicleCount ?? null,
    latestGpsEvidenceAgeMs: Number.isFinite(latestGpsEvidenceAt) ? Math.max(0, now - latestGpsEvidenceAt) : null,
    geometryLastEvidenceAgeMs: Number.isFinite(geometryLastEvidenceAt) ? Math.max(0, now - geometryLastEvidenceAt) : null,
    clearReason: doc.clearReason || null,
    clearWindowCount: Array.isArray(doc.clearWindows) ? doc.clearWindows.length : (doc.clearWindow ? 1 : 0),
    geometryWriteAttempted: Boolean(writeGeo),
    visibilityChanged,
    reasonChanged: Boolean(reasonChanged),
    geometry: geometrySummary,
  };
}

function shouldLogDecision(publishId, decisionRecord) {
  const signature = JSON.stringify({
    decision: decisionRecord.decision,
    riderVisible: decisionRecord.riderVisible,
    riderVisibilityReason: decisionRecord.riderVisibilityReason,
    confidence: decisionRecord.confidence,
    vehicleCount: decisionRecord.vehicleCount,
    currentVehicleCount: decisionRecord.currentVehicleCount,
    clearReason: decisionRecord.clearReason,
    geometry: {
      canShowDetourPath: decisionRecord.geometry.canShowDetourPath,
      detourPathSuppressedReason: decisionRecord.geometry.detourPathSuppressedReason,
      geometryGateReason: decisionRecord.geometry.geometryGateReason,
      segmentCount: decisionRecord.geometry.segmentCount,
      renderableSegmentCount: decisionRecord.geometry.renderableSegmentCount,
      hiddenSegmentReasons: decisionRecord.geometry.hiddenSegmentReasons,
      roadMatchSource: decisionRecord.geometry.roadMatchSource,
      likelyPointCount: decisionRecord.geometry.likelyPointCount,
    },
  });
  if (lastDecisionSignatureById.get(publishId) === signature) return false;
  lastDecisionSignatureById.set(publishId, signature);
  return true;
}

function recordDetourDecision(input) {
  const decisionRecord = buildDecision(input);
  if (!shouldLogDecision(decisionRecord.publishId, decisionRecord)) {
    return decisionRecord;
  }
  recentDecisions.push({
    at: new Date(input.now || Date.now()).toISOString(),
    ...decisionRecord,
  });
  while (recentDecisions.length > MAX_RECENT_DECISIONS) {
    recentDecisions.shift();
  }
  console.log(JSON.stringify(decisionRecord));
  return decisionRecord;
}

function getDetourDecisionJournalStats() {
  return {
    recentDecisionCount: recentDecisions.length,
    trackedDetourCount: lastDecisionSignatureById.size,
    recentDecisions: recentDecisions.slice(-20),
  };
}

function resetDetourDecisionJournal() {
  lastDecisionSignatureById.clear();
  recentDecisions.length = 0;
}

module.exports = {
  buildDecision,
  getDetourDecisionJournalStats,
  recordDetourDecision,
  resetDetourDecisionJournal,
  summarizeGeometry,
};
