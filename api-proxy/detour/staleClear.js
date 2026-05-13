const { estimateRouteHeadwayMs } = require('./routeSchedule');
const { routeIdsShareFamily } = require('./routeFamily');

const MIN_STALE_MS = Number.parseFloat(process.env.DETOUR_STALE_AUTO_CLEAR_MIN_MS || String(45 * 60 * 1000));
const BUFFER_MS = Number.parseFloat(process.env.DETOUR_STALE_AUTO_CLEAR_BUFFER_MS || String(10 * 60 * 1000));
const HEADWAY_MULTIPLIER = Number.parseFloat(process.env.DETOUR_STALE_AUTO_CLEAR_HEADWAY_MULTIPLIER || '2');
const DEFAULT_HEADWAY_MS = Number.parseFloat(
  process.env.DETOUR_STALE_AUTO_CLEAR_DEFAULT_HEADWAY_MS || String(60 * 60 * 1000)
);
const MAX_STALE_MS = Number.parseFloat(process.env.DETOUR_STALE_AUTO_CLEAR_MAX_MS || String(3 * 60 * 60 * 1000));
const STALE_AUTO_CLEAR_ENABLED = process.env.DETOUR_STALE_AUTO_CLEAR_ENABLED
  ? process.env.DETOUR_STALE_AUTO_CLEAR_ENABLED === 'true'
  : true;
const LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_ENABLED = process.env.DETOUR_LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_ENABLED
  ? process.env.DETOUR_LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_ENABLED === 'true'
  : true;
const LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_MS = Number.parseFloat(
  process.env.DETOUR_LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_MS || String(60 * 60 * 1000)
);

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

function routeFamilyHasRecentVehicle(routeId, vehicles = []) {
  return vehicles.some((vehicle) => routeIdsShareFamily(routeId, vehicle?.routeId));
}

function getLatestEvidenceMs(detour, previousSnapshot) {
  return (
    toMillis(detour?.geometry?.lastEvidenceAt) ??
    toMillis(detour?.lastEvidenceAt) ??
    toMillis(previousSnapshot?.lastEvidenceAt) ??
    toMillis(detour?.lastSeenAt) ??
    toMillis(previousSnapshot?.lastSeenAtMs) ??
    null
  );
}

function getCurrentVehicleCount(detour) {
  if (!detour || typeof detour !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(detour, 'currentVehicleCount')) {
    const parsed = Number.parseInt(String(detour.currentVehicleCount), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  if (detour.vehiclesOffRoute instanceof Set) return detour.vehiclesOffRoute.size;
  if (Array.isArray(detour.vehiclesOffRoute)) return detour.vehiclesOffRoute.length;
  if (Object.prototype.hasOwnProperty.call(detour, 'vehicleCount')) {
    const parsed = Number.parseInt(String(detour.vehicleCount), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return null;
}

function hasUsablePolyline(value) {
  return Array.isArray(value) && value.length >= 2;
}

function getDetourGeometry(detour) {
  return detour?.geometry && typeof detour.geometry === 'object'
    ? detour.geometry
    : detour;
}

function pickDetourField(detour, previousSnapshot, key) {
  const geometry = getDetourGeometry(detour);
  if (geometry && Object.prototype.hasOwnProperty.call(geometry, key)) {
    return geometry[key];
  }
  if (detour && Object.prototype.hasOwnProperty.call(detour, key)) {
    return detour[key];
  }
  if (previousSnapshot && Object.prototype.hasOwnProperty.call(previousSnapshot, key)) {
    return previousSnapshot[key];
  }
  return undefined;
}

function isLowConfidenceValidationOnlyDetour(detour, previousSnapshot = null) {
  const confidence = pickDetourField(detour, previousSnapshot, 'confidence');
  if (confidence !== 'low') return false;

  const canShowDetourPath = pickDetourField(detour, previousSnapshot, 'canShowDetourPath');
  if (canShowDetourPath !== false) return false;

  if (hasUsablePolyline(pickDetourField(detour, previousSnapshot, 'skippedSegmentPolyline'))) {
    return false;
  }
  if (hasUsablePolyline(pickDetourField(detour, previousSnapshot, 'likelyDetourPolyline'))) {
    return false;
  }

  const segments = pickDetourField(detour, previousSnapshot, 'segments');
  if (Array.isArray(segments) && segments.some((segment) =>
    segment?.canShowDetourPath === true ||
    hasUsablePolyline(segment?.skippedSegmentPolyline) ||
    hasUsablePolyline(segment?.likelyDetourPolyline)
  )) {
    return false;
  }

  return true;
}

function computeStaleThresholdMs(routeId, scheduleIndex, nowMs) {
  const estimate = estimateRouteHeadwayMs(routeId, scheduleIndex, nowMs);
  const scheduledHeadwayMs = estimate?.headwayMs;

  if (Number.isFinite(scheduledHeadwayMs) && scheduledHeadwayMs > 0) {
    return {
      thresholdMs: Math.min(
        MAX_STALE_MS,
        Math.max(MIN_STALE_MS, scheduledHeadwayMs * HEADWAY_MULTIPLIER + BUFFER_MS)
      ),
      headwayMs: scheduledHeadwayMs,
      scheduleSource: estimate.source,
      serviceDate: estimate.serviceDate,
    };
  }

  if (estimate?.source === 'no-scheduled-service') {
    return {
      thresholdMs: null,
      headwayMs: null,
      scheduleSource: estimate.source,
      serviceDate: estimate.serviceDate,
    };
  }

  return {
    thresholdMs: Math.min(
      MAX_STALE_MS,
      Math.max(MIN_STALE_MS, DEFAULT_HEADWAY_MS * HEADWAY_MULTIPLIER + BUFFER_MS)
    ),
    headwayMs: DEFAULT_HEADWAY_MS,
    scheduleSource: estimate?.source || 'default-headway',
    serviceDate: estimate?.serviceDate || null,
  };
}

function shouldAutoClearStaleDetour({
  routeId,
  detour,
  previousSnapshot = null,
  vehicles = [],
  scheduleIndex = null,
  now = Date.now(),
} = {}) {
  if (!STALE_AUTO_CLEAR_ENABLED) {
    return { shouldClear: false, reason: 'disabled' };
  }

  if (
    LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_ENABLED &&
    isLowConfidenceValidationOnlyDetour(detour, previousSnapshot)
  ) {
    const evidenceMs = getLatestEvidenceMs(detour, previousSnapshot);
    if (evidenceMs == null) {
      return { shouldClear: false, reason: 'missing-evidence-time' };
    }

    const staleAgeMs = now - evidenceMs;
    if (
      Number.isFinite(staleAgeMs) &&
      staleAgeMs >= LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_MS
    ) {
      return {
        shouldClear: true,
        reason: 'stale-low-confidence-validation',
        staleAgeMs,
        lastEvidenceAt: evidenceMs,
        thresholdMs: LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_MS,
      };
    }
  }

  if (!routeFamilyHasRecentVehicle(routeId, vehicles)) {
    return { shouldClear: false, reason: 'no-recent-route-family-vehicle' };
  }

  const evidenceMs = getLatestEvidenceMs(detour, previousSnapshot);
  if (evidenceMs == null) {
    return { shouldClear: false, reason: 'missing-evidence-time' };
  }

  const threshold = computeStaleThresholdMs(routeId, scheduleIndex, now);
  if (threshold.thresholdMs == null) {
    return {
      shouldClear: false,
      reason: 'no-scheduled-service',
      ...threshold,
    };
  }

  const staleAgeMs = now - evidenceMs;
  if (staleAgeMs < threshold.thresholdMs) {
    return {
      shouldClear: false,
      reason: 'fresh-enough',
      staleAgeMs,
      ...threshold,
    };
  }

  return {
    shouldClear: false,
    reason: 'gps-clear-required',
    staleAgeMs,
    lastEvidenceAt: evidenceMs,
    ...threshold,
  };
}

module.exports = {
  shouldAutoClearStaleDetour,
  computeStaleThresholdMs,
  routeFamilyHasRecentVehicle,
  getLatestEvidenceMs,
  getCurrentVehicleCount,
  isLowConfidenceValidationOnlyDetour,
  constants: {
    MIN_STALE_MS,
    BUFFER_MS,
    HEADWAY_MULTIPLIER,
    DEFAULT_HEADWAY_MS,
    MAX_STALE_MS,
    STALE_AUTO_CLEAR_ENABLED,
    LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_ENABLED,
    LOW_CONFIDENCE_VALIDATION_AUTO_CLEAR_MS,
  },
};
