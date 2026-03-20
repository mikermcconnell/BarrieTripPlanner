import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchAllStaticData } from '../services/gtfsService';
import { fetchVehiclePositions, formatVehiclesForMap } from '../services/realtimeService';
import { buildRoutingData } from '../services/routingDataService';
import { fetchServiceAlerts } from '../services/alertService';
import { REFRESH_INTERVALS, SHAPE_PROCESSING } from '../config/constants';
import { processShapeForRendering } from '../utils/geometryUtils';
import {
  isOnline,
  getCachedGTFSData,
  cacheGTFSData,
  addNetworkListener,
} from '../utils/offlineCache';
import { subscribeToActiveDetours } from '../services/firebase/detourService';
import { subscribeToTransitNews } from '../services/firebase/newsService';
import { subscribeToOnDemandZones } from '../services/firebase/zoneService';
import { fetchProxyHealth, PROXY_HEALTH_CHECK_INTERVAL_MS } from '../services/backendHealthService';
import logger from '../utils/logger';
import { DIAGNOSTIC_STATUS, buildTransitDiagnostics } from '../utils/transitDiagnostics';
import { getNotificationSettings, showLocalNotification } from '../services/notificationService';
import { LOCATIONIQ_CONFIG } from '../config/constants';
import runtimeConfig from '../config/runtimeConfig';
import { getDetoursEnabled, saveDetoursEnabled } from '../services/detourSettingsService';
import { diffDetourRouteIds } from '../utils/detourNotificationUtils';

const TransitContext = createContext(null);
const TransitStaticContext = createContext(null);
const TransitRealtimeContext = createContext(null);
export const useTransit = () => {
  const context = useContext(TransitContext);
  if (!context) {
    throw new Error('useTransit must be used within a TransitProvider');
  }
  return context;
};

export const useTransitStatic = () => {
  const context = useContext(TransitStaticContext);
  if (!context) {
    throw new Error('useTransitStatic must be used within a TransitProvider');
  }
  return context;
};

export const useTransitRealtime = () => {
  const context = useContext(TransitRealtimeContext);
  if (!context) {
    throw new Error('useTransitRealtime must be used within a TransitProvider');
  }
  return context;
};

export const TransitProvider = ({ children }) => {
  // Static GTFS data
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [shapes, setShapes] = useState({});
  const [trips, setTrips] = useState([]);
  const [tripMapping, setTripMapping] = useState({});
  const [routeShapeMapping, setRouteShapeMapping] = useState({});
  const [routeStopsMapping, setRouteStopsMapping] = useState({});
  const [routeStopSequencesMapping, setRouteStopSequencesMapping] = useState({});

  // Processed shapes for rendering (smoothed + simplified)
  const [processedShapes, setProcessedShapes] = useState({});
  const [shapeOverlapOffsets, setShapeOverlapOffsets] = useState({});

  // Routing data structures (for RAPTOR algorithm)
  const [routingData, setRoutingData] = useState(null);
  const [isRoutingReady, setIsRoutingReady] = useState(false);

  // Real-time data
  const [vehicles, setVehicles] = useState([]);
  const [lastVehicleUpdate, setLastVehicleUpdate] = useState(null);

  // Loading and error states
  const [isLoadingStatic, setIsLoadingStatic] = useState(true);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [staticError, setStaticError] = useState(null);
  const [vehicleError, setVehicleError] = useState(null);
  const [serviceAlerts, setServiceAlerts] = useState([]);
  const [lastStaticRefreshAt, setLastStaticRefreshAt] = useState(null);
  const [lastStaticFailureAt, setLastStaticFailureAt] = useState(null);
  const [isRefreshingStatic, setIsRefreshingStatic] = useState(false);
  const [lastVehicleFailureAt, setLastVehicleFailureAt] = useState(null);
  const [lastRoutingBuildAt, setLastRoutingBuildAt] = useState(null);
  const [lastRoutingFailureAt, setLastRoutingFailureAt] = useState(null);
  const [routingError, setRoutingError] = useState(null);
  const [isBuildingRouting, setIsBuildingRouting] = useState(false);
  const [proxyHealth, setProxyHealth] = useState(null);
  const [isCheckingProxyHealth, setIsCheckingProxyHealth] = useState(false);
  const [proxyHealthError, setProxyHealthError] = useState(null);
  const [lastProxyHealthCheckAt, setLastProxyHealthCheckAt] = useState(null);
  const [lastProxyHealthFailureAt, setLastProxyHealthFailureAt] = useState(null);

  // Detour detection (server-side, via Firestore)
  const [detourFeed, setDetourFeed] = useState({});
  const [detoursEnabled, setDetoursEnabledState] = useState(runtimeConfig.detours.enabledByDefault);
  const prevDetourIdsRef = useRef(new Set());
  const detoursEnabledRef = useRef(detoursEnabled);
  const hasSeenInitialDetourSnapshotRef = useRef(false);

  // Transit news (server-side, via Firestore)
  const [transitNews, setTransitNews] = useState([]);

  // On-demand zones (server-side, via Firestore)
  const [onDemandZones, setOnDemandZones] = useState({});

  // Offline state
  const [isOffline, setIsOffline] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);

  // Refs for intervals
  const vehicleIntervalRef = useRef(null);
  const vehicleRequestPromiseRef = useRef(null);
  const prevVehiclesRef = useRef([]);
  const serviceAlertIntervalRef = useRef(null);
  const proxyHealthIntervalRef = useRef(null);
  const shapeProcessingJobRef = useRef(0);

  // Refs for deferred routing and cache-first strategy
  const gtfsDataRef = useRef(null);
  const routingDataRef = useRef(null);
  const routingBuildPromiseRef = useRef(null);

  useEffect(() => {
    detoursEnabledRef.current = detoursEnabled;
  }, [detoursEnabled]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const storedEnabled = await getDetoursEnabled();
      if (isMounted) {
        setDetoursEnabledState(storedEnabled);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Process raw shapes through the rendering pipeline without blocking the UI thread.
   */
  const processAndStoreShapes = useCallback((rawShapes) => {
    const options = {
      dpTolerance: SHAPE_PROCESSING.DP_TOLERANCE_METERS,
      splineTension: SHAPE_PROCESSING.SPLINE_TENSION,
      splineSegments: SHAPE_PROCESSING.SPLINE_SEGMENTS_PER_PAIR,
    };

    const shapeIds = Object.keys(rawShapes || {});
    const jobId = ++shapeProcessingJobRef.current;

    if (shapeIds.length === 0) {
      setProcessedShapes({});
      setShapeOverlapOffsets({});
      return;
    }

    // Overlap offsets are currently unused by rendering; skip expensive graph scan.
    setShapeOverlapOffsets({});

    // Process shapes in small batches to keep the JS thread responsive on Android.
    void (async () => {
      try {
        const processed = {};
        const batchSize = 10;

        for (let i = 0; i < shapeIds.length; i += 1) {
          if (shapeProcessingJobRef.current !== jobId) {
            return;
          }

          const shapeId = shapeIds[i];
          processed[shapeId] = processShapeForRendering(rawShapes[shapeId], options);

          if ((i + 1) % batchSize === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }

        if (shapeProcessingJobRef.current === jobId) {
          setProcessedShapes(processed);
        }
      } catch (error) {
        logger.error('Failed to process map shapes:', error);
      }
    })();
  }, []);

  /**
   * Apply parsed GTFS data to state (shared by cache-first and network paths)
   */
  const applyStaticData = useCallback((data) => {
    setRoutes(data.routes || []);
    setStops(data.stops || []);
    setShapes(data.shapes || {});
    setTrips(data.trips || []);
    setTripMapping(data.tripMapping || {});
    setRouteShapeMapping(data.routeShapeMapping || {});
    setRouteStopsMapping(data.routeStopsMapping || {});
    setRouteStopSequencesMapping(data.routeStopSequencesMapping || {});
  }, []);

  /**
   * Load static GTFS data with cache-first strategy.
   *
   * Priority order:
   * 1. Load from cache instantly (map renders immediately)
   * 2. Background-refresh from network if online
   * 3. First launch (no cache): download from network
   *
   * Routing data is NOT built here — it's deferred to ensureRoutingData()
   * and only constructed when the user first requests a trip plan.
   */
  const loadStaticData = useCallback(async () => {
    setIsLoadingStatic(true);
    setIsRefreshingStatic(false);
    setStaticError(null);
    setUsingCachedData(false);

    const online = await isOnline();
    setIsOffline(!online);

    // Phase 1: Try cache first for instant map display
    const cachedData = await getCachedGTFSData();
    if (cachedData) {
      applyStaticData(cachedData);
      setUsingCachedData(true);
      processAndStoreShapes(cachedData.shapes || {});
      setIsLoadingStatic(false); // Map can render now

      // Phase 2: Background refresh if online
      if (online) {
        setIsRefreshingStatic(true);
        try {
          const data = await fetchAllStaticData();
          gtfsDataRef.current = data;
          applyStaticData(data);
          setUsingCachedData(false);
          setLastStaticRefreshAt(Date.now());
          processAndStoreShapes(data.shapes);
          // Invalidate stale routing so next trip plan rebuilds
          routingDataRef.current = null;
          setRoutingData(null);
          setIsRoutingReady(false);
          setLastRoutingBuildAt(null);
          setRoutingError(null);
          await cacheGTFSData(data);
        } catch (error) {
          // Silent fail — cached data is already displayed
          setLastStaticFailureAt(Date.now());
          logger.warn('Background GTFS refresh failed:', error);
        } finally {
          setIsRefreshingStatic(false);
        }
      }
      return;
    }

    // No cache available
    if (!online) {
      setStaticError('No internet connection and no cached data available');
      setLastStaticFailureAt(Date.now());
      setIsLoadingStatic(false);
      return;
    }

    // First launch: must download
    try {
      const data = await fetchAllStaticData();
      gtfsDataRef.current = data;
      applyStaticData(data);
      setLastStaticRefreshAt(Date.now());
      processAndStoreShapes(data.shapes);
      await cacheGTFSData(data);
    } catch (error) {
      logger.error('Failed to load static data:', error);
      setLastStaticFailureAt(Date.now());
      setStaticError(error.message || 'Failed to load transit data');
    } finally {
      setIsLoadingStatic(false);
    }
  }, [applyStaticData, processAndStoreShapes]);

  /**
   * Lazily build routing data on first trip plan request.
   * Returns the RAPTOR routing structures, fetching fresh GTFS if needed
   * (cache doesn't include stopTimes which are required for routing).
   */
  const ensureRoutingData = useCallback(async () => {
    // Already built
    if (routingDataRef.current) return routingDataRef.current;

    // If a build is already in progress, share the same promise
    if (routingBuildPromiseRef.current) {
      return routingBuildPromiseRef.current;
    }

    const buildPromise = (async () => {
      setIsBuildingRouting(true);
      setRoutingError(null);

      try {
        let data = gtfsDataRef.current;

        // Cache doesn't include stopTimes — fetch fresh if needed
        if (!data?.stopTimes) {
          data = await fetchAllStaticData();
          gtfsDataRef.current = data;
          applyStaticData(data);
          processAndStoreShapes(data.shapes);
          await cacheGTFSData(data);
        }

        const routing = buildRoutingData(data);
        routing.routes = data.routes;
        routing.shapes = data.shapes || {};
        routingDataRef.current = routing;
        setRoutingData(routing);
        setIsRoutingReady(true);
        setLastRoutingBuildAt(Date.now());
        return routing;
      } catch (error) {
        logger.error('Failed to build routing data:', error);
        setRoutingError(error);
        setLastRoutingFailureAt(Date.now());
        return null;
      } finally {
        routingBuildPromiseRef.current = null;
        setIsBuildingRouting(false);
      }
    })();

    routingBuildPromiseRef.current = buildPromise;
    return buildPromise;
  }, [applyStaticData, processAndStoreShapes]);

  /**
   * Diff new vehicles against previous snapshot to preserve object references
   * for unchanged vehicles, allowing React.memo in BusMarker to skip re-renders.
   */
  const diffVehicles = useCallback((newVehicles, prevVehicles) => {
    if (prevVehicles.length === 0) return newVehicles;

    const prevMap = new Map(prevVehicles.map(v => [v.id, v]));
    let hasChanges = false;

    const merged = newVehicles.map(v => {
      const prev = prevMap.get(v.id);
      if (prev &&
          prev.coordinate?.latitude === v.coordinate?.latitude &&
          prev.coordinate?.longitude === v.coordinate?.longitude &&
          prev.bearing === v.bearing &&
          prev.routeId === v.routeId) {
        return prev; // Same reference — React.memo skips re-render
      }
      hasChanges = true;
      return v;
    });

    if (!hasChanges && merged.length === prevVehicles.length) {
      return prevVehicles; // Identical — skip setState entirely
    }

    return merged;
  }, []);

  /**
   * Load vehicle positions
   */
  const loadVehiclePositions = useCallback(async () => {
    if (vehicleRequestPromiseRef.current) {
      return vehicleRequestPromiseRef.current;
    }

    const requestPromise = (async () => {
      setIsLoadingVehicles(true);
      setVehicleError((prev) => (prev == null ? prev : null));

      try {
        const rawVehicles = await fetchVehiclePositions();
        const formattedVehicles = formatVehiclesForMap(rawVehicles, tripMapping);
        const diffed = diffVehicles(formattedVehicles, prevVehiclesRef.current);
        if (diffed !== prevVehiclesRef.current) {
          prevVehiclesRef.current = diffed;
          setVehicles(diffed);
        }
        setLastVehicleUpdate(new Date());
      } catch (error) {
        logger.error('Failed to load vehicle positions:', error);
        setLastVehicleFailureAt(Date.now());
        setVehicleError(error.message || 'Failed to load vehicle positions');
      } finally {
        setIsLoadingVehicles(false);
        vehicleRequestPromiseRef.current = null;
      }
    })();

    vehicleRequestPromiseRef.current = requestPromise;
    return requestPromise;
  }, [tripMapping, diffVehicles]);

  /**
   * Start automatic vehicle position updates
   */
  const startVehicleUpdates = useCallback(() => {
    if (vehicleIntervalRef.current) {
      clearInterval(vehicleIntervalRef.current);
    }

    void loadVehiclePositions();

    vehicleIntervalRef.current = setInterval(
      loadVehiclePositions,
      REFRESH_INTERVALS.VEHICLE_POSITIONS
    );
  }, [loadVehiclePositions]);

  /**
   * Stop automatic vehicle position updates
   */
  const stopVehicleUpdates = useCallback(() => {
    if (vehicleIntervalRef.current) {
      clearInterval(vehicleIntervalRef.current);
      vehicleIntervalRef.current = null;
    }
  }, []);

  /**
   * Load active service alerts
   */
  const loadServiceAlerts = useCallback(async () => {
    if (isOffline) {
      setServiceAlerts([]);
      return;
    }

    try {
      const alerts = await fetchServiceAlerts();
      setServiceAlerts(alerts);
    } catch (error) {
      logger.error('Failed to load service alerts:', error);
    }
  }, [isOffline]);

  /**
   * Start automatic service alert updates
   */
  const startServiceAlertUpdates = useCallback(() => {
    if (serviceAlertIntervalRef.current) {
      clearInterval(serviceAlertIntervalRef.current);
    }

    loadServiceAlerts();
    serviceAlertIntervalRef.current = setInterval(loadServiceAlerts, REFRESH_INTERVALS.SERVICE_ALERTS);
  }, [loadServiceAlerts]);

  /**
   * Stop automatic service alert updates
   */
  const stopServiceAlertUpdates = useCallback(() => {
    if (serviceAlertIntervalRef.current) {
      clearInterval(serviceAlertIntervalRef.current);
      serviceAlertIntervalRef.current = null;
    }
  }, []);

  const loadProxyHealth = useCallback(async () => {
    if (!LOCATIONIQ_CONFIG.PROXY_URL) {
      setProxyHealth(null);
      setProxyHealthError('API proxy URL is not configured');
      setLastProxyHealthFailureAt(Date.now());
      return;
    }

    setIsCheckingProxyHealth(true);
    try {
      const nextHealth = await fetchProxyHealth();
      setProxyHealth(nextHealth);
      setProxyHealthError(null);
      setLastProxyHealthCheckAt(nextHealth.checkedAt || Date.now());
    } catch (error) {
      logger.warn('API proxy health check failed:', error);
      setProxyHealth(null);
      setProxyHealthError(error.message || 'API proxy health check failed');
      setLastProxyHealthFailureAt(Date.now());
    } finally {
      setIsCheckingProxyHealth(false);
    }
  }, []);

  const startProxyHealthChecks = useCallback(() => {
    if (proxyHealthIntervalRef.current) {
      clearInterval(proxyHealthIntervalRef.current);
    }

    void loadProxyHealth();

    if (LOCATIONIQ_CONFIG.PROXY_URL) {
      proxyHealthIntervalRef.current = setInterval(
        loadProxyHealth,
        PROXY_HEALTH_CHECK_INTERVAL_MS
      );
    }
  }, [loadProxyHealth]);

  const stopProxyHealthChecks = useCallback(() => {
    if (proxyHealthIntervalRef.current) {
      clearInterval(proxyHealthIntervalRef.current);
      proxyHealthIntervalRef.current = null;
    }
  }, []);

  const getRouteById = useCallback(
    (routeId) => routes.find((route) => route.id === routeId),
    [routes]
  );

  const getStopById = useCallback(
    (stopId) => stops.find((stop) => stop.id === stopId),
    [stops]
  );

  const getShapesForRoute = useCallback(
    (routeId) => {
      const shapeIds = routeShapeMapping[routeId] || [];
      return shapeIds.map((shapeId) => ({
        id: shapeId,
        coordinates: shapes[shapeId] || [],
      }));
    },
    [routeShapeMapping, shapes]
  );

  const getVehiclesForRoute = useCallback(
    (routeId) => vehicles.filter((vehicle) => vehicle.routeId === routeId),
    [vehicles]
  );

  const setDetoursEnabled = useCallback(async (enabled) => {
    const previousEnabled = detoursEnabledRef.current;
    detoursEnabledRef.current = enabled;
    setDetoursEnabledState(enabled);
    const result = await saveDetoursEnabled(enabled);

    if (!result.success) {
      detoursEnabledRef.current = previousEnabled;
      setDetoursEnabledState(previousEnabled);
    }

    return result;
  }, []);

  const activeDetours = useMemo(
    () => (detoursEnabled ? detourFeed : {}),
    [detoursEnabled, detourFeed]
  );

  const isRouteDetouring = useCallback(
    (routeId) => Boolean(activeDetours[routeId]),
    [activeDetours]
  );

  const getRouteDetour = useCallback(
    (routeId) => activeDetours[routeId] ?? null,
    [activeDetours]
  );

  const notifyNewDetours = useCallback(async (routeIds) => {
    if (!detoursEnabledRef.current || !Array.isArray(routeIds) || routeIds.length === 0) {
      return;
    }

    const notificationSettings = await getNotificationSettings();
    if (!notificationSettings?.serviceAlerts) {
      return;
    }

    await Promise.all(
      routeIds.map((routeId) =>
        showLocalNotification({
          title: 'Route ' + routeId + ' Detour',
          body: 'Route ' + routeId + ' is on detour \u2014 stops may be affected.',
          data: { type: 'detour_alert', routeId },
        }).catch(() => {})
      )
    );
  }, []);

  // Subscribe to active detours (public collection, no auth required)
  useEffect(() => {
    const unsubscribe = subscribeToActiveDetours(
      (detourMap) => {
        const { nextIds, newRouteIds } = diffDetourRouteIds({
          detourMap,
          prevIds: prevDetourIdsRef.current,
          hasSeenInitialSnapshot: hasSeenInitialDetourSnapshotRef.current,
        });

        hasSeenInitialDetourSnapshotRef.current = true;
        prevDetourIdsRef.current = new Set(nextIds);
        setDetourFeed(detourMap);

        if (newRouteIds.length > 0) {
          void notifyNewDetours(newRouteIds);
        }
      },
      (error) => logger.error('Detour subscription error:', error)
    );
    return () => unsubscribe();
  }, [notifyNewDetours]);

  // Subscribe to transit news (public collection, no auth required)
  useEffect(() => {
    const unsubscribe = subscribeToTransitNews(
      (news) => setTransitNews(news),
      (error) => logger.error('News subscription error:', error)
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to on-demand zones (public collection, no auth required)
  useEffect(() => {
    const unsubscribe = subscribeToOnDemandZones(
      (zoneMap) => setOnDemandZones(zoneMap),
      (error) => logger.error('Zone subscription error:', error)
    );
    return () => unsubscribe();
  }, []);

  // Load static data on mount
  useEffect(() => {
    loadStaticData();
  }, [loadStaticData]);

  // Start vehicle updates when static data is loaded
  useEffect(() => {
    if (!isLoadingStatic && routes.length > 0 && !isOffline) {
      startVehicleUpdates();
      startServiceAlertUpdates();
    }

    return () => {
      stopVehicleUpdates();
      stopServiceAlertUpdates();
    };
  }, [
    isLoadingStatic,
    routes.length,
    isOffline,
    startVehicleUpdates,
    stopVehicleUpdates,
    startServiceAlertUpdates,
    stopServiceAlertUpdates,
  ]);

  useEffect(() => {
    if (isOffline) {
      stopProxyHealthChecks();
      return;
    }

    startProxyHealthChecks();

    return () => {
      stopProxyHealthChecks();
    };
  }, [isOffline, startProxyHealthChecks, stopProxyHealthChecks]);

  // Listen for network changes
  useEffect(() => {
    const unsubscribe = addNetworkListener((state) => {
      const wasOffline = isOffline;
      const nowOffline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(nowOffline);

      if (nowOffline) {
        setServiceAlerts([]);
      }

      if (wasOffline && !nowOffline) {
        loadStaticData();
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isOffline, loadStaticData]);

  const diagnostics = useMemo(() => buildTransitDiagnostics({
    isOffline,
    staticData: {
      isLoading: isLoadingStatic,
      isRefreshing: isRefreshingStatic,
      isOffline,
      isAvailable: routes.length > 0 && stops.length > 0,
      usingCachedData,
      lastSuccessAt: lastStaticRefreshAt,
      lastFailureAt: lastStaticFailureAt,
      error: staticError,
    },
    realtimeVehicles: {
      isLoading: isLoadingVehicles,
      isOffline,
      isAvailable: Boolean(lastVehicleUpdate),
      lastSuccessAt: lastVehicleUpdate,
      lastFailureAt: lastVehicleFailureAt,
      error: vehicleError,
    },
    routing: {
      isLoading: isBuildingRouting,
      isOffline,
      isReady: isRoutingReady,
      routingData,
      lastSuccessAt: lastRoutingBuildAt,
      lastFailureAt: lastRoutingFailureAt,
      error: routingError,
    },
    proxyApi: {
      isLoading: isCheckingProxyHealth,
      isOffline,
      isAvailable: Boolean(proxyHealth?.ok),
      lastSuccessAt: lastProxyHealthCheckAt,
      lastFailureAt: lastProxyHealthFailureAt,
      error: proxyHealthError,
    },
    counts: {
      routes: routes.length,
      stops: stops.length,
      vehicles: vehicles.length,
      alerts: serviceAlerts.length,
    },
  }), [
    isOffline,
    isLoadingStatic,
    isRefreshingStatic,
    routes.length,
    stops.length,
    usingCachedData,
    lastStaticRefreshAt,
    lastStaticFailureAt,
    staticError,
    isLoadingVehicles,
    lastVehicleUpdate,
    lastVehicleFailureAt,
    vehicleError,
    isBuildingRouting,
    isRoutingReady,
    routingData,
    lastRoutingBuildAt,
    lastRoutingFailureAt,
    routingError,
    isCheckingProxyHealth,
    proxyHealth,
    lastProxyHealthCheckAt,
    lastProxyHealthFailureAt,
    proxyHealthError,
    vehicles.length,
    serviceAlerts.length,
  ]);

  const diagnosticsSignatureRef = useRef('');
  useEffect(() => {
    const signature = [
      diagnostics.overall.status,
      diagnostics.staticData.status,
      diagnostics.realtimeVehicles.status,
      diagnostics.routing.status,
      diagnostics.proxyApi.status,
      diagnostics.staticData.reason,
      diagnostics.realtimeVehicles.reason,
      diagnostics.routing.reason,
      diagnostics.proxyApi.reason,
    ].join('|');

    if (diagnosticsSignatureRef.current === signature) {
      return;
    }

    diagnosticsSignatureRef.current = signature;

    const logMethod =
      diagnostics.overall.status === DIAGNOSTIC_STATUS.ERROR
        ? logger.error
        : diagnostics.overall.status === DIAGNOSTIC_STATUS.DEGRADED
        ? logger.warn
        : logger.info;

    logMethod('Transit diagnostics updated', {
      overall: diagnostics.overall,
      staticData: {
        status: diagnostics.staticData.status,
        reason: diagnostics.staticData.reason,
        usingCachedData: diagnostics.staticData.usingCachedData,
        isStale: diagnostics.staticData.isStale,
      },
      realtimeVehicles: {
        status: diagnostics.realtimeVehicles.status,
        reason: diagnostics.realtimeVehicles.reason,
        isStale: diagnostics.realtimeVehicles.isStale,
      },
      routing: {
        status: diagnostics.routing.status,
        reason: diagnostics.routing.reason,
      },
      proxyApi: {
        status: diagnostics.proxyApi.status,
        reason: diagnostics.proxyApi.reason,
        isStale: diagnostics.proxyApi.isStale,
      },
      counts: diagnostics.counts,
    });
  }, [diagnostics]);

  const staticValue = useMemo(() => ({
    routes,
    stops,
    shapes,
    processedShapes,
    shapeOverlapOffsets,
    trips,
    tripMapping,
    routeShapeMapping,
    routeStopsMapping,
    routeStopSequencesMapping,
    routingData,
    isRoutingReady,
    ensureRoutingData,
    isLoadingStatic,
    isRefreshingStatic,
    staticError,
    isOffline,
    usingCachedData,
    diagnostics,
    loadStaticData,
    loadProxyHealth,
    getRouteById,
    getStopById,
    getShapesForRoute,
  }), [
    routes,
    stops,
    shapes,
    processedShapes,
    shapeOverlapOffsets,
    trips,
    tripMapping,
    routeShapeMapping,
    routeStopsMapping,
    routeStopSequencesMapping,
    routingData,
    isRoutingReady,
    ensureRoutingData,
    isLoadingStatic,
    isRefreshingStatic,
    staticError,
    isOffline,
    usingCachedData,
    diagnostics,
    loadStaticData,
    loadProxyHealth,
    getRouteById,
    getStopById,
    getShapesForRoute,
  ]);

  const realtimeValue = useMemo(() => ({
    vehicles,
    lastVehicleUpdate,
    serviceAlerts,
    detoursEnabled,
    setDetoursEnabled,
    activeDetours,
    isRouteDetouring,
    getRouteDetour,
    transitNews,
    onDemandZones,
    isLoadingVehicles,
    vehicleError,
    diagnostics,
    loadVehiclePositions,
    loadServiceAlerts,
    startVehicleUpdates,
    stopVehicleUpdates,
    startServiceAlertUpdates,
    stopServiceAlertUpdates,
    getVehiclesForRoute,
  }), [
    vehicles,
    lastVehicleUpdate,
    serviceAlerts,
    detoursEnabled,
    setDetoursEnabled,
    activeDetours,
    isRouteDetouring,
    getRouteDetour,
    transitNews,
    onDemandZones,
    isLoadingVehicles,
    vehicleError,
    diagnostics,
    loadVehiclePositions,
    loadServiceAlerts,
    startVehicleUpdates,
    stopVehicleUpdates,
    startServiceAlertUpdates,
    stopServiceAlertUpdates,
    getVehiclesForRoute,
  ]);

  const mergedValue = useMemo(
    () => ({ ...staticValue, ...realtimeValue }),
    [staticValue, realtimeValue]
  );

  return (
    <TransitStaticContext.Provider value={staticValue}>
      <TransitRealtimeContext.Provider value={realtimeValue}>
        <TransitContext.Provider value={mergedValue}>
          {children}
        </TransitContext.Provider>
      </TransitRealtimeContext.Provider>
    </TransitStaticContext.Provider>
  );
};

export default TransitContext;
