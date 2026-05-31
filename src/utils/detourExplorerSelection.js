import { normalizeRouteId } from './routeDetourMatching';

export const DEFAULT_DETOUR_EXPLORER_SELECTION = {
  level: 'all',
  event: null,
  routeId: null,
};

export const getDetourEventRouteIds = (detourEvent) => (
  Array.isArray(detourEvent?.routeIds)
    ? detourEvent.routeIds.map(normalizeRouteId).filter(Boolean)
    : []
);

export const getDetourEventPrimaryRouteId = (detourEvent, fallbackRouteId = null) => (
  normalizeRouteId(detourEvent?.primaryRouteId) ||
  getDetourEventRouteIds(detourEvent)[0] ||
  normalizeRouteId(fallbackRouteId)
);

export const getDetourEventSegmentIndexForRoute = (detourEvent, routeId) => {
  const normalizedRouteId = normalizeRouteId(routeId);
  if (!normalizedRouteId) return null;

  const candidate = (Array.isArray(detourEvent?.candidates) ? detourEvent.candidates : [])
    .find((entry) => normalizeRouteId(entry?.routeId) === normalizedRouteId && Number.isInteger(entry?.segmentIndex));
  if (candidate) return candidate.segmentIndex;

  return normalizeRouteId(detourEvent?.primaryRouteId) === normalizedRouteId &&
    Number.isInteger(detourEvent?.primarySegmentIndex)
    ? detourEvent.primarySegmentIndex
    : null;
};

export const buildDetourExplorerSelection = ({ level = 'all', event = null, routeId = null } = {}) => {
  if (level === 'route') {
    const normalizedRouteId = normalizeRouteId(routeId);
    return normalizedRouteId
      ? { level: 'route', event, routeId: normalizedRouteId }
      : DEFAULT_DETOUR_EXPLORER_SELECTION;
  }

  if (level === 'event' && event) {
    return { level: 'event', event, routeId: null };
  }

  return DEFAULT_DETOUR_EXPLORER_SELECTION;
};
