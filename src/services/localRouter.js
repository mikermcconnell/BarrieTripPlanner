/**
 * Local RAPTOR Router
 *
 * Implements the RAPTOR (Round-Based Public Transit Routing) algorithm
 * for finding optimal transit routes using Barrie Transit GTFS data.
 *
 * RAPTOR works by iterating through "rounds" where each round represents
 * one additional transit segment (transfer). Round 0 is walking to stops,
 * Round 1 is the first bus, Round 2 adds one transfer, etc.
 *
 * Reference: https://www.microsoft.com/en-us/research/publication/round-based-public-transit-routing/
 */

import { ROUTING_CONFIG } from '../config/constants';
import {
  findNearbyStops,
  getDeparturesAfter,
  haversineDistance,
} from './routingDataService';
import { getActiveServicesForDate, formatGTFSDate } from './calendarService';
import { buildItinerary } from './itineraryBuilder';

/**
 * Convert a Date to seconds since midnight
 * @param {Date} date - JavaScript Date object
 * @returns {number} Seconds since midnight
 */
const dateToSeconds = (date) => {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
};

/**
 * Custom error for routing failures
 */
export class RoutingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'RoutingError';
  }
}

export const ROUTING_ERROR_CODES = {
  NO_NEARBY_STOPS: 'NO_NEARBY_STOPS',
  NO_SERVICE: 'NO_SERVICE',
  NO_ROUTE_FOUND: 'NO_ROUTE_FOUND',
  OUTSIDE_SERVICE_AREA: 'OUTSIDE_SERVICE_AREA',
};

/**
 * Main entry point for local trip planning
 * Matches the signature expected by tripService.js
 *
 * @param {Object} params - Trip planning parameters
 * @param {Object} routingData - Pre-built routing data structures
 * @returns {Promise<Object>} Trip plan with itineraries
 */
export const planTripLocal = async ({
  fromLat,
  fromLon,
  toLat,
  toLon,
  date = new Date(),
  time = new Date(),
  arriveBy = false,
  routingData,
}) => {
  // Validate inputs
  if (!routingData) {
    throw new RoutingError('NO_DATA', 'Routing data not loaded');
  }

  // Check if origin and destination are too close (less than 50m)
  const directDistance = haversineDistance(fromLat, fromLon, toLat, toLon);
  if (directDistance < 50) {
    throw new RoutingError(
      ROUTING_ERROR_CODES.NO_ROUTE_FOUND,
      'Origin and destination are too close to require transit'
    );
  }

  // Get departure time in seconds since midnight
  const departureTime = dateToSeconds(time);

  // Get active services for the requested date
  const activeServices = getActiveServicesForDate(routingData.serviceCalendar, date);

  if (activeServices.size === 0) {
    throw new RoutingError(
      ROUTING_ERROR_CODES.NO_SERVICE,
      'No transit service on the requested date'
    );
  }

  // Find nearby stops for origin and destination
  const originStops = findNearbyStops(
    routingData.stops,
    fromLat,
    fromLon,
    ROUTING_CONFIG.MAX_WALK_TO_TRANSIT
  );

  const destStops = findNearbyStops(
    routingData.stops,
    toLat,
    toLon,
    ROUTING_CONFIG.MAX_WALK_TO_TRANSIT
  );

  if (originStops.length === 0) {
    throw new RoutingError(
      ROUTING_ERROR_CODES.OUTSIDE_SERVICE_AREA,
      'No transit stops near your starting location'
    );
  }

  if (destStops.length === 0) {
    throw new RoutingError(
      ROUTING_ERROR_CODES.OUTSIDE_SERVICE_AREA,
      'No transit stops near your destination'
    );
  }

  // Run RAPTOR algorithm with iterative passes for time-diverse results.
  // Each pass excludes previously-found trips so RAPTOR naturally discovers
  // the next departure time instead of showing the same bus with different stops.
  let raptorResults;

  if (arriveBy) {
    raptorResults = raptorReverse(
      routingData,
      originStops,
      destStops,
      departureTime,
      activeServices
    );
  } else {
    raptorResults = [];
    const excludeTrips = new Set();
    const maxPasses = ROUTING_CONFIG.MAX_ITINERARIES + 2; // safety limit

    for (let pass = 0; pass < maxPasses; pass++) {
      if (raptorResults.length >= ROUTING_CONFIG.MAX_ITINERARIES) break;

      const passResults = raptorForward(
        routingData,
        originStops,
        destStops,
        departureTime,
        activeServices,
        excludeTrips.size > 0 ? excludeTrips : null
      );

      if (passResults.length === 0) break;

      // Collect trip IDs from this pass to exclude in next pass
      for (const result of passResults) {
        for (const seg of result.path) {
          if (seg.type === 'TRANSIT') {
            excludeTrips.add(seg.tripId);
          }
        }
      }

      // Merge with existing results and deduplicate
      raptorResults = deduplicateResults([...raptorResults, ...passResults]);
    }

    // Final sort by arrival time, with tiebreaker on walk distance
    raptorResults.sort((a, b) => {
      const timeDiff = a.arrivalTime - b.arrivalTime;
      if (Math.abs(timeDiff) > 120) return timeDiff;
      return a.walkToDestSeconds - b.walkToDestSeconds;
    });

    raptorResults = raptorResults.slice(0, ROUTING_CONFIG.MAX_ITINERARIES);
  }

  if (raptorResults.length === 0) {
    throw new RoutingError(
      ROUTING_ERROR_CODES.NO_ROUTE_FOUND,
      'No transit routes found for this trip'
    );
  }

  // Build itineraries from RAPTOR results
  const itineraries = raptorResults.map((result, index) =>
    buildItinerary(result, routingData, {
      fromLat,
      fromLon,
      toLat,
      toLon,
      date,
    })
  );

  return {
    from: { name: 'Origin', lat: fromLat, lon: fromLon },
    to: { name: 'Destination', lat: toLat, lon: toLon },
    itineraries,
  };
};

/**
 * Forward RAPTOR algorithm (depart-at mode)
 * Finds earliest arrival times at all stops, then extracts best paths to destination
 *
 * @param {Object} routingData - Routing data structures
 * @param {Array} originStops - Nearby stops at origin with walk times
 * @param {Array} destStops - Nearby stops at destination with walk times
 * @param {number} departureTime - Departure time in seconds since midnight
 * @param {Set} activeServices - Set of active service IDs
 * @param {Set} excludeTrips - Trip IDs to exclude from search (for time diversity)
 * @returns {Array} Array of route results
 */
const raptorForward = (
  routingData,
  originStops,
  destStops,
  departureTime,
  activeServices,
  excludeTrips = null
) => {
  const { stopDepartures, transfers, stopIndex, tripIndex, routeStopSequences, stopTimes, stopTimesIndex } = routingData;
  const maxRounds = ROUTING_CONFIG.MAX_TRANSFERS + 1;
  const maxDepartureTime = departureTime + (ROUTING_CONFIG.TIME_WINDOW || 7200);

  // tau[stopId] = earliest arrival time at stop
  const tau = new Map();

  // labels[round][stopId] = how we reached this stop in this round
  const labels = [];
  for (let r = 0; r <= maxRounds; r++) {
    labels.push(new Map());
  }

  // markedStops = stops that were improved in the previous round
  let markedStops = new Set();

  // Round 0: Initialize with walking from origin
  originStops.forEach(({ stop, walkSeconds }) => {
    const arrivalTime = departureTime + walkSeconds;
    tau.set(stop.id, arrivalTime);
    labels[0].set(stop.id, {
      type: 'ORIGIN_WALK',
      walkSeconds,
      fromLat: null,
      fromLon: null,
    });
    markedStops.add(stop.id);
  });

  // Rounds 1 to maxRounds: Transit + transfers
  for (let round = 1; round <= maxRounds; round++) {
    const newMarked = new Set();

    // Collect all routes that serve marked stops
    const routesToScan = new Map(); // routeId -> earliest marked stop in sequence

    markedStops.forEach((stopId) => {
      const routes = routingData.stopRoutes[stopId] || new Set();
      routes.forEach((routeId) => {
        if (!routesToScan.has(routeId)) {
          routesToScan.set(routeId, stopId);
        }
      });
    });

    // Traverse each route
    routesToScan.forEach((_, routeId) => {
      // Get both directions
      const directions = routeStopSequences[routeId] || {};

      Object.keys(directions).forEach((directionId) => {
        const stopSequence = directions[directionId];
        if (!stopSequence || stopSequence.length === 0) return;

        let boarding = null; // { stopId, time, tripId, routeId, directionId }

        // Traverse stops in sequence order
        for (let i = 0; i < stopSequence.length; i++) {
          const stopId = stopSequence[i];
          const currentTime = tau.get(stopId);

          // Can we board at this stop?
          if (currentTime !== undefined && markedStops.has(stopId)) {
            // Skip if we're already past the time window
            if (currentTime > maxDepartureTime) continue;

            // Find next departure (skipping already-found trips for diversity)
            const departure = getNextDepartureForRouteDirection(
              stopDepartures,
              stopId,
              routeId,
              parseInt(directionId, 10),
              currentTime,
              activeServices,
              excludeTrips
            );

            if (departure && departure.departureTime <= maxDepartureTime) {
              if (boarding === null) {
                boarding = {
                  stopId,
                  stopIndex: i,
                  boardTime: currentTime,
                  tripId: departure.tripId,
                  tripDepartureTime: departure.departureTime,
                  routeId,
                  directionId: parseInt(directionId, 10),
                  headsign: departure.headsign,
                };
              } else {
                // Walk-aware comparison: penalize extra walking so closer stops are preferred
                // effectiveCost = walkTime * (multiplier - 1) + busDepartureTime
                const walkMultiplier = ROUTING_CONFIG.WALK_TIME_MULTIPLIER || 2.0;
                const candidateWalkTime = currentTime - departureTime;
                const incumbentWalkTime = boarding.boardTime - departureTime;
                const candidateCost = candidateWalkTime * (walkMultiplier - 1) + departure.departureTime;
                const incumbentCost = incumbentWalkTime * (walkMultiplier - 1) + boarding.tripDepartureTime;

                if (candidateCost < incumbentCost) {
                  boarding = {
                    stopId,
                    stopIndex: i,
                    boardTime: currentTime,
                    tripId: departure.tripId,
                    tripDepartureTime: departure.departureTime,
                    routeId,
                    directionId: parseInt(directionId, 10),
                    headsign: departure.headsign,
                  };
                }
              }
            }
          }

          // If we're on a trip, can we improve arrival at this stop?
          if (boarding !== null && i > boarding.stopIndex) {
            // Get arrival time at this stop for the trip we're on (O(1) lookup)
            const arrivalTime = getTripArrivalAtStop(
              stopTimesIndex,
              boarding.tripId,
              stopId
            );

            if (arrivalTime !== null) {
              const previousBest = tau.get(stopId);

              if (previousBest === undefined || arrivalTime < previousBest) {
                tau.set(stopId, arrivalTime);
                labels[round].set(stopId, {
                  type: 'TRANSIT',
                  tripId: boarding.tripId,
                  routeId: boarding.routeId,
                  directionId: boarding.directionId,
                  headsign: boarding.headsign,
                  boardingStopId: boarding.stopId,
                  boardingTime: boarding.tripDepartureTime,
                  alightingTime: arrivalTime,
                });
                newMarked.add(stopId);
              }
            }
          }
        }
      });
    });

    // Apply transfers (walking between stops)
    const stopsToTransferFrom = new Set(newMarked);
    stopsToTransferFrom.forEach((stopId) => {
      const currentTime = tau.get(stopId);
      const stopTransfers = transfers[stopId] || [];

      stopTransfers.forEach((transfer) => {
        const newTime = currentTime + transfer.walkSeconds + ROUTING_CONFIG.MIN_TRANSFER_TIME;
        const previousBest = tau.get(transfer.toStopId);

        if (previousBest === undefined || newTime < previousBest) {
          tau.set(transfer.toStopId, newTime);
          labels[round].set(transfer.toStopId, {
            type: 'TRANSFER',
            fromStopId: stopId,
            walkSeconds: transfer.walkSeconds,
            walkMeters: transfer.walkMeters,
          });
          newMarked.add(transfer.toStopId);
        }
      });
    });

    markedStops = newMarked;

    // Early termination if no improvements
    if (markedStops.size === 0) break;
  }

  // Find best arrivals at destination stops
  const results = [];

  destStops.forEach(({ stop, walkSeconds }) => {
    const arrivalAtStop = tau.get(stop.id);
    if (arrivalAtStop === undefined) return;

    const totalArrival = arrivalAtStop + walkSeconds;

    // Reconstruct the path
    const path = reconstructPath(labels, stop.id, tau);
    if (path) {
      // Filter out walk-only paths (no transit legs) — these are stops reachable
      // by walking from the origin, not actual transit itineraries
      const hasTransit = path.some((segment) => segment.type === 'TRANSIT');
      if (!hasTransit) return;

      results.push({
        destinationStopId: stop.id,
        walkToDestSeconds: walkSeconds,
        arrivalTime: totalArrival,
        path,
      });
    }
  });

  // Sort by arrival time, with secondary preference for shorter walks
  results.sort((a, b) => {
    // Primary: arrival time
    const timeDiff = a.arrivalTime - b.arrivalTime;
    // If arrival times differ by more than 2 minutes, sort by time
    if (Math.abs(timeDiff) > 120) {
      return timeDiff;
    }
    // Secondary: prefer shorter walks when arrival times are similar
    return a.walkToDestSeconds - b.walkToDestSeconds;
  });

  // Deduplicate similar routes (same trip combination)
  return deduplicateResults(results);
};

/**
 * Find next departure from a stop for a specific route and direction
 * @param {Set} excludeTrips - Trip IDs to skip (already-found trips)
 */
const getNextDepartureForRouteDirection = (
  stopDepartures,
  stopId,
  routeId,
  directionId,
  afterTime,
  activeServices,
  excludeTrips = null
) => {
  const departures = stopDepartures[stopId] || [];

  for (const dep of departures) {
    if (
      dep.departureTime >= afterTime &&
      dep.routeId === routeId &&
      dep.directionId === directionId &&
      activeServices.has(dep.serviceId) &&
      dep.pickupType !== 1 && // pickupType 1 = no pickup
      !(excludeTrips && excludeTrips.has(dep.tripId)) // skip already-found trips
    ) {
      return dep;
    }
  }

  return null;
};

/**
 * Get arrival time at a specific stop for a trip (O(1) lookup)
 */
const getTripArrivalAtStop = (stopTimesIndex, tripId, stopId) => {
  const key = `${tripId}_${stopId}`;
  const st = stopTimesIndex[key];
  return st?.arrivalTime ?? null;
};

/**
 * Reconstruct the path from labels
 */
const reconstructPath = (labels, endStopId, tau) => {
  const path = [];
  let currentStopId = endStopId;

  // Work backwards through rounds
  for (let round = labels.length - 1; round >= 0; round--) {
    const label = labels[round].get(currentStopId);
    if (!label) continue;

    if (label.type === 'TRANSIT') {
      path.unshift({
        type: 'TRANSIT',
        tripId: label.tripId,
        routeId: label.routeId,
        directionId: label.directionId,
        headsign: label.headsign,
        boardingStopId: label.boardingStopId,
        alightingStopId: currentStopId,
        boardingTime: label.boardingTime,
        alightingTime: label.alightingTime,
      });
      currentStopId = label.boardingStopId;
    } else if (label.type === 'TRANSFER') {
      path.unshift({
        type: 'TRANSFER',
        fromStopId: label.fromStopId,
        toStopId: currentStopId,
        walkSeconds: label.walkSeconds,
        walkMeters: label.walkMeters,
      });
      currentStopId = label.fromStopId;
    } else if (label.type === 'ORIGIN_WALK') {
      path.unshift({
        type: 'ORIGIN_WALK',
        toStopId: currentStopId,
        walkSeconds: label.walkSeconds,
      });
      return path;
    }
  }

  return path.length > 0 ? path : null;
};

/**
 * Remove duplicate/similar routes
 *
 * Two itineraries are considered duplicates if they use the same physical
 * bus trip(s). This prevents showing the same bus ride multiple times with
 * slightly different boarding/alighting stops (and thus different walk
 * distances) when they're really the same trip. Results are pre-sorted by
 * arrival time, so the first occurrence for each trip combo is the best one.
 */
const deduplicateResults = (results) => {
  const seen = new Set();
  const unique = [];

  results.forEach((result) => {
    // Create signature based on trip IDs — same physical bus = same trip
    const signature = result.path
      .filter((p) => p.type === 'TRANSIT')
      .map((p) => p.tripId)
      .join('|');

    if (!seen.has(signature)) {
      seen.add(signature);
      unique.push(result);
    }
  });

  return unique;
};

/**
 * Reverse RAPTOR for arrive-by mode
 * Works backwards from destination to find latest departure
 */
const raptorReverse = (
  routingData,
  originStops,
  destStops,
  targetArrivalTime,
  activeServices
) => {
  // For now, run forward RAPTOR with earlier departure times
  // and pick the one that arrives closest to target time
  // Full reverse RAPTOR is more complex and can be added later

  const searchTimes = [
    targetArrivalTime - 3600, // 1 hour before
    targetArrivalTime - 2400, // 40 min before
    targetArrivalTime - 1800, // 30 min before
    targetArrivalTime - 1200, // 20 min before
  ];

  let bestResult = null;

  for (const departureTime of searchTimes) {
    if (departureTime < 0) continue;

    try {
      const results = raptorForward(
        routingData,
        originStops,
        destStops,
        departureTime,
        activeServices
      );

      for (const result of results) {
        if (result.arrivalTime <= targetArrivalTime) {
          if (!bestResult || result.arrivalTime > bestResult.arrivalTime) {
            bestResult = result;
          }
        }
      }
    } catch (e) {
      // Continue trying earlier times
    }
  }

  return bestResult ? [bestResult] : [];
};
