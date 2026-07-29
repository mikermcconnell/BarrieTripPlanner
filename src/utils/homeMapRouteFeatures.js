import { DETOUR_ROUTE_LAYER_ORDER } from './detourFocusUtils';

export const HOME_ROUTE_LAYER_ORDERS = Object.freeze([
  DETOUR_ROUTE_LAYER_ORDER.CONTEXT_ROUTE,
  DETOUR_ROUTE_LAYER_ORDER.BASE_ROUTE,
  DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE,
]);

const emptyCollection = () => ({ type: 'FeatureCollection', features: [] });

const toLineCoordinates = (coordinates) => (
  (Array.isArray(coordinates) ? coordinates : [])
    .filter((coordinate) => (
      Number.isFinite(coordinate?.longitude) && Number.isFinite(coordinate?.latitude)
    ))
    .map((coordinate) => [coordinate.longitude, coordinate.latitude])
);

export const buildHomeRouteFeatureCollections = (segments = []) => {
  const collections = Object.fromEntries(
    HOME_ROUTE_LAYER_ORDERS.map((order) => [order, emptyCollection()])
  );

  segments.forEach((segment, index) => {
    if (!HOME_ROUTE_LAYER_ORDERS.includes(segment?.layerOrder)) return;
    const coordinates = toLineCoordinates(segment.coordinates);
    if (coordinates.length < 2) return;

    collections[segment.layerOrder].features.push({
      type: 'Feature',
      id: String(segment.id ?? `home-route-segment-${index}`),
      geometry: { type: 'LineString', coordinates },
      properties: {
        routeId: String(segment.routeId ?? ''),
        routeColor: segment.routeColor,
        routeOpacity: Number.isFinite(segment.routeOpacity) ? segment.routeOpacity : 1,
        routeStrokeWidth: Number.isFinite(segment.routeStrokeWidth) ? segment.routeStrokeWidth : 1,
      },
    });
  });

  return collections;
};

export const getHomeRouteSourceId = (layerOrder) => `home-routes-${layerOrder}`;

