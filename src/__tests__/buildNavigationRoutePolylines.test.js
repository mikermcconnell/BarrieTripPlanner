const { buildNavigationRoutePolylines } = require('../features/navigation/model/buildNavigationRoutePolylines');
const { buildCurrentStepBusPreviewLine } = require('../utils/navigationBusPreview');
const { encodePolyline } = require('../utils/polylineUtils');
const {
  WALKING_ROUTE_DOT_OUTLINE_COLOR,
  WALKING_ROUTE_DOT_OUTLINE_WIDTH,
  WALKING_ROUTE_DOT_PATTERN,
  WALKING_ROUTE_DOT_STROKE_WIDTH,
} = require('../config/mapLineStyles');

describe('buildNavigationRoutePolylines', () => {
  test('shows walking directions and next bus approach during the first walking leg', () => {
    const itinerary = {
      legs: [
        {
          mode: 'WALK',
          legGeometry: {
            points: encodePolyline([
              { latitude: 44.381, longitude: -79.701 },
              { latitude: 44.3815, longitude: -79.7005 },
              { latitude: 44.382, longitude: -79.7 },
            ]),
          },
        },
        {
          mode: 'BUS',
          tripId: 'TRIP-2A',
          route: { id: '2A', color: '#0057B8' },
          from: { lat: 44.382, lon: -79.7 },
          to: { lat: 44.386, lon: -79.696 },
        },
      ],
    };

    const walkingLines = buildNavigationRoutePolylines({
      itinerary,
      currentLegIndex: 0,
      userLocation: {
        latitude: 44.381,
        longitude: -79.701,
      },
    });

    expect(walkingLines[0]).toEqual(expect.objectContaining({
      id: 'leg-0',
      color: '#4285F4',
      width: 6,
      dashPattern: null,
      outlineWidth: 4,
    }));
    expect(walkingLines[0].coordinates).toHaveLength(3);

    const busApproachLine = buildCurrentStepBusPreviewLine({
      isWalkingLeg: true,
      nextTransitLeg: itinerary.legs[1],
      walkingVehicle: null,
      shapes: {
        shape2A: [
          { latitude: 44.38, longitude: -79.702 },
          { latitude: 44.381, longitude: -79.701 },
          { latitude: 44.382, longitude: -79.7 },
          { latitude: 44.386, longitude: -79.696 },
        ],
      },
      tripMapping: {
        'TRIP-2A': { shapeId: 'shape2A' },
      },
      routePathsByRouteId: new Map(),
    });

    expect(busApproachLine).toEqual(expect.objectContaining({
      id: 'nav-bus-approach-TRIP-2A-board-shape',
      color: '#0057B8',
      isStaticApproach: true,
    }));
    expect(busApproachLine.coordinates[busApproachLine.coordinates.length - 1])
      .toEqual({ latitude: 44.382, longitude: -79.7 });
  });

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
        color: '#4285F4',
        width: 6,
        dashPattern: null,
        opacity: 1,
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
          legGeometry: {
            points: encodePolyline([
              { latitude: 44.01, longitude: -79.01 },
              { latitude: 44.015, longitude: -79.015 },
              { latitude: 44.02, longitude: -79.02 },
            ]),
          },
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

  test('does not draw a straight walking corridor when street geometry is missing', () => {
    const itinerary = {
      legs: [
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

    expect(lines).toEqual([]);
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
