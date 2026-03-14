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

const findFirstBoardingStop = (legs) =>
  legs.find((leg) => leg.mode !== 'WALK' && !leg.isOnDemand && hasCoordinate(leg.from))?.from ?? null;

const findLastAlightingStop = (legs) => {
  for (let index = legs.length - 1; index >= 0; index -= 1) {
    const leg = legs[index];
    if (leg.mode !== 'WALK' && !leg.isOnDemand && hasCoordinate(leg.to)) {
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

export const buildBusApproachLines = ({
  legs = [],
  tripVehicles = [],
  shapes = null,
  tripMapping = null,
}) => {
  if (!Array.isArray(legs) || tripVehicles.length === 0 || !shapes || !tripMapping) {
    return [];
  }

  const firstTransitLeg = legs.find((leg) => leg.mode !== 'WALK' && !leg.isOnDemand && leg.tripId);
  if (!firstTransitLeg?.from || !hasCoordinate(firstTransitLeg.from)) {
    return [];
  }

  const vehicle = tripVehicles.find((candidate) => candidate.tripId === firstTransitLeg.tripId);
  if (!vehicle?.coordinate) {
    return [];
  }

  const mapping = tripMapping[firstTransitLeg.tripId];
  if (!mapping?.shapeId) {
    return [];
  }

  const shapeCoords = shapes[mapping.shapeId];
  if (!Array.isArray(shapeCoords) || shapeCoords.length < 2) {
    return [];
  }

  const busIdx = findClosestPointIndex(
    shapeCoords,
    vehicle.coordinate.latitude,
    vehicle.coordinate.longitude
  );
  const boardIdx = findClosestPointIndex(
    shapeCoords,
    firstTransitLeg.from.lat,
    firstTransitLeg.from.lon
  );

  // Guard: bus already past boarding stop
  if (busIdx >= boardIdx) {
    return [];
  }

  const segment = shapeCoords.slice(busIdx, boardIdx + 1);
  if (segment.length < 2) {
    return [];
  }

  return [{
    id: `bus-approach-${firstTransitLeg.tripId}`,
    coordinates: segment,
    color: firstTransitLeg.route?.color || COLORS.primary,
  }];
};

export const useTripVisualization = ({
  isTripPlanningMode,
  itineraries,
  selectedItineraryIndex,
  vehicles,
  shapes,
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
  const tripRouteCoordinates = useMemo(() => {
    if (!selectedItinerary) return [];

    const routes = [];
    selectedItinerary.legs.forEach((leg, index) => {
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
      } else if (leg.from && leg.to) {
        coords.push({ latitude: leg.from.lat, longitude: leg.from.lon });
        coords.push({ latitude: leg.to.lat, longitude: leg.to.lon });
      }

      if (coords.length > 0) {
        routes.push({
          id: `trip-leg-${index}`,
          coordinates: coords,
          color: leg.mode === 'WALK' ? '#4285F4'
            : leg.isOnDemand ? (leg.zoneColor || COLORS.primary)
            : (leg.route?.color || COLORS.primary),
          isWalk: leg.mode === 'WALK',
          isOnDemand: !!leg.isOnDemand,
          routeLabel: leg.mode !== 'WALK' ? (leg.route?.shortName || null) : null,
        });
      }
    });

    return routes;
  }, [selectedItinerary, decodedLegPolylines]);

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
      if (leg.mode === 'WALK' || leg.isOnDemand || !leg.intermediateStops) return;

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
      if (leg.mode === 'WALK' || leg.isOnDemand) return;

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

  // Vehicles matching the selected itinerary's trips
  const tripVehicles = useMemo(() => {
    if (!selectedItinerary || vehicles.length === 0) return [];

    const tripIds = new Set();
    selectedItinerary.legs.forEach(leg => {
      if (leg.mode !== 'WALK' && !leg.isOnDemand && leg.tripId) {
        tripIds.add(leg.tripId);
      }
    });

    if (tripIds.size === 0) return [];

    const byTripId = vehicles.filter(v => tripIds.has(v.tripId));
    if (byTripId.length > 0) return byTripId;

    // Fallback: filter by route IDs
    const tripRouteIds = new Set();
    selectedItinerary.legs.forEach(leg => {
      if (leg.mode !== 'WALK' && !leg.isOnDemand && leg.route?.id) {
        tripRouteIds.add(leg.route.id);
      }
    });
    return vehicles.filter(v => tripRouteIds.has(v.routeId));
  }, [selectedItinerary, vehicles]);

  // Dashed approach lines: bus current position → boarding stop (following GTFS shape)
  const busApproachLines = useMemo(() => {
    return buildBusApproachLines({
      legs: selectedItinerary?.legs,
      tripVehicles,
      shapes,
      tripMapping,
    });
  }, [selectedItinerary, tripVehicles, shapes, tripMapping]);

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
