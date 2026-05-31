import { getRouteFamilyId, routeIsDetouring } from './routeDetourMatching';

export const DETOUR_ROUTE_LAYER_ORDER = {
  CONTEXT_ROUTE: 90,
  BASE_ROUTE: 100,
  DETOURED_ROUTE: 180,
};

const routeIsInFocusedDetourFamily = (routeId, focusedDetourRouteId) => {
  if (routeId == null || focusedDetourRouteId == null) return false;

  const routeKey = String(routeId);
  const focusedKey = String(focusedDetourRouteId);
  return routeKey === focusedKey ||
    getRouteFamilyId(routeKey) === getRouteFamilyId(focusedKey);
};

/**
 * In focused detour mode, only the focused route's scheduled corridor should
 * remain visible. In the main detour view, keep regular route corridors visible
 * so riders can still see where the route runs before and after the closed
 * section. The closed section itself is covered by the detour overlay mask.
 */
export const shouldRenderRouteShape = ({
  routeId,
  activeDetourRouteIds,
  isDetourView,
  hasDetourFocus,
  focusedDetourRouteId,
}) => {
  const routeKey = String(routeId);
  if (!hasDetourFocus || focusedDetourRouteId == null) {
    return true;
  }

  return routeKey === String(focusedDetourRouteId) ||
    getRouteFamilyId(routeKey) === getRouteFamilyId(focusedDetourRouteId);
};

/**
 * Native MapLibre can leave an old route layer visible for a frame after a
 * route shape is unmounted. Keep detouring route layers mounted but invisible
 * while in detour view so switching tabs actively updates the old layer to
 * transparent instead of relying on removal timing.
 */
export const shouldKeepHiddenRouteShapeLayerMounted = ({
  routeId,
  activeDetourRouteIds,
  isDetourView,
}) => Boolean(isDetourView && routeIsDetouring(routeId, activeDetourRouteIds));

/**
 * In detour map mode, detouring route corridors need to sit above muted
 * non-detour context routes. The actual detour geometry still renders above
 * these route corridors using its own higher layer range.
 */
export const getDetourRouteLayerOrder = ({
  routeId,
  activeDetourRouteIds,
  isDetourView,
  hasDetourFocus,
  focusedDetourRouteId,
} = {}) => {
  if (hasDetourFocus) {
    return routeIsInFocusedDetourFamily(routeId, focusedDetourRouteId)
      ? DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE
      : DETOUR_ROUTE_LAYER_ORDER.CONTEXT_ROUTE;
  }

  if (isDetourView) {
    return routeIsDetouring(routeId, activeDetourRouteIds)
      ? DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE
      : DETOUR_ROUTE_LAYER_ORDER.CONTEXT_ROUTE;
  }

  return DETOUR_ROUTE_LAYER_ORDER.BASE_ROUTE;
};
