import { filterRiderVisibleDetours } from './detourVisibility';

const normalizeConfidence = (confidence) => (
  confidence == null ? '' : String(confidence).trim().toLowerCase()
);

export function diffDetourRouteIds({ detourMap, prevIds, hasSeenInitialSnapshot }) {
  const nextIds = Object.keys(filterRiderVisibleDetours(detourMap));
  if (!hasSeenInitialSnapshot) {
    return {
      nextIds,
      newRouteIds: [],
    };
  }

  const previousIds = prevIds instanceof Set ? prevIds : new Set(prevIds || []);

  return {
    nextIds,
    newRouteIds: nextIds.filter((routeId) => !previousIds.has(routeId)),
  };
}

function normalizeRouteId(value) {
  return value == null ? null : String(value).trim().toUpperCase();
}

function favoriteRouteMatches(routeId, favoriteRoute) {
  const normalizedRouteId = normalizeRouteId(routeId);
  if (!normalizedRouteId || !favoriteRoute) return false;

  const candidates = [
    favoriteRoute.id,
    favoriteRoute.routeId,
    favoriteRoute.shortName,
    favoriteRoute.routeShortName,
    favoriteRoute.name,
  ].map(normalizeRouteId);

  return candidates.includes(normalizedRouteId);
}

export function filterRelevantDetourRouteIds({ routeIds, favoriteRoutes }) {
  if (!Array.isArray(routeIds) || !Array.isArray(favoriteRoutes) || favoriteRoutes.length === 0) {
    return [];
  }

  return routeIds.filter((routeId) =>
    favoriteRoutes.some((favoriteRoute) => favoriteRouteMatches(routeId, favoriteRoute))
  );
}

export function filterHighConfidenceDetourRouteIds({ routeIds, detourMap }) {
  if (!Array.isArray(routeIds) || !detourMap || typeof detourMap !== 'object') {
    return [];
  }

  return routeIds.filter((routeId) =>
    normalizeConfidence(detourMap[routeId]?.confidence) === 'high'
  );
}
