jest.mock('../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
}));

jest.mock('../services/arrivalService', () => ({
  fetchTripUpdates: jest.fn(),
}));

jest.mock('../services/tripService', () => ({
  formatMinutes: (minutes) => `${minutes} min`,
}));

const { applyDelaysToItinerary, applyDelaysToItineraries } = require('../services/tripDelayService');
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

  test('re-ranks itineraries and refreshes the recommended label after delays', async () => {
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
});
