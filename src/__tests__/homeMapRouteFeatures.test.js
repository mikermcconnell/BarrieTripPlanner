import {
  buildHomeRouteFeatureCollections,
  getHomeRouteSourceId,
  HOME_ROUTE_LAYER_ORDERS,
} from '../utils/homeMapRouteFeatures';
import { DETOUR_ROUTE_LAYER_ORDER } from '../utils/detourFocusUtils';

describe('home map route feature collections', () => {
  test('groups many route segments into the three stable home-map sources', () => {
    const result = buildHomeRouteFeatureCollections([
      {
        id: 'route-10-a',
        routeId: '10',
        layerOrder: DETOUR_ROUTE_LAYER_ORDER.BASE_ROUTE,
        coordinates: [
          { longitude: -79.70, latitude: 44.38 },
          { longitude: -79.69, latitude: 44.39 },
        ],
        routeColor: '#6B145F',
        routeOpacity: 0.5,
        routeStrokeWidth: 3,
      },
      {
        id: 'route-8b-detour',
        routeId: '8B',
        layerOrder: DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE,
        coordinates: [
          { longitude: -79.68, latitude: 44.40 },
          { longitude: -79.67, latitude: 44.41 },
        ],
        routeColor: '#475569',
        routeOpacity: 1,
        routeStrokeWidth: 5,
      },
    ]);

    expect(Object.keys(result).map(Number).sort((a, b) => a - b)).toEqual([...HOME_ROUTE_LAYER_ORDERS]);
    expect(result[DETOUR_ROUTE_LAYER_ORDER.BASE_ROUTE].features).toHaveLength(1);
    expect(result[DETOUR_ROUTE_LAYER_ORDER.DETOURED_ROUTE].features[0]).toEqual(
      expect.objectContaining({
        id: 'route-8b-detour',
        properties: expect.objectContaining({ routeId: '8B', routeStrokeWidth: 5 }),
      })
    );
  });

  test('drops invalid geometry without adding more native sources', () => {
    const result = buildHomeRouteFeatureCollections([{
      id: 'invalid',
      layerOrder: DETOUR_ROUTE_LAYER_ORDER.BASE_ROUTE,
      coordinates: [{ longitude: -79.7, latitude: 44.38 }],
    }]);

    expect(Object.values(result).every((collection) => collection.features.length === 0)).toBe(true);
    expect(getHomeRouteSourceId(DETOUR_ROUTE_LAYER_ORDER.BASE_ROUTE)).toBe('home-routes-100');
  });
});

