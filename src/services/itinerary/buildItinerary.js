import { ROUTE_COLORS, ROUTING_CONFIG } from '../../config/constants';
import { haversineDistance } from '../../utils/geometryUtils';
import { buildTransitLegGeometry } from './buildTransitLegGeometry';
import { calculateLegDistance } from './calculateLegDistance';
import { getIntermediateStops } from './getIntermediateStops';
import { mergeTransitLegs } from './mergeTransitLegs';

const buildWalkLeg = ({ startTime, endTime, duration, distance, from, to }) => {
  const roundedDistance = Math.round(distance);
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

const buildTransitLeg = ({
  startTime,
  endTime,
  duration,
  from,
  to,
  route,
  headsign,
  tripId,
  directionId,
  blockId,
  intermediateStops,
  shapes,
  tripIndex,
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
  directionId,
  blockId,
  intermediateStops,
  legGeometry: buildTransitLegGeometry({ tripId, tripIndex, shapes, from, to, intermediateStops }),
  steps: null,
});

const mergeConsecutiveWalkLegs = (legs) => {
  if (!Array.isArray(legs) || legs.length <= 1) return legs;

  const merged = [];

  legs.forEach((leg) => {
    const previous = merged[merged.length - 1];

    if (leg?.mode === 'WALK' && previous?.mode === 'WALK') {
      merged[merged.length - 1] = {
        ...previous,
        endTime: leg.endTime,
        scheduledEndTime: leg.scheduledEndTime,
        duration: Math.round((leg.endTime - previous.startTime) / 1000),
        distance: Math.round((previous.distance || 0) + (leg.distance || 0)),
        to: leg.to,
        legGeometry: null,
        steps: null,
      };
      return;
    }

    merged.push(leg);
  });

  return merged;
};

const getRouteInfo = (routingData, routeId) => {
  if (routingData.routes) {
    const route = routingData.routes.find((candidate) => candidate.id === routeId);
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

export const buildItinerary = (result, routingData, tripInfo) => {
  const { path, arrivalTime, walkToDestSeconds, destinationStopId } = result;
  const { stopIndex, tripIndex } = routingData;
  const { fromLat, fromLon, toLat, toLon, date } = tripInfo;

  const legs = [];
  let totalWalkTime = 0;
  let totalWaitTime = 0;
  let totalWalkDistance = 0;

  const baseTime = new Date(date);
  baseTime.setHours(0, 0, 0, 0);
  const baseTimestamp = baseTime.getTime();

  let lastEndTime = null;

  path.forEach((segment) => {
    if (segment.type === 'ORIGIN_WALK') {
      const toStop = stopIndex[segment.toStopId];
      const walkDistance = haversineDistance(
        fromLat,
        fromLon,
        toStop.latitude,
        toStop.longitude
      ) * ROUTING_CONFIG.WALK_DISTANCE_BUFFER;

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
      return;
    }

    if (segment.type === 'TRANSIT') {
      const boardingStop = stopIndex[segment.boardingStopId];
      const alightingStop = stopIndex[segment.alightingStopId];
      const boardingTime = baseTimestamp + segment.boardingTime * 1000;
      const alightingTime = baseTimestamp + segment.alightingTime * 1000;
      const duration = segment.alightingTime - segment.boardingTime;

      if (lastEndTime) {
        const waitTime = (boardingTime - lastEndTime) / 1000;
        if (waitTime > 0) {
          totalWaitTime += waitTime;
        }
      }

      const intermediateStops = getIntermediateStops(
        routingData,
        segment.tripId,
        segment.boardingStopId,
        segment.alightingStopId
      );

      const route = routingData.routes ? getRouteInfo(routingData, segment.routeId) : null;
      const trip = tripIndex?.[segment.tripId];

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
        directionId: segment.directionId ?? trip?.directionId,
        blockId: trip?.blockId || segment.blockId || null,
        intermediateStops,
        shapes: routingData.shapes,
        tripIndex,
      }));

      lastEndTime = alightingTime;
      return;
    }

    if (segment.type === 'TRANSFER') {
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

  let mergedLegs = mergeTransitLegs(legs, routingData);

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

  mergedLegs = mergeConsecutiveWalkLegs(mergedLegs);

  const transitLegs = mergedLegs.filter((leg) => leg.mode === 'BUS');
  const recalcTransitTime = transitLegs.reduce((sum, leg) => sum + leg.duration, 0);
  const recalcTransfers = Math.max(0, transitLegs.length - 1);

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

export default buildItinerary;
