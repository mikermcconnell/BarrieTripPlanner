jest.mock('../utils/fetchWithCORS', () => ({
  fetchWithCORS: jest.fn(),
}));

const { formatVehiclesForMap } = require('../services/realtimeService');

describe('formatVehiclesForMap', () => {
  test('dedupes duplicate vehicle ids and keeps the newer snapshot', () => {
    const tripMapping = {
      tripA: { routeId: '100', headsign: 'Downtown' },
      tripB: { routeId: '100', headsign: 'Waterfront' },
    };

    const vehicles = [
      {
        id: 'entity-1',
        vehicleId: 'device-42',
        vehicleLabel: '42',
        latitude: 44.38,
        longitude: -79.69,
        bearing: 90,
        speed: 8,
        tripId: 'tripA',
        timestamp: 1700000000,
        currentStatus: 1,
        stopId: 'stop-1',
      },
      {
        id: 'entity-2',
        vehicleId: 'device-42',
        vehicleLabel: '42',
        latitude: 44.381,
        longitude: -79.691,
        bearing: 180,
        speed: 9,
        tripId: 'tripB',
        timestamp: 1700000060,
        currentStatus: 2,
        stopId: 'stop-2',
      },
    ];

    const formatted = formatVehiclesForMap(vehicles, tripMapping);

    expect(formatted).toHaveLength(1);
    expect(formatted[0]).toMatchObject({
      id: 'device-42',
      tripId: 'tripB',
      routeId: '100',
      headsign: 'Waterfront',
      currentStatus: 2,
      stopId: 'stop-2',
      coordinate: {
        latitude: 44.381,
        longitude: -79.691,
      },
    });
  });
});
