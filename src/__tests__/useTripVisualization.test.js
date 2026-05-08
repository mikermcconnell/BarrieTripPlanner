import {
  buildBusApproachLines,
  buildTripEndpointMarkers,
  buildTripMarkers,
  buildTripRouteCoordinates,
  selectTripPreviewVehicles,
} from '../hooks/useTripVisualization';

describe('buildTripMarkers', () => {
  test('uses boarding and alighting stops for walk access and egress markers', () => {
    const tripFrom = { lat: 44.381, lon: -79.701 };
    const tripTo = { lat: 44.401, lon: -79.681 };
    const legs = [
      {
        mode: 'WALK',
        distance: 291,
        from: { name: 'Origin', lat: tripFrom.lat, lon: tripFrom.lon },
        to: { name: 'Mapleview Stop', lat: 44.383, lon: -79.699, stopId: 'STOP-1', stopCode: '1001' },
      },
      {
        mode: 'BUS',
        from: { name: 'Mapleview Stop', lat: 44.383, lon: -79.699, stopId: 'STOP-1', stopCode: '1001' },
        to: { name: 'Georgian Mall', lat: 44.399, lon: -79.683, stopId: 'STOP-2', stopCode: '2002' },
        route: { id: '10', shortName: '10' },
      },
      {
        mode: 'WALK',
        distance: 104,
        from: { name: 'Georgian Mall', lat: 44.399, lon: -79.683, stopId: 'STOP-2', stopCode: '2002' },
        to: { name: 'Destination', lat: tripTo.lat, lon: tripTo.lon },
      },
    ];

    const markers = buildTripMarkers({ legs, tripFrom, tripTo });

    expect(markers).toEqual([
      {
        id: 'origin',
        coordinate: { latitude: 44.383, longitude: -79.699 },
        type: 'origin',
        title: 'Start',
        stopName: 'Mapleview Stop',
        stopCode: '1001',
        walkDistance: 291,
      },
      {
        id: 'destination',
        coordinate: { latitude: 44.399, longitude: -79.683 },
        type: 'destination',
        title: 'End',
        stopName: 'Georgian Mall',
        stopCode: '2002',
        walkDistance: 104,
      },
    ]);
  });

  test('does not reverse endpoints for walk-only itineraries', () => {
    const markers = buildTripMarkers({
      legs: [
        {
          mode: 'WALK',
          distance: 520,
          from: { name: 'Origin', lat: 44.381, lon: -79.701 },
          to: { name: 'Destination', lat: 44.384, lon: -79.696 },
        },
      ],
      tripFrom: { lat: 44.381, lon: -79.701 },
      tripTo: { lat: 44.384, lon: -79.696 },
    });

    expect(markers).toEqual([
      {
        id: 'origin',
        coordinate: { latitude: 44.381, longitude: -79.701 },
        type: 'origin',
        title: 'Start',
        stopName: 'Origin',
        stopCode: null,
        walkDistance: null,
      },
      {
        id: 'destination',
        coordinate: { latitude: 44.384, longitude: -79.696 },
        type: 'destination',
        title: 'End',
        stopName: 'Destination',
        stopCode: null,
        walkDistance: null,
      },
    ]);
  });
});

describe('buildTripEndpointMarkers', () => {
  test('adds separate actual origin and destination markers when stop markers are distinct', () => {
    const tripMarkers = [
      {
        id: 'origin',
        coordinate: { latitude: 44.383, longitude: -79.699 },
      },
      {
        id: 'destination',
        coordinate: { latitude: 44.399, longitude: -79.683 },
      },
    ];

    expect(buildTripEndpointMarkers({
      tripFrom: { lat: 44.381, lon: -79.701 },
      tripTo: { lat: 44.401, lon: -79.681 },
      tripMarkers,
    })).toEqual([
      {
        id: 'origin-location',
        coordinate: { latitude: 44.381, longitude: -79.701 },
        type: 'originLocation',
        title: 'Start location',
      },
      {
        id: 'destination-location',
        coordinate: { latitude: 44.401, longitude: -79.681 },
        type: 'destinationLocation',
        title: 'Destination location',
      },
    ]);
  });

  test('suppresses duplicate endpoint markers when stop and address are effectively the same point', () => {
    expect(buildTripEndpointMarkers({
      tripFrom: { lat: 44.381, lon: -79.701 },
      tripTo: { lat: 44.401, lon: -79.681 },
      tripMarkers: [
        {
          id: 'origin',
          coordinate: { latitude: 44.38101, longitude: -79.70101 },
        },
        {
          id: 'destination',
          coordinate: { latitude: 44.40101, longitude: -79.68101 },
        },
      ],
    })).toEqual([]);
  });
});

describe('buildTripRouteCoordinates', () => {
  test('shows the first walking leg and first bus approach in trip preview', () => {
    const itinerary = {
      legs: [
        {
          mode: 'WALK',
          from: { lat: 44.381, lon: -79.701 },
          to: { lat: 44.382, lon: -79.7 },
        },
        {
          mode: 'BUS',
          tripId: 'TRIP-7B',
          route: { id: '7B', shortName: '7B', color: '#F58220' },
          from: { name: 'Boarding Stop', lat: 44.382, lon: -79.7 },
          to: { name: 'Downtown', lat: 44.386, lon: -79.696 },
        },
      ],
    };

    const tripRoutes = buildTripRouteCoordinates({
      itinerary,
      decodedLegPolylines: [
        [
          { latitude: 44.381, longitude: -79.701 },
          { latitude: 44.3815, longitude: -79.7005 },
          { latitude: 44.382, longitude: -79.7 },
        ],
        [
          { latitude: 44.382, longitude: -79.7 },
          { latitude: 44.384, longitude: -79.698 },
          { latitude: 44.386, longitude: -79.696 },
        ],
      ],
    });

    expect(tripRoutes[0]).toEqual(expect.objectContaining({
      id: 'trip-leg-0',
      mode: 'WALK',
      isWalk: true,
      lineStyle: 'solid',
    }));
    expect(tripRoutes[0].coordinates).toHaveLength(3);
    expect(tripRoutes[1]).toEqual(expect.objectContaining({
      id: 'trip-leg-1',
      mode: 'BUS',
      routeLabel: '7B',
      lineStyle: 'solid',
    }));

    const approachLines = buildBusApproachLines({
      legs: itinerary.legs,
      tripVehicles: [],
      shapes: {
        shape7B: [
          { latitude: 44.38, longitude: -79.702 },
          { latitude: 44.381, longitude: -79.701 },
          { latitude: 44.382, longitude: -79.7 },
          { latitude: 44.384, longitude: -79.698 },
          { latitude: 44.386, longitude: -79.696 },
        ],
      },
      tripMapping: {
        'TRIP-7B': { shapeId: 'shape7B' },
      },
    });

    expect(approachLines).toEqual([
      expect.objectContaining({
        id: 'bus-approach-TRIP-7B',
        color: '#F58220',
        isStaticApproach: true,
      }),
    ]);
    expect(approachLines[0].coordinates[approachLines[0].coordinates.length - 1])
      .toEqual({ latitude: 44.382, longitude: -79.7 });
  });

  test('keeps bus and walking legs solid in a double-transfer trip', () => {
    const itinerary = {
      legs: [
        {
          mode: 'WALK',
          from: { lat: 44.381, lon: -79.701 },
          to: { lat: 44.382, lon: -79.700 },
        },
        {
          mode: 'BUS',
          route: { shortName: '7', color: '#AA0000' },
          from: { lat: 44.382, lon: -79.700 },
          to: { lat: 44.386, lon: -79.696 },
        },
        {
          mode: 'WALK',
          from: { lat: 44.386, lon: -79.696 },
          to: { lat: 44.387, lon: -79.695 },
        },
        {
          mode: 'BUS',
          route: { shortName: '8A', color: '#00AA00' },
          from: { lat: 44.387, lon: -79.695 },
          to: { lat: 44.390, lon: -79.692 },
        },
        {
          mode: 'WALK',
          from: { lat: 44.390, lon: -79.692 },
          to: { lat: 44.391, lon: -79.691 },
        },
        {
          mode: 'BUS',
          route: { shortName: '2B', color: '#0000AA' },
          from: { lat: 44.391, lon: -79.691 },
          to: { lat: 44.396, lon: -79.686 },
        },
        {
          mode: 'WALK',
          from: { lat: 44.396, lon: -79.686 },
          to: { lat: 44.397, lon: -79.685 },
        },
      ],
    };

    const decodedLegPolylines = itinerary.legs.map((leg) => (
      leg.mode === 'WALK'
        ? [
            { latitude: leg.from.lat, longitude: leg.from.lon },
            { latitude: (leg.from.lat + leg.to.lat) / 2, longitude: (leg.from.lon + leg.to.lon) / 2 },
            { latitude: leg.to.lat, longitude: leg.to.lon },
          ]
        : []
    ));
    const routes = buildTripRouteCoordinates({ itinerary, decodedLegPolylines });

    expect(routes.map((route) => route.lineStyle)).toEqual([
      'solid',
      'solid',
      'solid',
      'solid',
      'solid',
      'solid',
      'solid',
    ]);
    expect(routes.filter((route) => route.mode === 'BUS').map((route) => route.routeLabel)).toEqual(['7', '8A', '2B']);
    expect(routes.filter((route) => route.mode === 'BUS').every((route) => route.lineStyle === 'solid')).toBe(true);
    expect(routes.filter((route) => route.mode === 'BUS').every((route) => route.labelCoordinate)).toBe(true);
    expect(routes.filter((route) => route.isTransferWalk)).toHaveLength(2);
  });

  test('does not draw straight walking preview legs when street geometry is unavailable', () => {
    const routes = buildTripRouteCoordinates({
      itinerary: {
        legs: [
          {
            mode: 'WALK',
            from: { lat: 44.381, lon: -79.701 },
            to: { lat: 44.382, lon: -79.700 },
          },
          {
            mode: 'BUS',
            route: { shortName: '7', color: '#AA0000' },
            from: { lat: 44.382, lon: -79.700 },
            to: { lat: 44.386, lon: -79.696 },
          },
        ],
      },
      decodedLegPolylines: [],
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].mode).toBe('BUS');
  });

  test('treats fixed-route bus legs as solid even if an on-demand flag is present', () => {
    const routes = buildTripRouteCoordinates({
      itinerary: {
        legs: [
          {
            mode: 'BUS',
            isOnDemand: true,
            tripId: 'TRIP-12A',
            route: { id: '12A', shortName: '12A', color: '#F39AC2' },
            from: { lat: 44.381, lon: -79.701 },
            to: { lat: 44.385, lon: -79.697 },
          },
          {
            mode: 'ON_DEMAND',
            isOnDemand: true,
            zoneName: 'Flex Zone',
            zoneColor: '#FF8800',
            from: { lat: 44.385, lon: -79.697 },
            to: { lat: 44.389, lon: -79.693 },
          },
        ],
      },
      decodedLegPolylines: [],
    });

    expect(routes[0]).toEqual(expect.objectContaining({
      isOnDemand: false,
      lineStyle: 'solid',
      routeLabel: '12A',
    }));
    expect(routes[1]).toEqual(expect.objectContaining({
      isOnDemand: true,
      lineStyle: 'dashed',
      routeLabel: null,
    }));
  });
});

describe('selectTripPreviewVehicles', () => {
  test('route fallback hides buses that have already passed the boarding stop', () => {
    const selectedItinerary = {
      legs: [
        {
          mode: 'BUS',
          tripId: 'PLANNED-8B',
          from: { name: 'Boarding Stop', lat: 44.2, lon: -79.8 },
          to: { name: 'Destination Stop', lat: 44.5, lon: -79.5 },
          route: { id: '8B', shortName: '8B' },
        },
      ],
    };

    const vehicles = [
      {
        id: 'approaching-bus',
        routeId: '8B',
        tripId: 'LIVE-OTHER-1',
        directionId: 1,
        coordinate: { latitude: 44.1, longitude: -79.9 },
      },
      {
        id: 'passed-bus',
        routeId: '8B',
        tripId: 'LIVE-OTHER-2',
        directionId: 1,
        coordinate: { latitude: 44.35, longitude: -79.65 },
      },
      {
        id: 'wrong-direction-bus',
        routeId: '8B',
        tripId: 'LIVE-OTHER-3',
        directionId: 0,
        coordinate: { latitude: 44.1, longitude: -79.9 },
      },
      {
        id: 'other-route-bus',
        routeId: '8A',
        tripId: 'LIVE-OTHER-4',
        directionId: 1,
        coordinate: { latitude: 44.1, longitude: -79.9 },
      },
    ];

    const shapes = {
      shape8B: [
        { latitude: 44.0, longitude: -80.0 },
        { latitude: 44.1, longitude: -79.9 },
        { latitude: 44.2, longitude: -79.8 },
        { latitude: 44.35, longitude: -79.65 },
        { latitude: 44.5, longitude: -79.5 },
      ],
    };

    const tripMapping = {
      'PLANNED-8B': {
        routeId: '8B',
        directionId: 1,
        shapeId: 'shape8B',
      },
    };

    expect(selectTripPreviewVehicles({
      selectedItinerary,
      vehicles,
      shapes,
      tripMapping,
    }).map((vehicle) => vehicle.id)).toEqual(['approaching-bus']);
  });

  test('keeps exact trip matches even when the vehicle is past the boarding stop', () => {
    const selectedItinerary = {
      legs: [
        {
          mode: 'BUS',
          tripId: 'PLANNED-8B',
          from: { name: 'Boarding Stop', lat: 44.2, lon: -79.8 },
          to: { name: 'Destination Stop', lat: 44.5, lon: -79.5 },
          route: { id: '8B', shortName: '8B' },
        },
      ],
    };

    const exactVehicle = {
      id: 'exact-bus',
      routeId: '8B',
      tripId: 'PLANNED-8B',
      directionId: 1,
      coordinate: { latitude: 44.35, longitude: -79.65 },
    };

    expect(selectTripPreviewVehicles({
      selectedItinerary,
      vehicles: [exactVehicle],
      shapes: {},
      tripMapping: {},
    })).toEqual([exactVehicle]);
  });

  test('keeps an approaching first-leg route fallback when an exact trip bus is already downstream', () => {
    const selectedItinerary = {
      legs: [
        {
          mode: 'BUS',
          tripId: 'PLANNED-8B',
          directionId: 1,
          from: { name: 'Boarding Stop', lat: 44.2, lon: -79.8 },
          to: { name: 'Destination Stop', lat: 44.5, lon: -79.5 },
          route: { id: '8B', shortName: '8B' },
        },
      ],
    };

    const vehicles = [
      {
        id: 'exact-downstream',
        routeId: '8B',
        tripId: 'PLANNED-8B',
        directionId: 1,
        coordinate: { latitude: 44.35, longitude: -79.65 },
      },
      {
        id: 'route-approaching',
        routeId: '8B',
        tripId: 'LIVE-OTHER-8B',
        directionId: 1,
        coordinate: { latitude: 44.1, longitude: -79.9 },
      },
    ];

    expect(selectTripPreviewVehicles({
      selectedItinerary,
      vehicles,
      shapes: {
        shape8B: [
          { latitude: 44.1, longitude: -79.9 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.35, longitude: -79.65 },
          { latitude: 44.5, longitude: -79.5 },
        ],
      },
      tripMapping: {
        'PLANNED-8B': { routeId: '8B', directionId: 1, shapeId: 'shape8B' },
      },
    }).map((vehicle) => vehicle.id)).toEqual(['exact-downstream', 'route-approaching']);
  });

  test('keeps exact vehicle matches for merged same-route trip switches', () => {
    const selectedItinerary = {
      legs: [
        {
          mode: 'BUS',
          tripId: 'TRIP-BEFORE-SWITCH',
          tripIds: ['TRIP-BEFORE-SWITCH', 'TRIP-AFTER-SWITCH'],
          from: { name: 'Grove at Cook', lat: 44.40646, lon: -79.66828 },
          to: { name: 'Eden Drive', lat: 44.38343, lon: -79.71934 },
          route: { id: '10', shortName: '10' },
        },
      ],
    };
    const switchedVehicle = {
      id: 'same-bus-after-downtown',
      routeId: '10',
      tripId: 'TRIP-AFTER-SWITCH',
      coordinate: { latitude: 44.3904, longitude: -79.69251 },
    };

    expect(selectTripPreviewVehicles({
      selectedItinerary,
      vehicles: [switchedVehicle],
      shapes: {},
      tripMapping: {},
    })).toEqual([switchedVehicle]);
  });

  test('does not keep a passed first-leg route bus when progress filtering says it is downstream of pickup', () => {
    const selectedItinerary = {
      legs: [
        {
          mode: 'BUS',
          tripId: 'PLANNED-12A',
          from: { name: 'Boarding Stop', lat: 44.2, lon: -79.8 },
          to: { name: 'Destination Stop', lat: 44.5, lon: -79.5 },
          route: { id: '12A', shortName: '12A' },
        },
        {
          mode: 'BUS',
          tripId: 'TRANSFER-7A',
          from: { name: 'Transfer Stop', lat: 44.5, lon: -79.5 },
          to: { name: 'End Stop', lat: 44.7, lon: -79.3 },
          route: { id: '7A', shortName: '7A' },
        },
      ],
    };

    const firstLegBus = {
      id: 'closest-first-leg-bus',
      routeId: '12A',
      tripId: 'LIVE-OTHER-12A',
      directionId: 1,
      coordinate: { latitude: 44.35, longitude: -79.65 },
    };

    expect(selectTripPreviewVehicles({
      selectedItinerary,
      vehicles: [
        firstLegBus,
        {
          id: 'transfer-bus',
          routeId: '7A',
          tripId: 'LIVE-OTHER-7A',
          directionId: 1,
          coordinate: { latitude: 44.55, longitude: -79.45 },
        },
      ],
      shapes: {
        shape12A: [
          { latitude: 44.0, longitude: -80.0 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.35, longitude: -79.65 },
          { latitude: 44.5, longitude: -79.5 },
        ],
      },
      tripMapping: {
        'PLANNED-12A': {
          routeId: '12A',
          directionId: 1,
          shapeId: 'shape12A',
        },
      },
    })).toEqual([]);
  });

  test('keeps first-leg route fallback bus when a later transfer leg has an exact trip match', () => {
    const selectedItinerary = {
      legs: [
        {
          mode: 'BUS',
          tripId: 'SCHEDULED-100',
          directionId: 0,
          from: { name: 'U-Dash', lat: 44.382, lon: -79.7 },
          to: { name: 'Downtown Terminal', lat: 44.386, lon: -79.696 },
          route: { id: '100', shortName: '100', color: '#910005' },
        },
        {
          mode: 'BUS',
          tripId: 'TRANSFER-8A',
          directionId: 1,
          from: { name: 'Downtown Terminal', lat: 44.386, lon: -79.696 },
          to: { name: 'Destination', lat: 44.39, lon: -79.692 },
          route: { id: '8A', shortName: '8A', color: '#0057b8' },
        },
      ],
    };

    const vehicles = [
      {
        id: 'route-100-approaching',
        routeId: '100',
        tripId: 'LIVE-OTHER-100',
        directionId: 0,
        coordinate: { latitude: 44.381, longitude: -79.701 },
      },
      {
        id: 'transfer-exact',
        routeId: '8A',
        tripId: 'TRANSFER-8A',
        directionId: 1,
        coordinate: { latitude: 44.387, longitude: -79.695 },
      },
    ];

    const shapes = {
      shape100: [
        { latitude: 44.38, longitude: -79.702 },
        { latitude: 44.381, longitude: -79.701 },
        { latitude: 44.382, longitude: -79.7 },
        { latitude: 44.384, longitude: -79.698 },
        { latitude: 44.386, longitude: -79.696 },
      ],
    };

    const tripMapping = {
      'SCHEDULED-100': { routeId: '100', directionId: 0, shapeId: 'shape100' },
      'TRANSFER-8A': { routeId: '8A', directionId: 1, shapeId: 'shape8A' },
    };

    const selectedVehicles = selectTripPreviewVehicles({
      selectedItinerary,
      vehicles,
      shapes,
      tripMapping,
    });

    expect(selectedVehicles.map((vehicle) => vehicle.id)).toEqual([
      'route-100-approaching',
      'transfer-exact',
    ]);
    expect(buildBusApproachLines({
      legs: selectedItinerary.legs,
      tripVehicles: selectedVehicles,
      shapes,
      tripMapping,
    })).toEqual([
      {
        id: 'bus-approach-SCHEDULED-100',
        coordinates: [
          { latitude: 44.381, longitude: -79.701 },
          { latitude: 44.382, longitude: -79.7 },
        ],
        color: '#910005',
      },
    ]);
  });

  test('keeps an approaching bus on a closed loop after the rider alighting segment', () => {
    const selectedItinerary = {
      legs: [
        {
          mode: 'BUS',
          tripId: 'LOOP-TRIP',
          directionId: 0,
          from: { name: 'Loop Terminal', lat: 44.0, lon: -79.0 },
          to: { name: 'First Stop', lat: 44.0, lon: -78.99 },
          route: { id: '11', shortName: '11', color: '#B2D235' },
        },
      ],
    };

    const approachingLoopBus = {
      id: 'loop-bus-after-alighting-segment',
      routeId: '11',
      tripId: 'LIVE-ROUTE-11',
      directionId: 0,
      coordinate: { latitude: 44.0, longitude: -78.97 },
    };

    expect(selectTripPreviewVehicles({
      selectedItinerary,
      vehicles: [approachingLoopBus],
      shapes: {
        loopShape: [
          { latitude: 44.0, longitude: -79.0 },
          { latitude: 44.0, longitude: -78.99 },
          { latitude: 44.0, longitude: -78.98 },
          { latitude: 44.0, longitude: -78.97 },
          { latitude: 44.0, longitude: -79.0 },
        ],
      },
      tripMapping: {
        'LOOP-TRIP': { routeId: '11', directionId: 0, shapeId: 'loopShape' },
      },
    })).toEqual([approachingLoopBus]);
  });
});

describe('buildBusApproachLines', () => {
  test('uses a route-matched live bus when the scheduled trip id does not match realtime', () => {
    const legs = [
      {
        mode: 'BUS',
        tripId: 'SCHEDULED-11',
        route: { id: '11', color: '#B7DD2A' },
        directionId: 0,
        from: { name: 'Pickup', lat: 44.382, lon: -79.7 },
        to: { name: 'Dropoff', lat: 44.386, lon: -79.696 },
      },
    ];

    const shapes = {
      shape11: [
        { latitude: 44.38, longitude: -79.702 },
        { latitude: 44.381, longitude: -79.701 },
        { latitude: 44.382, longitude: -79.7 },
        { latitude: 44.384, longitude: -79.698 },
        { latitude: 44.386, longitude: -79.696 },
      ],
    };

    expect(buildBusApproachLines({
      legs,
      tripVehicles: [
        {
          id: 'live-route-11',
          routeId: '11',
          tripId: 'REALTIME-OTHER',
          directionId: 0,
          coordinate: { latitude: 44.381, longitude: -79.701 },
        },
      ],
      shapes,
      tripMapping: {
        'SCHEDULED-11': { shapeId: 'shape11', directionId: 0 },
      },
    })).toEqual([
      {
        id: 'bus-approach-SCHEDULED-11',
        coordinates: [
          { latitude: 44.381, longitude: -79.701 },
          { latitude: 44.382, longitude: -79.7 },
        ],
        color: '#B7DD2A',
      },
    ]);
  });

  test('returns only the first boarding approach line for transfer itineraries', () => {
    const legs = [
      {
        mode: 'WALK',
        from: { name: 'Origin', lat: 44.381, lon: -79.701 },
        to: { name: 'Stop A', lat: 44.382, lon: -79.7 },
      },
      {
        mode: 'BUS',
        tripId: 'TRIP-1',
        from: { name: 'Stop A', lat: 44.382, lon: -79.7 },
        to: { name: 'Transfer Stop', lat: 44.385, lon: -79.697 },
        route: { color: '#101010' },
      },
      {
        mode: 'WALK',
        from: { name: 'Transfer Stop', lat: 44.385, lon: -79.697 },
        to: { name: 'Stop B', lat: 44.386, lon: -79.696 },
      },
      {
        mode: 'BUS',
        tripId: 'TRIP-2',
        from: { name: 'Stop B', lat: 44.386, lon: -79.696 },
        to: { name: 'Destination Stop', lat: 44.39, lon: -79.692 },
        route: { color: '#ff66aa' },
      },
    ];

    const shapes = {
      shapeA: [
        { latitude: 44.3815, longitude: -79.7005 },
        { latitude: 44.3818, longitude: -79.7002 },
        { latitude: 44.382, longitude: -79.7 },
        { latitude: 44.384, longitude: -79.698 },
      ],
      shapeB: [
        { latitude: 44.3855, longitude: -79.6965 },
        { latitude: 44.386, longitude: -79.696 },
        { latitude: 44.388, longitude: -79.694 },
      ],
    };

    const tripVehicles = [
      {
        tripId: 'TRIP-1',
        coordinate: { latitude: 44.3815, longitude: -79.7005 },
      },
      {
        tripId: 'TRIP-2',
        coordinate: { latitude: 44.3855, longitude: -79.6965 },
      },
    ];

    const tripMapping = {
      'TRIP-1': { shapeId: 'shapeA' },
      'TRIP-2': { shapeId: 'shapeB' },
    };

    expect(buildBusApproachLines({
      legs,
      tripVehicles,
      shapes,
      tripMapping,
    })).toEqual([
      {
        id: 'bus-approach-TRIP-1',
        coordinates: [
          { latitude: 44.3815, longitude: -79.7005 },
          { latitude: 44.3818, longitude: -79.7002 },
          { latitude: 44.382, longitude: -79.7 },
        ],
        color: '#101010',
      },
    ]);
  });

  test('returns no line when the first bus has already passed the origin stop', () => {
    expect(buildBusApproachLines({
      legs: [
        {
          mode: 'BUS',
          tripId: 'TRIP-1',
          from: { name: 'Stop A', lat: 44.382, lon: -79.7 },
          to: { name: 'Stop B', lat: 44.385, lon: -79.697 },
          route: { color: '#101010' },
        },
      ],
      tripVehicles: [
        {
          tripId: 'TRIP-1',
          coordinate: { latitude: 44.384, longitude: -79.698 },
        },
      ],
      shapes: {
        shapeA: [
          { latitude: 44.382, longitude: -79.7 },
          { latitude: 44.383, longitude: -79.699 },
          { latitude: 44.384, longitude: -79.698 },
        ],
      },
      tripMapping: {
        'TRIP-1': { shapeId: 'shapeA' },
      },
    })).toEqual([]);
  });

  test('falls back to a static dashed approach segment when the live first bus is downstream', () => {
    expect(buildBusApproachLines({
      legs: [
        {
          mode: 'BUS',
          tripId: 'TRIP-7B',
          route: { id: '7B', color: '#F58220' },
          directionId: 1,
          from: { name: 'Pickup', lat: 44.2, lon: -79.8 },
          to: { name: 'Dropoff', lat: 44.5, lon: -79.5 },
        },
      ],
      tripVehicles: [
        {
          id: 'downstream-exact-bus',
          routeId: '7B',
          tripId: 'TRIP-7B',
          directionId: 1,
          coordinate: { latitude: 44.35, longitude: -79.65 },
        },
      ],
      shapes: {
        shape7B: [
          { latitude: 44.1, longitude: -79.9 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.35, longitude: -79.65 },
          { latitude: 44.5, longitude: -79.5 },
        ],
      },
      tripMapping: {
        'TRIP-7B': { routeId: '7B', directionId: 1, shapeId: 'shape7B' },
      },
    })).toEqual([
      {
        id: 'bus-approach-TRIP-7B',
        coordinates: [
          { latitude: 44.1, longitude: -79.9 },
          { latitude: 44.2, longitude: -79.8 },
        ],
        color: '#F58220',
        isStaticApproach: true,
      },
    ]);
  });

  test('uses an approaching route fallback line when the exact first-leg bus is downstream', () => {
    expect(buildBusApproachLines({
      legs: [
        {
          mode: 'BUS',
          tripId: 'TRIP-8B',
          route: { id: '8B', color: '#0057B8' },
          directionId: 1,
          from: { name: 'Stop A', lat: 44.2, lon: -79.8 },
          to: { name: 'Stop B', lat: 44.5, lon: -79.5 },
        },
      ],
      tripVehicles: [
        {
          id: 'exact-downstream',
          routeId: '8B',
          tripId: 'TRIP-8B',
          directionId: 1,
          coordinate: { latitude: 44.35, longitude: -79.65 },
        },
        {
          id: 'route-approaching',
          routeId: '8B',
          tripId: 'LIVE-OTHER-8B',
          directionId: 1,
          coordinate: { latitude: 44.1, longitude: -79.9 },
        },
      ],
      shapes: {
        shape8B: [
          { latitude: 44.1, longitude: -79.9 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.35, longitude: -79.65 },
          { latitude: 44.5, longitude: -79.5 },
        ],
      },
      tripMapping: {
        'TRIP-8B': { routeId: '8B', directionId: 1, shapeId: 'shape8B' },
      },
    })).toEqual([
      {
        id: 'bus-approach-TRIP-8B',
        coordinates: [
          { latitude: 44.1, longitude: -79.9 },
          { latitude: 44.2, longitude: -79.8 },
        ],
        color: '#0057B8',
      },
    ]);
  });

  test('uses the first transit leg route bus and direct fallback when no trip shape is available', () => {
    const line = buildBusApproachLines({
      legs: [
        {
          mode: 'WALK',
          from: { name: 'Origin', lat: 44.1, lon: -79.9 },
          to: { name: 'Boarding Stop', lat: 44.2, lon: -79.8 },
        },
        {
          mode: 'BUS',
          tripId: 'SCHEDULED-12A',
          route: { id: '12A', color: '#F39AC2' },
          directionId: 1,
          from: { name: 'Boarding Stop', lat: 44.2, lon: -79.8 },
          to: { name: 'Transfer Stop', lat: 44.5, lon: -79.5 },
        },
        {
          mode: 'BUS',
          tripId: 'TRANSFER-7A',
          route: { id: '7A', color: '#F58220' },
          directionId: 1,
          from: { name: 'Transfer Stop', lat: 44.5, lon: -79.5 },
          to: { name: 'End Stop', lat: 44.7, lon: -79.3 },
        },
      ],
      tripVehicles: [
        {
          id: 'first-leg-live-bus',
          routeId: '12A',
          tripId: 'LIVE-OTHER-12A',
          directionId: 1,
          coordinate: { latitude: 44.19, longitude: -79.81 },
        },
        {
          id: 'transfer-live-bus',
          routeId: '7A',
          tripId: 'LIVE-OTHER-7A',
          directionId: 1,
          coordinate: { latitude: 44.49, longitude: -79.51 },
        },
      ],
      shapes: {},
      tripMapping: {},
    });

    expect(line).toEqual([
      {
        id: 'bus-approach-SCHEDULED-12A',
        coordinates: [
          { latitude: 44.19, longitude: -79.81 },
          { latitude: 44.2, longitude: -79.8 },
        ],
        color: '#F39AC2',
      },
    ]);
  });

  test('uses a static route approach line when the visible bus is already past the first boarding stop', () => {
    expect(buildBusApproachLines({
      legs: [
        {
          mode: 'BUS',
          tripId: 'SCHEDULED-7B',
          route: { id: '7B', color: '#F58220' },
          directionId: 1,
          from: { name: 'Pickup', lat: 44.2, lon: -79.8 },
          to: { name: 'Dropoff', lat: 44.5, lon: -79.5 },
        },
      ],
      tripVehicles: [
        {
          id: 'downstream-route-bus',
          routeId: '7B',
          tripId: 'LIVE-OTHER-7B',
          directionId: 1,
          coordinate: { latitude: 44.35, longitude: -79.65 },
        },
      ],
      shapes: {
        shape7B: [
          { latitude: 44.0, longitude: -80.0 },
          { latitude: 44.2, longitude: -79.8 },
          { latitude: 44.35, longitude: -79.65 },
          { latitude: 44.5, longitude: -79.5 },
        ],
      },
      tripMapping: {
        'SCHEDULED-7B': { shapeId: 'shape7B', directionId: 1 },
      },
    })).toEqual([
      {
        id: 'bus-approach-SCHEDULED-7B',
        coordinates: [
          { latitude: 44.0, longitude: -80.0 },
          { latitude: 44.2, longitude: -79.8 },
        ],
        color: '#F58220',
        isStaticApproach: true,
      },
    ]);
  });

  test('draws the short forward approach segment on a closed loop route', () => {
    expect(buildBusApproachLines({
      legs: [
        {
          mode: 'BUS',
          tripId: 'LOOP-TRIP',
          directionId: 0,
          from: { name: 'Loop Terminal', lat: 44.0, lon: -79.0 },
          to: { name: 'First Stop', lat: 44.0, lon: -78.99 },
          route: { id: '11', color: '#B2D235' },
        },
      ],
      tripVehicles: [
        {
          id: 'loop-bus-after-alighting-segment',
          routeId: '11',
          tripId: 'LIVE-ROUTE-11',
          directionId: 0,
          coordinate: { latitude: 44.0, longitude: -78.97 },
        },
      ],
      shapes: {
        loopShape: [
          { latitude: 44.0, longitude: -79.0 },
          { latitude: 44.0, longitude: -78.99 },
          { latitude: 44.0, longitude: -78.98 },
          { latitude: 44.0, longitude: -78.97 },
          { latitude: 44.0, longitude: -79.0 },
        ],
      },
      tripMapping: {
        'LOOP-TRIP': { routeId: '11', directionId: 0, shapeId: 'loopShape' },
      },
    })).toEqual([
      {
        id: 'bus-approach-LOOP-TRIP',
        coordinates: [
          { latitude: 44.0, longitude: -78.97 },
          { latitude: 44.0, longitude: -79.0 },
        ],
        color: '#B2D235',
      },
    ]);
  });
});
