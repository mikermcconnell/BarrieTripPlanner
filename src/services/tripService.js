import { MAP_CONFIG, OTP_CONFIG, ROUTING_CONFIG } from '../config/constants';
import { planTripLocal, RoutingError, ROUTING_ERROR_CODES } from './localRouter';
import { enrichTripPlanWithWalking } from './walkingService';
import { haversineDistance } from '../utils/geometryUtils';
import { validateTripInputs } from '../utils/tripValidation';
import { retryFetch } from '../utils/retryFetch';
import logger from '../utils/logger';

/**
 * Add basic metadata to itineraries (used when walking enrichment is skipped)
 * Adds departure time info, tomorrow flag, and filters excessive durations
 */
const addBasicMetadata = (tripPlan) => {
  const maxTripDuration = ROUTING_CONFIG.MAX_TRIP_DURATION || 7200;
  const highWalkThreshold = 1000;
  const now = Date.now();

  const withMetadata = tripPlan.itineraries.map((itinerary) => {
    const departureTime = itinerary.startTime;
    const minutesUntilDeparture = Math.max(0, Math.round((departureTime - now) / 60000));

    const nowDate = new Date(now);
    const departureDate = new Date(departureTime);
    const isTomorrow = departureDate.getDate() !== nowDate.getDate() ||
                       departureDate.getMonth() !== nowDate.getMonth() ||
                       departureDate.getFullYear() !== nowDate.getFullYear();

    const hasHighWalk = itinerary.walkDistance > highWalkThreshold;
    const hasExcessiveDuration = itinerary.duration > maxTripDuration;

    return {
      ...itinerary,
      minutesUntilDeparture,
      isTomorrow,
      hasHighWalk,
      hasExcessiveDuration,
    };
  });

  // Filter out excessive duration trips
  const filtered = withMetadata.filter(it => !it.hasExcessiveDuration);

  // If all filtered out, only show if shortest is under 2x max (grace window)
  let finalItineraries;
  if (filtered.length > 0) {
    finalItineraries = filtered;
  } else {
    const sorted = withMetadata.sort((a, b) => a.duration - b.duration);
    if (sorted[0].duration <= maxTripDuration * 2) {
      finalItineraries = sorted.slice(0, 3);
    } else {
      finalItineraries = [];
    }
  }

  // Sort by arrival time
  finalItineraries.sort((a, b) => a.endTime - b.endTime);

  // Add "Recommended" label to first non-tomorrow trip
  const firstGoodTrip = finalItineraries.find(it => !it.isTomorrow && !it.hasHighWalk);
  if (firstGoodTrip) {
    firstGoodTrip.labels = ['Recommended'];
    firstGoodTrip.isRecommended = true;
  }

  return {
    ...tripPlan,
    itineraries: finalItineraries,
  };
};

// Error codes for trip planning
export const TRIP_ERROR_CODES = {
  OTP_UNAVAILABLE: 'OTP_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  NO_ROUTES_FOUND: 'NO_ROUTES_FOUND',
  OUTSIDE_SERVICE_AREA: 'OUTSIDE_SERVICE_AREA',
  TIMEOUT: 'TIMEOUT',
  NO_DATA: 'NO_DATA',
  NO_SERVICE: 'NO_SERVICE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
};

// Custom error class for trip planning errors
export class TripPlanningError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'TripPlanningError';
  }
}

/**
 * Plan a trip using OpenTripPlanner
 * @param {Object} params - Trip planning parameters
 * @returns {Promise<Object>} Trip plan results
 */
export const planTrip = async ({
  fromLat,
  fromLon,
  toLat,
  toLon,
  date = new Date(),
  time = new Date(),
  arriveBy = false,
  mode = 'TRANSIT,WALK',
  maxWalkDistance = 1000,
  numItineraries = 3,
}) => {
  if (!OTP_CONFIG.BASE_URL) {
    throw new TripPlanningError(
      TRIP_ERROR_CODES.OTP_UNAVAILABLE,
      'Trip planning backend is not configured'
    );
  }

  const dateStr = formatDate(date);
  const timeStr = formatTime(time);

  const params = new URLSearchParams({
    fromPlace: `${fromLat},${fromLon}`,
    toPlace: `${toLat},${toLon}`,
    date: dateStr,
    time: timeStr,
    arriveBy: arriveBy.toString(),
    mode,
    maxWalkDistance: maxWalkDistance.toString(),
    numItineraries: numItineraries.toString(),
  });

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OTP_CONFIG.TIMEOUT_MS);

  try {
    const response = await retryFetch(`${OTP_CONFIG.BASE_URL}/plan?${params}`, {
      signal: controller.signal,
      maxRetries: 2,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const status = response.status;
      if (status === 502 || status === 503 || status === 504) {
        throw new TripPlanningError(
          TRIP_ERROR_CODES.OTP_UNAVAILABLE,
          'Trip planning service is temporarily unavailable'
        );
      }
      throw new TripPlanningError(
        TRIP_ERROR_CODES.NETWORK_ERROR,
        `Server error: ${status}`
      );
    }

    const data = await response.json();

    // Handle OTP-specific errors
    if (data.error) {
      const errorMsg = data.error.message || '';
      const errorId = data.error.id;

      // Check for "no routes found" type errors
      if (errorId === 404 || errorMsg.includes('No trip found') || errorMsg.includes('PATH_NOT_FOUND')) {
        throw new TripPlanningError(
          TRIP_ERROR_CODES.NO_ROUTES_FOUND,
          'No transit routes found for this trip'
        );
      }

      // Check for outside service area
      if (errorMsg.includes('outside') || errorMsg.includes('boundary') || errorMsg.includes('LOCATION_NOT_ACCESSIBLE')) {
        throw new TripPlanningError(
          TRIP_ERROR_CODES.OUTSIDE_SERVICE_AREA,
          'One or both locations are outside the service area'
        );
      }

      throw new TripPlanningError(
        TRIP_ERROR_CODES.NETWORK_ERROR,
        data.error.message || 'Trip planning failed'
      );
    }

    const result = formatTripPlan(data.plan);

    // Check if no itineraries were returned
    if (!result.itineraries || result.itineraries.length === 0) {
      throw new TripPlanningError(
        TRIP_ERROR_CODES.NO_ROUTES_FOUND,
        'No transit routes found for this trip'
      );
    }

    // Add metadata for filtering and display
    return addBasicMetadata(result);
  } catch (error) {
    clearTimeout(timeoutId);

    // Re-throw TripPlanningError as-is
    if (error instanceof TripPlanningError) {
      // In development mode with mock enabled, return mock data instead
      if (OTP_CONFIG.USE_MOCK_IN_DEV) {
        logger.warn('OTP error, using mock data:', error.message);
        return getMockTripPlan(fromLat, fromLon, toLat, toLon);
      }
      throw error;
    }

    // Handle abort/timeout
    if (error.name === 'AbortError') {
      if (OTP_CONFIG.USE_MOCK_IN_DEV) {
        logger.warn('OTP timeout, using mock data');
        return getMockTripPlan(fromLat, fromLon, toLat, toLon);
      }
      throw new TripPlanningError(
        TRIP_ERROR_CODES.TIMEOUT,
        'Request timed out. Please try again.'
      );
    }

    // Handle network errors
    if (error.message?.includes('fetch') || error.message?.includes('network') || error.name === 'TypeError') {
      if (OTP_CONFIG.USE_MOCK_IN_DEV) {
        logger.warn('Network error, using mock data:', error.message);
        return getMockTripPlan(fromLat, fromLon, toLat, toLon);
      }
      throw new TripPlanningError(
        TRIP_ERROR_CODES.NETWORK_ERROR,
        'Unable to connect to trip planning service'
      );
    }

    // Unknown error - in dev mode, use mock; otherwise throw
    logger.error('Error planning trip:', error);
    if (OTP_CONFIG.USE_MOCK_IN_DEV) {
      return getMockTripPlan(fromLat, fromLon, toLat, toLon);
    }
    throw new TripPlanningError(
      TRIP_ERROR_CODES.NETWORK_ERROR,
      error.message || 'An unexpected error occurred'
    );
  }
};

/**
 * Format date for OTP API (YYYY-MM-DD)
 */
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Format time for OTP API (HH:MM)
 */
const formatTime = (time) => {
  const t = new Date(time);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};

/**
 * Format OTP trip plan response
 */
const formatTripPlan = (plan) => {
  if (!plan || !plan.itineraries) {
    return { itineraries: [] };
  }

  return {
    from: plan.from,
    to: plan.to,
    itineraries: plan.itineraries.map((itinerary, index) => ({
      id: `itinerary-${index}`,
      duration: itinerary.duration,
      startTime: itinerary.startTime,
      endTime: itinerary.endTime,
      walkTime: itinerary.walkTime,
      transitTime: itinerary.transitTime,
      waitingTime: itinerary.waitingTime,
      walkDistance: itinerary.walkDistance,
      transfers: itinerary.transfers,
      legs: itinerary.legs.map((leg) => formatLeg(leg)),
    })),
  };
};

/**
 * Format a single leg of the journey
 */
const formatLeg = (leg) => ({
  mode: leg.mode,
  startTime: leg.startTime,
  endTime: leg.endTime,
  scheduledStartTime: leg.startTime, // Original time before any delay adjustment
  scheduledEndTime: leg.endTime, // Original time before any delay adjustment
  delaySeconds: 0, // Will be populated by tripDelayService
  isRealtime: false, // Will be set to true if real-time data is available
  duration: leg.duration,
  distance: leg.distance,
  from: {
    name: leg.from.name,
    lat: leg.from.lat,
    lon: leg.from.lon,
    stopId: leg.from.stopId,
    stopCode: leg.from.stopCode,
  },
  to: {
    name: leg.to.name,
    lat: leg.to.lat,
    lon: leg.to.lon,
    stopId: leg.to.stopId,
    stopCode: leg.to.stopCode,
  },
  route: leg.route
    ? {
        id: leg.routeId,
        shortName: leg.routeShortName,
        longName: leg.routeLongName,
        color: leg.routeColor ? `#${leg.routeColor}` : null,
      }
    : null,
  headsign: leg.headsign,
  tripId: leg.tripId,
  intermediateStops: leg.intermediateStops?.map((stop) => ({
    name: stop.name,
    lat: stop.lat,
    lon: stop.lon,
    stopId: stop.stopId,
  })),
  legGeometry: leg.legGeometry,
  steps: leg.steps,
});

/**
 * Get mock trip plan for development
 * Calculates realistic distances based on actual origin/destination coordinates
 */
const getMockTripPlan = (fromLat, fromLon, toLat, toLon) => {
  const now = new Date();
  const startTime = now.getTime();
  const buffer = ROUTING_CONFIG.WALK_DISTANCE_BUFFER;
  const walkSpeed = ROUTING_CONFIG.WALK_SPEED;

  // Place mock bus stops at ~15% and ~85% of the way between origin and destination
  const stop1Lat = fromLat + (toLat - fromLat) * 0.15;
  const stop1Lon = fromLon + (toLon - fromLon) * 0.15;
  const stop2Lat = fromLat + (toLat - fromLat) * 0.85;
  const stop2Lon = fromLon + (toLon - fromLon) * 0.85;

  // Calculate realistic walk distances using haversine + street buffer
  const walk1Distance = Math.round(haversineDistance(fromLat, fromLon, stop1Lat, stop1Lon) * buffer);
  const walk2Distance = Math.round(haversineDistance(stop2Lat, stop2Lon, toLat, toLon) * buffer);
  const busDistance = Math.round(haversineDistance(stop1Lat, stop1Lon, stop2Lat, stop2Lon));
  const totalWalkDistance = walk1Distance + walk2Distance;

  // Calculate durations from distances
  const walk1Duration = Math.round(walk1Distance / walkSpeed);
  const walk2Duration = Math.round(walk2Distance / walkSpeed);
  const totalWalkTime = walk1Duration + walk2Duration;
  const transitTime = Math.round(busDistance / 8); // ~29 km/h average bus speed
  const waitTime = 240;
  const totalDuration = totalWalkTime + transitTime + waitTime;

  const walk1End = startTime + walk1Duration * 1000;
  const busStart = walk1End + waitTime * 1000;
  const busEnd = busStart + transitTime * 1000;
  const walk2End = busEnd + walk2Duration * 1000;

  // Mock itinerary 2: with a transfer, using stops at 10%/50%/90%
  const stopALat = fromLat + (toLat - fromLat) * 0.10;
  const stopALon = fromLon + (toLon - fromLon) * 0.10;
  const transferLat = fromLat + (toLat - fromLat) * 0.50;
  const transferLon = fromLon + (toLon - fromLon) * 0.50;
  const stopBLat = fromLat + (toLat - fromLat) * 0.90;
  const stopBLon = fromLon + (toLon - fromLon) * 0.90;

  const walk2aDistance = Math.round(haversineDistance(fromLat, fromLon, stopALat, stopALon) * buffer);
  const walk2bDistance = Math.round(haversineDistance(stopBLat, stopBLon, toLat, toLon) * buffer);
  const bus2aDistance = Math.round(haversineDistance(stopALat, stopALon, transferLat, transferLon));
  const bus2bDistance = Math.round(haversineDistance(transferLat, transferLon, stopBLat, stopBLon));
  const totalWalk2Distance = walk2aDistance + walk2bDistance;

  const walk2aDuration = Math.round(walk2aDistance / walkSpeed);
  const walk2bDuration = Math.round(walk2bDistance / walkSpeed);
  const totalWalk2Time = walk2aDuration + walk2bDuration;
  const transit2aTime = Math.round(bus2aDistance / 8);
  const transit2bTime = Math.round(bus2bDistance / 8);
  const wait2Time = 300;
  const transferWait = 300;
  const totalDuration2 = totalWalk2Time + transit2aTime + transit2bTime + wait2Time + transferWait;

  const it2Start = startTime + 10 * 60 * 1000;
  const it2Walk1End = it2Start + walk2aDuration * 1000;
  const it2Bus1Start = it2Walk1End + wait2Time * 1000;
  const it2Bus1End = it2Bus1Start + transit2aTime * 1000;
  const it2Bus2Start = it2Bus1End + transferWait * 1000;
  const it2Bus2End = it2Bus2Start + transit2bTime * 1000;
  const it2Walk2End = it2Bus2End + walk2bDuration * 1000;

  return {
    from: { name: 'Current Location', lat: fromLat, lon: fromLon },
    to: { name: 'Destination', lat: toLat, lon: toLon },
    itineraries: [
      {
        id: 'mock-1',
        duration: totalDuration,
        startTime,
        endTime: walk2End,
        walkTime: totalWalkTime,
        transitTime,
        waitingTime: waitTime,
        walkDistance: totalWalkDistance,
        transfers: 0,
        legs: [
          {
            mode: 'WALK',
            startTime,
            endTime: walk1End,
            duration: walk1Duration,
            distance: walk1Distance,
            from: { name: 'Current Location', lat: fromLat, lon: fromLon },
            to: { name: 'Bus Stop A', lat: stop1Lat, lon: stop1Lon },
          },
          {
            mode: 'BUS',
            startTime: busStart,
            endTime: busEnd,
            duration: transitTime,
            distance: busDistance,
            from: { name: 'Bus Stop A', lat: stop1Lat, lon: stop1Lon, stopId: 'S001' },
            to: { name: 'Bus Stop B', lat: stop2Lat, lon: stop2Lon, stopId: 'S002' },
            route: { id: '1', shortName: '1', longName: 'Downtown', color: '#E31837' },
            headsign: 'Downtown Terminal',
            intermediateStops: [
              { name: 'Stop 1', lat: (stop1Lat + stop2Lat) / 2, lon: (stop1Lon + stop2Lon) / 2 },
            ],
          },
          {
            mode: 'WALK',
            startTime: busEnd,
            endTime: walk2End,
            duration: walk2Duration,
            distance: walk2Distance,
            from: { name: 'Bus Stop B', lat: stop2Lat, lon: stop2Lon },
            to: { name: 'Destination', lat: toLat, lon: toLon },
          },
        ],
      },
      {
        id: 'mock-2',
        duration: totalDuration2,
        startTime: it2Start,
        endTime: it2Walk2End,
        walkTime: totalWalk2Time,
        transitTime: transit2aTime + transit2bTime,
        waitingTime: wait2Time + transferWait,
        walkDistance: totalWalk2Distance,
        transfers: 1,
        legs: [
          {
            mode: 'WALK',
            startTime: it2Start,
            endTime: it2Walk1End,
            duration: walk2aDuration,
            distance: walk2aDistance,
            from: { name: 'Current Location', lat: fromLat, lon: fromLon },
            to: { name: 'Bus Stop C', lat: stopALat, lon: stopALon },
          },
          {
            mode: 'BUS',
            startTime: it2Bus1Start,
            endTime: it2Bus1End,
            duration: transit2aTime,
            distance: bus2aDistance,
            from: { name: 'Bus Stop C', lat: stopALat, lon: stopALon, stopId: 'S003' },
            to: { name: 'Transfer Point', lat: transferLat, lon: transferLon, stopId: 'S004' },
            route: { id: '2', shortName: '2', longName: 'Crosstown', color: '#00A651' },
            headsign: 'Mall',
          },
          {
            mode: 'BUS',
            startTime: it2Bus2Start,
            endTime: it2Bus2End,
            duration: transit2bTime,
            distance: bus2bDistance,
            from: { name: 'Transfer Point', lat: transferLat, lon: transferLon, stopId: 'S004' },
            to: { name: 'Bus Stop D', lat: stopBLat, lon: stopBLon, stopId: 'S005' },
            route: { id: '3', shortName: '3', longName: 'South End', color: '#0072BC' },
            headsign: 'South Terminal',
          },
          {
            mode: 'WALK',
            startTime: it2Bus2End,
            endTime: it2Walk2End,
            duration: walk2bDuration,
            distance: walk2bDistance,
            from: { name: 'Bus Stop D', lat: stopBLat, lon: stopBLon },
            to: { name: 'Destination', lat: toLat, lon: toLon },
          },
        ],
      },
    ],
  };
};

// Re-export geocoding functions from LocationIQ service
// These are now powered by LocationIQ's free API instead of mock data
export {
  geocodeAddress,
  reverseGeocode,
} from './locationIQService';

/**
 * Plan a trip using the local RAPTOR router
 * This replaces the OTP-based planning when routing data is available
 *
 * @param {Object} params - Trip planning parameters
 * @param {Object} routingData - Pre-built routing data from TransitContext
 * @returns {Promise<Object>} Trip plan results
 */
export const planTripWithLocalRouter = async ({
  fromLat,
  fromLon,
  toLat,
  toLon,
  date = new Date(),
  time = new Date(),
  arriveBy = false,
  routingData,
  enrichWalking = true,
}) => {
  try {
    // Use local RAPTOR router
    const result = await planTripLocal({
      fromLat,
      fromLon,
      toLat,
      toLon,
      date,
      time,
      arriveBy,
      routingData,
    });

    // Check if no itineraries were returned
    if (!result.itineraries || result.itineraries.length === 0) {
      throw new TripPlanningError(
        TRIP_ERROR_CODES.NO_ROUTES_FOUND,
        'No transit routes found for this trip'
      );
    }

    // Optionally enrich with real walking directions
    if (enrichWalking) {
      try {
        const enrichedResult = await enrichTripPlanWithWalking(result);
        // Check if enrichment filtered out all itineraries
        if (!enrichedResult.itineraries || enrichedResult.itineraries.length === 0) {
          throw new TripPlanningError(
            TRIP_ERROR_CODES.NO_ROUTES_FOUND,
            'No reasonable transit routes found within 2 hours'
          );
        }
        return enrichedResult;
      } catch (walkingError) {
        // Re-throw TripPlanningError (from our check above)
        if (walkingError instanceof TripPlanningError) {
          throw walkingError;
        }
        logger.warn('Walking enrichment failed, using estimates:', walkingError);
        // Still add basic metadata even without walking enrichment
        return addBasicMetadata(result);
      }
    }

    // Add basic metadata even when not enriching
    return addBasicMetadata(result);
  } catch (error) {
    // Convert RoutingError to TripPlanningError for consistency
    if (error instanceof RoutingError) {
      const codeMapping = {
        [ROUTING_ERROR_CODES.NO_NEARBY_STOPS]: TRIP_ERROR_CODES.OUTSIDE_SERVICE_AREA,
        [ROUTING_ERROR_CODES.NO_SERVICE]: TRIP_ERROR_CODES.NO_SERVICE,
        [ROUTING_ERROR_CODES.NO_ROUTE_FOUND]: TRIP_ERROR_CODES.NO_ROUTES_FOUND,
        [ROUTING_ERROR_CODES.OUTSIDE_SERVICE_AREA]: TRIP_ERROR_CODES.OUTSIDE_SERVICE_AREA,
      };

      throw new TripPlanningError(
        codeMapping[error.code] || TRIP_ERROR_CODES.NETWORK_ERROR,
        error.message
      );
    }

    // Re-throw TripPlanningError as-is
    if (error instanceof TripPlanningError) {
      throw error;
    }

    // Unknown error
    logger.error('Local router error:', error);
    throw new TripPlanningError(
      TRIP_ERROR_CODES.NETWORK_ERROR,
      error.message || 'An unexpected error occurred'
    );
  }
};

// ─── Trip Plan Cache ──────────────────────────────────────────────
const TRIP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TRIP_CACHE_MAX_ENTRIES = 20;
const tripCache = new Map();

function getTripCacheKey(fromLat, fromLon, toLat, toLon) {
  // Round time to 5-minute windows for cache hits on nearby requests
  const timeRounded = Math.floor(Date.now() / TRIP_CACHE_TTL_MS);
  return `${fromLat.toFixed(4)},${fromLon.toFixed(4)},${toLat.toFixed(4)},${toLon.toFixed(4)},${timeRounded}`;
}

function getCachedTrip(key) {
  const entry = tripCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > TRIP_CACHE_TTL_MS) {
    tripCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedTrip(key, data) {
  if (tripCache.size >= TRIP_CACHE_MAX_ENTRIES) {
    // Evict oldest entry
    const oldestKey = tripCache.keys().next().value;
    tripCache.delete(oldestKey);
  }
  tripCache.set(key, { data, time: Date.now() });
}

/**
 * Plan a trip using the best available method
 * Tries local router first, falls back to OTP if needed
 *
 * @param {Object} params - Trip planning parameters
 * @returns {Promise<Object>} Trip plan results
 */
export const planTripAuto = async (params) => {
  const { routingData, ...otpParams } = params;

  // Validate inputs before routing
  const validation = validateTripInputs({
    from: { lat: params.fromLat, lon: params.fromLon },
    to: { lat: params.toLat, lon: params.toLon },
  });
  if (!validation.valid) {
    throw new TripPlanningError(
      TRIP_ERROR_CODES[validation.errorCode] || TRIP_ERROR_CODES.NETWORK_ERROR,
      validation.errorMessage
    );
  }

  // Check cache before routing
  const cacheKey = getTripCacheKey(params.fromLat, params.fromLon, params.toLat, params.toLon);
  const cached = getCachedTrip(cacheKey);
  if (cached) {
    return cached;
  }

  let result;

  // If routing data is available, prefer local router
  if (routingData) {
    try {
      result = await planTripWithLocalRouter(params);
      setCachedTrip(cacheKey, result);
      return result;
    } catch (error) {
      logger.warn('Local router failed, trying OTP:', error.message);
      // Fall through to OTP
    }
  }

  // Fall back to OTP
  result = await planTrip(otpParams);
  setCachedTrip(cacheKey, result);
  return result;
};

/**
 * Format a number of minutes to human readable string
 * e.g. 5 → "5 min", 90 → "1 hr 30 min", 120 → "2 hr"
 */
export const formatMinutes = (minutes) => {
  if (!minutes || minutes < 0 || !Number.isFinite(minutes)) {
    return '0 min';
  }
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
};

/**
 * Format duration in seconds to human readable string
 */
export const formatDuration = (seconds) => {
  // Handle invalid inputs
  if (!seconds || seconds < 0 || !Number.isFinite(seconds)) {
    return '0 min';
  }

  const totalMinutes = Math.floor(seconds / 60);
  return formatMinutes(totalMinutes);
};

/**
 * Format distance in meters to human readable string
 */
export const formatDistance = (meters) => {
  // Handle invalid inputs
  if (!meters || meters < 0 || !Number.isFinite(meters)) {
    return '0m';
  }

  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
};

/**
 * Format time from timestamp
 */
export const formatTimeFromTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
