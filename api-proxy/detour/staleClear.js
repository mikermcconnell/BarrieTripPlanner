const { estimateRouteHeadwayMs } = require('./routeSchedule');
const { routeIdsShareFamily } = require('./routeFamily');

const MIN_STALE_MS = Number.parseFloat(process.env.DETOUR_STALE_AUTO_CLEAR_MIN_MS || String(45 * 60 * 1000));
const BUFFER_MS = Number.parseFloat(process.env.DETOUR_STALE_AUTO_CLEAR_BUFFER_MS || String(10 * 60 * 1000));
const HEADWAY_MULTIPLIER = Number.parseFloat(process.env.DETOUR_STALE_AUTO_CLEAR_HEADWAY_MULTIPLIER || '2');
const DEFAULT_HEADWAY_MS = Number.parseFloat(
  process.env.DETOUR_STALE_AUTO_CLEAR_DEFAULT_HEADWAY_MS || String(60 * 60 * 1000)
);
const MAX_STALE_MS = Number.parseFloat(process.env.DETOUR_STALE_AUTO_CLEAR_MAX_MS || String(3 * 60 * 60 * 1000));
const ZERO_VEHICLE_STALE_MS = Number.parseFloat(
  process.env.DETOUR_ZERO_VEHICLE_STALE_AUTO_CLEAR_MS || String(12 * 60 * 1000)
);
const ZERO_VEHICLE_MIN_AGE_MS = Number.parseFloat(
  process.env.DETOUR_ZERO_VEHICLE_STALE_AUTO_CLEAR_MIN_AGE_MS || String(10 * 60 * 1000)
);
const STALE_AUTO_CLEAR_ENABLED = process.env.DETOUR_STALE_AUTO_CLEAR_ENABLED
  ? process.env.DETOUR_STALE_AUTO_CLEAR_ENABLED === 'true'
  : true;

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
  if (detour.vehiclesOffRoute instanceof Set) return detour.vehiclesOffRoute.size;
  if (Array.isArray(detour.vehiclesOffRoute)) return detour.vehiclesOffRoute.length;
  if (Object.prototype.hasOwnProperty.call(detour, 'vehicleCount')) {
    const parsed = Number.parseInt(String(detour.vehicleCount), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return null;
}

function getDetectedAtMs(detour, previousSnapshot) {
  return (
    toMillis(detour?.detectedAt) ??
    toMillis(detour?.detectedAtMs) ??
    toMillis(previousSnapshot?.detectedAtMs) ??
    toMillis(previousSnapshot?.detectedAt) ??
    null
  );
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
  const currentVehicleCount = getCurrentVehicleCount(detour);
  if (currentVehicleCount === 0) {
    const detectedAtMs = getDetectedAtMs(detour, previousSnapshot);
    const detourAgeMs = detectedAtMs == null ? null : now - detectedAtMs;

    if (detourAgeMs != null && detourAgeMs < ZERO_VEHICLE_MIN_AGE_MS) {
      return {
        shouldClear: false,
        reason: 'zero-vehicle-grace-period',
        staleAgeMs,
        thresholdMs: ZERO_VEHICLE_STALE_MS,
        detourAgeMs,
        minAgeMs: ZERO_VEHICLE_MIN_AGE_MS,
      };
    }

    if (staleAgeMs >= ZERO_VEHICLE_STALE_MS) {
      return {
        shouldClear: true,
        reason: 'zero-vehicle-stale-with-live-route-family-vehicles',
        staleAgeMs,
        thresholdMs: ZERO_VEHICLE_STALE_MS,
        lastEvidenceAt: evidenceMs,
        detourAgeMs,
        minAgeMs: ZERO_VEHICLE_MIN_AGE_MS,
      };
    }

    return {
      shouldClear: false,
      reason: 'zero-vehicle-fresh-enough',
      staleAgeMs,
      thresholdMs: ZERO_VEHICLE_STALE_MS,
      detourAgeMs,
      minAgeMs: ZERO_VEHICLE_MIN_AGE_MS,
    };
  }

  if (staleAgeMs < threshold.thresholdMs) {
    return {
      shouldClear: false,
      reason: 'fresh-enough',
      staleAgeMs,
      ...threshold,
    };
  }

  return {
    shouldClear: true,
    reason: 'stale-evidence-with-live-route-family-vehicles',
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
  constants: {
    MIN_STALE_MS,
    BUFFER_MS,
    HEADWAY_MULTIPLIER,
    DEFAULT_HEADWAY_MS,
    MAX_STALE_MS,
    ZERO_VEHICLE_STALE_MS,
    ZERO_VEHICLE_MIN_AGE_MS,
    STALE_AUTO_CLEAR_ENABLED,
  },
};
