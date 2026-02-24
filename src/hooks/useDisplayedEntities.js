/**
 * useDisplayedEntities Hook
 *
 * Computes displayed vehicles, shapes, and stops based on the current
 * route selection. Works with both multi-select (native) and single-select
 * (web) by accepting a normalized Set of route IDs.
 *
 * Shared between native and web HomeScreens.
 */
import { useMemo, useCallback } from 'react';
import { ROUTE_COLORS } from '../config/constants';
import { getRepresentativeShapeIdsByDirection } from '../utils/routeShapeUtils';

export const useDisplayedEntities = ({
  selectedRouteIds,
  vehicles,
  routes,
  trips,
  shapes,
  processedShapes,
  routeShapeMapping,
  routeStopsMapping,
  stops,
  showRoutes,
  showStops,
  mapRegion,
}) => {
  const isValidHexColor = (value) =>
    typeof value === 'string' && /^#?[0-9a-fA-F]{6}$/.test(value.trim());

  const routeColorById = useMemo(() => {
    const map = new Map();
    routes.forEach((route) => {
      if (route?.id && isValidHexColor(route?.color)) {
        const raw = String(route.color).trim();
        map.set(route.id, raw.startsWith('#') ? raw : `#${raw}`);
      }
    });
    return map;
  }, [routes]);

  // Get the route color
  const getRouteColor = useCallback(
    (routeId) => {
      let color = ROUTE_COLORS.DEFAULT;
      const mappedColor = routeColorById.get(routeId);

      if (mappedColor) {
        color = mappedColor;
      } else if (ROUTE_COLORS[routeId]) {
        color = ROUTE_COLORS[routeId];
      }

      // Soften pure black or extremely dark colors to reduce map clutter
      // GTFS often uses 000000 for unspecified/default black lines
      if (color.toUpperCase() === '#000000' || color.toUpperCase() === 'BLACK') {
        return '#475569'; // Slate-600
      }

      return color;
    },
    [routeColorById]
  );

  // Filter vehicles by selected routes
  const displayedVehicles = useMemo(() => {
    return selectedRouteIds.size > 0
      ? vehicles.filter((v) => selectedRouteIds.has(v.routeId))
      : vehicles;
  }, [selectedRouteIds, vehicles]);

  // Map shape IDs to direction sets from trips
  const shapeDirectionMap = useMemo(() => {
    const map = {};
    trips.forEach((trip) => {
      if (!trip.shapeId) return;
      const shapeId = String(trip.shapeId);
      const direction =
        trip.directionId === null || trip.directionId === undefined
          ? 'unknown'
          : String(trip.directionId);
      if (!map[shapeId]) map[shapeId] = new Set();
      map[shapeId].add(direction);
    });
    return map;
  }, [trips]);

  // Get shapes to display (prefer processedShapes for smooth rendering)
  const displayedShapes = useMemo(() => {
    const shapeSource = Object.keys(processedShapes).length > 0 ? processedShapes : shapes;
    const shapesToDisplay = [];

    if (selectedRouteIds.size > 0) {
      selectedRouteIds.forEach(routeId => {
        const shapeIds = routeShapeMapping[routeId] || [];
        shapeIds.forEach((shapeId) => {
          if (shapeSource[shapeId]) {
            const renderedShapeId = `${routeId}:${shapeId}`;
            shapesToDisplay.push({
              id: renderedShapeId,
              coordinates: shapeSource[shapeId],
              color: getRouteColor(routeId),
              routeId,
              shapeId,
            });
          }
        });
      });
    } else if (showRoutes) {
      Object.keys(routeShapeMapping).forEach((routeId) => {
        const shapeIds = routeShapeMapping[routeId] || [];
        const representativeIds = getRepresentativeShapeIdsByDirection(
          shapeIds,
          shapeSource,
          shapeDirectionMap,
          {
            maxShapes: 2,
            precision: 3,
          }
        );

        representativeIds.forEach((shapeId) => {
          const renderedShapeId = `${routeId}:${shapeId}`;
          shapesToDisplay.push({
            id: renderedShapeId,
            coordinates: shapeSource[shapeId],
            color: getRouteColor(routeId),
            routeId,
            shapeId,
          });
        });
      });
    }

    return shapesToDisplay;
  }, [selectedRouteIds, showRoutes, routeShapeMapping, shapes, processedShapes, getRouteColor, shapeDirectionMap]);

  // Get stops to display - using GTFS stop-route mapping for accuracy
  const displayedStops = useMemo(() => {
    if (!showStops) return [];

    let filteredStops = [];

    if (selectedRouteIds.size > 0) {
      const combinedStopIds = new Set();
      selectedRouteIds.forEach(routeId => {
        const stopIds = routeStopsMapping[routeId] || [];
        stopIds.forEach(stopId => combinedStopIds.add(stopId));
      });
      filteredStops = stops.filter(stop => combinedStopIds.has(stop.id));
    } else {
      // No route selected - use viewport-based filtering
      if (mapRegion.latitudeDelta > 0.05) return [];

      const buffer = mapRegion.latitudeDelta * 0.1;
      const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 2 - buffer;
      const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 2 + buffer;
      const minLng = mapRegion.longitude - mapRegion.longitudeDelta / 2 - buffer;
      const maxLng = mapRegion.longitude + mapRegion.longitudeDelta / 2 + buffer;

      filteredStops = stops.filter(stop =>
        stop.latitude >= minLat &&
        stop.latitude <= maxLat &&
        stop.longitude >= minLng &&
        stop.longitude <= maxLng
      );
    }

    return filteredStops.slice(0, 150);
  }, [showStops, mapRegion, stops, selectedRouteIds, routeStopsMapping]);

  return {
    getRouteColor,
    displayedVehicles,
    shapeDirectionMap,
    displayedShapes,
    displayedStops,
  };
};
