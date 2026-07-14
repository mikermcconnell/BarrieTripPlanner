/**
 * Tests for local RAPTOR router — trip deduplication and time diversity.
 *
 * Proves that the router:
 * 1. Deduplicates results using the same physical bus trip (tripId)
 * 2. Runs multiple RAPTOR passes to find different departure times
 * 3. Shows genuinely different trip options instead of same-bus variants
 */

import { planTripLocal, RoutingError } from '../services/localRouter';
import { ROUTING_CONFIG } from '../config/constants';

const mockGetActiveServicesForDate = jest.fn(() => new Set(['weekday']));

// ── Helpers ──────────────────────────────────────────────────

/** Build a minimal stop object */
const makeStop = (id, lat, lon, name) => ({ id, lat, lon, name: name || id });

/**
 * Build fake routingData that simulates a corridor with:
 *  - 3 origin-area stops (O1, O2, O3)  close to origin
 *  - 3 destination-area stops (D1, D2, D3) close to destination
 *  - Route 2A with 3 trips departing at different times
 *    Each trip visits all 6 stops in sequence
 */
const buildFakeRoutingData = () => {
  // Origin stops clustered near (44.389, -79.700)
  // Destination stops clustered near (44.400, -79.680) — ~2km away
  // This ensures dest stops are NOT walkable from origin (>800m)
  const stops = {
    O1: makeStop('O1', 44.389, -79.700, 'Origin Stop 1'),
    O2: makeStop('O2', 44.3895, -79.6995, 'Origin Stop 2'),
    O3: makeStop('O3', 44.390, -79.699, 'Origin Stop 3'),
    D1: makeStop('D1', 44.400, -79.680, 'Dest Stop 1'),
    D2: makeStop('D2', 44.4005, -79.6795, 'Dest Stop 2'),
    D3: makeStop('D3', 44.401, -79.679, 'Dest Stop 3'),
  };

  const serviceId = 'weekday';

  // 3 trips on route 2A, direction 0, departing at different times
  // All times in seconds since midnight (PM values)
  // Trip A: departs O1 at 70320 (7:32 PM = 19*3600 + 32*60)
  // Trip B: departs O1 at 71100 (7:45 PM = 19*3600 + 45*60)
  // Trip C: departs O1 at 71880 (7:58 PM = 19*3600 + 58*60)
  const trips = {
    'trip-A': { routeId: '2A', directionId: 0, serviceId, headsign: 'Dunlop' },
    'trip-B': { routeId: '2A', directionId: 0, serviceId, headsign: 'Dunlop' },
    'trip-C': { routeId: '2A', directionId: 0, serviceId, headsign: 'Dunlop' },
  };

  // Stop times for each trip (arrival/departure at each stop)
  const tripStopTimes = {
    'trip-A': [
      { stopId: 'O1', arrivalTime: 70320, departureTime: 70320 },
      { stopId: 'O2', arrivalTime: 70380, departureTime: 70380 },
      { stopId: 'O3', arrivalTime: 70440, departureTime: 70440 },
      { stopId: 'D1', arrivalTime: 70680, departureTime: 70680 },
      { stopId: 'D2', arrivalTime: 70740, departureTime: 70740 },
      { stopId: 'D3', arrivalTime: 70800, departureTime: 70800 },
    ],
    'trip-B': [
      { stopId: 'O1', arrivalTime: 71100, departureTime: 71100 },
      { stopId: 'O2', arrivalTime: 71160, departureTime: 71160 },
      { stopId: 'O3', arrivalTime: 71220, departureTime: 71220 },
      { stopId: 'D1', arrivalTime: 71460, departureTime: 71460 },
      { stopId: 'D2', arrivalTime: 71520, departureTime: 71520 },
      { stopId: 'D3', arrivalTime: 71580, departureTime: 71580 },
    ],
    'trip-C': [
      { stopId: 'O1', arrivalTime: 71880, departureTime: 71880 },
      { stopId: 'O2', arrivalTime: 71940, departureTime: 71940 },
      { stopId: 'O3', arrivalTime: 72000, departureTime: 72000 },
      { stopId: 'D1', arrivalTime: 72240, departureTime: 72240 },
      { stopId: 'D2', arrivalTime: 72300, departureTime: 72300 },
      { stopId: 'D3', arrivalTime: 72360, departureTime: 72360 },
    ],
  };

  // Build stopDepartures: for each stop, sorted list of departures
  const stopDepartures = {};
  for (const [tripId, tripInfo] of Object.entries(trips)) {
    const stopTimes = tripStopTimes[tripId];
    for (const st of stopTimes) {
      if (!stopDepartures[st.stopId]) stopDepartures[st.stopId] = [];
      stopDepartures[st.stopId].push({
        tripId,
        routeId: tripInfo.routeId,
        directionId: tripInfo.directionId,
        serviceId: tripInfo.serviceId,
        departureTime: st.departureTime,
        headsign: tripInfo.headsign,
        pickupType: 0,
      });
    }
  }
  // Sort each stop's departures by time
  for (const stopId of Object.keys(stopDepartures)) {
    stopDepartures[stopId].sort((a, b) => a.departureTime - b.departureTime);
  }

  // Build stopTimesIndex: tripId_stopId → { arrivalTime, departureTime }
  const stopTimesIndex = {};
  for (const [tripId, stopTimes] of Object.entries(tripStopTimes)) {
    for (const st of stopTimes) {
      stopTimesIndex[`${tripId}_${st.stopId}`] = {
        arrivalTime: st.arrivalTime,
        departureTime: st.departureTime,
      };
    }
  }

  // Route stop sequences: route → direction → ordered stop IDs
  const routeStopSequences = {
    '2A': {
      '0': ['O1', 'O2', 'O3', 'D1', 'D2', 'D3'],
    },
  };

  // stopRoutes: which routes serve each stop
  const stopRoutes = {};
  for (const stopId of ['O1', 'O2', 'O3', 'D1', 'D2', 'D3']) {
    stopRoutes[stopId] = new Set(['2A']);
  }

  // transfers: walking connections between stops (empty — all on same route)
  const transfers = {};

  // Calendar: weekday service is active
  const serviceCalendar = {
    services: {
      weekday: {
        monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1,
        saturday: 0, sunday: 0,
        start_date: '20250101', end_date: '20261231',
      },
    },
    exceptions: {},
  };

  return {
    stops,
    stopDepartures,
    stopTimesIndex,
    routeStopSequences,
    stopRoutes,
    transfers,
    serviceCalendar,
    tripIndex: trips,
    stopIndex: stops,
  };
};

// ── Mock dependencies ────────────────────────────────────────

// Mock routingDataService — override findNearbyStops and haversineDistance
jest.mock('../services/routingDataService', () => ({
  findNearbyStops: (stops, lat, lon, maxDist) => {
    // Return stops within ~500m of the query point
    const results = [];
    for (const [id, stop] of Object.entries(stops)) {
      const dlat = (stop.lat - lat) * 111000;
      const dlon = (stop.lon - lon) * 111000 * Math.cos(lat * Math.PI / 180);
      const dist = Math.sqrt(dlat * dlat + dlon * dlon);
      if (dist <= maxDist) {
        const walkSeconds = Math.round(dist / 1.2); // WALK_SPEED
        results.push({ stop, distance: dist, walkSeconds });
      }
    }
    return results;
  },
  getDeparturesAfter: jest.fn(),
  haversineDistance: (lat1, lon1, lat2, lon2) => {
    const dlat = (lat2 - lat1) * 111000;
    const dlon = (lon2 - lon1) * 111000 * Math.cos(lat1 * Math.PI / 180);
    return Math.sqrt(dlat * dlat + dlon * dlon);
  },
}));

// Mock calendarService
jest.mock('../services/calendarService', () => ({
  getActiveServicesForDate: (...args) => mockGetActiveServicesForDate(...args),
  formatGTFSDate: jest.fn(),
}));

// Mock itineraryBuilder — return a simplified itinerary with key fields
jest.mock('../services/itineraryBuilder', () => ({
  buildItinerary: (result, routingData, opts) => {
    const transitLegs = result.path.filter((p) => p.type === 'TRANSIT');
    const tripIds = transitLegs.map((t) => t.tripId);
    const boardingTimes = transitLegs.map((t) => t.boardingTime);
    const startSeconds = Math.min(...boardingTimes);
    const endSeconds = result.arrivalTime;
    const baseTime = new Date(opts.date);
    baseTime.setHours(0, 0, 0, 0);
    const startTime = baseTime.getTime() + startSeconds * 1000;
    const endTime = baseTime.getTime() + endSeconds * 1000;
    return {
      id: `itin-${tripIds.join('-')}`,
      tripIds,
      boardingTimes,
      duration: endSeconds - startSeconds,
      startTime,
      endTime,
      transfers: Math.max(0, transitLegs.length - 1),
      walkDistance: 0,
      arrivalTime: result.arrivalTime,
      walkToDestSeconds: result.walkToDestSeconds,
      destinationStopId: result.destinationStopId,
      legs: result.path.map((segment) => (
        segment.type === 'TRANSIT'
          ? {
              mode: 'BUS',
              startTime: baseTime.getTime() + segment.boardingTime * 1000,
              endTime: baseTime.getTime() + segment.alightingTime * 1000,
              duration: segment.alightingTime - segment.boardingTime,
              tripId: segment.tripId,
              routeId: segment.routeId,
            }
          : segment
      )),
    };
  },
}));

// ── Tests ────────────────────────────────────────────────────

describe('localRouter — trip deduplication and time diversity', () => {
  const routingData = buildFakeRoutingData();

  beforeEach(() => {
    mockGetActiveServicesForDate.mockImplementation(() => new Set(['weekday']));
  });

  // Origin near O1 (44.389, -79.700), Destination near D1 (44.400, -79.680)
  const tripParams = {
    fromLat: 44.389,
    fromLon: -79.700,
    toLat: 44.400,
    toLon: -79.680,
    date: new Date('2025-06-11T00:00:00'), // a Wednesday
    time: (() => {
      const t = new Date('2025-06-11T19:25:00'); // 7:25 PM — before first trip at 7:32
      return t;
    })(),
    arriveBy: false,
    routingData,
  };

  test('returns up to 3 itineraries with DIFFERENT trip IDs', async () => {
    const result = await planTripLocal(tripParams);

    expect(result.itineraries.length).toBeGreaterThanOrEqual(2);
    expect(result.itineraries.length).toBeLessThanOrEqual(3);

    // Each itinerary should use a different trip
    const allTripIds = result.itineraries.map((it) => it.tripIds.join('|'));
    const uniqueTripIds = new Set(allTripIds);
    expect(uniqueTripIds.size).toBe(result.itineraries.length);
  });

  test('uses a long-walk fallback when the origin is inside Barrie but more than the normal walk limit from a stop', async () => {
    const result = await planTripLocal({
      ...tripParams,
      // About 890m south of O1: outside the normal 800m walk-to-transit search,
      // but still close enough for the long-walk fallback.
      fromLat: 44.381,
      fromLon: -79.700,
    });

    expect(result.itineraries.length).toBeGreaterThan(0);
    expect(result.accessWalkFallback).toEqual(expect.objectContaining({
      origin: true,
      destination: false,
    }));
  });

  test('throws no-nearby-stops instead of outside-service-area when no stop is close enough', async () => {
    await expect(planTripLocal({
      ...tripParams,
      fromLat: 44.25,
      fromLon: -79.70,
    })).rejects.toMatchObject({
      code: 'NO_NEARBY_STOPS',
      message: 'No bus stops are close enough to your starting location',
    });
  });

  test('no two itineraries use the same tripId (anti-regression)', async () => {
    const result = await planTripLocal(tripParams);

    // Collect every tripId used across all itineraries
    const tripIdUsage = new Map(); // tripId → count
    for (const itin of result.itineraries) {
      for (const tid of itin.tripIds) {
        tripIdUsage.set(tid, (tripIdUsage.get(tid) || 0) + 1);
      }
    }

    // No trip should appear in more than one itinerary
    for (const [tid, count] of tripIdUsage) {
      expect(count).toBe(1);
    }
  });

  test('itineraries are sorted by arrival time (earliest first)', async () => {
    const result = await planTripLocal(tripParams);

    for (let i = 1; i < result.itineraries.length; i++) {
      expect(result.itineraries[i].arrivalTime)
        .toBeGreaterThanOrEqual(result.itineraries[i - 1].arrivalTime);
    }
  });

  test('first itinerary uses the earliest available trip', async () => {
    const result = await planTripLocal(tripParams);

    // trip-A departs at 27120 (7:32 PM) — should be the first option
    expect(result.itineraries[0].tripIds).toContain('trip-A');
  });

  test('second itinerary uses a later departure than the first', async () => {
    const result = await planTripLocal(tripParams);

    if (result.itineraries.length >= 2) {
      const firstBoardingTime = result.itineraries[0].boardingTimes[0];
      const secondBoardingTime = result.itineraries[1].boardingTimes[0];
      expect(secondBoardingTime).toBeGreaterThan(firstBoardingTime);
    }
  });

  test('keeps the best stop pairing for each trip (shortest walk)', async () => {
    const result = await planTripLocal(tripParams);

    // For the first itinerary (trip-A), the destination stop should be the
    // one closest to the destination (D1 is closest to toLat/toLon)
    expect(result.itineraries[0].destinationStopId).toBe('D1');
  });
});

describe('localRouter — edge cases', () => {
  const routingData = buildFakeRoutingData();

  beforeEach(() => {
    mockGetActiveServicesForDate.mockImplementation(() => new Set(['weekday']));
  });

  test('returns at most MAX_ITINERARIES results', async () => {
    const result = await planTripLocal({
      fromLat: 44.389,
      fromLon: -79.700,
      toLat: 44.400,
      toLon: -79.680,
      date: new Date('2025-06-11T00:00:00'),
      time: new Date('2025-06-11T19:25:00'),
      arriveBy: false,
      routingData,
    });

    expect(result.itineraries.length).toBeLessThanOrEqual(ROUTING_CONFIG.MAX_ITINERARIES);
  });

  test('finds arrive-by trips that depart more than one hour before arrival', async () => {
    const longTripRoutingData = buildFakeRoutingData();
    Object.keys(longTripRoutingData.stopDepartures).forEach((stopId) => {
      longTripRoutingData.stopDepartures[stopId] = longTripRoutingData.stopDepartures[stopId]
        .filter((departure) => departure.tripId === 'trip-A');
    });
    const longTripTimes = {
      O1: 70320,
      O2: 70440,
      O3: 70560,
      D1: 74520,
      D2: 74580,
      D3: 74640,
    };
    Object.entries(longTripTimes).forEach(([stopId, arrivalTime]) => {
      longTripRoutingData.stopTimesIndex[`trip-A_${stopId}`] = {
        arrivalTime,
        departureTime: arrivalTime,
      };
    });

    const result = await planTripLocal({
      fromLat: 44.389,
      fromLon: -79.700,
      toLat: 44.400,
      toLon: -79.680,
      date: new Date('2025-06-11T00:00:00'),
      time: new Date('2025-06-11T20:45:00'),
      arriveBy: true,
      routingData: longTripRoutingData,
    });

    expect(result.itineraries[0].tripIds).toContain('trip-A');
    expect(result.itineraries[0].endTime)
      .toBeLessThanOrEqual(new Date('2025-06-11T20:45:00').getTime());
    expect(result.itineraries[0].duration).toBeGreaterThan(60 * 60);
  });

  test('throws when origin and destination are too close', async () => {
    await expect(
      planTripLocal({
        fromLat: 44.389,
        fromLon: -79.700,
        toLat: 44.389,
        toLon: -79.700,
        date: new Date('2025-06-11T00:00:00'),
        time: new Date('2025-06-11T19:25:00'),
        arriveBy: false,
        routingData,
      })
    ).rejects.toThrow(RoutingError);
  });

  test('finds previous service-day trips after midnight', async () => {
    const overnightRoutingData = {
      stops: {
        O1: makeStop('O1', 44.389, -79.700, 'Origin Stop 1'),
        D1: makeStop('D1', 44.400, -79.680, 'Dest Stop 1'),
      },
      stopDepartures: {
        O1: [
          {
            tripId: 'trip-overnight',
            routeId: '2A',
            directionId: 0,
            serviceId: 'night',
            departureTime: 89280,
            headsign: 'Downtown',
            pickupType: 0,
          },
        ],
      },
      stopTimesIndex: {
        'trip-overnight_O1': {
          arrivalTime: 89280,
          departureTime: 89280,
        },
        'trip-overnight_D1': {
          arrivalTime: 90000,
          departureTime: 90000,
        },
      },
      routeStopSequences: {
        '2A': {
          '0': ['O1', 'D1'],
        },
      },
      stopRoutes: {
        O1: new Set(['2A']),
        D1: new Set(['2A']),
      },
      transfers: {},
      serviceCalendar: {},
      tripIndex: {
        'trip-overnight': {
          routeId: '2A',
          directionId: 0,
          serviceId: 'night',
          headsign: 'Downtown',
        },
      },
      stopIndex: {
        O1: {
          id: 'O1',
          code: 'O1',
          name: 'Origin Stop 1',
          latitude: 44.389,
          longitude: -79.700,
        },
        D1: {
          id: 'D1',
          code: 'D1',
          name: 'Dest Stop 1',
          latitude: 44.400,
          longitude: -79.680,
        },
      },
    };

    mockGetActiveServicesForDate.mockImplementation((_calendar, date) => {
      const isoDate = date.toISOString().slice(0, 10);
      if (isoDate === '2025-06-10') {
        return new Set(['night']);
      }
      return new Set();
    });

    const result = await planTripLocal({
      fromLat: 44.389,
      fromLon: -79.700,
      toLat: 44.400,
      toLon: -79.680,
      date: new Date('2025-06-11T00:00:00'),
      time: new Date('2025-06-11T00:30:00'),
      arriveBy: false,
      routingData: overnightRoutingData,
    });

    expect(result.itineraries).toHaveLength(1);
    expect(result.itineraries[0].tripIds).toContain('trip-overnight');
    expect(result.itineraries[0].boardingTimes[0]).toBe(89280);
  });

  test('keeps a rider-best direct candidate discovered after the first three arrivals', async () => {
    const serviceId = 'weekday';
    const stops = {
      O: makeStop('O', 44.389, -79.700, 'Origin Stop'),
      X1: makeStop('X1', 44.394, -79.690, 'Transfer Alight'),
      X2: makeStop('X2', 44.3941, -79.6899, 'Transfer Board'),
      D: makeStop('D', 44.400, -79.680, 'Destination Stop'),
    };
    const trips = {
      'transfer-a-1': { routeId: '1', directionId: 0, serviceId, headsign: 'Transfer' },
      'transfer-a-2': { routeId: '2', directionId: 0, serviceId, headsign: 'Destination' },
      'transfer-b-1': { routeId: '1', directionId: 0, serviceId, headsign: 'Transfer' },
      'transfer-b-2': { routeId: '2', directionId: 0, serviceId, headsign: 'Destination' },
      'transfer-c-1': { routeId: '1', directionId: 0, serviceId, headsign: 'Transfer' },
      'transfer-c-2': { routeId: '2', directionId: 0, serviceId, headsign: 'Destination' },
      'direct-trip': { routeId: '10', directionId: 0, serviceId, headsign: 'Direct' },
    };
    const tripStopTimes = {
      'transfer-a-1': [
        { stopId: 'O', arrivalTime: 36060, departureTime: 36060 },
        { stopId: 'X1', arrivalTime: 36360, departureTime: 36360 },
      ],
      'transfer-a-2': [
        { stopId: 'X2', arrivalTime: 36480, departureTime: 36480 },
        { stopId: 'D', arrivalTime: 37200, departureTime: 37200 },
      ],
      'transfer-b-1': [
        { stopId: 'O', arrivalTime: 36120, departureTime: 36120 },
        { stopId: 'X1', arrivalTime: 36420, departureTime: 36420 },
      ],
      'transfer-b-2': [
        { stopId: 'X2', arrivalTime: 36540, departureTime: 36540 },
        { stopId: 'D', arrivalTime: 37260, departureTime: 37260 },
      ],
      'transfer-c-1': [
        { stopId: 'O', arrivalTime: 36180, departureTime: 36180 },
        { stopId: 'X1', arrivalTime: 36480, departureTime: 36480 },
      ],
      'transfer-c-2': [
        { stopId: 'X2', arrivalTime: 36600, departureTime: 36600 },
        { stopId: 'D', arrivalTime: 37320, departureTime: 37320 },
      ],
      'direct-trip': [
        { stopId: 'O', arrivalTime: 36300, departureTime: 36300 },
        { stopId: 'D', arrivalTime: 37380, departureTime: 37380 },
      ],
    };
    const stopDepartures = {};
    Object.entries(tripStopTimes).forEach(([tripId, stopTimes]) => {
      stopTimes.forEach((stopTime) => {
        stopDepartures[stopTime.stopId] = stopDepartures[stopTime.stopId] || [];
        stopDepartures[stopTime.stopId].push({
          tripId,
          routeId: trips[tripId].routeId,
          directionId: trips[tripId].directionId,
          serviceId,
          departureTime: stopTime.departureTime,
          headsign: trips[tripId].headsign,
          pickupType: 0,
        });
      });
    });
    Object.values(stopDepartures).forEach((departures) => {
      departures.sort((a, b) => a.departureTime - b.departureTime);
    });
    const stopTimesIndex = {};
    Object.entries(tripStopTimes).forEach(([tripId, stopTimes]) => {
      stopTimes.forEach((stopTime) => {
        stopTimesIndex[`${tripId}_${stopTime.stopId}`] = {
          arrivalTime: stopTime.arrivalTime,
          departureTime: stopTime.departureTime,
        };
      });
    });

    const result = await planTripLocal({
      fromLat: 44.389,
      fromLon: -79.700,
      toLat: 44.400,
      toLon: -79.680,
      date: new Date('2025-06-11T00:00:00'),
      time: new Date('2025-06-11T10:00:00'),
      arriveBy: false,
      routingData: {
        stops,
        stopIndex: stops,
        stopDepartures,
        stopTimesIndex,
        routeStopSequences: {
          1: { 0: ['O', 'X1'] },
          2: { 0: ['X2', 'D'] },
          10: { 0: ['O', 'D'] },
        },
        stopRoutes: {
          O: new Set(['1', '10']),
          X1: new Set(['1']),
          X2: new Set(['2']),
          D: new Set(['2', '10']),
        },
        transfers: {
          X1: [{ toStopId: 'X2', walkSeconds: 60, walkMeters: 70 }],
        },
        serviceCalendar: {},
        tripIndex: trips,
      },
    });

    expect(result.itineraries.length).toBeLessThanOrEqual(ROUTING_CONFIG.MAX_ITINERARIES);
    expect(result.itineraries[0].tripIds).toEqual(['direct-trip']);
    expect(result.itineraries.map((itinerary) => itinerary.tripIds.join('|'))).toContain('direct-trip');
  });
});
