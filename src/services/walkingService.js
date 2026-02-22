/**
 * Walking Service
 *
 * Fetches real walking directions from LocationIQ to enhance itineraries
 * with street-level walking paths and turn-by-turn instructions.
 *
 * Strategy:
 * 1. RAPTOR uses straight-line estimates for speed during routing
 * 2. This service enriches the final itinerary with real walking paths
 * 3. Caching reduces API calls for repeated origin/destination pairs
 */

import { LOCATIONIQ_CONFIG, ROUTING_CONFIG } from '../config/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haversineDistance } from '../utils/geometryUtils';
import logger from '../utils/logger';
import { getApiProxyRequestOptions } from './proxyAuth';

const CACHE_PREFIX = 'walk_directions_';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_DELAY_MS = 550; // ~2 req/sec to stay within LocationIQ free tier

let lastRequestTime = 0;

/**
 * Wait if needed to respect LocationIQ rate limits
 */
const waitForRateLimit = async () => {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
};

/**
 * Get walking directions between two points
 *
 * @param {number} fromLat - Starting latitude
 * @param {number} fromLon - Starting longitude
 * @param {number} toLat - Ending latitude
 * @param {number} toLon - Ending longitude
 * @returns {Promise<Object>} Walking directions with geometry and steps
 */
export const getWalkingDirections = async (fromLat, fromLon, toLat, toLon) => {
  // Check cache first
  const cacheKey = generateCacheKey(fromLat, fromLon, toLat, toLon);
  const cached = await getCachedDirections(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    let response;
    const canUseDirectLocationIQ = Boolean(
      LOCATIONIQ_CONFIG.ALLOW_DIRECT && LOCATIONIQ_CONFIG.API_KEY
    );

    if (LOCATIONIQ_CONFIG.PROXY_URL) {
      // Route through proxy (API key stays server-side)
      const proxyParams = new URLSearchParams({
        from: `${fromLat},${fromLon}`,
        to: `${toLat},${toLon}`,
      });
      const proxyUrl = `${LOCATIONIQ_CONFIG.PROXY_URL}/api/walking-directions?${proxyParams}`;
      const proxyOptions = await getApiProxyRequestOptions(LOCATIONIQ_CONFIG.PROXY_TOKEN || '');

      await waitForRateLimit();
      response = await fetch(proxyUrl, proxyOptions);

      if (response.status === 429) {
        logger.warn('Walking directions rate limit hit, retrying after delay...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        lastRequestTime = Date.now();
        response = await fetch(proxyUrl, proxyOptions);
      }
    } else if (canUseDirectLocationIQ) {
      // Direct call (native app or dev without proxy)
      const url = `${LOCATIONIQ_CONFIG.BASE_URL}/directions/walking/${fromLon},${fromLat};${toLon},${toLat}`;
      const params = new URLSearchParams({
        key: LOCATIONIQ_CONFIG.API_KEY,
        steps: 'true',
        geometries: 'polyline',
        overview: 'full',
      });

      await waitForRateLimit();
      response = await fetch(`${url}?${params}`);

      if (response.status === 429) {
        logger.warn('LocationIQ rate limit hit, retrying after delay...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        lastRequestTime = Date.now();
        response = await fetch(`${url}?${params}`);
      }
    } else {
      logger.warn('Walking directions proxy is not configured; using estimated walking leg');
      return getFallbackDirections(fromLat, fromLon, toLat, toLon);
    }

    if (!response.ok) {
      if (response.status === 429) {
        logger.warn('LocationIQ rate limit reached for directions (after retry)');
        return getFallbackDirections(fromLat, fromLon, toLat, toLon);
      }
      throw new Error(`Directions API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return getFallbackDirections(fromLat, fromLon, toLat, toLon);
    }

    const route = data.routes[0];
    const result = {
      distance: route.distance, // meters
      duration: route.duration, // seconds
      geometry: route.geometry, // encoded polyline
      steps: formatWalkingSteps(route.legs?.[0]?.steps || []),
      source: 'locationiq',
    };

    // Cache the result
    await cacheDirections(cacheKey, result);

    return result;
  } catch (error) {
    logger.error('Walking directions error:', error);
    return getFallbackDirections(fromLat, fromLon, toLat, toLon);
  }
};

/**
 * Format walking steps into turn-by-turn instructions
 */
const formatWalkingSteps = (steps) => {
  return steps.map((step) => ({
    instruction: step.maneuver?.instruction || formatManeuver(step.maneuver),
    distance: step.distance,
    duration: step.duration,
    type: step.maneuver?.type,
    modifier: step.maneuver?.modifier,
    name: step.name || '',
  }));
};

/**
 * Format maneuver into readable instruction
 */
const formatManeuver = (maneuver) => {
  if (!maneuver) return 'Continue';

  const type = maneuver.type;
  const modifier = maneuver.modifier;

  switch (type) {
    case 'depart':
      return 'Start walking';
    case 'arrive':
      return 'Arrive at destination';
    case 'turn':
      return `Turn ${modifier || 'right'}`;
    case 'continue':
      return 'Continue straight';
    case 'merge':
      return `Merge ${modifier || ''}`;
    case 'new name':
      return 'Continue onto new street';
    case 'end of road':
      return `Turn ${modifier || 'right'} at end of road`;
    default:
      return modifier ? `Go ${modifier}` : 'Continue';
  }
};

/**
 * Generate fallback directions when API is unavailable
 * Uses straight-line with buffer estimate
 */
const getFallbackDirections = (fromLat, fromLon, toLat, toLon) => {
  const straightDistance = haversineDistance(fromLat, fromLon, toLat, toLon);
  const walkDistance = straightDistance * ROUTING_CONFIG.WALK_DISTANCE_BUFFER;
  const walkDuration = walkDistance / ROUTING_CONFIG.WALK_SPEED;

  return {
    distance: Math.round(walkDistance),
    duration: Math.round(walkDuration),
    geometry: null,
    steps: [
      {
        instruction: 'Walk to your destination',
        distance: Math.round(walkDistance),
        duration: Math.round(walkDuration),
        type: 'depart',
        modifier: null,
        name: '',
      },
    ],
    source: 'estimate',
  };
};


/**
 * Generate cache key from coordinates (rounded for similar lookups)
 */
const generateCacheKey = (fromLat, fromLon, toLat, toLon) => {
  // Round to ~50m precision for cache hits on similar locations
  const precision = 2000; // 1/2000 degree ≈ 50m
  const key = [
    Math.round(fromLat * precision),
    Math.round(fromLon * precision),
    Math.round(toLat * precision),
    Math.round(toLon * precision),
  ].join('_');
  return `${CACHE_PREFIX}${key}`;
};

/**
 * Get cached directions if available and not expired
 */
const getCachedDirections = async (cacheKey) => {
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age > CACHE_EXPIRY_MS) {
      // Expired, remove from cache
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    return data;
  } catch (error) {
    logger.warn('Cache read error:', error);
    return null;
  }
};

/**
 * Cache walking directions
 */
const cacheDirections = async (cacheKey, data) => {
  try {
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    logger.warn('Cache write error:', error);
  }
};

/**
 * Enrich an itinerary with real walking directions
 * Replaces straight-line walking estimates with actual paths
 *
 * @param {Object} itinerary - Itinerary object with legs
 * @returns {Promise<Object>} Enriched itinerary
 */
export const enrichItineraryWithWalking = async (itinerary) => {
  const maxActualWalk = ROUTING_CONFIG.MAX_ACTUAL_WALK_DISTANCE || 1200;
  let hasExcessiveWalk = false;
  let longestWalkDistance = 0;

  // Process walk legs sequentially to respect LocationIQ rate limits
  const enrichedLegs = [];
  for (const leg of itinerary.legs) {
    if (leg.mode !== 'WALK') {
      enrichedLegs.push(leg);
      continue;
    }

    // Get walking directions for this leg
    const directions = await getWalkingDirections(
      leg.from.lat,
      leg.from.lon,
      leg.to.lat,
      leg.to.lon
    );

    // Sanity check: walking duration shouldn't exceed distance / 0.8 m/s (very slow walking)
    // This catches cases where API returns wrong units or corrupted data
    const maxReasonableDuration = (directions.distance || leg.distance) / 0.8;
    const isValidDuration = directions.duration > 0 && directions.duration <= maxReasonableDuration;

    // If duration seems wrong, recalculate from distance
    const safeDuration = isValidDuration
      ? directions.duration
      : Math.round((directions.distance || leg.distance) / ROUTING_CONFIG.WALK_SPEED);

    const actualDistance = directions.distance || leg.distance;

    // Track longest walk and check for excessive walking
    if (actualDistance > longestWalkDistance) {
      longestWalkDistance = actualDistance;
    }
    if (actualDistance > maxActualWalk) {
      hasExcessiveWalk = true;
      logger.warn(
        `Walking leg exceeds max distance: ${actualDistance}m > ${maxActualWalk}m ` +
        `(from ${leg.from.name} to ${leg.to.name})`
      );
    }

    enrichedLegs.push({
      ...leg,
      distance: actualDistance,
      duration: safeDuration,
      legGeometry: directions.geometry
        ? { points: directions.geometry }
        : leg.legGeometry,
      steps: directions.steps,
      walkingSource: isValidDuration ? directions.source : 'estimate-fallback',
      isExcessiveWalk: actualDistance > maxActualWalk,
    });
  }

  // Recalculate totals
  const totalWalkDistance = enrichedLegs
    .filter((leg) => leg.mode === 'WALK')
    .reduce((sum, leg) => sum + leg.distance, 0);

  const totalWalkTime = enrichedLegs
    .filter((leg) => leg.mode === 'WALK')
    .reduce((sum, leg) => sum + leg.duration, 0);

  return {
    ...itinerary,
    legs: enrichedLegs,
    walkDistance: totalWalkDistance,
    walkTime: totalWalkTime,
    hasExcessiveWalk,
    longestWalkDistance: Math.round(longestWalkDistance),
  };
};

/**
 * Enrich all itineraries in a trip plan
 * Filters out itineraries with excessive walking, long durations, and adds metadata
 *
 * @param {Object} tripPlan - Trip plan with itineraries array
 * @returns {Promise<Object>} Trip plan with enriched itineraries
 */
export const enrichTripPlanWithWalking = async (tripPlan) => {
  const maxTripDuration = ROUTING_CONFIG.MAX_TRIP_DURATION || 7200; // 2 hours default
  const maxWaitTime = ROUTING_CONFIG.MAX_WAIT_TIME || 3600; // 1 hour default
  const highWalkThreshold = 1000; // meters - flag walks over this (1km)
  const now = Date.now();

  // Process itineraries sequentially to respect LocationIQ rate limits
  const enrichedItineraries = [];
  for (const itinerary of tripPlan.itineraries) {
    enrichedItineraries.push(await enrichItineraryWithWalking(itinerary));
  }

  // Add metadata to each itinerary
  const withMetadata = enrichedItineraries.map((itinerary) => {
    const departureTime = itinerary.startTime;
    const minutesUntilDeparture = Math.max(0, Math.round((departureTime - now) / 60000));

    // Check if trip is tomorrow (departure is after midnight relative to now)
    const nowDate = new Date(now);
    const departureDate = new Date(departureTime);
    const isTomorrow = departureDate.getDate() !== nowDate.getDate() ||
                       departureDate.getMonth() !== nowDate.getMonth() ||
                       departureDate.getFullYear() !== nowDate.getFullYear();

    // Check for high walking distance
    const hasHighWalk = itinerary.walkDistance > highWalkThreshold;

    // Check if duration is excessive (over 2 hours)
    const hasExcessiveDuration = itinerary.duration > maxTripDuration;

    // Check if wait time is long
    const hasLongWait = minutesUntilDeparture > (maxWaitTime / 60);

    return {
      ...itinerary,
      minutesUntilDeparture,
      isTomorrow,
      hasHighWalk,
      hasExcessiveDuration,
      hasLongWait,
    };
  });

  // Filter out trips with excessive duration (over 2 hours)
  const reasonableDuration = withMetadata.filter(it => !it.hasExcessiveDuration);

  // Separate into good itineraries and those with issues
  const goodItineraries = reasonableDuration.filter(it => !it.hasExcessiveWalk);
  const problematicItineraries = reasonableDuration.filter(it => it.hasExcessiveWalk);

  // Determine which itineraries to show
  let finalItineraries = goodItineraries.length > 0 ? goodItineraries : problematicItineraries;

  // If all were filtered out, don't fall back to showing unreasonable trips
  if (finalItineraries.length === 0 && withMetadata.length > 0) {
    // Only show if shortest is under 2x the max (grace window)
    const sorted = withMetadata.sort((a, b) => a.duration - b.duration);
    if (sorted[0].duration <= maxTripDuration * 2) {
      logger.warn('All itineraries exceed max duration, showing shortest options');
      finalItineraries = sorted.slice(0, 3);
    } else {
      logger.warn('All itineraries have unreasonable durations, returning empty');
      return {
        ...tripPlan,
        itineraries: [],
        hasOnlyExcessiveWalkOptions: false,
        filteredCount: withMetadata.length,
      };
    }
  }

  // Sort by arrival time (soonest first)
  finalItineraries.sort((a, b) => a.endTime - b.endTime);

  // Add recommendation labels
  if (finalItineraries.length > 0) {
    // Find the best options for different criteria
    const fastest = finalItineraries.reduce((best, it) =>
      it.duration < best.duration ? it : best, finalItineraries[0]);
    const leastWalking = finalItineraries.reduce((best, it) =>
      it.walkDistance < best.walkDistance ? it : best, finalItineraries[0]);
    const fewestTransfers = finalItineraries.reduce((best, it) =>
      it.transfers < best.transfers ? it : best, finalItineraries[0]);
    const soonestArrival = finalItineraries[0]; // Already sorted by arrival

    // Assign labels (priority: recommended > fastest > least walking)
    finalItineraries = finalItineraries.map((it) => {
      const labels = [];

      // "Recommended" = arrives soonest AND leaves soon AND reasonable walk
      if (it === soonestArrival && !it.isTomorrow && !it.hasLongWait && !it.hasHighWalk) {
        labels.push('Recommended');
      } else if (it === fastest && !labels.includes('Recommended')) {
        labels.push('Fastest');
      }

      if (it === leastWalking && it.walkDistance < fastest.walkDistance - 100) {
        labels.push('Less Walking');
      }

      if (it === fewestTransfers && it.transfers < fastest.transfers) {
        labels.push('Direct');
      }

      return {
        ...it,
        labels: labels.length > 0 ? labels : null,
        isRecommended: labels.includes('Recommended'),
      };
    });
  }

  return {
    ...tripPlan,
    itineraries: finalItineraries,
    hasOnlyExcessiveWalkOptions: goodItineraries.length === 0 && problematicItineraries.length > 0,
    filteredCount: withMetadata.length - finalItineraries.length,
  };
};

/**
 * Clear walking directions cache
 * Useful when storage is running low
 */
export const clearWalkingCache = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const walkingKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    await AsyncStorage.multiRemove(walkingKeys);
    logger.log(`Cleared ${walkingKeys.length} cached walking directions`);
  } catch (error) {
    logger.error('Error clearing walking cache:', error);
  }
};
