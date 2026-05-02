const RIDER_VISIBLE_CONFIDENCES = new Set(['medium', 'high']);

const normalizeConfidence = (confidence) => (
  confidence == null ? '' : String(confidence).trim().toLowerCase()
);

const getVehicleCount = (detour) => {
  const count = Number(detour?.vehicleCount);
  return Number.isFinite(count) ? count : 0;
};

export function isRiderVisibleDetour(detour) {
  if (!detour || detour.state === 'cleared') return false;
  const confidence = normalizeConfidence(detour.confidence);
  if (!RIDER_VISIBLE_CONFIDENCES.has(confidence)) return false;
  if (confidence === 'medium') return getVehicleCount(detour) >= 2;
  return true;
}

export function filterRiderVisibleDetours(detourMap = {}) {
  return Object.fromEntries(
    Object.entries(detourMap || {}).filter(([, detour]) => isRiderVisibleDetour(detour))
  );
}
