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
const KNOWN_INVALID_GEOMETRY_REASONS = new Set([
  'detour-boundary-gap',
  'jumpy-inferred-path',
  'stale-mixed-evidence',
]);
const DEFAULT_MAX_GPS_EVIDENCE_AGE_MS = 90 * 60 * 1000;
const DEFAULT_MIN_EVIDENCE_POINTS = 6;
const DEFAULT_MIN_SEGMENT_SPAN_METERS = 75;
const DEFAULT_MAX_EVENT_WINDOW_DIAGONAL_METERS = 5000;

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

function hasKnownInvalidGeometry(source = {}, geometry = null) {
  const candidates = [source, geometry]
    .filter((candidate) => candidate && typeof candidate === 'object');

  for (const candidate of [...candidates]) {
    if (Array.isArray(candidate.segments)) {
      candidates.push(...candidate.segments.filter((segment) => segment && typeof segment === 'object'));
    }
  }

  return candidates.some((candidate) => {
    const reasons = [
      candidate.riderVisibilityReason,
      candidate.geometryTrustBlockedReason,
      candidate.detourPathSuppressedReason,
      candidate.geometryGate?.reason,
    ].map((reason) => String(reason || '').trim().toLowerCase());

    return candidate.invalidGeometrySuppressed === true ||
      candidate.staleMixedEvidence === true ||
      reasons.some((reason) => KNOWN_INVALID_GEOMETRY_REASONS.has(reason));
  });
}

function hasPoint(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function distanceMeters(a, b) {
  if (!hasPoint(a) || !hasPoint(b)) return Infinity;
  const latitudeA = Number(a.latitude ?? a.lat);
  const longitudeA = Number(a.longitude ?? a.lon ?? a.lng);
  const latitudeB = Number(b.latitude ?? b.lat);
  const longitudeB = Number(b.longitude ?? b.lon ?? b.lng);
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const firstLatitude = toRadians(latitudeA);
  const secondLatitude = toRadians(latitudeB);
  const haversine = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * 6_371_000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function hasSafeBoundedEventWindow(source = {}, maxDiagonalMeters = DEFAULT_MAX_EVENT_WINDOW_DIAGONAL_METERS) {
  const eventWindow = source?.eventWindow;
  const center = eventWindow?.geoCenter;
  const bounds = eventWindow?.geoBounds;
  if (!eventWindow || !hasPoint(center) || !bounds || typeof bounds !== 'object') return false;

  const minimum = {
    latitude: Number(bounds.minLatitude),
    longitude: Number(bounds.minLongitude),
  };
  const maximum = {
    latitude: Number(bounds.maxLatitude),
    longitude: Number(bounds.maxLongitude),
  };
  if (!hasPoint(minimum) || !hasPoint(maximum)) return false;
  if (minimum.latitude > maximum.latitude || minimum.longitude > maximum.longitude) return false;
  if (
    Number(center.latitude ?? center.lat) < minimum.latitude ||
    Number(center.latitude ?? center.lat) > maximum.latitude ||
    Number(center.longitude ?? center.lon ?? center.lng) < minimum.longitude ||
    Number(center.longitude ?? center.lon ?? center.lng) > maximum.longitude
  ) {
    return false;
  }

  const coreStart = Number(eventWindow.coreStartProgressMeters);
  const coreEnd = Number(eventWindow.coreEndProgressMeters);
  if (!Number.isFinite(coreStart) || !Number.isFinite(coreEnd) || coreStart === coreEnd) return false;
  return distanceMeters(minimum, maximum) <= maxDiagonalMeters;
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
  const maxEventWindowDiagonalMeters = getConfiguredNumber(
    options.maxEventWindowDiagonalMeters ?? process.env.DETOUR_ALERT_MAX_EVENT_WINDOW_DIAGONAL_METERS,
    DEFAULT_MAX_EVENT_WINDOW_DIAGONAL_METERS,
    { min: 1 }
  );
  const detailsPending = !hasKnownInvalidGeometry(source, options.geometry || null) &&
    hasSafeBoundedEventWindow(source, maxEventWindowDiagonalMeters) &&
    !hasMeaningfulAlertGeometry(source, options.geometry || null, minSegmentSpanMeters);

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

  if (!hasMeaningfulAlertGeometry(source, geometry, minSegmentSpanMeters) && !detailsPending) {
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
  const serviceAwareVisibilityEvaluated = Boolean(source.riderVisibilityPolicySource);
  if (
    evidenceAgeMs == null ||
    (!serviceAwareVisibilityEvaluated && evidenceAgeMs > maxGpsEvidenceAgeMs) ||
    riderVisibilityReason === 'stale-evidence-awaiting-gps-clear'
  ) {
    return { alertVisible: false, reason: 'stale-unresolved-awaiting-gps-clear' };
  }
  const retainedBeyondLegacyAge = serviceAwareVisibilityEvaluated && evidenceAgeMs > maxGpsEvidenceAgeMs;

  return {
    alertVisible: true,
    ...(detailsPending ? { detailsPending: true } : {}),
    reason: detailsPending
      ? (retainedBeyondLegacyAge
        ? 'schedule-aware-gps-details-pending'
        : 'fresh-confirmed-gps-details-pending')
      : retainedBeyondLegacyAge
        ? 'schedule-aware-gps-clear-required'
      : completeTransitionProof
        ? 'fresh-complete-transition-evidence'
        : 'fresh-confirmed-gps-evidence',
  };
}

function attachRiderAlertVisibility(target = {}, options = {}) {
  const decision = evaluateRiderAlertVisibility(target, options);
  target.alertVisible = decision.alertVisible;
  target.alertVisibilityReason = decision.reason;
  target.detailsPending = decision.detailsPending === true;
  return target;
}

module.exports = {
  ALERT_BLOCKING_REASONS,
  DEFAULT_MAX_GPS_EVIDENCE_AGE_MS,
  DEFAULT_MIN_EVIDENCE_POINTS,
  DEFAULT_MIN_SEGMENT_SPAN_METERS,
  DEFAULT_MAX_EVENT_WINDOW_DIAGONAL_METERS,
  attachRiderAlertVisibility,
  evaluateRiderAlertVisibility,
  getConfirmedVehicleCount,
  getLatestGpsEvidenceAt,
  hasCompleteTransitionAlertProof,
  hasKnownInvalidGeometry,
  hasMeaningfulAlertGeometry,
  hasSafeBoundedEventWindow,
};
