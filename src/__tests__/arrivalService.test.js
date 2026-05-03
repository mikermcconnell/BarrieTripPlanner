jest.mock('../utils/fetchWithCORS', () => ({
  fetchWithCORS: jest.fn(),
}));

const { getArrivalsForStop, getNearbyStops } = require('../services/arrivalService');

describe('arrivalService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-08T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('getArrivalsForStop filters past arrivals, sorts future arrivals, and falls back to trip mapping data', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tripUpdates = [
      {
        tripUpdate: {
          tripId: 'trip-later',
          routeId: '8A',
          stopTimeUpdates: [
            {
              stopId: 'STOP-1',
              stopSequence: 12,
              arrival: { time: nowSeconds + 12 * 60, delay: 120 },
              departure: { time: nowSeconds + 13 * 60, delay: 120 },
            },
          ],
        },
      },
      {
        tripUpdate: {
          tripId: 'trip-sooner',
          routeId: null,
          stopTimeUpdates: [
            {
              stopId: 'STOP-1',
              stopSequence: 8,
              departure: { time: nowSeconds + 5 * 60, delay: 0 },
            },
          ],
        },
      },
      {
        tripUpdate: {
          tripId: 'trip-past',
          routeId: '1',
          stopTimeUpdates: [
            {
              stopId: 'STOP-1',
              stopSequence: 3,
              arrival: { time: nowSeconds - 60, delay: 0 },
            },
          ],
        },
      },
    ];

    const routes = [
      { id: '8A', shortName: '8A', color: '#0A84FF' },
      { id: '2', shortName: '2', color: '#34C759' },
    ];
    const tripMapping = {
      'trip-sooner': { routeId: '2', headsign: 'Downtown' },
      'trip-later': { routeId: '8A', headsign: 'Georgian Mall' },
    };

    const arrivals = getArrivalsForStop(tripUpdates, 'STOP-1', routes, tripMapping);

    expect(arrivals).toHaveLength(2);
    expect(arrivals.map((arrival) => arrival.tripId)).toEqual(['trip-sooner', 'trip-later']);
    expect(arrivals[0]).toEqual(
      expect.objectContaining({
        routeId: '2',
        routeShortName: '2',
        headsign: 'Downtown',
        minutesAway: 5,
      })
    );
    expect(arrivals[1]).toEqual(
      expect.objectContaining({
        routeId: '8A',
        routeShortName: '8A',
        routeColor: '#0A84FF',
        delay: 120,
        minutesAway: 12,
      })
    );
  });

  test('getNearbyStops filters by distance, sorts closest-first, and respects the result limit', () => {
    const stops = [
      { id: 'far', latitude: 44.3955, longitude: -79.6805 },
      { id: 'closest', latitude: 44.3896, longitude: -79.6901 },
      { id: 'second', latitude: 44.3905, longitude: -79.6894 },
      { id: 'outside-radius', latitude: 44.4105, longitude: -79.6505 },
    ];

    const nearbyStops = getNearbyStops(stops, 44.3894, -79.6903, 1200, 2);

    expect(nearbyStops).toHaveLength(2);
    expect(nearbyStops.map((stop) => stop.id)).toEqual(['closest', 'second']);
    expect(nearbyStops[0].distance).toBeLessThan(nearbyStops[1].distance);
    expect(nearbyStops.every((stop) => stop.distance <= 1200)).toBe(true);
  });
});
