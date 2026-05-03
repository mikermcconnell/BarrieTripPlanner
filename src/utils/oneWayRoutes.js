const ONE_WAY_ROUTE_IDS = new Set(['8A', '8B', '10', '11', '100', '101']);

export const isOneWayRoute = (routeId) => (
  ONE_WAY_ROUTE_IDS.has(String(routeId || '').toUpperCase())
);

export const getOneWayRouteArrowVisibility = ({
  routeId,
  currentZoom,
  isSelected = false,
  hasSelection = false,
}) => {
  if (!isOneWayRoute(routeId) || !Number.isFinite(currentZoom)) {
    return false;
  }

  if (isSelected) {
    return currentZoom >= 14;
  }

  if (hasSelection) {
    return false;
  }

  return currentZoom >= 15;
};

export const ONE_WAY_ROUTE_IDS_FOR_DISPLAY = Array.from(ONE_WAY_ROUTE_IDS);
