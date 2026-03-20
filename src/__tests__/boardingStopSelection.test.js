const mockGetActiveServicesForDate = jest.fn(() => new Set(['weekday']));

const makeStop = (id, lat, lon, name = id) => ({
  id,
  code: id,
  name,
  lat,
  lon,
  latitude: lat,
  longitude: lon,
});

const approximateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const dLat = (lat2 - lat1) * 111000;
  const dLon = (lon2 - lon1) * 111000 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

jest.mock('../services/routingDataService', () => ({
  findNearbyStops: (stops, lat, lon, maxDist) => {
    const allStops = Array.isArray(stops) ? stops : Object.values(stops || {});

    return allStops
      .map((stop) => {
        const stopLat = stop.latitude ?? stop.lat;
        const stopLon = stop.longitude ?? stop.lon;
        const walkMeters = approximateDistanceMeters(lat, lon, stopLat, stopLon);

        return {
          stop,
          walkMeters: Math.round(walkMeters),
          walkSeconds: Math.round(walkMeters / 1.2),
        };
      })
      .filter((candidate) => candidate.walkMeters <= maxDist)
      .sort((a, b) => a.walkMeters - b.walkMeters);
  },
  getDeparturesAfter: jest.fn(),
}));

jest.mock('../services/calendarService', () => ({
  getActiveServicesForDate: (...args) => mockGetActiveServicesForDate(...args),
  formatGTFSDate: jest.fn(),
}));

jest.mock('../services/itineraryBuilder', () => ({
  buildItinerary: (result) => {
    const transitLegs = result.path.filter((segment) => segment.type === 'TRANSIT');

    return {
      firstBoardingStopId: transitLegs[0]?.boardingStopId ?? null,
      tripIds: transitLegs.map((segment) => segment.tripId),
      legs: result.path,
    };
  },
}));

import { planTripLocal } from '../services/localRouter';

const buildRoutingData = ({
  stops,
  stopDepartures,
  stopTimesIndex,
  routeStopSequences,
  stopRoutes,
  tripIndex,
}) => ({
  stops,
  stopDepartures,
  stopTimesIndex,
  routeStopSequences,
  stopRoutes,
  transfers: {},
  serviceCalendar: {},
  tripIndex,
  stopIndex: stops,
});

describe('localRouter boarding stop selection', () => {
  beforeEach(() => {
    mockGetActiveServicesForDate.mockImplementation(() => new Set(['weekday']));
  });

  test('ignores closer stops on unrelated routes and boards the closest feasible stop', async () => {
    const stops = {
      R8_A: makeStop('R8_A', 44.40005, -79.70005, 'Cundles at Anne'),
      R8_B: makeStop('R8_B', 44.40015, -79.7001, 'Cundles at Sunnidale'),
      R11_A: makeStop('R11_A', 44.4004, -79.70035, 'Burns Circle'),
      R11_B: makeStop('R11_B', 44.4007, -79.70015, 'Leacock Drive'),
      R8_DEST: makeStop('R8_DEST', 44.402, -79.698, 'Route 8 Terminus'),
      DEST: makeStop('DEST', 44.4097, -79.6902, 'Downtown Terminal'),
    };

    const routingData = buildRoutingData({
      stops,
      stopDepartures: {
        R8_A: [
          {
            tripId: 'trip-8',
            routeId: '8A',
            directionId: 0,
            serviceId: 'weekday',
            headsign: 'Route 8',
            departureTime: 13 * 3600 + 5 * 60,
            pickupType: 0,
          },
        ],
        R8_B: [
          {
            tripId: 'trip-8',
            routeId: '8A',
            directionId: 0,
            serviceId: 'weekday',
            headsign: 'Route 8',
            departureTime: 13 * 3600 + 6 * 60,
            pickupType: 0,
          },
        ],
        R11_A: [
          {
            tripId: 'trip-11',
            routeId: '11',
            directionId: 0,
            serviceId: 'weekday',
            headsign: 'North Loop',
            departureTime: 13 * 3600 + 8 * 60,
            pickupType: 0,
          },
        ],
        R11_B: [
          {
            tripId: 'trip-11',
            routeId: '11',
            directionId: 0,
            serviceId: 'weekday',
            headsign: 'North Loop',
            departureTime: 13 * 3600 + 9 * 60,
            pickupType: 0,
          },
        ],
      },
      stopTimesIndex: {
        'trip-8_R8_A': { arrivalTime: 13 * 3600 + 5 * 60, departureTime: 13 * 3600 + 5 * 60 },
        'trip-8_R8_B': { arrivalTime: 13 * 3600 + 6 * 60, departureTime: 13 * 3600 + 6 * 60 },
        'trip-8_R8_DEST': { arrivalTime: 13 * 3600 + 16 * 60, departureTime: 13 * 3600 + 16 * 60 },
        'trip-11_R11_A': { arrivalTime: 13 * 3600 + 8 * 60, departureTime: 13 * 3600 + 8 * 60 },
        'trip-11_R11_B': { arrivalTime: 13 * 3600 + 9 * 60, departureTime: 13 * 3600 + 9 * 60 },
        'trip-11_DEST': { arrivalTime: 13 * 3600 + 22 * 60, departureTime: 13 * 3600 + 22 * 60 },
      },
      routeStopSequences: {
        '8A': { 0: ['R8_A', 'R8_B', 'R8_DEST'] },
        '11': { 0: ['R11_A', 'R11_B', 'DEST'] },
      },
      stopRoutes: {
        R8_A: new Set(['8A']),
        R8_B: new Set(['8A']),
        R11_A: new Set(['11']),
        R11_B: new Set(['11']),
        R8_DEST: new Set(['8A']),
        DEST: new Set(['11']),
      },
      tripIndex: {
        'trip-8': { routeId: '8A', directionId: 0, serviceId: 'weekday', headsign: 'Route 8' },
        'trip-11': { routeId: '11', directionId: 0, serviceId: 'weekday', headsign: 'North Loop' },
      },
    });

    const result = await planTripLocal({
      fromLat: 44.4,
      fromLon: -79.7,
      toLat: 44.41,
      toLon: -79.69,
      date: new Date('2025-06-11T00:00:00'),
      time: new Date('2025-06-11T13:00:00'),
      arriveBy: false,
      routingData,
    });

    expect(result.itineraries).toHaveLength(1);
    expect(result.itineraries[0].tripIds).toEqual(['trip-11']);
    expect(result.itineraries[0].firstBoardingStopId).toBe('R11_A');
  });

  test('keeps the nearest catchable upstream stop on the same trip', async () => {
    const stops = {
      UPSTREAM: makeStop('UPSTREAM', 44.40025, -79.70015, 'Burns Circle'),
      DOWNSTREAM: makeStop('DOWNSTREAM', 44.4009, -79.6999, 'Leacock Drive'),
      DEST: makeStop('DEST', 44.4098, -79.6902, 'Downtown Terminal'),
    };

    const routingData = buildRoutingData({
      stops,
      stopDepartures: {
        UPSTREAM: [
          {
            tripId: 'trip-11',
            routeId: '11',
            directionId: 0,
            serviceId: 'weekday',
            headsign: 'North Loop',
            departureTime: 13 * 3600 + 8 * 60,
            pickupType: 0,
          },
        ],
        DOWNSTREAM: [
          {
            tripId: 'trip-11',
            routeId: '11',
            directionId: 0,
            serviceId: 'weekday',
            headsign: 'North Loop',
            departureTime: 13 * 3600 + 9 * 60,
            pickupType: 0,
          },
        ],
      },
      stopTimesIndex: {
        'trip-11_UPSTREAM': { arrivalTime: 13 * 3600 + 8 * 60, departureTime: 13 * 3600 + 8 * 60 },
        'trip-11_DOWNSTREAM': { arrivalTime: 13 * 3600 + 9 * 60, departureTime: 13 * 3600 + 9 * 60 },
        'trip-11_DEST': { arrivalTime: 13 * 3600 + 22 * 60, departureTime: 13 * 3600 + 22 * 60 },
      },
      routeStopSequences: {
        '11': { 0: ['UPSTREAM', 'DOWNSTREAM', 'DEST'] },
      },
      stopRoutes: {
        UPSTREAM: new Set(['11']),
        DOWNSTREAM: new Set(['11']),
        DEST: new Set(['11']),
      },
      tripIndex: {
        'trip-11': { routeId: '11', directionId: 0, serviceId: 'weekday', headsign: 'North Loop' },
      },
    });

    const result = await planTripLocal({
      fromLat: 44.4,
      fromLon: -79.7,
      toLat: 44.41,
      toLon: -79.69,
      date: new Date('2025-06-11T00:00:00'),
      time: new Date('2025-06-11T13:00:00'),
      arriveBy: false,
      routingData,
    });

    expect(result.itineraries).toHaveLength(1);
    expect(result.itineraries[0].firstBoardingStopId).toBe('UPSTREAM');
  });
});
