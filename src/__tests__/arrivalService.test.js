jest.mock('../utils/fetchWithCORS', () => ({
  fetchWithCORS: jest.fn(),
}));

const {
  parseTripUpdates,
  getArrivalsForStop,
  getNearbyStops,
  isTripUpdateEntityFresh,
} = require('../services/arrivalService');

const encodeVarint = (input) => {
  let value = BigInt(input);
  if (value < 0n) value = BigInt.asUintN(64, value);
  const bytes = [];
  do {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (value > 0n);
  return Buffer.from(bytes);
};
const fieldVarint = (field, value) => Buffer.concat([encodeVarint(field << 3), encodeVarint(value)]);
const fieldString = (field, value) => {
  const data = Buffer.from(value);
  return Buffer.concat([encodeVarint((field << 3) | 2), encodeVarint(data.length), data]);
};
const fieldMessage = (field, data) => Buffer.concat([
  encodeVarint((field << 3) | 2),
  encodeVarint(data.length),
  data,
]);
const buildTripUpdateFeed = ({
  tripRelationship = 0,
  stopRelationship = 0,
  headerTimestamp = Math.floor(Date.now() / 1000),
  updateTimestamp = headerTimestamp,
} = {}) => {
  const header = Buffer.concat([
    fieldString(1, '2.0'),
    fieldVarint(2, 0),
    fieldVarint(3, headerTimestamp),
  ]);
  const descriptor = Buffer.concat([
    fieldString(1, 'trip-raw'),
    fieldString(2, '08:00:00'),
    fieldString(3, '20260408'),
    fieldVarint(4, tripRelationship),
    fieldString(5, '8A'),
  ]);
  const arrival = Buffer.concat([fieldVarint(1, 301), fieldVarint(2, 1775664300)]);
  const departure = Buffer.concat([fieldVarint(1, -180), fieldVarint(2, 1775664360)]);
  const stopUpdate = Buffer.concat([
    fieldVarint(1, 4),
    fieldMessage(2, arrival),
    fieldMessage(3, departure),
    fieldString(4, 'STOP-RAW'),
    fieldVarint(5, stopRelationship),
  ]);
  const tripUpdate = Buffer.concat([
    fieldMessage(1, descriptor),
    fieldMessage(2, stopUpdate),
    fieldVarint(4, updateTimestamp),
  ]);
  return Buffer.concat([fieldMessage(1, header), fieldMessage(2, fieldMessage(3, tripUpdate))]);
};

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

  test('identifies unmatched trips and blank schedule headsigns', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const makeUpdate = (tripId, routeId) => ({
      tripUpdate: {
        tripId,
        routeId,
        stopTimeUpdates: [{
          stopId: 'STOP-1',
          stopSequence: 1,
          arrival: { time: nowSeconds + 300 },
        }],
      },
    });

    const arrivals = getArrivalsForStop(
      [makeUpdate('new-live-trip', '8A'), makeUpdate('blank-headsign-trip', '2')],
      'STOP-1',
      [],
      { 'blank-headsign-trip': { routeId: '2', headsign: '  ' } }
    );

    expect(arrivals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tripId: 'new-live-trip',
        destinationStatus: 'trip-unmatched',
        headsign: '',
      }),
      expect.objectContaining({
        tripId: 'blank-headsign-trip',
        destinationStatus: 'headsign-missing',
        headsign: '',
      }),
    ]));
  });

  test('decodes positive and negative GTFS-Realtime int32 delays without zigzag corruption', () => {
    const feed = parseTripUpdates(buildTripUpdateFeed());
    const [entity] = feed.updates;
    const [stopUpdate] = entity.tripUpdate.stopTimeUpdates;

    expect(stopUpdate.arrival).toEqual({ delay: 301, time: 1775664300 });
    expect(stopUpdate.departure).toEqual({ delay: -180, time: 1775664360 });
    expect(entity.tripUpdate).toEqual(expect.objectContaining({
      startDate: '20260408',
      startTime: '08:00:00',
      timestamp: Math.floor(Date.now() / 1000),
    }));
    expect(feed).toEqual(expect.objectContaining({
      status: 'fresh',
      headerTimestamp: Math.floor(Date.now() / 1000),
      incrementality: 'FULL_DATASET',
    }));
  });

  test('parses and excludes canceled trips and skipped stops from arrivals', () => {
    const canceled = parseTripUpdates(buildTripUpdateFeed({ tripRelationship: 3 }));
    const skipped = parseTripUpdates(buildTripUpdateFeed({ stopRelationship: 1 }));

    expect(canceled.updates[0].tripUpdate.scheduleRelationship).toBe('CANCELED');
    expect(skipped.updates[0].tripUpdate.stopTimeUpdates[0].scheduleRelationship).toBe('SKIPPED');
    expect(getArrivalsForStop(canceled, 'STOP-RAW', [], {})).toEqual([]);
    expect(getArrivalsForStop(skipped, 'STOP-RAW', [], {})).toEqual([]);
  });

  test('marks old feeds stale and refuses to label their predictions live', () => {
    const stale = parseTripUpdates(buildTripUpdateFeed({
      headerTimestamp: Math.floor(Date.now() / 1000) - 10 * 60,
      updateTimestamp: Math.floor(Date.now() / 1000) - 10 * 60,
    }));

    expect(stale.status).toBe('stale');
    expect(stale.ageMs).toBe(10 * 60 * 1000);
    expect(getArrivalsForStop(stale, 'STOP-RAW', [], {})).toEqual([]);
  });

  test('rejects an old individual update even when the feed header is fresh', () => {
    const feed = parseTripUpdates(buildTripUpdateFeed({
      updateTimestamp: Math.floor(Date.now() / 1000) - 10 * 60,
    }));

    expect(feed.status).toBe('fresh');
    expect(isTripUpdateEntityFresh(feed.updates[0], feed)).toBe(false);
    expect(getArrivalsForStop(feed, 'STOP-RAW', [], {})).toEqual([]);
  });
});
