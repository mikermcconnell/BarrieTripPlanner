jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(),
}));
jest.mock('../services/proxyAuth', () => ({ getApiProxyRequestOptions: jest.fn() }));
jest.mock('../services/locationIQService', () => ({ geocodeAddress: jest.fn(), reverseGeocode: jest.fn() }));
jest.mock('../services/arrivalService', () => ({ ...jest.requireActual('../services/arrivalService'), fetchTripUpdates: jest.fn() }));

const storage = require('@react-native-async-storage/async-storage');
const { buildRoutingData } = require('../services/routingDataService');
const { planTripAuto } = require('../services/tripService');
const { applyDelaysToItineraries } = require('../services/tripDelayService');
const { fetchTripUpdates } = require('../services/arrivalService');
const { getItineraryNavigationBlock } = require('../utils/tripNavigationSafety');
const { isItineraryFeasible } = require('../utils/itineraryFeasibility');

const time = (hour, minute = 0) => new Date(2026, 8, 20, hour, minute);
const stops = [
  { id: 'O', name: 'Origin stop', latitude: 44.390, longitude: -79.700 },
  { id: 'D', name: 'Destination stop', latitude: 44.430, longitude: -79.680 },
];
const data = (departures) => {
  const trips = departures.map((_, i) => ({ tripId: `trip-${i}`, routeId: '1', directionId: 0, serviceId: 'sunday' }));
  const stopTimes = trips.flatMap((trip, i) => stops.map((stop, j) => ({
    tripId: trip.tripId, stopId: stop.id, stopSequence: j + 1,
    arrivalTime: departures[i] + j * 15 * 60,
    departureTime: departures[i] + j * 15 * 60,
    pickupType: 0, dropOffType: 0,
  })));
  const routing = buildRoutingData({ stops, trips, stopTimes, calendar: [], calendarDates: [] });
  routing.serviceCalendar = { '20260920': new Set(['sunday']) };
  return routing;
};
const params = (routingData, requested, extra = {}) => ({
  fromLat: 44.389, fromLon: -79.700, toLat: 44.430, toLon: -79.680,
  date: requested, time: requested, routingData, onDemandZones: {}, stops,
  ...extra,
});

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(time(8).getTime());
  storage.getItem.mockResolvedValue(JSON.stringify({
    timestamp: time(8).getTime(),
    data: { duration: 600, distance: 600, geometry: 'walk', steps: [{ instruction: 'Walk', duration: 600 }], source: 'locationiq' },
  }));
  fetchTripUpdates.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

test('real routing publishes only a walking-verified preview within the original request bounds', async () => {
  const onCandidateReady = jest.fn(() => true);
  const requested = time(14);
  const plan = await planTripAuto(params(data([14 * 3600 + 300, 14 * 3600 + 1200]), requested, { onCandidateReady }));
  expect(onCandidateReady).toHaveBeenCalledTimes(1);
  const preview = onCandidateReady.mock.calls[0][0];
  expect(preview.requestedTimeMs).toBe(requested.getTime());
  expect(preview.startTime).toBeGreaterThanOrEqual(requested.getTime());
  expect(preview.legs.find(leg => leg.mode === 'BUS').tripId).toBe('trip-1');
  expect(preview.legs.filter(leg => leg.mode === 'WALK').every(leg => leg.walkingSource === 'locationiq')).toBe(true);
  expect(preview.isRecommended).toBe(false);
  expect(plan.itineraries.every(isItineraryFeasible)).toBe(true);
});

test('real routing and walking enrichment replace an unreachable first bus with a later one', async () => {
  const plan = await planTripAuto(params(data([8 * 3600 + 300, 8 * 3600 + 1200]), time(8)));
  expect(plan.itineraries.length).toBeGreaterThan(0);
  expect(plan.itineraries.every(isItineraryFeasible)).toBe(true);
  const best = plan.itineraries[0];
  expect(best.legs.find((leg) => leg.mode === 'BUS').tripId).toBe('trip-1');
  expect(best.startTime).toBe(time(8, 10).getTime());
  expect(best.requestedTimeMs).toBe(time(8).getTime());
  expect(getItineraryNavigationBlock(best)).toBeNull();
});

test('real routing reports no route rather than recommending an unreachable last bus', async () => {
  await expect(planTripAuto(params(data([11 * 3600 + 300]), time(11, 1))))
    .rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
});

test('arrive-by filtering chooses an earlier bus after the final walk grows', async () => {
  const plan = await planTripAuto(params(data([8 * 3600 + 1800, 8 * 3600 + 2400]), time(9), {
    arriveBy: true, toLat: 44.431,
  }));
  expect(plan.itineraries.every(isItineraryFeasible)).toBe(true);
  expect(plan.itineraries[0].endTime).toBeLessThanOrEqual(time(9).getTime());
  expect(plan.itineraries[0].legs.find((leg) => leg.mode === 'BUS').tripId).toBe('trip-0');
});

test('cached options are rechecked against a later request in the same five-minute bucket', async () => {
  const routing = data([9 * 3600 + 600]);
  const first = await planTripAuto(params(routing, time(9)));
  expect(first.itineraries[0].startTime).toBe(time(9).getTime());
  await expect(planTripAuto(params(routing, time(9, 3))))
    .rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
});

test('live arrive-by deadline failures lose recommendation in favour of a feasible alternative', async () => {
  const plan = await planTripAuto(params(data([10 * 3600, 10 * 3600 + 300]), time(10, 30), { arriveBy: true }));
  const lateTrip = plan.itineraries[0].legs.find((leg) => leg.mode === 'BUS').tripId;
  fetchTripUpdates.mockResolvedValue([{ tripUpdate: {
    tripId: lateTrip, startDate: '20260920', timestamp: Date.now() / 1000,
    stopTimeUpdates: [{ stopId: 'D', stopSequence: 2, arrival: { delay: 1800 } }],
  } }]);
  const updated = await applyDelaysToItineraries(plan.itineraries);
  expect(isItineraryFeasible(updated[0])).toBe(true);
  const late = updated.find((itinerary) => itinerary.legs.some((leg) => leg.tripId === lateTrip));
  expect(late.isRecommended).toBe(false);
  expect(getItineraryNavigationBlock(late).code).toBe('ARRIVES_TOO_LATE');
});


test('a failed live refresh clears cached predictions', async () => {
  const { applyDelaysToItinerary, applyDelaysToItineraries } = require('../services/tripDelayService');
  const plan = await planTripAuto(params(data([12 * 3600 + 1200]), time(12)));
  const scheduled = plan.itineraries[0];
  const tripId = scheduled.legs.find((leg) => leg.mode === 'BUS').tripId;
  const live = await applyDelaysToItinerary(scheduled, [{ tripUpdate: {
    tripId, startDate: '20260920', timestamp: Date.now() / 1000,
    stopTimeUpdates: [{ stopId: 'O', stopSequence: 1, departure: { delay: 600 } }],
  } }]);
  fetchTripUpdates.mockRejectedValue(new Error('offline'));
  const [fallback] = await applyDelaysToItineraries([live]);
  expect(fallback.legs.find((leg) => leg.mode === 'BUS').isRealtime).toBe(false);
  expect(fallback.startTime).toBe(scheduled.startTime);
});
