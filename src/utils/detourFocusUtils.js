/**
 * In focused detour mode, only the focused route's scheduled corridor
 * should remain visible. This prevents overlapping corridors from other
 * routes from making the detour appear longer than it is for the
 * selected route.
 */
export const shouldRenderRouteShape = ({
  routeId,
  hasDetourFocus,
  focusedDetourRouteId,
}) => {
  if (!hasDetourFocus || focusedDetourRouteId == null) {
    return true;
  }

  return String(routeId) === String(focusedDetourRouteId);
};
