'use strict';

const ALERT_BLOCKING_REASONS = new Set([
  'baseline-update-pending',
  'baseline-diverged',
  'suppressed-invalid-geometry',
  'zero-confirmed-vehicle-count',
]);

const NORMAL_ROUTE_CLEAR_REASONS = new Set([
  'normal-route-observed',
  'obsolete-shape-normal-route-observed',
]);

const ALERT_VISIBLE_STATES = new Set(['active', 'clear-pending']);
const ALERT_VISIBLE_CONFIDENCES = new Set(['medium', 'high']);
const DEFAULT_MAX_GPS_EVIDENCE_AGE_MS = 90 * 60 * 1000;
const DEFAULT_MIN_EVIDENCE_POINTS = 6;
const DEFAULT_MIN_SEGMENT_SPAN_METERS = 75;

function toNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date ? date.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function getConfirmedVehicleCount(source = {}) {
  return toNonNegativeInt(source.uniqueVehicleCount ?? source.vehicleCount);
}

function getConfiguredNumber(value, fallback, { min = 0 } = {}) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function collectSegments(source = {}, geometry = null) {
  const candidate = geometry && typeof geometry === 'object' ? geometry : source;
  if (Array.isArray(candidate?.segments) && candidate.segments.length > 0) {
    return candidate.segments.filter((segment) => segment && typeof segment === 'object');
  }
  return candidate && typeof candidate === 'object' ? [candidate] : [];
}

function hasPoint(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function segmentSpanMeters(segment = {}) {
  const explicit = Number(segment.spanMeters);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const startProgress = Number(segment.startProgressMeters ?? segment.coreStartProgressMeters);
  const endProgress = Number(segment.endProgressMeters ?? segment.coreEndProgressMeters);
  if (Number.isFinite(startProgress) && Number.isFinite(endProgress)) {
    return Math.abs(endProgress - startProgress);
  }
  return null;
}

function hasMeaningfulAlertGeometry(source = {}, geometry = null, minSpanMeters) {
  if (source.canShowDetourPath === true || geometry?.canShowDetourPath === true) return true;

  return collectSegments(source, geometry).some((segment) => (
    hasPoint(segment.entryPoint) &&
    hasPoint(segment.exitPoint) &&
    Number(segmentSpanMeters(segment)) >= minSpanMeters
  ));
}

function getEvidencePointCount(source = {}, geometry = null) {
  const candidates = [
    source.evidencePointCount,
    geometry?.evidencePointCount,
    ...collectSegments(source, geometry).map((segment) => segment.evidencePointCount),
  ].map(toNonNegativeInt);
  return Math.max(0, ...candidates);
}

function hasCompleteTransitionAlertProof(source = {}, geometry = null, minSpanMeters = 75) {
  const requiredSpanMeters = Math.max(100, Number(minSpanMeters) || 0);
  return collectSegments(source, geometry).some((segment) => {
    const consensus = segment?.boundaryConsensus || segment?.sharedBoundaryConsensus || {};
    return Boolean(
      Number(consensus.lowerSignatureCount) >= 2 &&
      Number(consensus.upperSignatureCount) >= 2 &&
      toNonNegativeInt(segment.evidencePointCount ?? source.evidencePointCount) >= 2 &&
      Number(segmentSpanMeters(segment)) >= requiredSpanMeters
    );
  });
}

function getLatestGpsEvidenceAt(source = {}, geometry = null) {
  const candidates = [
    source.latestGpsEvidenceAt,
    geometry?.latestGpsEvidenceAt,
    geometry?.lastEvidenceAt,
    source.lastEvidenceAt,
    ...collectSegments(source, geometry).map((segment) => segment.lastEvidenceAt),
  ].map(toMillis).filter(Number.isFinite);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function evaluateRiderAlertVisibility(source = {}, options = {}) {
  const state = String(source.state || 'active').trim().toLowerCase();
  const confidence = String(source.confidence || options.geometry?.confidence || '').trim().toLowerCase();
  const confirmedVehicleCount = getConfirmedVehicleCount(source);
  const riderVisibilityReason = String(source.riderVisibilityReason || '').trim();
  const clearReason = String(source.clearReason || '').trim();
  const now = getConfiguredNumber(options.now, Date.now());
  const maxGpsEvidenceAgeMs = getConfiguredNumber(
    options.maxGpsEvidenceAgeMs ?? process.env.DETOUR_ALERT_MAX_GPS_EVIDENCE_AGE_MS,
    DEFAULT_MAX_GPS_EVIDENCE_AGE_MS,
    { min: 1 }
  );
  const minEvidencePoints = getConfiguredNumber(
    options.minEvidencePoints ?? process.env.DETOUR_ALERT_MIN_EVIDENCE_POINTS,
    DEFAULT_MIN_EVIDENCE_POINTS,
    { min: 1 }
  );
  const minSegmentSpanMeters = getConfiguredNumber(
    options.minSegmentSpanMeters ?? process.env.DETOUR_ALERT_MIN_SEGMENT_SPAN_METERS,
    DEFAULT_MIN_SEGMENT_SPAN_METERS,
    { min: 1 }
  );

  if (!ALERT_VISIBLE_STATES.has(state)) {
    return { alertVisible: false, reason: state === 'cleared' ? 'detour-cleared' : 'detour-not-active' };
  }

  if (NORMAL_ROUTE_CLEAR_REASONS.has(clearReason)) {
    return { alertVisible: false, reason: 'normal-route-clear-pending' };
  }

  if (ALERT_BLOCKING_REASONS.has(riderVisibilityReason)) {
    return { alertVisible: false, reason: riderVisibilityReason };
  }

  const confirmed = confirmedVehicleCount >= 2 || source.isPersistent === true;
  if (!confirmed) {
    return { alertVisible: false, reason: 'insufficient-confirmed-evidence' };
  }

  if (!ALERT_VISIBLE_CONFIDENCES.has(confidence)) {
    return { alertVisible: false, reason: 'insufficient-alert-confidence' };
  }

  if (source.isPersistent === true) {
    return { alertVisible: true, reason: 'persistent-operator-detour' };
  }

  const geometry = options.geometry || null;
  const currentVehicleCount = toNonNegativeInt(source.currentVehicleCount);
  if (
    currentVehicleCount > 0 &&
    source.riderVisible !== false &&
    (source.canShowDetourPath === true || geometry?.canShowDetourPath === true)
  ) {
    return { alertVisible: true, reason: 'current-confirmed-detour-vehicle' };
  }

  if (!hasMeaningfulAlertGeometry(source, geometry, minSegmentSpanMeters)) {
    return { alertVisible: false, reason: 'insufficient-alert-geometry' };
  }

  const evidencePointCount = getEvidencePointCount(source, geometry);
  const completeTransitionProof = hasCompleteTransitionAlertProof(
    source,
    geometry,
    minSegmentSpanMeters
  );
  if (evidencePointCount < minEvidencePoints && !completeTransitionProof) {
    return { alertVisible: false, reason: 'insufficient-recent-gps-evidence' };
  }

  const latestGpsEvidenceAt = getLatestGpsEvidenceAt(source, geometry);
  const evidenceAgeMs = latestGpsEvidenceAt == null ? null : Math.max(0, now - latestGpsEvidenceAt);
  if (evidenceAgeMs == null || evidenceAgeMs > maxGpsEvidenceAgeMs) {
    return { alertVisible: false, reason: 'stale-unresolved-awaiting-gps-clear' };
  }

  return {
    alertVisible: true,
    reason: completeTransitionProof
      ? 'fresh-complete-transition-evidence'
      : 'fresh-confirmed-gps-evidence',
  };
}

function attachRiderAlertVisibility(target = {}, options = {}) {
  const decision = evaluateRiderAlertVisibility(target, options);
  target.alertVisible = decision.alertVisible;
  target.alertVisibilityReason = decision.reason;
  return target;
}

module.exports = {
  ALERT_BLOCKING_REASONS,
  DEFAULT_MAX_GPS_EVIDENCE_AGE_MS,
  DEFAULT_MIN_EVIDENCE_POINTS,
  DEFAULT_MIN_SEGMENT_SPAN_METERS,
  attachRiderAlertVisibility,
  evaluateRiderAlertVisibility,
  getConfirmedVehicleCount,
  getLatestGpsEvidenceAt,
  hasCompleteTransitionAlertProof,
  hasMeaningfulAlertGeometry,
};
