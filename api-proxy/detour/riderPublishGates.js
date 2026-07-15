'use strict';

const NORMAL_ROUTE_CLEAR_REASONS = new Set([
  'normal-route-observed',
  'obsolete-shape-normal-route-observed',
]);

function toNonNegativeInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasRenderablePolyline(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  return Array.isArray(value) && value.length >= 2;
}

function collectSegments(source = {}) {
  return Array.isArray(source?.segments)
    ? source.segments.filter((segment) => segment && typeof segment === 'object')
    : [];
}

function hasRenderableDetourPath(source = {}) {
  if (
    hasRenderablePolyline(source.likelyDetourPolyline) ||
    (source.canShowDetourPath === true && hasRenderablePolyline(source.inferredDetourPolyline))
  ) {
    return true;
  }

  return collectSegments(source).some((segment) => (
    hasRenderablePolyline(segment.likelyDetourPolyline) ||
    (segment.canShowDetourPath === true && hasRenderablePolyline(segment.inferredDetourPolyline))
  ));
}

function hasExplicitSkippedStops(source = {}) {
  if (
    hasItems(source.skippedStops) ||
    hasItems(source.skippedStopIds) ||
    hasItems(source.skippedStopCodes)
  ) {
    return true;
  }

  return collectSegments(source).some((segment) => (
    hasItems(segment.skippedStops) ||
    hasItems(segment.skippedStopIds) ||
    hasItems(segment.skippedStopCodes)
  ));
}

function buildDetourGate(source = {}) {
  const uniqueVehicleCount = toNonNegativeInt(source.uniqueVehicleCount ?? source.vehicleCount);
  const vehicleCount = toNonNegativeInt(source.vehicleCount);
  const evidencePointCount = source.evidencePointCount == null
    ? null
    : toNonNegativeInt(source.evidencePointCount);

  let reason = 'active-detour-record';
  if (uniqueVehicleCount >= 2) {
    reason = 'confirmed-multi-vehicle-evidence';
  } else if (vehicleCount > 0 || uniqueVehicleCount > 0) {
    reason = 'confirmed-detector-evidence';
  } else if (source.isPersistent === true) {
    reason = 'persistent-detour-record';
  }

  return {
    passed: true,
    reason,
    vehicleCount,
    uniqueVehicleCount,
    currentVehicleCount: toNonNegativeInt(source.currentVehicleCount),
    evidencePointCount,
  };
}

function isRiderAlertVisible(source = {}) {
  return source.alertVisible === true || (
    source.alertVisible == null && source.riderVisible !== false
  );
}

function buildRiderAlertGate(source = {}) {
  const riderVisible = isRiderAlertVisible(source);
  return {
    passed: riderVisible,
    reason: riderVisible
      ? (source.alertVisibilityReason || source.riderVisibilityReason || 'rider-visible-confirmed')
      : (source.alertVisibilityReason || source.riderVisibilityReason || 'rider-hidden'),
  };
}

function buildLikelyPathGate(source = {}) {
  if (!isRiderAlertVisible(source)) {
    return {
      passed: false,
      reason: 'rider-hidden',
    };
  }

  if (source.canShowDetourPath !== true) {
    return {
      passed: false,
      reason: 'path-not-trusted',
    };
  }

  if (!hasRenderableDetourPath(source)) {
    return {
      passed: false,
      reason: 'trusted-path-flag-without-renderable-path',
    };
  }

  return {
    passed: true,
    reason: 'trusted-renderable-path',
  };
}

function buildSkippedStopsGate(source = {}) {
  if (!isRiderAlertVisible(source)) {
    return {
      passed: false,
      reason: 'rider-hidden',
    };
  }

  if (!hasExplicitSkippedStops(source)) {
    return {
      passed: false,
      reason: 'no-explicit-skipped-stops',
    };
  }

  return {
    passed: true,
    reason: 'explicit-route-scoped-skipped-stops',
  };
}

function buildClearGate(source = {}) {
  const clearReason = source.clearReason || null;
  if (clearReason && NORMAL_ROUTE_CLEAR_REASONS.has(clearReason)) {
    return {
      passed: true,
      reason: clearReason,
    };
  }

  return {
    passed: false,
    reason: clearReason || 'awaiting-normal-route-gps-proof',
  };
}

function buildRiderPublishGates(source = {}) {
  return {
    version: 1,
    detour: buildDetourGate(source),
    riderAlert: buildRiderAlertGate(source),
    likelyPath: buildLikelyPathGate(source),
    skippedStops: buildSkippedStopsGate(source),
    clear: buildClearGate(source),
  };
}

function attachRiderPublishGates(target = {}) {
  target.riderPublishGates = buildRiderPublishGates(target);
  return target;
}

module.exports = {
  NORMAL_ROUTE_CLEAR_REASONS,
  attachRiderPublishGates,
  buildRiderPublishGates,
};
