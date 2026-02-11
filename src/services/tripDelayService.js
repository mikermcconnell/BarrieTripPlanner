/**
 * Trip Delay Service
 * Applies real-time GTFS-RT delays to trip itineraries
 */

import { fetchTripUpdates } from './arrivalService';
import { formatMinutes } from './tripService';
import logger from '../utils/logger';

/**
 * Apply real-time delays to a single itinerary
 * @param {Object} itinerary - The itinerary to apply delays to
 * @param {Array} tripUpdates - Pre-fetched trip updates (optional, will fetch if not provided)
 * @returns {Promise<Object>} Itinerary with delay information applied
 */
export const applyDelaysToItinerary = async (itinerary, tripUpdates = null) => {
  // Fetch trip updates if not provided
  let updates = tripUpdates;
  if (!updates) {
    try {
      updates = await fetchTripUpdates();
    } catch (error) {
      logger.warn('Could not fetch trip updates for delays:', error);
      // Return itinerary unchanged if we can't get updates
      return itinerary;
    }
  }

  if (!updates || updates.length === 0) {
    return itinerary;
  }

  // Create a map for faster lookup
  const tripUpdateMap = new Map();
  updates.forEach((entity) => {
    if (entity.tripUpdate?.tripId) {
      tripUpdateMap.set(entity.tripUpdate.tripId, entity.tripUpdate);
    }
  });

  // Apply delays to each leg
  const updatedLegs = itinerary.legs.map((leg) => {
    // Walk legs don't have delays
    if (leg.mode === 'WALK' || !leg.tripId) {
      return {
        ...leg,
        delaySeconds: 0,
        isRealtime: false,
      };
    }

    // Find matching trip update
    const update = tripUpdateMap.get(leg.tripId);
    if (!update || !update.stopTimeUpdates) {
      return {
        ...leg,
        delaySeconds: 0,
        isRealtime: false,
      };
    }

    // Find the stop update for the boarding stop
    const stopUpdate = update.stopTimeUpdates.find(
      (st) => st.stopId === leg.from.stopId
    );

    // Get delay from arrival or departure time
    const delaySeconds = stopUpdate?.arrival?.delay || stopUpdate?.departure?.delay || 0;

    return {
      ...leg,
      delaySeconds,
      isRealtime: true,
      // Adjust times if there's a delay
      startTime: leg.scheduledStartTime + (delaySeconds * 1000),
      endTime: leg.scheduledEndTime + (delaySeconds * 1000),
    };
  });

  // Calculate total delay for the itinerary (based on first transit leg)
  const firstTransitLeg = updatedLegs.find((leg) => leg.mode !== 'WALK' && leg.isRealtime);
  const totalDelaySeconds = firstTransitLeg?.delaySeconds || 0;

  return {
    ...itinerary,
    legs: updatedLegs,
    hasRealtimeInfo: updatedLegs.some((leg) => leg.isRealtime),
    totalDelaySeconds,
  };
};

/**
 * Apply real-time delays to multiple itineraries
 * Fetches trip updates once and applies to all itineraries
 * @param {Array} itineraries - Array of itineraries to apply delays to
 * @returns {Promise<Array>} Array of itineraries with delay information
 */
export const applyDelaysToItineraries = async (itineraries) => {
  if (!itineraries || itineraries.length === 0) {
    return itineraries;
  }

  // Fetch trip updates once for all itineraries
  let tripUpdates = null;
  try {
    tripUpdates = await fetchTripUpdates();
  } catch (error) {
    logger.warn('Could not fetch trip updates:', error);
    // Return itineraries unchanged
    return itineraries;
  }

  // Apply delays to each itinerary
  const updatedItineraries = await Promise.all(
    itineraries.map((itinerary) => applyDelaysToItinerary(itinerary, tripUpdates))
  );

  return updatedItineraries;
};

/**
 * Format delay for display
 * @param {number} delaySeconds - Delay in seconds
 * @returns {Object} Formatted delay info with text and status
 */
export const formatDelay = (delaySeconds) => {
  if (delaySeconds === 0) {
    return {
      text: 'On time',
      status: 'ontime',
      minutes: 0,
    };
  }

  const minutes = Math.round(delaySeconds / 60);

  if (minutes > 0) {
    return {
      text: `+${formatMinutes(minutes)}`,
      status: minutes <= 2 ? 'slight' : minutes <= 5 ? 'moderate' : 'severe',
      minutes,
    };
  } else {
    return {
      text: `${formatMinutes(Math.abs(minutes))} early`,
      status: 'early',
      minutes,
    };
  }
};
