const RIDER_VISIBLE_CONFIDENCES = new Set(['medium', 'high']);

const normalizeConfidence = (confidence) => (
  confidence == null ? '' : String(confidence).trim().toLowerCase()
);

const ONGOING_DETOUR_STATES = new Set(['active', 'clear-pending']);

export function isRiderVisibleDetour(detour) {
  if (!detour || detour.state === 'cleared') return false;
  if (detour.riderVisible === false) return false;
  const confidence = normalizeConfidence(detour.confidence);
  return RIDER_VISIBLE_CONFIDENCES.has(confidence);
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
