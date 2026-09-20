/**
 * useRouteSelection Hook
 *
 * Manages route selection state without changing the rider's viewport.
 */
import { useState, useCallback } from 'react';

export const useRouteSelection = ({
  multiSelect = false,
}) => {
  const [selectedRoutes, setSelectedRoutes] = useState(new Set());

  // Convenience accessor for single-select consumers (web)
  const selectedRoute = selectedRoutes.size > 0 ? [...selectedRoutes][0] : null;
  const hasSelection = selectedRoutes.size > 0;

  // Toggle route selection (no auto-zoom — user controls the camera)
  const handleRouteSelect = useCallback((routeId) => {
    if (routeId === null) {
      setSelectedRoutes(new Set());
    } else if (multiSelect) {
      setSelectedRoutes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(routeId)) {
          newSet.delete(routeId);
        } else {
          newSet.add(routeId);
        }
        return newSet;
      });
    } else {
      // Single-select toggle
      setSelectedRoutes(prev => {
        if (prev.has(routeId)) {
          return new Set();
        }
        return new Set([routeId]);
      });
    }
  }, [multiSelect]);

  // Programmatically set selection (e.g., from navigation params)
  const selectRoute = useCallback((routeId) => {
    if (routeId) {
      setSelectedRoutes(new Set([routeId]));
    } else {
      setSelectedRoutes(new Set());
    }
  }, []);

  const selectRoutes = useCallback((routeIds = []) => {
    const ids = Array.isArray(routeIds)
      ? routeIds.filter(Boolean)
      : [...routeIds || []].filter(Boolean);
    setSelectedRoutes(new Set(ids));
  }, []);

  // Check if a specific route is selected
  const isRouteSelected = useCallback(
    (routeId) => selectedRoutes.has(routeId),
    [selectedRoutes]
  );

  return {
    selectedRoutes,
    selectedRoute,
    hasSelection,
    handleRouteSelect,
    selectRoute,
    selectRoutes,
    isRouteSelected,
  };
};
