const { buildNavigationRoutePolylines } = require('../features/navigation/model/buildNavigationRoutePolylines');
const { encodePolyline } = require('../utils/polylineUtils');
const {
  WALKING_ROUTE_DOT_OUTLINE_COLOR,
  WALKING_ROUTE_DOT_OUTLINE_WIDTH,
  WALKING_ROUTE_DOT_PATTERN,
  WALKING_ROUTE_DOT_STROKE_WIDTH,
} = require('../config/mapLineStyles');

describe('buildNavigationRoutePolylines', () => {
  test('splits the current walking leg at the user location', () => {
    const itinerary = {
      legs: [
        {
          mode: 'WALK',
          legGeometry: {
            points: encodePolyline([
              { latitude: 44.0, longitude: -79.0 },
              { latitude: 44.001, longitude: -79.001 },
              { latitude: 44.002, longitude: -79.002 },
            ]),
          },
        },
      ],
    };

    const lines = buildNavigationRoutePolylines({
      itinerary,
      currentLegIndex: 0,
      userLocation: {
        latitude: 44.001,
        longitude: -79.001,
      },
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual(
      expect.objectContaining({
        id: 'leg-0-completed',
        color: '#9BBBF9',
        width: 6,
        dashPattern: null,
        outlineWidth: 4,
      })
    );
    expect(lines[1]).toEqual(
      expect.objectContaining({
        id: 'leg-0-remaining',
        color: '#4285F4',
        width: 6,
        dashPattern: null,
        outlineWidth: 4,
      })
    );
  });

  test('uses the best transit shape segment when shape data exists', () => {
    const itinerary = {
      legs: [
        {
          mode: 'BUS',
          route: { id: '1', color: '#123456' },
          from: { lat: 44.0, lon: -79.0 },
          to: { lat: 44.003, lon: -79.003 },
        },
      ],
    };

    const shapes = {
      shortShape: [
        { latitude: 44.0, longitude: -79.0 },
        { latitude: 44.003, longitude: -79.003 },
      ],
      longShape: [
        { latitude: 44.0, longitude: -79.0 },
        { latitude: 44.001, longitude: -79.001 },
        { latitude: 44.002, longitude: -79.002 },
        { latitude: 44.003, longitude: -79.003 },
      ],
    };

    const lines = buildNavigationRoutePolylines({
      itinerary,
      currentLegIndex: 0,
      shapes,
      routeShapeMapping: {
        '1': ['shortShape', 'longShape'],
      },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual(
      expect.objectContaining({
        id: 'leg-0',
        color: '#123456',
        width: 7,
      })
    );
    expect(lines[0].coordinates).toHaveLength(4);
  });

  test('falls back to straight-line coordinates when no transit shape can be resolved', () => {
    const itinerary = {
      legs: [
        {
          mode: 'BUS',
          route: { id: '2', color: '#456789' },
          from: { lat: 44.01, lon: -79.01 },
          to: { lat: 44.02, lon: -79.02 },
        },
      ],
    };

    const lines = buildNavigationRoutePolylines({
      itinerary,
      currentLegIndex: 0,
      shapes: {},
      routeShapeMapping: {},
    });

    expect(lines).toEqual([
      expect.objectContaining({
        id: 'leg-0',
        color: '#456789',
        coordinates: [
          { latitude: 44.01, longitude: -79.01 },
          { latitude: 44.02, longitude: -79.02 },
        ],
      }),
    ]);
  });

  test('uses polished dotted styling for non-current walking legs', () => {
    const itinerary = {
      legs: [
        {
          mode: 'BUS',
          route: { id: '1', color: '#123456' },
          from: { lat: 44.0, lon: -79.0 },
          to: { lat: 44.01, lon: -79.01 },
        },
        {
          mode: 'WALK',
          from: { lat: 44.01, lon: -79.01 },
          to: { lat: 44.02, lon: -79.02 },
        },
      ],
    };

    const lines = buildNavigationRoutePolylines({
      itinerary,
      currentLegIndex: 0,
    });

    expect(lines[1]).toEqual(
      expect.objectContaining({
        id: 'leg-1',
        color: '#A5ADBA',
        width: WALKING_ROUTE_DOT_STROKE_WIDTH,
        dashPattern: WALKING_ROUTE_DOT_PATTERN,
        outlineWidth: WALKING_ROUTE_DOT_OUTLINE_WIDTH,
        outlineColor: WALKING_ROUTE_DOT_OUTLINE_COLOR,
      })
    );
  });


  test('applies on-demand styling without walking-specific outline treatment', () => {
    const itinerary = {
      legs: [
        {
          mode: 'BUS',
          isOnDemand: true,
          zoneColor: '#AA33CC',
          from: { lat: 44.05, lon: -79.05 },
          to: { lat: 44.06, lon: -79.06 },
        },
      ],
    };

    const lines = buildNavigationRoutePolylines({
      itinerary,
      currentLegIndex: 0,
    });

    expect(lines).toEqual([
      expect.objectContaining({
        id: 'leg-0',
        color: '#AA33CC',
        width: 7,
        dashPattern: [8, 6],
        outlineWidth: 0,
        outlineColor: undefined,
      }),
    ]);
  });
});
