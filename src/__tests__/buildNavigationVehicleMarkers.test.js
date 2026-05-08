const {
  buildTrackedBusMarker,
  buildWalkingBusMarker,
} = require('../features/navigation/model/buildNavigationVehicleMarkers');

describe('buildNavigationVehicleMarkers', () => {
  test('buildTrackedBusMarker prefers an exact trip match', () => {
    const currentTransitLeg = {
      tripId: 'trip-1',
      route: {
        id: 'route-1',
        shortName: '1A',
        color: '#0055AA',
      },
    };

    const trackedBusMarker = buildTrackedBusMarker({
      currentTransitLeg,
      vehicles: [
        {
          id: 'vehicle-1',
          tripId: 'trip-1',
          routeId: 'route-1',
          bearing: 180,
          coordinate: {
            latitude: 44.41,
            longitude: -79.69,
          },
        },
        {
          id: 'vehicle-2',
          tripId: 'trip-2',
          routeId: 'route-1',
          coordinate: {
            latitude: 44.4,
            longitude: -79.7,
          },
        },
      ],
      routePathsByRouteId: new Map(),
    });

    expect(trackedBusMarker).toEqual(
      expect.objectContaining({
        id: 'tracked-bus',
        routeId: 'route-1',
        routeShortName: '1A',
        color: '#0055AA',
        latitude: 44.41,
        longitude: -79.69,
      })
    );
    expect(trackedBusMarker.vehicle.tripId).toBe('trip-1');
  });

  test('buildWalkingBusMarker falls back to the previous transit leg while walking', () => {
    const itinerary = {
      legs: [
        {
          mode: 'BUS',
          tripId: 'trip-previous',
          route: {
            id: 'route-7',
            shortName: '7',
            color: '#7700AA',
          },
        },
        {
          mode: 'WALK',
        },
      ],
    };

    const walkingBusMarker = buildWalkingBusMarker({
      itinerary,
      currentLegIndex: 1,
      isWalkingLeg: true,
      nextTransitLeg: null,
      vehicles: [
        {
          id: 'vehicle-7',
          tripId: 'trip-previous',
          routeId: 'route-7',
          bearing: 270,
          coordinate: {
            latitude: 44.42,
            longitude: -79.68,
          },
        },
      ],
      routePathsByRouteId: new Map(),
    });

    expect(walkingBusMarker).toEqual(
      expect.objectContaining({
        id: 'walking-bus',
        routeId: 'route-7',
        routeShortName: '7',
        color: '#7700AA',
        latitude: 44.42,
        longitude: -79.68,
      })
    );
    expect(walkingBusMarker.vehicle.tripId).toBe('trip-previous');
    expect(walkingBusMarker.bearing).toBe(270);
  });

  test('buildWalkingBusMarker points the arrow toward the boarding stop while walking to transit', () => {
    const walkingBusMarker = buildWalkingBusMarker({
      itinerary: {
        legs: [
          { mode: 'WALK' },
          {
            mode: 'BUS',
            tripId: 'trip-next',
            route: {
              id: 'route-100',
              shortName: '100',
              color: '#AA0000',
            },
            from: {
              lat: 44.4,
              lon: -79.7,
            },
          },
        ],
      },
      currentLegIndex: 0,
      isWalkingLeg: true,
      nextTransitLeg: {
        mode: 'BUS',
        tripId: 'trip-next',
        route: {
          id: 'route-100',
          shortName: '100',
          color: '#AA0000',
        },
        from: {
          lat: 44.4,
          lon: -79.7,
        },
      },
      vehicles: [
        {
          id: 'vehicle-100',
          tripId: 'trip-next',
          routeId: 'route-100',
          bearing: 0,
          coordinate: {
            latitude: 44.41,
            longitude: -79.7,
          },
        },
      ],
      routePathsByRouteId: new Map(),
    });

    expect(walkingBusMarker.bearing).toBeCloseTo(180, 0);
    expect(walkingBusMarker.vehicle.bearing).toBeCloseTo(180, 0);
  });

  test('buildWalkingBusMarker uses the proximity-selected next bus while walking', () => {
    const walkingBusMarker = buildWalkingBusMarker({
      itinerary: {
        legs: [
          { mode: 'WALK' },
          {
            mode: 'BUS',
            tripId: 'scheduled-trip',
            route: {
              id: '11',
              shortName: '11',
              color: '#AA0000',
            },
            from: {
              lat: 44.4,
              lon: -79.7,
            },
          },
        ],
      },
      currentLegIndex: 0,
      isWalkingLeg: true,
      nextTransitLeg: {
        mode: 'BUS',
        tripId: 'scheduled-trip',
        route: {
          id: '11',
          shortName: '11',
          color: '#AA0000',
        },
        from: {
          lat: 44.4,
          lon: -79.7,
        },
      },
      vehicles: [
        {
          id: 'far-scheduled-bus',
          tripId: 'scheduled-trip',
          routeId: '11',
          coordinate: {
            latitude: 44.46,
            longitude: -79.7,
          },
        },
        {
          id: 'near-approaching-bus',
          tripId: 'near-trip',
          routeId: '11',
          coordinate: {
            latitude: 44.405,
            longitude: -79.7,
          },
        },
      ],
      nextTransitProximityVehicle: {
        id: 'near-approaching-bus',
        tripId: 'near-trip',
        routeId: '11',
        coordinate: {
          latitude: 44.405,
          longitude: -79.7,
        },
      },
      routePathsByRouteId: new Map(),
    });

    expect(walkingBusMarker.vehicle.id).toBe('near-approaching-bus');
    expect(walkingBusMarker.latitude).toBe(44.405);
  });

  test('buildTrackedBusMarker falls back to route match when trip match is unavailable', () => {
    const trackedBusMarker = buildTrackedBusMarker({
      currentTransitLeg: {
        tripId: 'missing-trip',
        route: {
          id: 'route-10',
          shortName: '10',
          color: '#2244FF',
        },
      },
      vehicles: [
        {
          id: 'vehicle-10',
          routeId: 'route-10',
          coordinate: {
            latitude: 44.5,
            longitude: -79.5,
          },
        },
      ],
      routePathsByRouteId: new Map(),
    });

    expect(trackedBusMarker).toEqual(
      expect.objectContaining({
        routeId: 'route-10',
        routeShortName: '10',
        latitude: 44.5,
        longitude: -79.5,
      })
    );
    expect(trackedBusMarker.vehicle.routeId).toBe('route-10');
  });

  test('buildTrackedBusMarker falls back to proximity vehicle when no live list match exists', () => {
    const trackedBusMarker = buildTrackedBusMarker({
      currentTransitLeg: {
        tripId: 'trip-12',
        route: {
          id: 'route-12',
          shortName: '12',
          color: '#11AA66',
        },
      },
      vehicles: [],
      busProximityVehicle: {
        id: 'proximity-12',
        coordinate: {
          latitude: 44.51,
          longitude: -79.51,
        },
      },
      routePathsByRouteId: new Map(),
    });

    expect(trackedBusMarker).toEqual(
      expect.objectContaining({
        routeId: 'route-12',
        routeShortName: '12',
        latitude: 44.51,
        longitude: -79.51,
      })
    );
    expect(trackedBusMarker.vehicle.routeId).toBe('route-12');
  });

  test('returns null when the resolved vehicle has no coordinate', () => {
    const trackedBusMarker = buildTrackedBusMarker({
      currentTransitLeg: {
        tripId: 'trip-99',
        route: {
          id: 'route-99',
          shortName: '99',
          color: '#999999',
        },
      },
      vehicles: [
        {
          id: 'vehicle-99',
          tripId: 'trip-99',
          routeId: 'route-99',
        },
      ],
      routePathsByRouteId: new Map(),
    });

    expect(trackedBusMarker).toBeNull();
  });
});
