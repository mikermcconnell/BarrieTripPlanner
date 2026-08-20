const {
  buildVehicleFeedStatus,
  isFreshVehicle,
  mapVehicleEntity,
  MAX_FUTURE_SKEW_SECONDS,
  STALE_THRESHOLD_SECONDS,
} = require('../vehicleFetcher');

describe('vehicle fetcher feed status', () => {
  test('shows when raw vehicles were filtered out because the feed is stale', () => {
    const nowSeconds = Math.floor(Date.parse('2026-05-28T15:24:32.000Z') / 1000);
    const staleTimestamp = Math.floor(Date.parse('2026-05-28T15:05:16.000Z') / 1000);

    const status = buildVehicleFeedStatus([
      {
        id: 'entity-1',
        vehicle: {
          latitude: 44.39,
          longitude: -79.69,
          timestamp: staleTimestamp,
        },
      },
    ], { nowSeconds });

    expect(status).toMatchObject({
      rawEntityCount: 1,
      positionedVehicleCount: 1,
      usableVehicleCount: 0,
      staleFilteredCount: 1,
      freshness: {
        staleThresholdMs: STALE_THRESHOLD_SECONDS * 1000,
        newestTimestampMs: staleTimestamp * 1000,
        stale: true,
        status: 'stale',
      },
    });
  });

  test('counts fresh positioned vehicles as usable', () => {
    const nowSeconds = Math.floor(Date.parse('2026-05-28T15:24:32.000Z') / 1000);

    const status = buildVehicleFeedStatus([
      {
        id: 'entity-1',
        vehicle: {
          latitude: 44.39,
          longitude: -79.69,
          timestamp: nowSeconds - 30,
        },
      },
      {
        id: 'entity-2',
        vehicle: {
          latitude: null,
          longitude: -79.7,
          timestamp: nowSeconds - 30,
        },
      },
    ], { nowSeconds });

    expect(status).toMatchObject({
      rawEntityCount: 2,
      positionedVehicleCount: 1,
      usableVehicleCount: 1,
      staleFilteredCount: 0,
      freshness: {
        stale: false,
        status: 'fresh',
      },
    });
  });

  test('rejects positioned vehicles whose evidence timestamp is missing', () => {
    const nowSeconds = Math.floor(Date.parse('2026-05-28T15:24:32.000Z') / 1000);
    const entity = {
      id: 'entity-1',
      vehicle: { latitude: 44.39, longitude: -79.69, timestamp: null },
    };

    expect(isFreshVehicle(entity, nowSeconds)).toBe(false);
    expect(buildVehicleFeedStatus([entity], { nowSeconds })).toMatchObject({
      positionedVehicleCount: 1,
      usableVehicleCount: 0,
      missingTimestampFilteredCount: 1,
      freshness: { status: 'unknown' },
    });
  });

  test('rejects timestamps beyond the allowed future clock skew', () => {
    const nowSeconds = Math.floor(Date.parse('2026-05-28T15:24:32.000Z') / 1000);
    const entity = {
      id: 'entity-1',
      vehicle: {
        latitude: 44.39,
        longitude: -79.69,
        timestamp: nowSeconds + MAX_FUTURE_SKEW_SECONDS + 1,
      },
    };

    expect(isFreshVehicle(entity, nowSeconds)).toBe(false);
    expect(buildVehicleFeedStatus([entity], { nowSeconds })).toMatchObject({
      positionedVehicleCount: 1,
      usableVehicleCount: 0,
      futureTimestampFilteredCount: 1,
      freshness: { status: 'future', futureTimestampCount: 1 },
    });
  });

  test('attaches the scheduled trip shape and direction to detector samples', () => {
    const mapped = mapVehicleEntity({
      id: 'entity-1',
      vehicle: {
        tripId: 'trip-1',
        routeId: 'live-route',
        latitude: 44.39,
        longitude: -79.69,
        timestamp: 1770000000,
        directionId: null,
      },
    }, new Map([['trip-1', {
      routeId: 'static-route',
      shapeId: 'shape-1',
      directionId: 1,
    }]]));

    expect(mapped).toEqual(expect.objectContaining({
      routeId: 'static-route',
      tripShapeId: 'shape-1',
      directionId: 1,
    }));
  });
});
