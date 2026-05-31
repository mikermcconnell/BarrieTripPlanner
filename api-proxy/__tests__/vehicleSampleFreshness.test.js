const {
  createVehicleSampleFreshnessTracker,
  makeVehicleSampleKey,
  summarizeVehicleFeedFreshness,
  toVehicleTimestampMs,
} = require('../detour/vehicleSampleFreshness');

describe('vehicle sample freshness tracking', () => {
  test('keeps first vehicle sample and drops duplicate feed snapshots', () => {
    const tracker = createVehicleSampleFreshnessTracker();
    const vehicle = {
      id: 'bus-1',
      routeId: '8A',
      tripId: 'trip-1',
      timestamp: 1770000000,
      coordinate: { latitude: 44.39, longitude: -79.69 },
    };

    expect(tracker.filterFreshSamples([vehicle])).toEqual([vehicle]);
    expect(tracker.filterFreshSamples([{ ...vehicle }])).toEqual([]);
  });

  test('treats changed timestamp or position as fresh evidence', () => {
    const tracker = createVehicleSampleFreshnessTracker();
    const vehicle = {
      id: 'bus-1',
      routeId: '8A',
      tripId: 'trip-1',
      timestamp: 1770000000,
      coordinate: { latitude: 44.39, longitude: -79.69 },
    };

    tracker.filterFreshSamples([vehicle]);

    expect(tracker.filterFreshSamples([{ ...vehicle, timestamp: 1770000030 }])).toHaveLength(1);
    expect(tracker.filterFreshSamples([
      {
        ...vehicle,
        coordinate: { latitude: 44.3901, longitude: -79.69 },
      },
    ])).toHaveLength(1);
  });

  test('builds a stable key from vehicle identity, assignment, timestamp, and position', () => {
    expect(makeVehicleSampleKey({
      id: 'bus-1',
      routeId: '8A',
      tripId: 'trip-1',
      timestamp: 1770000000,
      coordinate: { latitude: 44.3900004, longitude: -79.6900004 },
    })).toBe('bus-1|8A|trip-1|1770000000|44.390000|-79.690000');
  });

  test('summarizes a stale timestamped vehicle feed', () => {
    const now = Date.parse('2026-05-28T15:24:32.000Z');
    const timestamp = Math.floor(Date.parse('2026-05-28T15:05:16.000Z') / 1000);

    const result = summarizeVehicleFeedFreshness(
      [{ id: 'bus-1', timestamp }],
      { now, staleThresholdMs: 5 * 60 * 1000 }
    );

    expect(result).toMatchObject({
      vehicleCount: 1,
      timestampedVehicleCount: 1,
      newestTimestampMs: timestamp * 1000,
      oldestTimestampMs: timestamp * 1000,
      newestAgeMs: now - timestamp * 1000,
      stale: true,
      status: 'stale',
    });
  });

  test('keeps feed status fresh when newest timestamp is within threshold', () => {
    const now = Date.parse('2026-05-28T15:24:32.000Z');
    const timestamp = Math.floor((now - 30 * 1000) / 1000);

    expect(summarizeVehicleFeedFreshness(
      [{ id: 'bus-1', timestamp }],
      { now, staleThresholdMs: 5 * 60 * 1000 }
    )).toMatchObject({
      stale: false,
      status: 'fresh',
    });
  });

  test('reports unknown freshness when vehicles have no timestamps', () => {
    expect(summarizeVehicleFeedFreshness([{ id: 'bus-1' }])).toMatchObject({
      vehicleCount: 1,
      timestampedVehicleCount: 0,
      stale: false,
      status: 'unknown',
    });
  });

  test('normalizes seconds and milliseconds timestamps', () => {
    expect(toVehicleTimestampMs({ timestamp: 1770000000 })).toBe(1770000000000);
    expect(toVehicleTimestampMs({ timestampMs: 1770000000000 })).toBe(1770000000000);
    expect(toVehicleTimestampMs({ timestamp: 'bad' })).toBeNull();
  });

  test('includes feed freshness in tracker stats', () => {
    const tracker = createVehicleSampleFreshnessTracker();
    const now = Date.parse('2026-05-28T15:24:32.000Z');
    const timestamp = Math.floor(Date.parse('2026-05-28T15:05:16.000Z') / 1000);

    tracker.filterFreshSamples([
      {
        id: 'bus-1',
        routeId: '8A',
        tripId: 'trip-1',
        timestamp,
        coordinate: { latitude: 44.39, longitude: -79.69 },
      },
    ], { now });

    expect(tracker.getStats().feedFreshness).toMatchObject({
      vehicleCount: 1,
      stale: true,
      status: 'stale',
    });
  });
});
