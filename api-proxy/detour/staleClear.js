const { routeIdsShareFamily } = require('./routeFamily');

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

function getConfirmedVehicleCount(detour, previousSnapshot = null) {
  const sources = [detour, previousSnapshot].filter(Boolean);
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(source, 'uniqueVehicleCount')) {
      const parsed = Number.parseInt(String(source.uniqueVehicleCount), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'vehicleCount')) {
      const parsed = Number.parseInt(String(source.vehicleCount), 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
  }
  return null;
}

function evaluateStaleRiderVisibility({
  detour,
  previousSnapshot = null,
} = {}) {
  const currentVehicleCount = getCurrentVehicleCount(detour) ?? getCurrentVehicleCount(previousSnapshot) ?? 0;
  if (currentVehicleCount > 0) {
    return {
      riderVisible: true,
      staleForReview: false,
      reason: 'current-detour-vehicle',
      currentVehicleCount,
    };
  }

  if (detour?.riderVisible === false) {
    return {
      riderVisible: false,
      staleForReview: true,
      reason: detour.riderVisibilityReason || detour.visibilityReason || 'backend-suppressed',
      currentVehicleCount,
      confirmedVehicleCount: getConfirmedVehicleCount(detour, previousSnapshot),
    };
  }

  const confirmedVehicleCount = getConfirmedVehicleCount(detour, previousSnapshot);
  if (confirmedVehicleCount === 0) {
    return {
      riderVisible: false,
      staleForReview: true,
      reason: 'zero-confirmed-vehicle-count',
      currentVehicleCount,
      confirmedVehicleCount,
    };
  }

  const evidenceMs = getLatestEvidenceMs(detour, previousSnapshot);

  return {
    riderVisible: true,
    staleForReview: false,
    reason: evidenceMs == null ? 'missing-evidence-time' : 'gps-clear-required',
    currentVehicleCount,
    confirmedVehicleCount,
    lastEvidenceAt: evidenceMs,
  };
}

function hasUsablePolyline(value) {
  if (Array.isArray(value)) return value.length >= 2;
  return typeof value === 'string' && value.trim().length > 0;
}

function getDetourGeometry(detour) {
  return detour?.geometry && typeof detour.geometry === 'object'
    ? detour.geometry
    : detour;
}

function pickDetourField(detour, previousSnapshot, key) {
  const hasCurrentDetour = detour && typeof detour === 'object';
  const geometry = detour?.geometry && typeof detour.geometry === 'object'
    ? detour.geometry
    : null;

  if (geometry && Object.prototype.hasOwnProperty.call(geometry, key)) {
    return geometry[key];
  }
  if (hasCurrentDetour && Object.prototype.hasOwnProperty.call(detour, key)) {
    return detour[key];
  }
  if (hasCurrentDetour) {
    return undefined;
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

function hasRenderableGeometry(detour, previousSnapshot = null) {
  if (hasUsablePolyline(pickDetourField(detour, previousSnapshot, 'skippedSegmentPolyline'))) return true;
  if (hasUsablePolyline(pickDetourField(detour, previousSnapshot, 'likelyDetourPolyline'))) return true;

  const canShowDetourPath = pickDetourField(detour, previousSnapshot, 'canShowDetourPath');
  if (
    canShowDetourPath === true &&
    hasUsablePolyline(pickDetourField(detour, previousSnapshot, 'inferredDetourPolyline'))
  ) {
    return true;
  }

  const segments = pickDetourField(detour, previousSnapshot, 'segments');
  if (!Array.isArray(segments)) return false;

  return segments.some((segment) =>
    segment?.canShowDetourPath === true ||
    hasUsablePolyline(segment?.skippedSegmentPolyline) ||
    hasUsablePolyline(segment?.likelyDetourPolyline) ||
    (segment?.canShowDetourPath === true && hasUsablePolyline(segment?.inferredDetourPolyline))
  );
}

function isUnclearableGeometrylessDetour(detour, previousSnapshot = null) {
  const currentReason = detour?.riderVisibilityReason || detour?.visibilityReason || null;
  const previousReason = previousSnapshot?.riderVisibilityReason || previousSnapshot?.visibilityReason || null;
  const canShowDetourPath = pickDetourField(detour, previousSnapshot, 'canShowDetourPath');
  const segments = pickDetourField(detour, previousSnapshot, 'segments');
  const explicitlyEmptySegments = Array.isArray(segments) && segments.length === 0;
  const wasSuppressedInvalidGeometry =
    currentReason === 'suppressed-invalid-geometry' ||
    previousReason === 'suppressed-invalid-geometry';

  if (
    canShowDetourPath !== false &&
    !explicitlyEmptySegments &&
    !wasSuppressedInvalidGeometry
  ) {
    return false;
  }

  return !hasRenderableGeometry(detour, previousSnapshot);
}

function shouldAutoClearStaleDetour({
  routeId,
  detour,
  previousSnapshot = null,
  vehicles = [],
} = {}) {
  if (!routeFamilyHasRecentVehicle(routeId, vehicles)) {
    return { shouldClear: false, reason: 'no-recent-route-family-vehicle' };
  }

  const evidenceMs = getLatestEvidenceMs(detour, previousSnapshot);
  if (evidenceMs == null) {
    return { shouldClear: false, reason: 'missing-evidence-time' };
  }

  return {
    shouldClear: false,
    reason: 'gps-clear-required',
    lastEvidenceAt: evidenceMs,
  };
}

module.exports = {
  shouldAutoClearStaleDetour,
  routeFamilyHasRecentVehicle,
  getLatestEvidenceMs,
  getCurrentVehicleCount,
  getConfirmedVehicleCount,
  evaluateStaleRiderVisibility,
  isLowConfidenceValidationOnlyDetour,
  isUnclearableGeometrylessDetour,
};
