/**
 * useDetourDetection Hook
 *
 * React hook that processes vehicle positions to automatically detect
 * when buses are deviating from their GTFS route shapes.
 *
 * Detection Logic:
 * 1. Track when vehicles go >50m off their route
 * 2. Record breadcrumb GPS positions while off-route
 * 3. When vehicle returns to route, compare path to pending paths
 * 4. If two vehicles take the same off-route path, mark as "Detour Suspected"
 * 5. Clear detour when a vehicle follows the normal route through that area
 */

import { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger';
import { DETOUR_CONFIG } from '../config/constants';
import {
  initializeDetourState,
  processVehicleForDetour,
  checkDetourClearing,
  cleanupExpiredDetours,
  correlateDetoursWithServiceAlerts,
  enrichDetoursWithRouteContext,
  getActiveDetours as getActiveDetoursFromState,
  getDetourHistory as getDetourHistoryFromState,
} from '../services/detourDetectionService';

const DETOUR_STATE_STORAGE_KEY = '@barrie_transit_detour_state_v2';
const STATE_PERSIST_INTERVAL_MS = 10000;
const DETOUR_ALERT_EFFECTS = new Set(['Detour', 'Modified Service', 'No Service', 'Reduced Service']);

const normalizeLoadedState = (rawState) => {
  const initialState = initializeDetourState();
  if (!rawState || typeof rawState !== 'object') return initialState;

  return {
    ...initialState,
    ...rawState,
    vehicleTracking:
      rawState.vehicleTracking && typeof rawState.vehicleTracking === 'object'
        ? rawState.vehicleTracking
        : {},
    pendingPaths:
      rawState.pendingPaths && typeof rawState.pendingPaths === 'object'
        ? rawState.pendingPaths
        : {},
    activeDetours:
      rawState.activeDetours && typeof rawState.activeDetours === 'object'
        ? rawState.activeDetours
        : {},
    detourHistory: Array.isArray(rawState.detourHistory) ? rawState.detourHistory : [],
  };
};

const buildStopLookup = (stops = []) => {
  const lookup = {};
  for (const stop of stops) {
    lookup[stop.id] = stop;
  }
  return lookup;
};

const canonicalizeRouteId = (routeId) => {
  if (!routeId || typeof routeId !== 'string') return null;
  const trimmed = routeId.trim();
  if (!trimmed) return null;
  const digitMatch = trimmed.match(/\d+/);
  if (!digitMatch) return trimmed;
  return String(parseInt(digitMatch[0], 10));
};

const buildOfficialDetoursFromAlerts = (serviceAlerts = [], stops = []) => {
  const now = Date.now();
  const stopLookup = buildStopLookup(stops);
  const officialDetours = [];

  for (const alert of serviceAlerts) {
    if (!DETOUR_ALERT_EFFECTS.has(alert.effect)) continue;
    if (!Array.isArray(alert.affectedRoutes) || alert.affectedRoutes.length === 0) continue;

    const firstPeriod = Array.isArray(alert.activePeriods) && alert.activePeriods.length > 0
      ? alert.activePeriods[0]
      : null;
    const firstDetectedAt = firstPeriod?.start || now;

    const canonicalRouteIds = Array.from(
      new Set(
        alert.affectedRoutes
          .map((routeId) => canonicalizeRouteId(routeId))
          .filter(Boolean)
      )
    );

    for (const routeId of canonicalRouteIds) {
      const affectedStops = (alert.affectedStops || [])
        .map((stopId) => stopLookup[stopId])
        .filter(Boolean)
        .slice(0, 6)
        .map((stop) => ({
          id: stop.id,
          name: stop.name || stop.stopName || `Stop ${stop.id}`,
          code: stop.code || stop.stopCode || stop.id,
          latitude: stop.latitude,
          longitude: stop.longitude,
        }));

      officialDetours.push({
        id: `official_alert_${alert.id}_${routeId}`,
        routeId,
        directionId: null,
        routeKey: `${routeId}_official`,
        polyline: [],
        centroid: null,
        confirmedByVehicles: [],
        firstDetectedAt,
        lastSeenAt: now,
        status: 'suspected',
        evidenceCount: 0,
        confidenceScore: 96,
        confidenceLevel: 'high-confidence',
        officialAlert: {
          matched: true,
          alertId: alert.id,
          title: alert.title,
          effect: alert.effect,
          severity: alert.severity,
          matchedAt: now,
        },
        alertCorrelation: 'official-only',
        segmentLabel: alert.title || 'Official detour',
        affectedStops,
        source: 'official-alert',
      });
    }
  }

  return officialDetours;
};

const mergeAutoAndOfficialDetours = (autoDetours = [], officialDetours = []) => {
  const merged = [...autoDetours];
  const autoByRoute = new Set(autoDetours.map((detour) => detour.routeId));

  // If a route already has auto detection, keep the auto detour as primary source.
  // Otherwise add the official alert as an active detour indicator.
  for (const officialDetour of officialDetours) {
    if (!autoByRoute.has(officialDetour.routeId)) {
      merged.push(officialDetour);
    }
  }

  return merged.sort((a, b) => {
    if ((b.confidenceScore || 0) !== (a.confidenceScore || 0)) {
      return (b.confidenceScore || 0) - (a.confidenceScore || 0);
    }
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });
};

/**
 * Hook for detecting route detours from real-time vehicle data
 *
 * @param {Array} vehicles - Array of formatted vehicle objects from TransitContext
 * @param {Object} shapes - Map of shapeId to coordinate arrays
 * @param {Object} tripMapping - Map of tripId to trip info
 * @param {Object} routeShapeMapping - Map of routeId to array of shapeIds
 * @param {Array} stops - Array of stops (for affected stop enrichment)
 * @param {Object} routeStopsMapping - Map of routeId to array of stopIds
 * @param {Array} serviceAlerts - Array of GTFS service alerts
 * @returns {Object} Detour detection state and helper functions
 */
export const useDetourDetection = (
  vehicles,
  shapes,
  tripMapping,
  routeShapeMapping,
  stops = [],
  routeStopsMapping = {},
  serviceAlerts = []
) => {
  // Persistent state ref that survives re-renders
  const stateRef = useRef(null);
  const isHydratedRef = useRef(false);
  const lastPersistTimeRef = useRef(0);
  const dismissedDetourIdsRef = useRef(new Set());
  const [stateVersion, setStateVersion] = useState(0);

  // Initialize state on first use
  if (!stateRef.current) {
    stateRef.current = initializeDetourState();
  }

  const persistState = useCallback(
    async (force = false) => {
      if (!stateRef.current || !isHydratedRef.current) return;
      const now = Date.now();
      if (!force && now - lastPersistTimeRef.current < STATE_PERSIST_INTERVAL_MS) return;

      try {
        const serializableState = {
          vehicleTracking: stateRef.current.vehicleTracking,
          pendingPaths: stateRef.current.pendingPaths,
          activeDetours: stateRef.current.activeDetours,
          detourHistory: stateRef.current.detourHistory,
          detourIdCounter: stateRef.current.detourIdCounter,
        };
        await AsyncStorage.setItem(DETOUR_STATE_STORAGE_KEY, JSON.stringify(serializableState));
        lastPersistTimeRef.current = now;
      } catch (error) {
        logger.warn('Failed to persist detour detection state:', error);
      }
    },
    []
  );

  // Hydrate persisted state on mount
  useEffect(() => {
    let mounted = true;

    const hydrateState = async () => {
      try {
        const raw = await AsyncStorage.getItem(DETOUR_STATE_STORAGE_KEY);
        if (!mounted) return;

        if (raw) {
          const parsed = JSON.parse(raw);
          stateRef.current = normalizeLoadedState(parsed);

          // Confidence-based detour expiry on hydration:
          // - suspected: expire after SUSPECTED_DETOUR_EXPIRY_MS (1 hour)
          // - likely / high-confidence: persist (unless past 24-hour max)
          const hydrateNow = Date.now();
          const suspectedExpiryMs = DETOUR_CONFIG.SUSPECTED_DETOUR_EXPIRY_MS || DETOUR_CONFIG.DETOUR_EXPIRY_MS || 3600000;
          const maxRetentionMs = DETOUR_CONFIG.MAX_DETOUR_RETENTION_MS || 86400000;
          for (const detourId of Object.keys(stateRef.current.activeDetours)) {
            const detour = stateRef.current.activeDetours[detourId];
            const age = hydrateNow - (detour.firstDetectedAt || detour.lastSeenAt);
            const level = detour.confidenceLevel || 'suspected';

            // Absolute cap: expire any detour older than 24 hours
            if (age > maxRetentionMs) {
              delete stateRef.current.activeDetours[detourId];
              continue;
            }
            // Only time-expire suspected (low-confidence) detours
            if (level === 'suspected' && hydrateNow - detour.lastSeenAt > suspectedExpiryMs) {
              delete stateRef.current.activeDetours[detourId];
            }
          }
          // Clear stale pending paths — breadcrumbs shouldn't carry over across sessions
          stateRef.current.pendingPaths = {};

          cleanupExpiredDetours(stateRef.current);
        }
      } catch (error) {
        logger.warn('Failed to hydrate detour detection state:', error);
        stateRef.current = initializeDetourState();
      } finally {
        if (mounted) {
          isHydratedRef.current = true;
          setStateVersion((version) => version + 1);
        }
      }
    };

    hydrateState();
    return () => {
      mounted = false;
      if (isHydratedRef.current) {
        persistState(true);
      }
    };
  }, [persistState]);

  // Process all vehicles on each update
  useEffect(() => {
    if (!stateRef.current || !isHydratedRef.current) return;
    if (!vehicles || vehicles.length === 0) return;

    const state = stateRef.current;
    const canProcessVehicles =
      shapes &&
      Object.keys(shapes).length > 0 &&
      routeShapeMapping &&
      Object.keys(routeShapeMapping).length > 0;

    if (canProcessVehicles) {
      for (const vehicle of vehicles) {
        try {
          processVehicleForDetour(vehicle, shapes, tripMapping, routeShapeMapping, state);
          checkDetourClearing(vehicle, shapes, routeShapeMapping, state);
        } catch (error) {
          logger.warn('Failed to process vehicle for detour detection:', vehicle?.id, error);
        }
      }

      // Log every vehicle that is currently off-route after processing
      const offRouteVehicles = Object.values(state.vehicleTracking).filter((v) => v.isCurrentlyOffRoute);
      if (offRouteVehicles.length > 0) {
        const details = offRouteVehicles.map((v) => {
          const crumbs = v.offRouteBreadcrumbs?.length || 0;
          const lastCrumb = v.offRouteBreadcrumbs?.[v.offRouteBreadcrumbs.length - 1];
          const dist = lastCrumb?.offRouteDistanceMeters ? Math.round(lastCrumb.offRouteDistanceMeters) : '?';
          return `${v.vehicleId}(rt${v.routeId} dir${v.directionId ?? '?'} ${dist}m ${crumbs}crumbs)`;
        }).join(', ');
        logger.info('[detour-client] OFF-ROUTE vehicles: ' + details);
      }
    } else {
      logger.info(
        '[detour-client] skipping: shapes=%d routeShapeMappings=%d vehicles=%d',
        shapes ? Object.keys(shapes).length : 0,
        routeShapeMapping ? Object.keys(routeShapeMapping).length : 0,
        vehicles?.length || 0
      );
    }

    // Correlate with official service alerts (if provided)
    correlateDetoursWithServiceAlerts(state, serviceAlerts);

    // Periodically clean up expired data
    cleanupExpiredDetours(state);
    persistState();
    setStateVersion((version) => version + 1);
  }, [vehicles, shapes, tripMapping, routeShapeMapping, serviceAlerts, persistState]);

  // Cleanup interval for stale data + periodic diagnostic logging
  useEffect(() => {
    const interval = setInterval(() => {
      if (stateRef.current && isHydratedRef.current) {
        correlateDetoursWithServiceAlerts(stateRef.current, serviceAlerts);
        cleanupExpiredDetours(stateRef.current);
        persistState();
        setStateVersion((version) => version + 1);

        // Detailed diagnostic summary every 60s
        const s = stateRef.current;
        const trackingCount = Object.keys(s.vehicleTracking).length;
        const offRouteVehicles = Object.values(s.vehicleTracking).filter((v) => v.isCurrentlyOffRoute);
        const pendingByRoute = {};
        Object.entries(s.pendingPaths).forEach(([key, paths]) => {
          if (paths?.length) pendingByRoute[key] = paths.length;
        });
        const activeByRoute = {};
        Object.entries(s.activeDetours).forEach(([key, det]) => {
          activeByRoute[key] = `${det.status}/${det.confidenceLevel || '?'}(${det.confirmedByVehicles?.length || 0}veh)`;
        });

        logger.info(
          '[detour-client] 60s diagnostic: tracking=%d offRoute=%d pending=%s active=%s',
          trackingCount,
          offRouteVehicles.length,
          Object.keys(pendingByRoute).length > 0
            ? JSON.stringify(pendingByRoute)
            : 'none',
          Object.keys(activeByRoute).length > 0
            ? JSON.stringify(activeByRoute)
            : 'none'
        );
        if (offRouteVehicles.length > 0) {
          const details = offRouteVehicles.map((v) => {
            const crumbs = v.offRouteBreadcrumbs?.length || 0;
            return `${v.vehicleId}(rt${v.routeId} ${crumbs}crumbs)`;
          }).join(', ');
          logger.info('[detour-client] 60s off-route: ' + details);
        }
      }
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, [serviceAlerts, persistState]);

  /**
   * Dismiss a detour for this session only (not persisted across restarts)
   */
  const dismissDetour = useCallback((detourId) => {
    dismissedDetourIdsRef.current.add(detourId);
    setStateVersion((v) => v + 1);
  }, []);

  /**
   * Get all currently active (suspected) detours, excluding dismissed ones
   */
  const activeDetours = useMemo(() => {
    if (!stateRef.current) return [];
    const autoDetours = enrichDetoursWithRouteContext(
      getActiveDetoursFromState(stateRef.current),
      stops,
      routeStopsMapping
    );
    const officialDetours = buildOfficialDetoursFromAlerts(serviceAlerts, stops);
    const merged = mergeAutoAndOfficialDetours(autoDetours, officialDetours);
    return merged.filter((d) => !dismissedDetourIdsRef.current.has(d.id));
  }, [stateVersion, stops, routeStopsMapping, serviceAlerts]);

  /**
   * Get active detours for a specific route
   * @param {string} routeId - Route ID to check
   * @param {string|null} directionId - Optional direction ID
   * @returns {Array} Array of detour objects for the route
   */
  const getDetoursForRoute = useCallback((routeId, directionId = null) => {
    return activeDetours.filter((detour) => {
      if (detour.routeId !== routeId) return false;
      if (directionId !== null && detour.directionId !== null && detour.directionId !== directionId) {
        return false;
      }
      return detour.status === 'suspected';
    });
  }, [activeDetours]);

  /**
   * Get archived detour history for diagnostics
   * @param {string|null} routeId - Optional route filter
   * @param {number|null} limit - Optional limit override
   * @returns {Array} Archived detour records
   */
  const getDetourHistory = useCallback((routeId = null, limit = null) => {
    if (!stateRef.current) return [];
    return getDetourHistoryFromState(stateRef.current, routeId, limit);
  }, []);

  /**
   * Check if a route has any active detours
   * @param {string} routeId - Route ID to check
   * @param {string|null} directionId - Optional direction ID
   * @returns {boolean} True if route has active detours
   */
  const hasActiveDetour = useCallback((routeId, directionId = null) => {
    return activeDetours.some((detour) => {
      if (detour.routeId !== routeId) return false;
      if (directionId !== null && detour.directionId !== null && detour.directionId !== directionId) {
        return false;
      }
      return detour.status === 'suspected';
    });
  }, [activeDetours]);

  /**
   * Get the detour detection state for debugging purposes
   */
  const getDebugState = useCallback(() => {
    if (!stateRef.current) return null;
    return {
      vehicleTrackingCount: Object.keys(stateRef.current.vehicleTracking).length,
      pendingPathsCount: Object.keys(stateRef.current.pendingPaths).reduce(
        (sum, key) => sum + stateRef.current.pendingPaths[key].length,
        0
      ),
      activeDetoursCount: Object.keys(stateRef.current.activeDetours).length,
      detourHistoryCount: Array.isArray(stateRef.current.detourHistory)
        ? stateRef.current.detourHistory.length
        : 0,
      activeDetours,
    };
  }, [activeDetours]);

  return {
    activeDetours,
    getDetoursForRoute,
    getDetourHistory,
    hasActiveDetour,
    dismissDetour,
    getDebugState,
  };
};

export default useDetourDetection;
