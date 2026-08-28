jest.mock('../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
}));

jest.mock('../services/arrivalService', () => ({
  ...jest.requireActual('../services/arrivalService'),
  fetchTripUpdates: jest.fn(),
}));

jest.mock('../services/tripService', () => ({
  formatMinutes: (minutes) => `${minutes} min`,
}));

const { applyDelaysToItinerary, applyDelaysToItineraries, formatDelay } = require('../services/tripDelayService');
const { fetchTripUpdates } = require('../services/arrivalService');

const baseTime = Date.parse('2026-05-13T12:00:00-04:00');
const minutes = (value) => baseTime + value * 60 * 1000;

const makeBusLeg = ({ tripId, startMin, endMin }) => ({
  mode: 'BUS',
  tripId,
  startTime: minutes(startMin),
  endTime: minutes(endMin),
  scheduledStartTime: minutes(startMin),
  scheduledEndTime: minutes(endMin),
  duration: (endMin - startMin) * 60,
  from: { stopId: `${tripId}-from`, name: 'Boarding stop' },
  to: { stopId: `${tripId}-to`, name: 'Exit stop' },
  route: { shortName: '1' },
});

const makeWalkLeg = ({ startMin, endMin }) => ({
  mode: 'WALK',
  startTime: minutes(startMin),
  endTime: minutes(endMin),
  scheduledStartTime: minutes(startMin),
  scheduledEndTime: minutes(endMin),
  duration: (endMin - startMin) * 60,
  distance: 300,
  from: { name: 'Start' },
  to: { name: 'Stop' },
});

const makeItinerary = ({ id, startMin, endMin, tripId, labels = null, isRecommended = false }) => ({
  id,
  startTime: minutes(startMin),
  endTime: minutes(endMin),
  duration: (endMin - startMin) * 60,
  scheduledStartTime: minutes(startMin),
  scheduledEndTime: minutes(endMin),
  walkTime: 0,
  walkDistance: 0,
  transitTime: (endMin - startMin) * 60,
  waitingTime: 0,
  transfers: 0,
  labels,
  isRecommended,
  legs: [makeBusLeg({ tripId, startMin, endMin })],
});

const tripUpdate = (tripId, stopId, delay) => ({
  tripUpdate: {
    tripId,
    stopTimeUpdates: [{ stopId, departure: { delay } }],
  },
});

const tripUpdateWithDepartureTime = (tripId, stopId, departureTimeMs) => ({
  tripUpdate: {
    tripId,
    stopTimeUpdates: [{ stopId, departure: { time: Math.round(departureTimeMs / 1000), delay: 0 } }],
  },
});

describe('tripDelayService', () => {
  let dateNowSpy;

  beforeEach(() => {
    fetchTripUpdates.mockReset();
    dateNowSpy = null;
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
  });

  test('recalculates itinerary times when a transit leg is delayed', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(0));
    const itinerary = {
      id: 'walk-bus-walk',
      startTime: minutes(5),
      endTime: minutes(35),
      duration: 30 * 60,
      walkTime: 10 * 60,
      walkDistance: 600,
      transitTime: 20 * 60,
      waitingTime: 0,
      transfers: 0,
      legs: [
        makeWalkLeg({ startMin: 5, endMin: 10 }),
        makeBusLeg({ tripId: 'late-trip', startMin: 10, endMin: 30 }),
        makeWalkLeg({ startMin: 30, endMin: 35 }),
      ],
    };

    const updated = await applyDelaysToItinerary(
      itinerary,
      [tripUpdate('late-trip', 'late-trip-from', 10 * 60)]
    );

    expect(updated.legs[0].startTime).toBe(minutes(15));
    expect(updated.legs[0].endTime).toBe(minutes(20));
    expect(updated.legs[1].startTime).toBe(minutes(20));
    expect(updated.legs[1].endTime).toBe(minutes(40));
    expect(updated.legs[2].startTime).toBe(minutes(40));
    expect(updated.legs[2].endTime).toBe(minutes(45));
    expect(updated.startTime).toBe(minutes(15));
    expect(updated.endTime).toBe(minutes(45));
    expect(updated.duration).toBe(30 * 60);
    expect(updated.walkTime).toBe(10 * 60);
    expect(updated.transitTime).toBe(20 * 60);
    expect(updated.totalDelaySeconds).toBe(10 * 60);
    expect(updated.arrivalDelaySeconds).toBe(10 * 60);
    expect(updated.minutesUntilDeparture).toBe(15);
  });

  test('recalculates itinerary times when a transit leg is early', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(0));
    const itinerary = {
      id: 'early-bus',
      startTime: minutes(10),
      endTime: minutes(30),
      duration: 20 * 60,
      scheduledStartTime: minutes(10),
      scheduledEndTime: minutes(30),
      walkTime: 0,
      walkDistance: 0,
      transitTime: 20 * 60,
      waitingTime: 0,
      transfers: 0,
      legs: [
        makeBusLeg({ tripId: 'early-trip', startMin: 10, endMin: 30 }),
      ],
    };

    const updated = await applyDelaysToItinerary(
      itinerary,
      [tripUpdate('early-trip', 'early-trip-from', -3 * 60)]
    );

    expect(updated.legs[0].startTime).toBe(minutes(7));
    expect(updated.legs[0].endTime).toBe(minutes(27));
    expect(updated.totalDelaySeconds).toBe(-3 * 60);
    expect(updated.arrivalDelaySeconds).toBe(-3 * 60);
    expect(updated.minutesUntilDeparture).toBe(7);
  });

  test('re-ranks itineraries and refreshes the recommended label after delays', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(-10));
    fetchTripUpdates.mockResolvedValue([
      tripUpdate('original-best', 'original-best-from', 30 * 60),
    ]);

    const originalBest = makeItinerary({
      id: 'original-best-itinerary',
      startMin: 0,
      endMin: 20,
      tripId: 'original-best',
      labels: ['Recommended'],
      isRecommended: true,
    });
    const liveBest = makeItinerary({
      id: 'live-best-itinerary',
      startMin: 5,
      endMin: 30,
      tripId: 'live-best',
    });

    const updated = await applyDelaysToItineraries([originalBest, liveBest]);

    expect(updated[0].id).toBe('live-best-itinerary');
    expect(updated[0].labels).toContain('Recommended');
    expect(updated[0].isRecommended).toBe(true);
    expect(updated[1].id).toBe('original-best-itinerary');
    expect(updated[1].labels || []).not.toContain('Recommended');
    expect(updated[1].isRecommended).toBe(false);
  });

  test('does not recommend a high-walk itinerary after live re-ranking', async () => {
    fetchTripUpdates.mockResolvedValue([]);

    const highWalk = {
      ...makeItinerary({ id: 'high-walk', startMin: 0, endMin: 20, tripId: 'high-walk-trip' }),
      hasHighWalk: true,
      walkDistance: 1400,
      legs: [
        makeWalkLeg({ startMin: 0, endMin: 10 }),
        makeBusLeg({ tripId: 'high-walk-trip', startMin: 10, endMin: 20 }),
      ],
    };

    const updated = await applyDelaysToItineraries([highWalk]);

    expect(updated[0].id).toBe('high-walk');
    expect(updated[0].labels || []).not.toContain('Recommended');
    expect(updated[0].isRecommended).toBe(false);
  });

  test('demotes an itinerary when the first bus has already departed', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(12));
    fetchTripUpdates.mockResolvedValue([
      tripUpdateWithDepartureTime('missed-trip', 'missed-trip-from', minutes(10)),
    ]);

    const missed = makeItinerary({
      id: 'missed-itinerary',
      startMin: 10,
      endMin: 25,
      tripId: 'missed-trip',
      labels: ['Recommended'],
      isRecommended: true,
    });
    const viable = makeItinerary({
      id: 'viable-itinerary',
      startMin: 14,
      endMin: 35,
      tripId: 'viable-trip',
    });

    const updated = await applyDelaysToItineraries([missed, viable]);

    expect(updated[0].id).toBe('viable-itinerary');
    expect(updated[0].labels).toContain('Recommended');
    expect(updated[1].id).toBe('missed-itinerary');
    expect(updated[1].hasMissedDeparture).toBe(true);
    expect(updated[1].labels).toContain('Likely departed');
    expect(updated[1].labels || []).not.toContain('Recommended');
    expect(updated[1].isRecommended).toBe(false);
  });

  test('uses live vehicle stop sequence to catch buses that have passed the boarding stop', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(12));
    fetchTripUpdates.mockResolvedValue([]);

    const missedByVehicle = {
      ...makeItinerary({ id: 'vehicle-missed', startMin: 14, endMin: 30, tripId: 'vehicle-trip' }),
      legs: [{
        ...makeBusLeg({ tripId: 'vehicle-trip', startMin: 14, endMin: 30 }),
        boardingStopSequence: 2,
        from: { stopId: 'vehicle-trip-from', name: 'Boarding stop', stopSequence: 2 },
      }],
    };

    const updated = await applyDelaysToItineraries([missedByVehicle], {
      vehicles: [{ tripId: 'vehicle-trip', currentStopSequence: 4, timestamp: Math.round(minutes(12) / 1000) }],
    });

    expect(updated[0].hasMissedDeparture).toBe(true);
    expect(updated[0].missedDeparture.reason).toBe('vehicle_passed_stop');
    expect(updated[0].labels).toContain('Likely departed');
    expect(updated[0].isRecommended).toBe(false);
  });

  test('demotes an itinerary when live delay makes a transfer impossible', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(0));
    fetchTripUpdates.mockResolvedValue([
      tripUpdate('late-first-leg', 'late-first-leg-from', 6 * 60),
    ]);

    const missedTransfer = {
      id: 'missed-transfer',
      startTime: minutes(10),
      endTime: minutes(40),
      duration: 30 * 60,
      scheduledStartTime: minutes(10),
      scheduledEndTime: minutes(40),
      walkTime: 3 * 60,
      walkDistance: 180,
      transitTime: 27 * 60,
      waitingTime: 0,
      transfers: 1,
      labels: ['Recommended'],
      isRecommended: true,
      legs: [
        makeBusLeg({ tripId: 'late-first-leg', startMin: 10, endMin: 20 }),
        makeWalkLeg({ startMin: 20, endMin: 23 }),
        makeBusLeg({ tripId: 'connection-leg', startMin: 25, endMin: 40 }),
      ],
    };
    const viableDirect = makeItinerary({
      id: 'viable-direct',
      startMin: 12,
      endMin: 45,
      tripId: 'direct-trip',
    });

    const updated = await applyDelaysToItineraries([missedTransfer, viableDirect]);

    expect(updated[0].id).toBe('viable-direct');
    expect(updated[0].labels).toContain('Recommended');
    expect(updated[1].id).toBe('missed-transfer');
    expect(updated[1].hasMissedTransfer).toBe(true);
    expect(updated[1].transferRisk.status).toBe('missed');
    expect(updated[1].labels).toContain('Missed transfer');
    expect(updated[1].labels || []).not.toContain('Recommended');
    expect(updated[1].isRecommended).toBe(false);
  });

  test('uses separate boarding departure and alighting arrival predictions', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(0));
    const itinerary = makeItinerary({
      id: 'different-stop-delays',
      startMin: 10,
      endMin: 30,
      tripId: 'per-stop-trip',
    });
    const updates = [{
      tripUpdate: {
        tripId: 'per-stop-trip',
        stopTimeUpdates: [
          { stopId: 'per-stop-trip-from', departure: { delay: 2 * 60 } },
          { stopId: 'per-stop-trip-to', arrival: { delay: 10 * 60 } },
        ],
      },
    }];

    const updated = await applyDelaysToItinerary(itinerary, updates);

    expect(updated.legs[0].startTime).toBe(minutes(12));
    expect(updated.legs[0].endTime).toBe(minutes(40));
    expect(updated.legs[0].delaySeconds).toBe(2 * 60);
    expect(updated.legs[0].arrivalDelaySeconds).toBe(10 * 60);
    expect(updated.arrivalDelaySeconds).toBe(10 * 60);
  });

  test('derives per-stop delays from absolute realtime event times', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(0));
    const itinerary = makeItinerary({ id: 'absolute-times', startMin: 10, endMin: 30, tripId: 'absolute-trip' });
    const updates = [{
      tripUpdate: {
        tripId: 'absolute-trip',
        stopTimeUpdates: [
          { stopId: 'absolute-trip-from', departure: { time: minutes(13) / 1000 } },
          { stopId: 'absolute-trip-to', arrival: { time: minutes(35) / 1000 } },
        ],
      },
    }];

    const updated = await applyDelaysToItinerary(itinerary, updates);

    expect(updated.legs[0].startTime).toBe(minutes(13));
    expect(updated.legs[0].endTime).toBe(minutes(35));
    expect(updated.legs[0].delaySeconds).toBe(3 * 60);
    expect(updated.legs[0].arrivalDelaySeconds).toBe(5 * 60);
  });

  test('removes canceled options when a viable itinerary remains', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(0));
    fetchTripUpdates.mockResolvedValue([{
      tripUpdate: {
        tripId: 'canceled-trip',
        scheduleRelationship: 'CANCELED',
        stopTimeUpdates: [],
      },
    }]);
    const canceled = makeItinerary({ id: 'canceled', startMin: 10, endMin: 25, tripId: 'canceled-trip' });
    const viable = makeItinerary({ id: 'viable', startMin: 12, endMin: 30, tripId: 'viable-trip' });

    const updated = await applyDelaysToItineraries([canceled, viable]);

    expect(updated.map((item) => item.id)).toEqual(['viable']);
    expect(updated[0].isRecommended).toBe(true);
  });

  test('keeps an explicit non-navigable explanation when every option is disrupted', async () => {
    fetchTripUpdates.mockResolvedValue([{
      tripUpdate: {
        tripId: 'skipped-trip',
        stopTimeUpdates: [{
          stopId: 'skipped-trip-to',
          scheduleRelationship: 'SKIPPED',
        }],
      },
    }]);
    const skipped = makeItinerary({ id: 'skipped', startMin: 12, endMin: 30, tripId: 'skipped-trip' });

    const updated = await applyDelaysToItineraries([skipped]);

    expect(updated[0].hasRealtimeServiceDisruption).toBe(true);
    expect(updated[0].realtimeServiceDisruption.type).toBe('stop_skipped');
    expect(updated[0].labels).toContain('Stop skipped');
    expect(updated[0].isRecommended).toBe(false);
  });

  test('does not apply today cancellation to the same trip ID tomorrow', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseTime);
    const tomorrowStart = baseTime + 24 * 60 * 60 * 1000;
    const itinerary = {
      ...makeItinerary({ id: 'tomorrow', startMin: 10, endMin: 30, tripId: 'reused-trip' }),
      serviceDate: '20260514',
      startTime: tomorrowStart + 10 * 60 * 1000,
      endTime: tomorrowStart + 30 * 60 * 1000,
      legs: [{
        ...makeBusLeg({ tripId: 'reused-trip', startMin: 10, endMin: 30 }),
        serviceDate: '20260514',
        startTime: tomorrowStart + 10 * 60 * 1000,
        endTime: tomorrowStart + 30 * 60 * 1000,
      }],
    };
    const todayCancellation = [{
      tripUpdate: {
        tripId: 'reused-trip',
        startDate: '20260513',
        scheduleRelationship: 'CANCELED',
        stopTimeUpdates: [],
      },
    }];

    const updated = await applyDelaysToItinerary(itinerary, todayCancellation, { nowMs: baseTime });

    expect(updated.realtimeStatus).toBe('scheduled');
    expect(updated.hasRealtimeServiceDisruption).toBeUndefined();
    expect(updated.startTime).toBe(itinerary.startTime);
  });

  test('keeps a future itinerary scheduled even when legacy data lacks serviceDate', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseTime);
    const tomorrowStart = baseTime + 24 * 60 * 60 * 1000;
    const itinerary = {
      ...makeItinerary({ id: 'legacy-tomorrow', startMin: 10, endMin: 30, tripId: 'reused-trip' }),
      startTime: tomorrowStart + 10 * 60 * 1000,
      endTime: tomorrowStart + 30 * 60 * 1000,
      scheduledStartTime: tomorrowStart + 10 * 60 * 1000,
      scheduledEndTime: tomorrowStart + 30 * 60 * 1000,
      legs: [{
        ...makeBusLeg({ tripId: 'reused-trip', startMin: 10, endMin: 30 }),
        startTime: tomorrowStart + 10 * 60 * 1000,
        endTime: tomorrowStart + 30 * 60 * 1000,
        scheduledStartTime: tomorrowStart + 10 * 60 * 1000,
        scheduledEndTime: tomorrowStart + 30 * 60 * 1000,
      }],
    };

    const updated = await applyDelaysToItinerary(
      itinerary,
      [{ tripUpdate: { tripId: 'reused-trip', scheduleRelationship: 'CANCELED' } }],
      { nowMs: baseTime }
    );

    expect(updated.realtimeStatus).toBe('scheduled');
    expect(updated.hasRealtimeServiceDisruption).toBeUndefined();
  });

  test('matches realtime updates to the correct service date', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseTime);
    const itinerary = {
      ...makeItinerary({ id: 'today', startMin: 10, endMin: 30, tripId: 'reused-trip' }),
      serviceDate: '20260513',
      legs: [{
        ...makeBusLeg({ tripId: 'reused-trip', startMin: 10, endMin: 30 }),
        serviceDate: '20260513',
      }],
    };
    const tomorrowUpdate = [{
      tripUpdate: {
        tripId: 'reused-trip',
        startDate: '20260514',
        scheduleRelationship: 'CANCELED',
        stopTimeUpdates: [],
      },
    }];

    const updated = await applyDelaysToItinerary(itinerary, tomorrowUpdate, { nowMs: baseTime });

    expect(updated.realtimeStatus).toBe('scheduled');
    expect(updated.hasRealtimeServiceDisruption).toBeUndefined();
  });

  test('stale TripUpdates never alter scheduled times or service state', async () => {
    const itinerary = makeItinerary({ id: 'stale', startMin: 10, endMin: 30, tripId: 'stale-trip' });
    const staleFeed = {
      status: 'stale',
      ageMs: 10 * 60 * 1000,
      checkedAt: baseTime,
      updates: [tripUpdate('stale-trip', 'stale-trip-from', 20 * 60)],
    };

    const updated = await applyDelaysToItinerary(itinerary, staleFeed);

    expect(updated.realtimeStatus).toBe('stale');
    expect(updated.startTime).toBe(itinerary.startTime);
    expect(updated.hasRealtimeInfo).toBe(false);
  });

  test('an old update in a fresh feed cannot alter the itinerary', async () => {
    const itinerary = makeItinerary({ id: 'old-entity', startMin: 10, endMin: 30, tripId: 'old-trip' });
    const feed = {
      status: 'fresh',
      checkedAt: baseTime,
      headerTimestamp: Math.floor(baseTime / 1000),
      updates: [{
        tripUpdate: {
          tripId: 'old-trip',
          timestamp: Math.floor(baseTime / 1000) - 10 * 60,
          scheduleRelationship: 'CANCELED',
          stopTimeUpdates: [],
        },
      }],
    };

    const updated = await applyDelaysToItinerary(itinerary, feed, { nowMs: baseTime });

    expect(updated.realtimeStatus).toBe('scheduled');
    expect(updated.hasRealtimeServiceDisruption).toBeUndefined();
    expect(updated.startTime).toBe(itinerary.startTime);
  });

  test('does not infer a missed departure from a timestamp-less vehicle', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(12));
    fetchTripUpdates.mockResolvedValue([]);
    const itinerary = {
      ...makeItinerary({ id: 'no-vehicle-time', startMin: 14, endMin: 30, tripId: 'vehicle-trip' }),
      legs: [{
        ...makeBusLeg({ tripId: 'vehicle-trip', startMin: 14, endMin: 30 }),
        boardingStopSequence: 2,
      }],
    };

    const [updated] = await applyDelaysToItineraries([itinerary], {
      vehicles: [{ tripId: 'vehicle-trip', currentStopSequence: 4 }],
    });

    expect(updated.hasMissedDeparture).toBeUndefined();
  });

  test('does not use a vehicle from another service date to infer a missed departure', async () => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(minutes(12));
    fetchTripUpdates.mockResolvedValue([]);
    const itinerary = {
      ...makeItinerary({ id: 'wrong-vehicle-date', startMin: 14, endMin: 30, tripId: 'vehicle-trip' }),
      serviceDate: '20260513',
      legs: [{
        ...makeBusLeg({ tripId: 'vehicle-trip', startMin: 14, endMin: 30 }),
        serviceDate: '20260513',
        boardingStopSequence: 2,
      }],
    };

    const [updated] = await applyDelaysToItineraries([itinerary], {
      nowMs: minutes(12),
      vehicles: [{
        tripId: 'vehicle-trip',
        startDate: '20260514',
        currentStopSequence: 4,
        timestamp: Math.floor(minutes(12) / 1000),
      }],
    });

    expect(updated.hasMissedDeparture).toBeUndefined();
  });

  test('formats realtime status as on time, late, or early', () => {
    expect(formatDelay(0)).toEqual({
      text: 'On time',
      status: 'ontime',
      minutes: 0,
    });
    expect(formatDelay(90)).toEqual({
      text: '+2 min late',
      status: 'slight',
      minutes: 2,
    });
    expect(formatDelay(-90)).toEqual({
      text: '2 min early',
      status: 'early',
      minutes: -2,
    });
  });

  test('keeps sub-minute realtime changes in the correct direction', () => {
    expect(formatDelay(10).text).toBe('+1 min late');
    expect(formatDelay(-10).text).toBe('1 min early');
  });
});
