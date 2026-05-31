const {
  buildVehicleFeedStatus,
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
});
