import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
import logger from '../utils/logger';

const TransitContext = createContext(null);

export const useTransit = () => {
  const context = useContext(TransitContext);
  if (!context) {
    throw new Error('useTransit must be used within a TransitProvider');
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

  // Detour detection (server-side, via Firestore)
  const [activeDetours, setActiveDetours] = useState({});

  // Transit news (server-side, via Firestore)
  const [transitNews, setTransitNews] = useState([]);

  // Offline state
  const [isOffline, setIsOffline] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);

  // Refs for intervals
  const vehicleIntervalRef = useRef(null);
  const serviceAlertIntervalRef = useRef(null);
  const shapeProcessingJobRef = useRef(0);

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

        for (let i = 0; i < shapeIds.length; i++) {
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
   * Load static GTFS data with offline caching support
   */
  const loadStaticData = useCallback(async () => {
    setIsLoadingStatic(true);
    setStaticError(null);
    setUsingCachedData(false);
    setIsRoutingReady(false);

    const online = await isOnline();
    setIsOffline(!online);

    // Try to load from cache first if offline
    if (!online) {
      const cachedData = await getCachedGTFSData();
      if (cachedData) {
        setRoutes(cachedData.routes);
        setStops(cachedData.stops);
        setShapes(cachedData.shapes || {});
        setTrips(cachedData.trips || []);
        setTripMapping(cachedData.tripMapping || {});
        setRouteShapeMapping(cachedData.routeShapeMapping || {});
        setRouteStopsMapping(cachedData.routeStopsMapping || {});
        setUsingCachedData(true);

        // Process shapes for rendering
        processAndStoreShapes(cachedData.shapes || {});

        // Build routing data from cached data if available
        if (cachedData.stopTimes && cachedData.calendar) {
          try {
            const routing = buildRoutingData(cachedData);
            // Add routes for itinerary building
            routing.routes = cachedData.routes;
            routing.shapes = cachedData.shapes || {};
            setRoutingData(routing);
            setIsRoutingReady(true);
          } catch (routingError) {
            logger.warn('Failed to build routing data from cache:', routingError);
          }
        }

        setIsLoadingStatic(false);
        return;
      }
    }

    try {
      const data = await fetchAllStaticData();
      setRoutes(data.routes);
      setStops(data.stops);
      setShapes(data.shapes);
      setTrips(data.trips);
      setTripMapping(data.tripMapping);
      setRouteShapeMapping(data.routeShapeMapping);
      setRouteStopsMapping(data.routeStopsMapping || {});

      // Process shapes for rendering
      processAndStoreShapes(data.shapes);

      // Build routing data structures for RAPTOR
      try {
        const routing = buildRoutingData(data);
        // Add routes for itinerary building
        routing.routes = data.routes;
        routing.shapes = data.shapes || {};
        setRoutingData(routing);
        setIsRoutingReady(true);
      } catch (routingError) {
        logger.error('Failed to build routing data:', routingError);
        // Continue without local routing - will fall back to OTP
      }

      // Cache the data for offline use
      await cacheGTFSData(data);
    } catch (error) {
      logger.error('Failed to load static data:', error);

      // Try to use cached data as fallback
      const cachedData = await getCachedGTFSData();
      if (cachedData) {
        setRoutes(cachedData.routes);
        setStops(cachedData.stops);
        setShapes(cachedData.shapes || {});
        setTrips(cachedData.trips || []);
        setTripMapping(cachedData.tripMapping || {});
        setRouteShapeMapping(cachedData.routeShapeMapping || {});
        setRouteStopsMapping(cachedData.routeStopsMapping || {});
        setUsingCachedData(true);

        // Process shapes for rendering
        processAndStoreShapes(cachedData.shapes || {});

        // Try to build routing data from cached data
        if (cachedData.stopTimes && cachedData.calendar) {
          try {
            const routing = buildRoutingData(cachedData);
            routing.routes = cachedData.routes;
            routing.shapes = cachedData.shapes || {};
            setRoutingData(routing);
            setIsRoutingReady(true);
          } catch (routingError) {
            logger.warn('Failed to build routing data from cache:', routingError);
          }
        }
      } else {
        setStaticError(error.message || 'Failed to load transit data');
      }
    } finally {
      setIsLoadingStatic(false);
    }
  }, []);

  /**
   * Load vehicle positions
   */
  const loadVehiclePositions = useCallback(async () => {
    setIsLoadingVehicles(true);
    setVehicleError(null);

    try {
      const rawVehicles = await fetchVehiclePositions();
      const formattedVehicles = formatVehiclesForMap(rawVehicles, tripMapping);
      setVehicles(formattedVehicles);
      setLastVehicleUpdate(new Date());
    } catch (error) {
      logger.error('Failed to load vehicle positions:', error);
      setVehicleError(error.message || 'Failed to load vehicle positions');
    } finally {
      setIsLoadingVehicles(false);
    }
  }, [tripMapping]);

  /**
   * Start automatic vehicle position updates
   */
  const startVehicleUpdates = useCallback(() => {
    // Clear existing interval
    if (vehicleIntervalRef.current) {
      clearInterval(vehicleIntervalRef.current);
    }

    // Load immediately
    loadVehiclePositions();

    // Set up interval
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

  /**
   * Get route by ID
   */
  const getRouteById = useCallback(
    (routeId) => {
      return routes.find((route) => route.id === routeId);
    },
    [routes]
  );

  /**
   * Get stop by ID
   */
  const getStopById = useCallback(
    (stopId) => {
      return stops.find((stop) => stop.id === stopId);
    },
    [stops]
  );

  /**
   * Get shapes for a route
   */
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

  /**
   * Get vehicles for a specific route
   */
  const getVehiclesForRoute = useCallback(
    (routeId) => {
      return vehicles.filter((vehicle) => vehicle.routeId === routeId);
    },
    [vehicles]
  );

  const isRouteDetouring = useCallback(
    (routeId) => Boolean(activeDetours[routeId]),
    [activeDetours]
  );

  // Subscribe to active detours (public collection, no auth required)
  useEffect(() => {
    const unsubscribe = subscribeToActiveDetours(
      (detourMap) => setActiveDetours(detourMap),
      (error) => logger.error('Detour subscription error:', error)
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to transit news (public collection, no auth required)
  useEffect(() => {
    const unsubscribe = subscribeToTransitNews(
      (news) => setTransitNews(news),
      (error) => logger.error('News subscription error:', error)
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

  // Listen for network changes
  useEffect(() => {
    const unsubscribe = addNetworkListener((state) => {
      const wasOffline = isOffline;
      const nowOffline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(nowOffline);

      if (nowOffline) {
        setServiceAlerts([]);
      }

      // Reload data when coming back online
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

  const value = {
    // Static data
    routes,
    stops,
    shapes,
    processedShapes,
    shapeOverlapOffsets,
    trips,
    tripMapping,
    routeShapeMapping,
    routeStopsMapping,

    // Routing data (for RAPTOR algorithm)
    routingData,
    isRoutingReady,

    // Real-time data
    vehicles,
    lastVehicleUpdate,
    serviceAlerts,
    activeDetours,
    isRouteDetouring,
    transitNews,

    // Loading states
    isLoadingStatic,
    isLoadingVehicles,
    staticError,
    vehicleError,

    // Offline state
    isOffline,
    usingCachedData,

    // Actions
    loadStaticData,
    loadVehiclePositions,
    loadServiceAlerts,
    startVehicleUpdates,
    stopVehicleUpdates,
    startServiceAlertUpdates,
    stopServiceAlertUpdates,

    // Helpers
    getRouteById,
    getStopById,
    getShapesForRoute,
    getVehiclesForRoute,
  };

  return <TransitContext.Provider value={value}>{children}</TransitContext.Provider>;
};

export default TransitContext;
