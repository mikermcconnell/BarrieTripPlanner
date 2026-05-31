jest.mock('../utils/fetchWithCORS', () => ({
  fetchWithCORS: jest.fn(),
}));

const {
  buildVehicleFeedStatus,
  formatVehiclesForMap,
  summarizeVehicleFeedFreshness,
} = require('../services/realtimeService');

describe('formatVehiclesForMap', () => {
  test('preserves missing speed so bearing updates are not treated as stopped buses', () => {
    const [formatted] = formatVehiclesForMap([
      {
        id: 'entity-1',
        vehicleId: 'device-42',
        latitude: 44.38,
        longitude: -79.69,
        bearing: 90,
        speed: null,
        tripId: 'tripA',
        routeId: '10',
      },
    ]);

    expect(formatted.speed).toBeNull();
  });

  test('preserves current stop sequence for trip-planning missed-bus checks', () => {
    const [formatted] = formatVehiclesForMap([
      {
        id: 'entity-1',
        vehicleId: 'device-42',
        latitude: 44.38,
        longitude: -79.69,
        bearing: 90,
        speed: 8,
        tripId: 'tripA',
        routeId: '10',
        currentStopSequence: 4,
      },
    ]);

    expect(formatted.currentStopSequence).toBe(4);
  });

  test('dedupes duplicate vehicle ids and keeps the newer snapshot', () => {
    const tripMapping = {
      tripA: { routeId: '100', headsign: 'Downtown' },
      tripB: { routeId: '100', headsign: 'Waterfront', shapeId: 'shape-b' },
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
      shapeId: 'shape-b',
      currentStatus: 2,
      stopId: 'stop-2',
      coordinate: {
        latitude: 44.381,
        longitude: -79.691,
      },
    });
  });
});

describe('vehicle feed freshness', () => {
  test('detects stale bus feed data before map markers are shown', () => {
    const now = Date.parse('2026-05-28T15:40:19.000Z');
    const timestamp = Math.floor(Date.parse('2026-05-28T15:05:16.000Z') / 1000);

    const status = buildVehicleFeedStatus([
      {
        id: 'entity-1',
        vehicle: {
          latitude: 44.39,
          longitude: -79.69,
          timestamp,
        },
      },
    ], { now });

    expect(status).toMatchObject({
      rawEntityCount: 1,
      positionedVehicleCount: 1,
      usableVehicleCount: 0,
      staleFilteredCount: 1,
      freshness: {
        stale: true,
        status: 'stale',
      },
    });
  });

  test('treats recent bus feed data as usable', () => {
    const now = Date.parse('2026-05-28T15:40:19.000Z');
    const timestamp = Math.floor((now - 30 * 1000) / 1000);

    expect(buildVehicleFeedStatus([
      {
        id: 'entity-1',
        vehicle: {
          latitude: 44.39,
          longitude: -79.69,
          timestamp,
        },
      },
    ], { now })).toMatchObject({
      positionedVehicleCount: 1,
      usableVehicleCount: 1,
      staleFilteredCount: 0,
      freshness: {
        stale: false,
        status: 'fresh',
      },
    });
  });

  test('summarizes vehicles without timestamps as unknown instead of live', () => {
    expect(summarizeVehicleFeedFreshness([{ latitude: 44.39, longitude: -79.69 }]))
      .toMatchObject({
        vehicleCount: 1,
        timestampedVehicleCount: 0,
        stale: false,
        status: 'unknown',
      });
  });
});

