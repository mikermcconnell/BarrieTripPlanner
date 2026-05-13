import runtimeConfig from '../config/runtimeConfig';

const RIDER_VISIBLE_CONFIDENCES = new Set(['medium', 'high']);

const normalizeConfidence = (confidence) => (
  confidence == null ? '' : String(confidence).trim().toLowerCase()
);

const getVehicleCount = (detour) => {
  const count = Number(detour?.uniqueVehicleCount ?? detour?.vehicleCount);
  return Number.isFinite(count) ? count : 0;
};

const shouldShowLowConfidence = (options = {}) => (
  options.showLowConfidence === true ||
  runtimeConfig.detours?.showLowConfidenceForValidation === true
);

export function isRiderVisibleDetour(detour, options = {}) {
  if (!detour || detour.state === 'cleared') return false;
  const confidence = normalizeConfidence(detour.confidence);
  if (confidence === 'low') return shouldShowLowConfidence(options);
  if (!RIDER_VISIBLE_CONFIDENCES.has(confidence)) return false;
  if (confidence === 'medium') return getVehicleCount(detour) >= 2;
  return true;
}

export function filterRiderVisibleDetours(detourMap = {}, options = {}) {
  return Object.fromEntries(
    Object.entries(detourMap || {}).filter(([, detour]) => isRiderVisibleDetour(detour, options))
  );
}
