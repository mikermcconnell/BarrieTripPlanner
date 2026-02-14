/**
 * Routing Data Service
 *
 * Builds and manages data structures optimized for the RAPTOR routing algorithm.
 * Pre-processes GTFS data into efficient lookup structures for fast trip planning.
 *
 * Key data structures:
 * 1. stopDepartures - Departures indexed by stop for quick lookup
 * 2. routeStopSequences - Ordered stops per route/direction
 * 3. transfers - Walking connections between nearby stops
 * 4. tripIndex - Fast trip lookup by ID
 * 5. stopIndex - Fast stop lookup with coordinates
 */

import { ROUTING_CONFIG } from '../config/constants';
import { buildServiceCalendar } from './calendarService';
import { haversineDistance } from '../utils/geometryUtils';
import logger from '../utils/logger';

/**
 * Build stop departures index
 * Maps each stop to all departures from that stop, sorted by time
 *
 * Structure: { stopId: [{ tripId, routeId, departureTime, arrivalTime, stopSeq }, ...] }
 *
 * @param {Array} stopTimes - Array of stop_time objects
 * @param {Array} trips - Array of trip objects
 * @returns {Object} Stop departures index
 */
export const buildStopDeparturesIndex = (stopTimes, trips) => {
  const index = {};

  // Create trip lookup for fast access
  const tripMap = {};
  trips.forEach((trip) => {
    tripMap[trip.tripId] = trip;
  });

  // Group stop times by stop
  stopTimes.forEach((st) => {
    if (st.departureTime == null) return; // Skip entries without departure time

    const trip = tripMap[st.tripId];
    if (!trip) return;

    if (!index[st.stopId]) {
      index[st.stopId] = [];
    }

    index[st.stopId].push({
      tripId: st.tripId,
      routeId: trip.routeId,
      serviceId: trip.serviceId,
      directionId: trip.directionId,
      headsign: trip.headsign,
      departureTime: st.departureTime,
      arrivalTime: st.arrivalTime,
      stopSequence: st.stopSequence,
      pickupType: st.pickupType,
    });
  });

  // Sort each stop's departures by time
  Object.keys(index).forEach((stopId) => {
    index[stopId].sort((a, b) => a.departureTime - b.departureTime);
  });

  return index;
};

/**
 * Build route stop sequences
 * Maps each route+direction to an ordered list of stops
 *
 * Structure: { routeId: { 0: [stopId, ...], 1: [stopId, ...] } }
 *
 * @param {Array} stopTimes - Array of stop_time objects
 * @param {Array} trips - Array of trip objects
 * @returns {Object} Route stop sequences
 */
export const buildRouteStopSequences = (stopTimes, trips) => {
  const sequences = {};

  // Create trip lookup
  const tripMap = {};
  trips.forEach((trip) => {
    tripMap[trip.tripId] = trip;
  });

  // Group stop times by trip, then by route+direction
  const tripStops = {};
  stopTimes.forEach((st) => {
    if (!tripStops[st.tripId]) {
      tripStops[st.tripId] = [];
    }
    tripStops[st.tripId].push({
      stopId: st.stopId,
      sequence: st.stopSequence,
    });
  });

  // For each trip, extract the stop sequence
  Object.keys(tripStops).forEach((tripId) => {
    const trip = tripMap[tripId];
    if (!trip) return;

    const routeId = trip.routeId;
    const directionId = trip.directionId;

    // Sort stops by sequence
    tripStops[tripId].sort((a, b) => a.sequence - b.sequence);
    const stopSequence = tripStops[tripId].map((s) => s.stopId);

    // Initialize route if needed
    if (!sequences[routeId]) {
      sequences[routeId] = {};
    }

    // Store this direction's sequence (use first trip as canonical)
    if (!sequences[routeId][directionId]) {
      sequences[routeId][directionId] = stopSequence;
    }
  });

  return sequences;
};

/**
 * Build transfer graph (walking connections between stops)
 * For each stop, find nearby stops within walking distance
 *
 * Structure: { stopId: [{ toStopId, walkMeters, walkSeconds }, ...] }
 *
 * @param {Array} stops - Array of stop objects with lat/lon
 * @param {number} maxWalkMeters - Maximum walking distance (default from config)
 * @returns {Object} Transfer graph
 */
export const buildTransferGraph = (stops, maxWalkMeters = ROUTING_CONFIG.MAX_WALK_FOR_TRANSFER) => {
  const transfers = {};
  const walkSpeed = ROUTING_CONFIG.WALK_SPEED;
  const buffer = ROUTING_CONFIG.WALK_DISTANCE_BUFFER;

  // Build spatial index for faster nearby searches
  // Using simple grid-based bucketing
  const gridSize = 0.005; // ~500m at mid-latitudes
  const grid = {};

  stops.forEach((stop) => {
    const gridX = Math.floor(stop.longitude / gridSize);
    const gridY = Math.floor(stop.latitude / gridSize);
    const key = `${gridX},${gridY}`;
    if (!grid[key]) {
      grid[key] = [];
    }
    grid[key].push(stop);
  });

  // For each stop, find nearby stops
  stops.forEach((stop) => {
    transfers[stop.id] = [];

    const gridX = Math.floor(stop.longitude / gridSize);
    const gridY = Math.floor(stop.latitude / gridSize);

    // Check adjacent grid cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${gridX + dx},${gridY + dy}`;
        const nearby = grid[key] || [];

        nearby.forEach((other) => {
          if (other.id === stop.id) return;

          const distance = haversineDistance(
            stop.latitude,
            stop.longitude,
            other.latitude,
            other.longitude
          );

          if (distance <= maxWalkMeters) {
            // Apply buffer for more realistic walking distance
            const walkDistance = distance * buffer;
            const walkSeconds = Math.round(walkDistance / walkSpeed);

            transfers[stop.id].push({
              toStopId: other.id,
              walkMeters: Math.round(distance),
              walkSeconds,
            });
          }
        });
      }
    }

    // Sort by distance
    transfers[stop.id].sort((a, b) => a.walkMeters - b.walkMeters);
  });

  return transfers;
};

/**
 * Find stops near a given coordinate
 *
 * @param {Array} stops - Array of stop objects
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} maxMeters - Maximum distance in meters
 * @returns {Array} Array of { stop, walkMeters, walkSeconds }
 */
export const findNearbyStops = (stops, lat, lon, maxMeters = ROUTING_CONFIG.MAX_WALK_TO_TRANSIT) => {
  const walkSpeed = ROUTING_CONFIG.WALK_SPEED;
  const buffer = ROUTING_CONFIG.WALK_DISTANCE_BUFFER;
  const nearby = [];

  stops.forEach((stop) => {
    const distance = haversineDistance(lat, lon, stop.latitude, stop.longitude);

    if (distance <= maxMeters) {
      const walkDistance = distance * buffer;
      nearby.push({
        stop,
        walkMeters: Math.round(distance),
        walkSeconds: Math.round(walkDistance / walkSpeed),
      });
    }
  });

  // Sort by distance
  nearby.sort((a, b) => a.walkMeters - b.walkMeters);

  return nearby;
};

/**
 * Build trip index for fast lookup
 *
 * @param {Array} trips - Array of trip objects
 * @returns {Object} Map of tripId to trip object
 */
export const buildTripIndex = (trips) => {
  const index = {};
  trips.forEach((trip) => {
    index[trip.tripId] = trip;
  });
  return index;
};

/**
 * Build stop index for fast lookup
 *
 * @param {Array} stops - Array of stop objects
 * @returns {Object} Map of stopId to stop object
 */
export const buildStopIndex = (stops) => {
  const index = {};
  stops.forEach((stop) => {
    index[stop.id] = stop;
  });
  return index;
};

/**
 * Build routes that serve each stop
 * Maps each stop to the routes that pass through it
 *
 * Structure: { stopId: Set<routeId> }
 *
 * @param {Object} stopDepartures - Stop departures index
 * @returns {Object} Map of stopId to Set of routeIds
 */
export const buildStopRoutesIndex = (stopDepartures) => {
  const index = {};

  Object.keys(stopDepartures).forEach((stopId) => {
    const routes = new Set();
    stopDepartures[stopId].forEach((dep) => {
      routes.add(dep.routeId);
    });
    index[stopId] = routes;
  });

  return index;
};

/**
 * Get stop times for a specific trip in sequence order
 *
 * @param {Array} stopTimes - Array of all stop times
 * @param {string} tripId - Trip ID to get times for
 * @returns {Array} Sorted stop times for the trip
 */
export const getTripStopTimes = (stopTimes, tripId) => {
  return stopTimes
    .filter((st) => st.tripId === tripId)
    .sort((a, b) => a.stopSequence - b.stopSequence);
};

/**
 * Build an index of stop times by trip+stop for O(1) lookup
 * This is critical for RAPTOR performance
 *
 * @param {Array} stopTimes - Array of all stop times
 * @returns {Object} Map of "tripId_stopId" to stop time object
 */
export const buildStopTimesIndex = (stopTimes) => {
  const index = {};
  stopTimes.forEach((st) => {
    const key = `${st.tripId}_${st.stopId}`;
    index[key] = st;
  });
  return index;
};

/**
 * Build complete routing data structures from GTFS data
 * Main entry point for preparing routing data
 *
 * @param {Object} gtfsData - Object containing all parsed GTFS data
 * @returns {Object} Complete routing data package
 */
export const buildRoutingData = (gtfsData) => {
  const { stops, trips, stopTimes, calendar, calendarDates } = gtfsData;

  // Build all indexes
  const stopDepartures = buildStopDeparturesIndex(stopTimes, trips);
  const routeStopSequences = buildRouteStopSequences(stopTimes, trips);
  const transfers = buildTransferGraph(stops);
  const tripIndex = buildTripIndex(trips);
  const stopIndex = buildStopIndex(stops);
  const stopRoutes = buildStopRoutesIndex(stopDepartures);
  const serviceCalendar = buildServiceCalendar(calendar, calendarDates);

  // Build stop times index for O(1) lookup during routing
  const stopTimesIndex = buildStopTimesIndex(stopTimes);

  return {
    stopDepartures,
    routeStopSequences,
    transfers,
    tripIndex,
    stopIndex,
    stopRoutes,
    serviceCalendar,
    stopTimesIndex,
    // Keep raw data for certain operations
    stops,
    trips,
    stopTimes,
  };
};

/**
 * Get departures from a stop after a given time
 *
 * @param {Object} stopDepartures - Stop departures index
 * @param {string} stopId - Stop ID
 * @param {number} afterTime - Time in seconds since midnight
 * @param {Set} activeServices - Set of active service IDs
 * @param {number} limit - Maximum number of departures to return
 * @returns {Array} Array of departure objects
 */
export const getDeparturesAfter = (
  stopDepartures,
  stopId,
  afterTime,
  activeServices,
  limit = 10
) => {
  const departures = stopDepartures[stopId] || [];
  const results = [];

  for (const dep of departures) {
    if (dep.departureTime >= afterTime && activeServices.has(dep.serviceId)) {
      results.push(dep);
      if (results.length >= limit) break;
    }
  }

  return results;
};

/**
 * Find the next departure from a stop for a specific route
 *
 * @param {Object} stopDepartures - Stop departures index
 * @param {string} stopId - Stop ID
 * @param {string} routeId - Route ID
 * @param {number} afterTime - Time in seconds since midnight
 * @param {Set} activeServices - Set of active service IDs
 * @returns {Object|null} Next departure or null if none found
 */
export const getNextDepartureForRoute = (
  stopDepartures,
  stopId,
  routeId,
  afterTime,
  activeServices
) => {
  const departures = stopDepartures[stopId] || [];

  for (const dep of departures) {
    if (
      dep.departureTime >= afterTime &&
      dep.routeId === routeId &&
      activeServices.has(dep.serviceId)
    ) {
      return dep;
    }
  }

  return null;
};
