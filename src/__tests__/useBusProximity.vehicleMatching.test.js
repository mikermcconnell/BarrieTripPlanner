const {
  selectMatchingVehicleForTransitLeg,
} = require('../utils/transitVehicleMatching');

describe('useBusProximity vehicle matching', () => {
  test('prefers an approaching route bus over an exact trip bus that has already passed boarding', () => {
    const result = selectMatchingVehicleForTransitLeg({
      transitLeg: {
        tripId: 'scheduled-trip',
        route: { id: '11' },
        from: { lat: 44.4, lon: -79.7 },
        to: { lat: 44.5, lon: -79.7 },
        legGeometry: {
          points: null,
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
            latitude: 44.39,
            longitude: -79.7,
          },
        },
      ],
      shapes: {
        shape11: [
          { latitude: 44.3, longitude: -79.7 },
          { latitude: 44.4, longitude: -79.7 },
          { latitude: 44.5, longitude: -79.7 },
        ],
      },
      tripMapping: {
        'scheduled-trip': {
          shapeId: 'shape11',
        },
      },
    });

    expect(result.vehicle.id).toBe('near-approaching-bus');
    expect(result.matchQuality).toBe('route_progress');
  });
});
