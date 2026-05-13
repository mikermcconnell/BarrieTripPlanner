import {
  getMatchingDetourRouteIds,
  getRouteFamilyId,
  normalizeRouteId,
} from './routeDetourMatching';

const getActiveDetourEntries = (activeDetours = {}) => (
  Object.entries(activeDetours || {}).filter(([, detour]) => detour?.state !== 'cleared')
);

export const isRouteInSameDetourFamily = (routeId, detourRouteId) => (
  Boolean(routeId) &&
  Boolean(detourRouteId) &&
  getRouteFamilyId(routeId) === getRouteFamilyId(detourRouteId)
);

export const getDetourViewVehicleRouteIds = ({
  selectedRouteIds,
  activeDetours,
  focusedDetourRouteId,
  isDetourView,
}) => {
  if (!isDetourView) return null;

  const activeEntries = getActiveDetourEntries(activeDetours);
  if (activeEntries.length === 0) return null;

  const targetFamilies = new Set();

  if (focusedDetourRouteId) {
    targetFamilies.add(getRouteFamilyId(focusedDetourRouteId));
  }

  if (selectedRouteIds?.size > 0) {
    selectedRouteIds.forEach((routeId) => {
      const matches = getMatchingDetourRouteIds(routeId, activeDetours);
      if (matches.length > 0) {
        matches.forEach((detourRouteId) => targetFamilies.add(getRouteFamilyId(detourRouteId)));
      } else if (routeId) {
        targetFamilies.add(getRouteFamilyId(routeId));
      }
    });
  }

  if (targetFamilies.size === 0) return null;

  const routeIds = activeEntries
    .map(([routeId]) => normalizeRouteId(routeId))
    .filter((routeId) => targetFamilies.has(getRouteFamilyId(routeId)));

  return routeIds.length > 0 ? new Set(routeIds) : null;
};

export const getDisplayedVehiclesForDetourView = ({
  displayedVehicles,
  vehicles,
  selectedRouteIds,
  activeDetours,
  focusedDetourRouteId,
  isDetourView,
}) => {
  const detourRouteIds = getDetourViewVehicleRouteIds({
    selectedRouteIds,
    activeDetours,
    focusedDetourRouteId,
    isDetourView,
  });

  if (!detourRouteIds || detourRouteIds.size === 0) {
    return displayedVehicles;
  }

  const detourFamilies = new Set(
    Array.from(detourRouteIds).map((routeId) => getRouteFamilyId(routeId))
  );

  return (vehicles || []).filter((vehicle) => {
    const routeId = normalizeRouteId(vehicle?.routeId);
    return detourRouteIds.has(routeId) || detourFamilies.has(getRouteFamilyId(routeId));
  });
};
