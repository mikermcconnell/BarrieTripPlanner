import { getRouteFamilyId, routeIsDetouring } from './routeDetourMatching';

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
