/**
 * useTripVisualization Hook
 *
 * Computes trip preview map data (polylines, markers, vehicle matches)
 * from a selected itinerary. Shared between native and web HomeScreens.
 */
import { useMemo } from 'react';
import { COLORS } from '../config/theme';
import { decodePolyline, findClosestPointIndex } from '../utils/polylineUtils';

/** Snap a lat/lon to the nearest point on a decoded polyline */
const snapToPolyline = (lat, lon, polylineCoords) => {
  if (!polylineCoords || polylineCoords.length === 0) {
    return { latitude: lat, longitude: lon };
  }
  const idx = findClosestPointIndex(polylineCoords, lat, lon);
  return polylineCoords[idx];
};

export const useTripVisualization = ({
  isTripPlanningMode,
  itineraries,
  selectedItineraryIndex,
  vehicles,
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
          color: leg.mode === 'WALK' ? COLORS.grey500 : (leg.route?.color || COLORS.primary),
          isWalk: leg.mode === 'WALK',
        });
      }
    });

    return routes;
  }, [selectedItinerary, decodedLegPolylines]);

  // Origin + destination markers
  const tripMarkers = useMemo(() => {
    if (!selectedItinerary?.legs) return [];

    const markers = [];
    const firstLeg = selectedItinerary.legs[0];
    const lastLeg = selectedItinerary.legs[selectedItinerary.legs.length - 1];

    if (firstLeg?.from) {
      markers.push({
        id: 'origin',
        coordinate: { latitude: firstLeg.from.lat, longitude: firstLeg.from.lon },
        type: 'origin',
        title: 'Start',
      });
    }

    if (lastLeg?.to) {
      markers.push({
        id: 'destination',
        coordinate: { latitude: lastLeg.to.lat, longitude: lastLeg.to.lon },
        type: 'destination',
        title: 'End',
      });
    }

    return markers;
  }, [selectedItinerary]);

  // Intermediate stop dots along transit legs (snapped to polyline)
  const intermediateStopMarkers = useMemo(() => {
    if (!selectedItinerary) return [];

    const stopMarkers = [];
    selectedItinerary.legs.forEach((leg, legIndex) => {
      if (leg.mode === 'WALK' || !leg.intermediateStops) return;

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
      if (leg.mode === 'WALK') return;

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
    if (!selectedItinerary) return [];

    const tripIds = new Set();
    selectedItinerary.legs.forEach(leg => {
      if (leg.mode !== 'WALK' && leg.tripId) {
        tripIds.add(leg.tripId);
      }
    });

    if (tripIds.size === 0) return [];

    const byTripId = vehicles.filter(v => tripIds.has(v.tripId));
    if (byTripId.length > 0) return byTripId;

    // Fallback: filter by route IDs
    const tripRouteIds = new Set();
    selectedItinerary.legs.forEach(leg => {
      if (leg.mode !== 'WALK' && leg.route?.id) {
        tripRouteIds.add(leg.route.id);
      }
    });
    return vehicles.filter(v => tripRouteIds.has(v.routeId));
  }, [selectedItinerary, vehicles]);

  return {
    tripRouteCoordinates,
    tripMarkers,
    intermediateStopMarkers,
    boardingAlightingMarkers,
    tripVehicles,
  };
};
