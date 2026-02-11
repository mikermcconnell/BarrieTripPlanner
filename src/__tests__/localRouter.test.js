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
  getActiveServicesForDate: (calendar, date) => {
    // Always return weekday service active (for testing on any day)
    return new Set(['weekday']);
  },
  formatGTFSDate: jest.fn(),
}));

// Mock itineraryBuilder — return a simplified itinerary with key fields
jest.mock('../services/itineraryBuilder', () => ({
  buildItinerary: (result, routingData, opts) => {
    const transitLegs = result.path.filter((p) => p.type === 'TRANSIT');
    const tripIds = transitLegs.map((t) => t.tripId);
    const boardingTimes = transitLegs.map((t) => t.boardingTime);
    return {
      id: `itin-${tripIds.join('-')}`,
      tripIds,
      boardingTimes,
      arrivalTime: result.arrivalTime,
      walkToDestSeconds: result.walkToDestSeconds,
      destinationStopId: result.destinationStopId,
      legs: result.path,
    };
  },
}));

// ── Tests ────────────────────────────────────────────────────

describe('localRouter — trip deduplication and time diversity', () => {
  const routingData = buildFakeRoutingData();

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
});
