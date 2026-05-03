export const normalizeRouteId = (routeId) => (
  routeId == null ? '' : String(routeId).trim().toUpperCase()
);

export const getRouteFamilyId = (routeId) => {
  const normalized = normalizeRouteId(routeId);
  const match = normalized.match(/^(\d+)[A-Z]$/);
  return match ? match[1] : normalized;
};

export const hasRouteVariantSuffix = (routeId) => {
  const normalized = normalizeRouteId(routeId);
  return /^\d+[A-Z]$/.test(normalized);
};

export const routeMatchesDetourRoute = (routeId, detourRouteId) => {
  const routeKey = normalizeRouteId(routeId);
  const detourKey = normalizeRouteId(detourRouteId);
  if (!routeKey || !detourKey) return false;
  if (routeKey === detourKey) return true;

  // A base route like "8" should match variant detours like "8A"/"8B".
  // A selected variant like "8A" should stay exact so it does not pull in "8B".
  if (hasRouteVariantSuffix(routeKey)) return false;
  return getRouteFamilyId(routeKey) === getRouteFamilyId(detourKey);
};

export const routeIsDetouring = (routeId, activeDetourRouteIds) => {
  const detourIds = activeDetourRouteIds instanceof Set
    ? Array.from(activeDetourRouteIds)
    : Array.isArray(activeDetourRouteIds)
      ? activeDetourRouteIds
      : [];
  return detourIds.some((detourRouteId) => routeMatchesDetourRoute(routeId, detourRouteId));
};

export const getMatchingDetourRouteIds = (routeId, activeDetours = {}) => (
  Object.entries(activeDetours)
    .filter(([, detour]) => detour?.state !== 'cleared')
    .map(([detourRouteId]) => detourRouteId)
    .filter((detourRouteId) => routeMatchesDetourRoute(routeId, detourRouteId))
);

export const getRouteDetourFromMap = (routeId, activeDetours = {}) => {
  const exact = activeDetours[routeId] ?? activeDetours[normalizeRouteId(routeId)];
  if (exact && exact.state !== 'cleared') return exact;

  const [firstMatchingRouteId] = getMatchingDetourRouteIds(routeId, activeDetours);
  return firstMatchingRouteId ? activeDetours[firstMatchingRouteId] : null;
};
