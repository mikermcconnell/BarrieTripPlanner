const {
  createVehicleSampleFreshnessTracker,
  makeVehicleSampleKey,
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
});
