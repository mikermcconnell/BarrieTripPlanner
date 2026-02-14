/**
 * useDisplayedEntities Hook
 *
 * Computes displayed vehicles, shapes, stops, and detour-related memos
 * based on the current route selection. Works with both multi-select (native)
 * and single-select (web) by accepting a normalized Set of route IDs.
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
  activeDetours,
  getDetourHistory,
  hasActiveDetour,
  lastVehicleUpdate,
}) => {
  // Get the route color
  const getRouteColor = useCallback(
    (routeId) => {
      const foundRoute = routes.find((r) => r.id === routeId);
      if (foundRoute?.color) return foundRoute.color;
      return ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT;
    },
    [routes]
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
            shapesToDisplay.push({
              id: shapeId,
              coordinates: shapeSource[shapeId],
              color: getRouteColor(routeId),
              routeId,
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
          shapesToDisplay.push({
            id: shapeId,
            coordinates: shapeSource[shapeId],
            color: getRouteColor(routeId),
            routeId,
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

  // Get detours to display for selected routes
  const displayedDetours = useMemo(() => {
    if (!activeDetours || activeDetours.length === 0) return [];

    if (selectedRouteIds.size > 0) {
      return activeDetours.filter(detour => selectedRouteIds.has(detour.routeId));
    }

    return activeDetours;
  }, [activeDetours, selectedRouteIds]);

  const primaryDisplayedDetour = useMemo(
    () => (displayedDetours.length > 0 ? displayedDetours[0] : null),
    [displayedDetours]
  );

  const detourHistory = useMemo(() => {
    if (!getDetourHistory) return [];
    return getDetourHistory(null, 20);
  }, [getDetourHistory, activeDetours, lastVehicleUpdate]);

  // Check if any selected route has an active detour
  const selectedRoutesHaveDetour = useMemo(() => {
    if (selectedRouteIds.size === 0) return false;
    for (const routeId of selectedRouteIds) {
      if (hasActiveDetour(routeId)) return true;
    }
    return false;
  }, [selectedRouteIds, hasActiveDetour]);

  return {
    getRouteColor,
    displayedVehicles,
    shapeDirectionMap,
    displayedShapes,
    displayedStops,
    displayedDetours,
    primaryDisplayedDetour,
    detourHistory,
    selectedRoutesHaveDetour,
  };
};
