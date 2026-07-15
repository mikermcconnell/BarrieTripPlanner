const RIDER_VISIBLE_CONFIDENCES = new Set(['medium', 'high']);

const normalizeConfidence = (confidence) => (
  confidence == null ? '' : String(confidence).trim().toLowerCase()
);

const ONGOING_DETOUR_STATES = new Set(['active', 'clear-pending']);

const toNonNegativeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const hasOwn = (source, key) => (
  Boolean(source) && Object.prototype.hasOwnProperty.call(source, key)
);

const hasCurrentDetourVehicle = (detour) => (
  (toNonNegativeNumber(detour?.currentVehicleCount) ?? 0) > 0
);

const getConfirmedVehicleCount = (detour) => {
  if (!detour) return null;
  if (hasOwn(detour, 'uniqueVehicleCount')) {
    return toNonNegativeNumber(detour.uniqueVehicleCount);
  }
  if (hasOwn(detour, 'vehicleCount')) {
    return toNonNegativeNumber(detour.vehicleCount);
  }
  return null;
};

const hasEnoughConfirmedEvidence = (detour) => {
  const confirmedVehicleCount = getConfirmedVehicleCount(detour);
  return confirmedVehicleCount == null || confirmedVehicleCount >= 2;
};

const hasZeroConfirmedEvidence = (detour) => {
  if (!detour || hasCurrentDetourVehicle(detour)) return false;

  if (detour.riderVisibilityReason === 'zero-confirmed-vehicle-count') {
    return true;
  }

  return false;
};

export function isRiderVisibleDetour(detour) {
  if (!detour || detour.state === 'cleared') return false;
  const alertVisible = hasOwn(detour, 'alertVisible')
    ? detour.alertVisible === true
    : detour.riderVisible !== false;
  if (!alertVisible) return false;
  if (!hasEnoughConfirmedEvidence(detour)) return false;
  if (hasZeroConfirmedEvidence(detour)) return false;
  const confidence = normalizeConfidence(detour.confidence);
  return RIDER_VISIBLE_CONFIDENCES.has(confidence);
}

const hasRenderablePolyline = (value) => Array.isArray(value) && value.length >= 2;

const sourceHasMapGeometry = (source = {}) => (
  hasRenderablePolyline(source.skippedSegmentPolyline) ||
  hasRenderablePolyline(source.likelyDetourPolyline) ||
  (source.canShowDetourPath === true && hasRenderablePolyline(source.inferredDetourPolyline))
);

export function hasRiderDetourMapGeometry(detour = {}) {
  if (sourceHasMapGeometry(detour)) return true;
  return Array.isArray(detour.segments) && detour.segments.some(sourceHasMapGeometry);
}

export function filterRiderVisibleDetours(detourMap = {}) {
  return Object.fromEntries(
    Object.entries(detourMap || {}).filter(([, detour]) => isRiderVisibleDetour(detour))
  );
}

export function getCurrentOngoingDetourCount(detourMap = {}) {
  return Object.values(detourMap || {}).filter((detour) => {
    const state = String(detour?.state || 'active').trim().toLowerCase();
    return ONGOING_DETOUR_STATES.has(state);
  }).length;
}
