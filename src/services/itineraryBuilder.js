/**
 * Itinerary Builder
 *
 * Transforms RAPTOR algorithm results into OTP-compatible itinerary objects.
 * This ensures the output format matches what the existing UI components expect.
 */

import { ROUTE_COLORS, ROUTING_CONFIG } from '../config/constants';
import { haversineDistance } from './routingDataService';

/**
 * Build an OTP-compatible itinerary from RAPTOR result
 *
 * @param {Object} result - RAPTOR routing result
 * @param {Object} routingData - Routing data structures
 * @param {Object} tripInfo - Trip metadata (from/to coords, date)
 * @returns {Object} OTP-compatible itinerary
 */
export const buildItinerary = (result, routingData, tripInfo) => {
  const { path, arrivalTime, walkToDestSeconds, destinationStopId } = result;
  const { stopIndex, tripIndex } = routingData;
  const { fromLat, fromLon, toLat, toLon, date } = tripInfo;

  const legs = [];
  let totalWalkTime = 0;
  let totalTransitTime = 0;
  let totalWaitTime = 0;
  let totalWalkDistance = 0;

  // Get base timestamp for the date
  const baseTime = new Date(date);
  baseTime.setHours(0, 0, 0, 0);
  const baseTimestamp = baseTime.getTime();

  let lastEndTime = null;

  // Build each leg
  path.forEach((segment, index) => {
    if (segment.type === 'ORIGIN_WALK') {
      // Walking from origin to first stop
      const toStop = stopIndex[segment.toStopId];
      const walkDistance = haversineDistance(
        fromLat,
        fromLon,
        toStop.latitude,
        toStop.longitude
      ) * ROUTING_CONFIG.WALK_DISTANCE_BUFFER;

      // Calculate walk start time based on when the next transit leg boards
      // If no transit leg follows (walk-only path), fall back to arrival-based calculation
      const nextBoardingTime = path[1]?.boardingTime;
      const startTime = nextBoardingTime !== undefined
        ? baseTimestamp + (nextBoardingTime - segment.walkSeconds) * 1000
        : baseTimestamp + (arrivalTime - walkToDestSeconds - segment.walkSeconds) * 1000;
      const endTime = startTime + segment.walkSeconds * 1000;

      legs.push(buildWalkLeg({
        startTime,
        endTime,
        duration: segment.walkSeconds,
        distance: walkDistance,
        from: {
          name: 'Origin',
          lat: fromLat,
          lon: fromLon,
        },
        to: {
          name: toStop.name,
          lat: toStop.latitude,
          lon: toStop.longitude,
          stopId: toStop.id,
          stopCode: toStop.code,
        },
      }));

      totalWalkTime += segment.walkSeconds;
      totalWalkDistance += walkDistance;
      lastEndTime = endTime;

    } else if (segment.type === 'TRANSIT') {
      const boardingStop = stopIndex[segment.boardingStopId];
      const alightingStop = stopIndex[segment.alightingStopId];
      const trip = tripIndex[segment.tripId];

      const boardingTime = baseTimestamp + segment.boardingTime * 1000;
      const alightingTime = baseTimestamp + segment.alightingTime * 1000;
      const duration = segment.alightingTime - segment.boardingTime;

      // Calculate wait time
      if (lastEndTime) {
        const waitTime = (boardingTime - lastEndTime) / 1000;
        if (waitTime > 0) {
          totalWaitTime += waitTime;
        }
      }

      // Get intermediate stops
      const intermediateStops = getIntermediateStops(
        routingData,
        segment.tripId,
        segment.boardingStopId,
        segment.alightingStopId
      );

      // Get route info
      const route = routingData.routes ? getRouteInfo(routingData, segment.routeId) : null;

      legs.push(buildTransitLeg({
        startTime: boardingTime,
        endTime: alightingTime,
        duration,
        from: {
          name: boardingStop.name,
          lat: boardingStop.latitude,
          lon: boardingStop.longitude,
          stopId: boardingStop.id,
          stopCode: boardingStop.code,
        },
        to: {
          name: alightingStop.name,
          lat: alightingStop.latitude,
          lon: alightingStop.longitude,
          stopId: alightingStop.id,
          stopCode: alightingStop.code,
        },
        route: {
          id: segment.routeId,
          shortName: route?.shortName || segment.routeId,
          longName: route?.longName || '',
          color: route?.color || ROUTE_COLORS[segment.routeId] || ROUTE_COLORS.DEFAULT,
        },
        headsign: segment.headsign,
        tripId: segment.tripId,
        intermediateStops,
      }));

      totalTransitTime += duration;
      lastEndTime = alightingTime;

    } else if (segment.type === 'TRANSFER') {
      const fromStop = stopIndex[segment.fromStopId];
      const toStop = stopIndex[segment.toStopId];

      const startTime = lastEndTime || (baseTimestamp + segment.walkSeconds * 1000);
      const endTime = startTime + segment.walkSeconds * 1000;

      legs.push(buildWalkLeg({
        startTime,
        endTime,
        duration: segment.walkSeconds,
        distance: segment.walkMeters * ROUTING_CONFIG.WALK_DISTANCE_BUFFER,
        from: {
          name: fromStop.name,
          lat: fromStop.latitude,
          lon: fromStop.longitude,
          stopId: fromStop.id,
          stopCode: fromStop.code,
        },
        to: {
          name: toStop.name,
          lat: toStop.latitude,
          lon: toStop.longitude,
          stopId: toStop.id,
          stopCode: toStop.code,
        },
      }));

      totalWalkTime += segment.walkSeconds;
      totalWalkDistance += segment.walkMeters * ROUTING_CONFIG.WALK_DISTANCE_BUFFER;
      lastEndTime = endTime;
    }
  });

  // Merge consecutive transit legs on the same route
  // RAPTOR may split a single ride into multiple segments (different tripIds)
  // but if the route is the same, the passenger stays on the bus — no transfer needed
  const mergedLegs = mergeSameRouteLegs(legs);

  // Add final walk to destination
  if (walkToDestSeconds > 0) {
    const destStop = stopIndex[destinationStopId];
    const walkDistance = haversineDistance(
      destStop.latitude,
      destStop.longitude,
      toLat,
      toLon
    ) * ROUTING_CONFIG.WALK_DISTANCE_BUFFER;

    const startTime = lastEndTime || (baseTimestamp + arrivalTime * 1000 - walkToDestSeconds * 1000);
    const endTime = startTime + walkToDestSeconds * 1000;

    mergedLegs.push(buildWalkLeg({
      startTime,
      endTime,
      duration: walkToDestSeconds,
      distance: walkDistance,
      from: {
        name: destStop.name,
        lat: destStop.latitude,
        lon: destStop.longitude,
        stopId: destStop.id,
        stopCode: destStop.code,
      },
      to: {
        name: 'Destination',
        lat: toLat,
        lon: toLon,
      },
    }));

    totalWalkTime += walkToDestSeconds;
    totalWalkDistance += walkDistance;
  }

  // Recalculate totals from merged legs
  const recalcTransitTime = mergedLegs
    .filter(l => l.mode === 'BUS')
    .reduce((sum, l) => sum + l.duration, 0);
  const recalcTransfers = Math.max(0, mergedLegs.filter(l => l.mode === 'BUS').length - 1);

  // Calculate total duration
  const startTime = mergedLegs[0]?.startTime || baseTimestamp;
  const endTime = mergedLegs[mergedLegs.length - 1]?.endTime || baseTimestamp;
  const duration = Math.round((endTime - startTime) / 1000);

  return {
    id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    duration,
    startTime,
    endTime,
    walkTime: Math.round(totalWalkTime),
    transitTime: Math.round(recalcTransitTime),
    waitingTime: Math.round(totalWaitTime),
    walkDistance: Math.round(totalWalkDistance),
    transfers: recalcTransfers,
    legs: mergedLegs,
  };
};

/**
 * Merge consecutive transit legs on the same route.
 * RAPTOR may output multiple TRANSIT segments for the same route (different tripIds)
 * when a route has sub-variants or the GTFS data splits trips at hubs.
 * If the passenger stays on the same route, these should be one leg with no transfer.
 *
 * Also removes any WALK (transfer) legs sandwiched between same-route transit legs.
 */
const mergeSameRouteLegs = (legs) => {
  if (legs.length <= 1) return legs;

  const merged = [];
  let i = 0;

  while (i < legs.length) {
    const current = legs[i];

    if (current.mode !== 'BUS') {
      // Check if this WALK leg is a transfer between same-route BUS legs
      if (current.mode === 'WALK' && i > 0 && i < legs.length - 1) {
        const prev = merged[merged.length - 1];
        const next = legs[i + 1];
        if (
          prev?.mode === 'BUS' &&
          next?.mode === 'BUS' &&
          prev.route?.shortName === next.route?.shortName
        ) {
          // Skip this transfer walk — it'll be absorbed by the merge
          i++;
          continue;
        }
      }
      merged.push(current);
      i++;
      continue;
    }

    // Current is a BUS leg — look ahead for consecutive same-route BUS legs
    let mergedLeg = { ...current, intermediateStops: [...(current.intermediateStops || [])] };
    let j = i + 1;

    while (j < legs.length) {
      // Skip transfer walks between same-route legs
      let next = legs[j];
      if (next.mode === 'WALK' && j + 1 < legs.length && legs[j + 1].mode === 'BUS') {
        const nextBus = legs[j + 1];
        if (nextBus.route?.shortName === mergedLeg.route?.shortName) {
          // Skip the walk, merge the next bus leg
          j++;
          next = legs[j];
        } else {
          break;
        }
      }

      if (next.mode === 'BUS' && next.route?.shortName === mergedLeg.route?.shortName) {
        // Merge: extend the leg to cover both segments
        // Add the alighting stop of the current merged leg as an intermediate
        mergedLeg.intermediateStops.push({
          name: mergedLeg.to.name,
          lat: mergedLeg.to.lat,
          lon: mergedLeg.to.lon,
          stopId: mergedLeg.to.stopId,
        });
        // Add the next leg's intermediate stops
        if (next.intermediateStops) {
          mergedLeg.intermediateStops.push(...next.intermediateStops);
        }
        // Update end point
        mergedLeg.to = next.to;
        mergedLeg.endTime = next.endTime;
        mergedLeg.scheduledEndTime = next.scheduledEndTime;
        mergedLeg.duration = Math.round((mergedLeg.endTime - mergedLeg.startTime) / 1000);
        mergedLeg.distance = calculateLegDistance(mergedLeg.from, mergedLeg.to, mergedLeg.intermediateStops);
        j++;
      } else {
        break;
      }
    }

    merged.push(mergedLeg);
    i = j;
  }

  return merged;
};

/**
 * Build a walking leg
 * Includes sanity check: walk duration is capped to distance-based maximum
 */
const buildWalkLeg = ({ startTime, endTime, duration, distance, from, to }) => {
  const roundedDistance = Math.round(distance);
  // Sanity check: max reasonable walk duration based on distance at 0.8 m/s (very slow)
  const maxReasonableDuration = Math.round(roundedDistance / 0.8);
  const safeDuration = (duration > 0 && duration <= maxReasonableDuration)
    ? duration
    : Math.round(roundedDistance / ROUTING_CONFIG.WALK_SPEED);

  return {
    mode: 'WALK',
    startTime,
    endTime,
    scheduledStartTime: startTime,
    scheduledEndTime: endTime,
    delaySeconds: 0,
    isRealtime: false,
    duration: safeDuration,
    distance: roundedDistance,
    from,
    to,
    route: null,
    headsign: null,
    tripId: null,
    intermediateStops: null,
    legGeometry: null,
    steps: null,
  };
};

/**
 * Build a transit (bus) leg
 */
const buildTransitLeg = ({
  startTime,
  endTime,
  duration,
  from,
  to,
  route,
  headsign,
  tripId,
  intermediateStops,
}) => ({
  mode: 'BUS',
  startTime,
  endTime,
  scheduledStartTime: startTime,
  scheduledEndTime: endTime,
  delaySeconds: 0,
  isRealtime: false,
  duration,
  distance: calculateLegDistance(from, to, intermediateStops),
  from,
  to,
  route,
  headsign,
  tripId,
  intermediateStops,
  legGeometry: null,
  steps: null,
});

/**
 * Calculate approximate distance for a transit leg
 */
const calculateLegDistance = (from, to, intermediateStops) => {
  let distance = 0;
  let lastLat = from.lat;
  let lastLon = from.lon;

  if (intermediateStops) {
    intermediateStops.forEach((stop) => {
      distance += haversineDistance(lastLat, lastLon, stop.lat, stop.lon);
      lastLat = stop.lat;
      lastLon = stop.lon;
    });
  }

  distance += haversineDistance(lastLat, lastLon, to.lat, to.lon);
  return Math.round(distance);
};

/**
 * Get intermediate stops for a transit leg
 */
const getIntermediateStops = (routingData, tripId, boardingStopId, alightingStopId) => {
  const { stopTimes, stopIndex } = routingData;

  // Get all stop times for this trip in sequence order
  const tripStopTimes = stopTimes
    .filter((st) => st.tripId === tripId)
    .sort((a, b) => a.stopSequence - b.stopSequence);

  // Find boarding and alighting indices
  let boardingIdx = -1;
  let alightingIdx = -1;

  tripStopTimes.forEach((st, idx) => {
    if (st.stopId === boardingStopId && boardingIdx === -1) {
      boardingIdx = idx;
    }
    if (st.stopId === alightingStopId) {
      alightingIdx = idx;
    }
  });

  if (boardingIdx === -1 || alightingIdx === -1 || alightingIdx <= boardingIdx) {
    return [];
  }

  // Get intermediate stops (excluding boarding and alighting stops)
  const intermediates = [];
  for (let i = boardingIdx + 1; i < alightingIdx; i++) {
    const st = tripStopTimes[i];
    const stop = stopIndex[st.stopId];
    if (stop) {
      intermediates.push({
        name: stop.name,
        lat: stop.latitude,
        lon: stop.longitude,
        stopId: stop.id,
      });
    }
  }

  return intermediates;
};

/**
 * Get route info from routing data
 */
const getRouteInfo = (routingData, routeId) => {
  // Routes might be stored in the raw GTFS data
  if (routingData.routes) {
    const route = routingData.routes.find((r) => r.id === routeId);
    if (route) {
      return {
        shortName: route.shortName,
        longName: route.longName,
        color: route.color,
      };
    }
  }
  return null;
};

/**
 * Build geometry polyline for map display
 * Uses shape data if available, otherwise creates straight lines
 */
export const buildLegGeometry = (leg, shapes, routeShapeMapping) => {
  if (leg.mode === 'WALK') {
    // Simple straight line for walking
    return {
      points: encodePolyline([
        [leg.from.lat, leg.from.lon],
        [leg.to.lat, leg.to.lon],
      ]),
      length: 2,
    };
  }

  // For transit, try to use shape data
  // This is a simplified version - full implementation would slice the shape
  // between boarding and alighting stops
  return {
    points: encodePolyline([
      [leg.from.lat, leg.from.lon],
      ...(leg.intermediateStops || []).map((s) => [s.lat, s.lon]),
      [leg.to.lat, leg.to.lon],
    ]),
    length: (leg.intermediateStops?.length || 0) + 2,
  };
};

/**
 * Encode coordinates as polyline (simplified version)
 * Full implementation would use Google's polyline encoding algorithm
 */
const encodePolyline = (coords) => {
  // For now, just return JSON-encoded coordinates
  // Real implementation would use proper polyline encoding
  return JSON.stringify(coords);
};
