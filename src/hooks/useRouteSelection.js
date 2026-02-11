/**
 * useRouteSelection Hook
 *
 * Manages route selection state, map zoom/center actions, and
 * auto-zoom behavior for both single-select (web) and multi-select (native) modes.
 */
import { useState, useCallback, useEffect } from 'react';
import { MAP_CONFIG } from '../config/constants';

export const useRouteSelection = ({
  routeShapeMapping,
  shapes,
  mapRef,
  multiSelect = false,
}) => {
  const [selectedRoutes, setSelectedRoutes] = useState(new Set());

  // Convenience accessor for single-select consumers (web)
  const selectedRoute = selectedRoutes.size > 0 ? [...selectedRoutes][0] : null;
  const hasSelection = selectedRoutes.size > 0;

  // Center map on Barrie default region
  const centerOnBarrie = useCallback(() => {
    mapRef.current?.animateToRegion(MAP_CONFIG.INITIAL_REGION, 500);
  }, []);

  // Zoom to fit all given route IDs on the map
  const zoomToRoutes = useCallback((routeIds) => {
    const ids = routeIds instanceof Set ? routeIds : new Set([routeIds]);
    if (ids.size === 0) return;

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    let hasCoords = false;

    ids.forEach(routeId => {
      const shapeIds = routeShapeMapping[routeId] || [];
      shapeIds.forEach(shapeId => {
        const coords = shapes[shapeId] || [];
        coords.forEach(coord => {
          minLat = Math.min(minLat, coord.latitude);
          maxLat = Math.max(maxLat, coord.latitude);
          minLng = Math.min(minLng, coord.longitude);
          maxLng = Math.max(maxLng, coord.longitude);
          hasCoords = true;
        });
      });
    });

    if (hasCoords && minLat < maxLat && minLng < maxLng) {
      const padding = 0.005;
      mapRef.current?.animateToRegion({
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: (maxLat - minLat) + padding,
        longitudeDelta: (maxLng - minLng) + padding,
      }, 500);
    }
  }, [routeShapeMapping, shapes]);

  // Toggle route selection
  const handleRouteSelect = useCallback((routeId) => {
    if (routeId === null) {
      setSelectedRoutes(new Set());
      centerOnBarrie();
    } else if (multiSelect) {
      setSelectedRoutes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(routeId)) {
          newSet.delete(routeId);
          if (newSet.size === 0) centerOnBarrie();
        } else {
          newSet.add(routeId);
        }
        return newSet;
      });
    } else {
      // Single-select toggle
      setSelectedRoutes(prev => {
        if (prev.has(routeId)) {
          centerOnBarrie();
          return new Set();
        }
        return new Set([routeId]);
      });
    }
  }, [multiSelect, centerOnBarrie]);

  // Programmatically set selection (e.g., from navigation params)
  const selectRoute = useCallback((routeId) => {
    if (routeId) {
      setSelectedRoutes(new Set([routeId]));
    } else {
      setSelectedRoutes(new Set());
    }
  }, []);

  // Check if a specific route is selected
  const isRouteSelected = useCallback(
    (routeId) => selectedRoutes.has(routeId),
    [selectedRoutes]
  );

  // Auto-zoom to selected routes when selection changes
  useEffect(() => {
    if (selectedRoutes.size > 0) {
      zoomToRoutes(selectedRoutes);
    }
  }, [selectedRoutes]);

  return {
    selectedRoutes,
    selectedRoute,
    hasSelection,
    handleRouteSelect,
    centerOnBarrie,
    zoomToRoutes,
    selectRoute,
    isRouteSelected,
  };
};
