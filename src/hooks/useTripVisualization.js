/**
 * useTripVisualization Hook
 *
 * Computes trip preview map data (polylines, markers, vehicle matches)
 * from a selected itinerary. Shared between native and web HomeScreens.
 */
import { useMemo } from 'react';
import { COLORS } from '../config/theme';
import { decodePolyline, findClosestPointIndex } from '../utils/polylineUtils';
import { haversineDistance } from '../utils/geometryUtils';
import { WALKING_ROUTE_COLOR } from '../config/mapLineStyles';
import {
  buildBusApproachLine,
  buildRoutePathsByRouteId,
} from '../utils/navigationBusPreview';

const BOARDING_PROGRESS_TOLERANCE_METERS = 80;

/** Snap a lat/lon to the nearest point on a decoded polyline */
const snapToPolyline = (lat, lon, polylineCoords) => {
  if (!polylineCoords || polylineCoords.length === 0) {
    return { latitude: lat, longitude: lon };
  }
  const idx = findClosestPointIndex(polylineCoords, lat, lon);
  return polylineCoords[idx];
};

const hasCoordinate = (point) =>
  Number.isFinite(point?.lat) && Number.isFinite(point?.lon);

const hasMarkerCoordinate = (point) =>
  Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);

const toMarkerCoordinate = (point) => ({
  latitude: point.lat,
  longitude: point.lon,
});

const estimateWalkDistance = (fromPoint, toPoint) => {
  if (!hasCoordinate(fromPoint) || !hasCoordinate(toPoint)) {
    return null;
  }

  return Math.round(haversineDistance(fromPoint.lat, fromPoint.lon, toPoint.lat, toPoint.lon));
};

const hasFixedRouteTransitIdentity = (leg) => (
  !!leg &&
  leg.mode !== 'WALK' &&
  (
    leg.mode === 'BUS' ||
    leg.mode === 'TRANSIT' ||
    !!leg.tripId ||
    !!leg.routeId ||
    !!leg.route?.id ||
    !!leg.route?.shortName
  )
);

const isOnDemandMapLeg = (leg) => (
  !!leg && !!leg.isOnDemand && !hasFixedRouteTransitIdentity(leg)
);

const findFirstBoardingStop = (legs) =>
  legs.find((leg) => isTransitMapLeg(leg) && hasCoordinate(leg.from))?.from ?? null;

const findLastAlightingStop = (legs) => {
  for (let index = legs.length - 1; index >= 0; index -= 1) {
    const leg = legs[index];
    if (isTransitMapLeg(leg) && hasCoordinate(leg.to)) {
      return leg.to;
    }
  }

  return null;
};

const areDistinctPoints = (point, markerCoordinate, minDistanceMeters = 20) => {
  if (!hasCoordinate(point) || !hasMarkerCoordinate(markerCoordinate)) {
    return false;
  }

  return haversineDistance(
    point.lat,
    point.lon,
    markerCoordinate.latitude,
    markerCoordinate.longitude
  ) >= minDistanceMeters;
};

export const buildTripMarkers = ({ legs = [], tripFrom = null, tripTo = null }) => {
  if (!Array.isArray(legs) || legs.length === 0) {
    return [];
  }

  const markers = [];
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const firstBoardingStop = findFirstBoardingStop(legs);
  const lastAlightingStop = findLastAlightingStop(legs);

  let originPoint = null;
  let originWalkDistance = null;

  if (firstLeg?.mode === 'WALK') {
    originPoint = firstBoardingStop ?? (hasCoordinate(firstLeg.from) ? firstLeg.from : null);
    originWalkDistance = firstBoardingStop
      ? Math.round(firstLeg.distance ?? estimateWalkDistance(tripFrom, firstBoardingStop) ?? 0)
      : null;
  } else {
    originPoint = firstBoardingStop ?? (hasCoordinate(firstLeg?.from) ? firstLeg.from : null);
    originWalkDistance = firstLeg?.isOnDemand
      ? null
      : estimateWalkDistance(tripFrom, originPoint);
  }

  if (originPoint) {
    markers.push({
      id: 'origin',
      coordinate: toMarkerCoordinate(originPoint),
      type: 'origin',
      title: 'Start',
      stopName: originPoint.name || null,
      stopCode: originPoint.stopCode || originPoint.stopId || null,
      walkDistance: originWalkDistance,
    });
  }

  let destinationPoint = null;
  let destinationWalkDistance = null;

  if (lastLeg?.mode === 'WALK') {
    destinationPoint = lastAlightingStop ?? (hasCoordinate(lastLeg.to) ? lastLeg.to : null);
    destinationWalkDistance = lastAlightingStop
      ? Math.round(lastLeg.distance ?? estimateWalkDistance(lastAlightingStop, tripTo) ?? 0)
      : null;
  } else {
    destinationPoint = lastAlightingStop ?? (hasCoordinate(lastLeg?.to) ? lastLeg.to : null);
    destinationWalkDistance = lastLeg?.isOnDemand
      ? null
      : estimateWalkDistance(destinationPoint, tripTo);
  }

  if (destinationPoint) {
    markers.push({
      id: 'destination',
      coordinate: toMarkerCoordinate(destinationPoint),
      type: 'destination',
      title: 'End',
      stopName: destinationPoint.name || null,
      stopCode: destinationPoint.stopCode || destinationPoint.stopId || null,
      walkDistance: destinationWalkDistance,
    });
  }

  return markers;
};

export const buildTripEndpointMarkers = ({
  tripFrom = null,
  tripTo = null,
  tripMarkers = [],
}) => {
  const markers = [];
  const originStopMarker = tripMarkers.find((marker) => marker.id === 'origin');
  const destinationStopMarker = tripMarkers.find((marker) => marker.id === 'destination');

  if (hasCoordinate(tripFrom) && areDistinctPoints(tripFrom, originStopMarker?.coordinate)) {
    markers.push({
      id: 'origin-location',
      coordinate: toMarkerCoordinate(tripFrom),
      type: 'originLocation',
      title: 'Start location',
    });
  }

  if (hasCoordinate(tripTo) && areDistinctPoints(tripTo, destinationStopMarker?.coordinate)) {
    markers.push({
      id: 'destination-location',
      coordinate: toMarkerCoordinate(tripTo),
      type: 'destinationLocation',
      title: 'Destination location',
    });
  }

  return markers;
};

const getTransitLegs = (itinerary) => (
  Array.isArray(itinerary?.legs)
    ? itinerary.legs.filter(isTransitMapLeg)
    : []
);

const isTransitMapLeg = (leg) => (
  !!leg && leg.mode !== 'WALK' && !isOnDemandMapLeg(leg)
);

const isWalkBetweenTransit = (legs, index) => (
  legs?.[index]?.mode === 'WALK' &&
  isTransitMapLeg(legs?.[index - 1]) &&
  isTransitMapLeg(legs?.[index + 1])
);

const isWalkMapLeg = (leg) => leg?.mode === 'WALK';

const getMiddleCoordinate = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }
  return coordinates[Math.floor((coordinates.length - 1) / 2)] ?? null;
};

export const buildTripRouteCoordinates = ({
  itinerary,
  decodedLegPolylines = [],
}) => {
  if (!itinerary) return [];

  const routes = [];
  itinerary.legs.forEach((leg, index) => {
    const decoded = decodedLegPolylines[index];
    const coords = [];

    if (decoded && decoded.length > 0) {
      coords.push(...decoded);
    } else if (leg.mode !== 'WALK' && leg.intermediateStops && leg.intermediateStops.length > 0) {
      if (leg.from) {
        coords.push({ latitude: leg.from.lat, longitude: leg.from.lon });
      }
      leg.intermediateStops.forEach((stop) => {
        if (stop.lat && stop.lon) {
          coords.push({ latitude: stop.lat, longitude: stop.lon });
        }
      });
      if (leg.to) {
        coords.push({ latitude: leg.to.lat, longitude: leg.to.lon });
      }
    } else if (!isWalkMapLeg(leg) && leg.from && leg.to) {
      coords.push({ latitude: leg.from.lat, longitude: leg.from.lon });
      coords.push({ latitude: leg.to.lat, longitude: leg.to.lon });
    }

    if (coords.length > 0) {
      const isWalk = leg.mode === 'WALK';
      const isOnDemand = isOnDemandMapLeg(leg);
      routes.push({
        id: `trip-leg-${index}`,
        coordinates: coords,
        color: isWalk ? WALKING_ROUTE_COLOR
          : isOnDemand ? (leg.zoneColor || COLORS.primary)
          : (leg.route?.color || COLORS.primary),
        mode: leg.mode,
        isWalk,
        isOnDemand,
        isTransferWalk: isWalkBetweenTransit(itinerary.legs, index),
        lineStyle: isWalk ? 'solid' : isOnDemand ? 'dashed' : 'solid',
        routeLabel: !isWalk && !isOnDemand ? (leg.route?.shortName || null) : null,
        labelCoordinate: !isWalk && !isOnDemand ? getMiddleCoordinate(coords) : null,
      });
    }
  });

  return routes;
};

const getLegTripIds = (leg) => {
  if (Array.isArray(leg?.tripIds) && leg.tripIds.length > 0) {
    return leg.tripIds;
  }

  return leg?.tripId ? [leg.tripId] : [];
};

const normalizeRouteKey = (routeId) => (
  routeId == null ? '' : String(routeId).trim().toUpperCase()
);

const getLegRouteId = (leg) => leg?.route?.id || leg?.routeId || null;

const getLegDirectionId = (leg, tripMapping = {}) => {
  if (leg?.directionId !== null && leg?.directionId !== undefined) {
    return leg.directionId;
  }
  if (leg?.tripId && tripMapping?.[leg.tripId]?.directionId !== undefined) {
    return tripMapping[leg.tripId].directionId;
  }
  return null;
};

const directionsMatch = (leg, vehicle, tripMapping = {}) => {
  const legDirectionId = getLegDirectionId(leg, tripMapping);
  if (legDirectionId === null || legDirectionId === undefined) {
    return true;
  }
  if (vehicle?.directionId === null || vehicle?.directionId === undefined) {
    return true;
  }
  return String(vehicle.directionId) === String(legDirectionId);
};

const getShapeForLeg = (leg, shapes = {}, tripMapping = {}) => {
  const shapeId = leg?.tripId ? tripMapping?.[leg.tripId]?.shapeId : null;
  if (shapeId && Array.isArray(shapes?.[shapeId]) && shapes[shapeId].length >= 2) {
    return shapes[shapeId];
  }

  if (leg?.legGeometry?.points) {
    const decoded = decodePolyline(leg.legGeometry.points);
    if (decoded.length >= 2) {
      return decoded;
    }
  }

  return null;
};

const getShapeProgress = (shapeCoords, lat, lon) => {
  if (!Array.isArray(shapeCoords) || shapeCoords.length < 2) {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const index = findClosestPointIndex(shapeCoords, lat, lon);
  let meters = 0;
  for (let i = 1; i <= index; i += 1) {
    meters += haversineDistance(
      shapeCoords[i - 1].latitude,
      shapeCoords[i - 1].longitude,
      shapeCoords[i].latitude,
      shapeCoords[i].longitude
    );
  }

  return { index, meters };
};

const getVehicleDistanceToStop = (vehicle, stop) => {
  if (!hasMarkerCoordinate(vehicle?.coordinate) || !hasCoordinate(stop)) {
    return Infinity;
  }

  return haversineDistance(
    vehicle.coordinate.latitude,
    vehicle.coordinate.longitude,
    stop.lat,
    stop.lon
  );
};

const getVehicleRouteFallbackMatch = ({
  leg,
  vehicle,
  shapes,
  tripMapping,
}) => {
  const legRouteId = normalizeRouteKey(getLegRouteId(leg));
  const vehicleRouteId = normalizeRouteKey(vehicle?.routeId);
  if (!legRouteId || !vehicleRouteId || legRouteId !== vehicleRouteId) {
    return { keep: false, evaluated: false, score: Infinity };
  }

  if (!directionsMatch(leg, vehicle, tripMapping)) {
    return { keep: false, evaluated: false, score: Infinity };
  }

  const shapeCoords = getShapeForLeg(leg, shapes, tripMapping);
  const vehicleCoord = vehicle?.coordinate;

  if (!shapeCoords || !hasCoordinate(leg?.from) || !hasCoordinate(leg?.to) || !hasMarkerCoordinate(vehicleCoord)) {
    return { keep: true, evaluated: false, score: Infinity };
  }

  const boardProgress = getShapeProgress(shapeCoords, leg.from.lat, leg.from.lon);
  const alightProgress = getShapeProgress(shapeCoords, leg.to.lat, leg.to.lon);
  const vehicleProgress = getShapeProgress(
    shapeCoords,
    vehicleCoord.latitude,
    vehicleCoord.longitude
  );

  if (!boardProgress || !alightProgress || !vehicleProgress || boardProgress.index === alightProgress.index) {
    return { keep: true, evaluated: false, score: Infinity };
  }

  const travelIncreasing = boardProgress.meters <= alightProgress.meters;
  const hasPassedBoarding = travelIncreasing
    ? vehicleProgress.meters > boardProgress.meters + BOARDING_PROGRESS_TOLERANCE_METERS
    : vehicleProgress.meters < boardProgress.meters - BOARDING_PROGRESS_TOLERANCE_METERS;

  return {
    keep: !hasPassedBoarding,
    evaluated: true,
    score: Math.abs(boardProgress.meters - vehicleProgress.meters),
  };
};

const getVehiclePreviewKey = (vehicle, fallbackIndex = 0) => (
  vehicle?.id ||
  `${vehicle?.routeId || 'route'}-${vehicle?.tripId || 'trip'}-${vehicle?.vehicleLabel || fallbackIndex}`
);

const selectRouteFallbackVehiclesForLeg = ({
  leg,
  vehicles,
  shapes,
  tripMapping,
}) => {
  const candidates = new Map();
  let hasEvaluatedCandidates = false;

  if (!leg) {
    return { vehicles: [], hasEvaluatedCandidates };
  }

  vehicles.forEach((vehicle) => {
    const match = getVehicleRouteFallbackMatch({
      leg,
      vehicle,
      shapes,
      tripMapping,
    });

    if (match.evaluated) {
      hasEvaluatedCandidates = true;
    }

    if (!match.keep) {
      return;
    }

    const key = getVehiclePreviewKey(vehicle, candidates.size);
    const existing = candidates.get(key);
    if (!existing || match.score < existing.score) {
      candidates.set(key, { vehicle, score: match.score });
    }
  });

  return {
    vehicles: Array.from(candidates.values())
      .sort((a, b) => a.score - b.score)
      .map((entry) => entry.vehicle),
    hasEvaluatedCandidates,
  };
};

const mergePreviewVehicles = (...vehicleGroups) => {
  const merged = new Map();

  vehicleGroups.flat().filter(Boolean).forEach((vehicle) => {
    const key = getVehiclePreviewKey(vehicle, merged.size);
    if (!merged.has(key)) {
      merged.set(key, vehicle);
    }
  });

  return Array.from(merged.values());
};

export const selectTripPreviewVehicles = ({
  selectedItinerary,
  vehicles = [],
  shapes = {},
  tripMapping = {},
}) => {
  if (!selectedItinerary || vehicles.length === 0) return [];

  const transitLegs = getTransitLegs(selectedItinerary);
  const tripIds = new Set(transitLegs.flatMap(getLegTripIds).filter(Boolean));
  const firstTransitLeg = transitLegs[0];

  if (tripIds.size > 0) {
    const byTripId = vehicles.filter((vehicle) => tripIds.has(vehicle.tripId));
    if (byTripId.length > 0) {
      const firstLegTripIds = new Set(getLegTripIds(firstTransitLeg).filter(Boolean));
      const hasFirstLegExactMatch = byTripId.some((vehicle) => firstLegTripIds.has(vehicle.tripId));

      if (hasFirstLegExactMatch) {
        return byTripId;
      }

      const { vehicles: firstLegFallbackVehicles } = selectRouteFallbackVehiclesForLeg({
        leg: firstTransitLeg,
        vehicles,
        shapes,
        tripMapping,
      });

      return firstLegFallbackVehicles.length > 0
        ? mergePreviewVehicles(firstLegFallbackVehicles, byTripId)
        : byTripId;
    }
  }

  const {
    vehicles: fallbackVehicles,
    hasEvaluatedCandidates,
  } = selectRouteFallbackVehiclesForLeg({
    leg: firstTransitLeg,
    vehicles,
    shapes,
    tripMapping,
  });

  if (hasEvaluatedCandidates) {
    if (fallbackVehicles.length > 0) {
      return fallbackVehicles;
    }
    return [];
  }

  const firstRouteId = normalizeRouteKey(getLegRouteId(firstTransitLeg));
  return vehicles.filter((vehicle) => firstRouteId && firstRouteId === normalizeRouteKey(vehicle.routeId));
};

const getApproachProgressMatch = ({
  leg,
  vehicle,
  shapes,
  tripMapping,
}) => {
  if (!hasMarkerCoordinate(vehicle?.coordinate)) {
    return { keep: false, evaluated: false, score: Infinity };
  }

  const shapeCoords = getShapeForLeg(leg, shapes, tripMapping);

  if (!shapeCoords || !hasCoordinate(leg?.from) || !hasCoordinate(leg?.to)) {
    return {
      keep: true,
      evaluated: false,
      score: getVehicleDistanceToStop(vehicle, leg?.from),
    };
  }

  const boardProgress = getShapeProgress(shapeCoords, leg.from.lat, leg.from.lon);
  const alightProgress = getShapeProgress(shapeCoords, leg.to.lat, leg.to.lon);
  const vehicleProgress = getShapeProgress(
    shapeCoords,
    vehicle.coordinate.latitude,
    vehicle.coordinate.longitude
  );

  if (!boardProgress || !alightProgress || !vehicleProgress || boardProgress.index === alightProgress.index) {
    return {
      keep: true,
      evaluated: false,
      score: getVehicleDistanceToStop(vehicle, leg?.from),
    };
  }

  const travelIncreasing = boardProgress.meters <= alightProgress.meters;
  const hasPassedBoarding = travelIncreasing
    ? vehicleProgress.meters > boardProgress.meters + BOARDING_PROGRESS_TOLERANCE_METERS
    : vehicleProgress.meters < boardProgress.meters - BOARDING_PROGRESS_TOLERANCE_METERS;

  return {
    keep: !hasPassedBoarding,
    evaluated: true,
    score: Math.abs(boardProgress.meters - vehicleProgress.meters),
  };
};

const getFirstLegApproachVehicle = ({
  firstTransitLeg,
  tripVehicles,
  shapes,
  tripMapping,
}) => {
  const legTripIds = new Set(getLegTripIds(firstTransitLeg).filter(Boolean));
  const exactVehicles = tripVehicles.filter((vehicle) => legTripIds.has(vehicle?.tripId));

  if (exactVehicles.length > 0) {
    const exactMatches = exactVehicles
      .map((vehicle) => ({
        vehicle,
        ...getApproachProgressMatch({ leg: firstTransitLeg, vehicle, shapes, tripMapping }),
      }))
      .sort((a, b) => a.score - b.score);

    const bestExactMatch = exactMatches.find((match) => match.keep);
    if (bestExactMatch) {
      return bestExactMatch.vehicle;
    }

    return exactMatches.some((match) => match.evaluated) ? null : exactVehicles[0];
  }

  const routeVehicles = tripVehicles.filter((candidate) => (
    normalizeRouteKey(candidate?.routeId) === normalizeRouteKey(getLegRouteId(firstTransitLeg)) &&
    directionsMatch(firstTransitLeg, candidate, tripMapping)
  ));

  if (routeVehicles.length === 0) {
    return null;
  }

  const routeMatches = routeVehicles
    .map((vehicle) => ({
      vehicle,
      ...getApproachProgressMatch({ leg: firstTransitLeg, vehicle, shapes, tripMapping }),
    }))
    .sort((a, b) => a.score - b.score);

  return routeMatches.find((match) => match.keep)?.vehicle ?? null;
};

export const buildBusApproachLines = ({
  legs = [],
  tripVehicles = [],
  shapes = {},
  tripMapping = {},
  routePathsByRouteId,
}) => {
  if (!Array.isArray(legs) || tripVehicles.length === 0) {
    return [];
  }

  const firstTransitLeg = legs.find((leg) => isTransitMapLeg(leg));
  if (!firstTransitLeg?.from || !hasCoordinate(firstTransitLeg.from)) {
    return [];
  }

  const vehicle = getFirstLegApproachVehicle({
    firstTransitLeg,
    tripVehicles,
    shapes,
    tripMapping,
  });
  if (!vehicle) {
    return [];
  }

  const line = buildBusApproachLine({
    transitLeg: firstTransitLeg,
    vehicle,
    targetStop: firstTransitLeg.from,
    previewKind: 'board',
    shapes,
    tripMapping,
    routePathsByRouteId,
  });

  if (!line) {
    return [];
  }

  return [{
    ...line,
    id: `bus-approach-${firstTransitLeg.tripId || getLegRouteId(firstTransitLeg) || 'first-leg'}`,
  }];
};

export const useTripVisualization = ({
  isTripPlanningMode,
  itineraries,
  selectedItineraryIndex,
  vehicles,
  shapes,
  routeShapeMapping,
  tripMapping,
  tripFrom,  // { lat, lon } - user's entered origin address
  tripTo,    // { lat, lon } - user's entered destination address
}) => {
  const selectedItinerary =
    isTripPlanningMode && itineraries.length > 0
      ? itineraries[selectedItineraryIndex] ?? null
      : null;

  // Decoded polyline per leg index (used for snapping stop markers)
  const decodedLegPolylines = useMemo(() => {
    if (!selectedItinerary) return [];
    return selectedItinerary.legs.map((leg) => {
      if (leg.legGeometry?.points) {
        return decodePolyline(leg.legGeometry.points);
      }
      return [];
    });
  }, [selectedItinerary]);

  // Decoded polyline segments for each leg
  const tripRouteCoordinates = useMemo(() => (
    buildTripRouteCoordinates({
      itinerary: selectedItinerary,
      decodedLegPolylines,
    })
  ), [selectedItinerary, decodedLegPolylines]);

  // Origin + destination markers with stop info
  const tripMarkers = useMemo(() => {
    return buildTripMarkers({
      legs: selectedItinerary?.legs,
      tripFrom,
      tripTo,
    });
  }, [selectedItinerary, tripFrom, tripTo]);

  const tripEndpointMarkers = useMemo(() => (
    buildTripEndpointMarkers({
      tripFrom,
      tripTo,
      tripMarkers,
    })
  ), [tripFrom, tripTo, tripMarkers]);

  // Intermediate stop dots along transit legs (snapped to polyline)
  const intermediateStopMarkers = useMemo(() => {
    if (!selectedItinerary) return [];

    const stopMarkers = [];
    selectedItinerary.legs.forEach((leg, legIndex) => {
      if (!isTransitMapLeg(leg) || !leg.intermediateStops) return;

      const polyline = decodedLegPolylines[legIndex];

      leg.intermediateStops.forEach((stop, stopIndex) => {
        if (stop.lat && stop.lon) {
          stopMarkers.push({
            id: `stop-${legIndex}-${stopIndex}`,
            coordinate: snapToPolyline(stop.lat, stop.lon, polyline),
            name: stop.name,
            color: leg.route?.color || COLORS.primary,
          });
        }
      });
    });

    return stopMarkers;
  }, [selectedItinerary, decodedLegPolylines]);

  // Boarding / alighting markers with labels (snapped to polyline)
  const boardingAlightingMarkers = useMemo(() => {
    if (!selectedItinerary) return [];

    const markers = [];
    selectedItinerary.legs.forEach((leg, legIndex) => {
      if (!isTransitMapLeg(leg)) return;

      const routeColor = leg.route?.color || COLORS.primary;
      const routeName = leg.route?.shortName || '';
      const polyline = decodedLegPolylines[legIndex];

      if (leg.from && leg.from.lat && leg.from.lon) {
        markers.push({
          id: `boarding-${legIndex}`,
          coordinate: snapToPolyline(leg.from.lat, leg.from.lon, polyline),
          type: 'boarding',
          stopName: leg.from.name,
          stopCode: leg.from.stopCode || leg.from.stopId,
          routeColor,
          routeName,
        });
      }

      if (leg.to && leg.to.lat && leg.to.lon) {
        markers.push({
          id: `alighting-${legIndex}`,
          coordinate: snapToPolyline(leg.to.lat, leg.to.lon, polyline),
          type: 'alighting',
          stopName: leg.to.name,
          stopCode: leg.to.stopCode || leg.to.stopId,
          routeColor,
          routeName,
        });
      }
    });

    return markers;
  }, [selectedItinerary, decodedLegPolylines]);

  // Vehicles matching the selected itinerary's trips, or approaching buses on the same route
  const tripVehicles = useMemo(() => {
    return selectTripPreviewVehicles({
      selectedItinerary,
      vehicles,
      shapes,
      tripMapping,
    });
  }, [selectedItinerary, vehicles, shapes, tripMapping]);

  const routePathsByRouteId = useMemo(() => (
    buildRoutePathsByRouteId({ shapes, routeShapeMapping })
  ), [shapes, routeShapeMapping]);

  // Dashed approach lines: bus current position → boarding stop (following GTFS shape)
  const busApproachLines = useMemo(() => {
    return buildBusApproachLines({
      legs: selectedItinerary?.legs,
      tripVehicles,
      shapes,
      tripMapping,
      routePathsByRouteId,
    });
  }, [selectedItinerary, tripVehicles, shapes, tripMapping, routePathsByRouteId]);

  return {
    tripRouteCoordinates,
    tripMarkers,
    tripEndpointMarkers,
    intermediateStopMarkers,
    boardingAlightingMarkers,
    tripVehicles,
    busApproachLines,
  };
};
