/**
 * Detour Detection Service
 * Automatically detects when buses deviate from their GTFS route shapes
 * and confirms detours when multiple vehicles take the same off-route path.
 */

import { DETOUR_CONFIG } from '../config/constants';
import {
  pointToPolylineDistance,
  pathsOverlap,
  simplifyPath,
  calculatePathCentroid,
  haversineDistance,
} from '../utils/geometryUtils';

const DETOUR_ALERT_EFFECTS = new Set(['Detour', 'Modified Service', 'No Service', 'Reduced Service']);

const DEFAULT_CONFIDENCE_THRESHOLDS = {
  likely: 70,
  high: 85,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Resolve route-specific detection settings by merging global defaults
 * with optional per-route overrides from constants.
 */
export const resolveRouteDetourConfig = (routeId) => {
  const overrides = DETOUR_CONFIG.ROUTE_OVERRIDES?.[routeId] || {};
  return {
    OFF_ROUTE_THRESHOLD_METERS:
      overrides.OFF_ROUTE_THRESHOLD_METERS ?? DETOUR_CONFIG.OFF_ROUTE_THRESHOLD_METERS,
    CORRIDOR_WIDTH_METERS: overrides.CORRIDOR_WIDTH_METERS ?? DETOUR_CONFIG.CORRIDOR_WIDTH_METERS,
    PATH_OVERLAP_PERCENTAGE:
      overrides.PATH_OVERLAP_PERCENTAGE ?? DETOUR_CONFIG.PATH_OVERLAP_PERCENTAGE,
    MIN_OFF_ROUTE_POINTS: overrides.MIN_OFF_ROUTE_POINTS ?? DETOUR_CONFIG.MIN_OFF_ROUTE_POINTS,
    DETOUR_EXPIRY_MS: overrides.DETOUR_EXPIRY_MS ?? DETOUR_CONFIG.DETOUR_EXPIRY_MS,
    MIN_OFF_ROUTE_DURATION_MS:
      overrides.MIN_OFF_ROUTE_DURATION_MS ?? DETOUR_CONFIG.MIN_OFF_ROUTE_DURATION_MS,
    PENDING_PATH_EXPIRY_MS:
      overrides.PENDING_PATH_EXPIRY_MS ?? DETOUR_CONFIG.PENDING_PATH_EXPIRY_MS,
    STOP_MATCH_RADIUS_METERS:
      overrides.STOP_MATCH_RADIUS_METERS ?? DETOUR_CONFIG.STOP_MATCH_RADIUS_METERS,
    MAX_AFFECTED_STOPS: overrides.MAX_AFFECTED_STOPS ?? DETOUR_CONFIG.MAX_AFFECTED_STOPS,
  };
};

const getConfidenceThresholds = () => ({
  likely:
    DETOUR_CONFIG.CONFIDENCE_THRESHOLDS?.likely ?? DEFAULT_CONFIDENCE_THRESHOLDS.likely,
  high: DETOUR_CONFIG.CONFIDENCE_THRESHOLDS?.high ?? DEFAULT_CONFIDENCE_THRESHOLDS.high,
});

const getUniqueVehicleCount = (detour) => {
  const ids = new Set((detour.confirmedByVehicles || []).map((entry) => entry.vehicleId));
  return ids.size;
};

const calculateConfidenceScore = (detour) => {
  const uniqueVehicles = getUniqueVehicleCount(detour);
  let score = 45;

  if (uniqueVehicles >= 2) score = 60;
  if (uniqueVehicles >= 3) score = 72;
  if (uniqueVehicles >= 4) score = 82;
  if (uniqueVehicles >= 5) score = 90;

  const now = Date.now();
  const ageMs = now - (detour.lastSeenAt || now);
  if (ageMs <= 5 * 60 * 1000) score += 5;
  else if (ageMs <= 15 * 60 * 1000) score += 2;

  if (detour.officialAlert?.matched) score += 8;

  return clamp(score, 0, 100);
};

const getConfidenceLevelFromScore = (score) => {
  const thresholds = getConfidenceThresholds();
  if (score >= thresholds.high) return 'high-confidence';
  if (score >= thresholds.likely) return 'likely';
  return 'suspected';
};

const updateDetourConfidence = (detour) => {
  detour.evidenceCount = getUniqueVehicleCount(detour);
  detour.confidenceScore = calculateConfidenceScore(detour);
  detour.confidenceLevel = getConfidenceLevelFromScore(detour.confidenceScore);
  return detour;
};

/**
 * Initialize empty detour detection state
 * @returns {Object} Initial state structure
 */
export const initializeDetourState = () => ({
  // Track each vehicle's off-route status
  // Key: vehicleId, Value: tracking record
  vehicleTracking: {},

  // Pending detour paths waiting for confirmation
  // Key: routeKey (routeId_directionId), Value: array of pending paths
  pendingPaths: {},

  // Confirmed/suspected detours
  // Key: detourId, Value: detour record
  activeDetours: {},

  // Archived detours retained for history/debugging
  detourHistory: [],

  // Counter for generating unique detour IDs
  detourIdCounter: 0,
});

/**
 * Generate a unique route key from route ID and direction ID
 */
const getRouteKey = (routeId, directionId) => `${routeId}_${directionId ?? 'unknown'}`;

/**
 * Generate a unique detour ID
 */
const generateDetourId = (state) => {
  state.detourIdCounter += 1;
  return `detour_${Date.now()}_${state.detourIdCounter}`;
};

/**
 * Check if a vehicle is off its designated route
 * @param {Object} vehicle - Vehicle with coordinate {latitude, longitude}
 * @param {Array} shapePolyline - Array of coordinates representing the route shape
 * @returns {boolean} True if vehicle is more than threshold distance from route
 */
export const checkVehicleOffRoute = (vehicle, shapePolyline) => {
  if (!vehicle || !vehicle.coordinate || !shapePolyline || shapePolyline.length < 2) {
    return false;
  }

  const distance = pointToPolylineDistance(vehicle.coordinate, shapePolyline);
  return distance > DETOUR_CONFIG.OFF_ROUTE_THRESHOLD_METERS;
};

/**
 * Get the combined polyline for a route (merges all shape variants)
 * @param {string} routeId - Route ID
 * @param {Object} shapes - Map of shapeId to coordinates
 * @param {Object} routeShapeMapping - Map of routeId to array of shapeIds
 * @returns {Array} Candidate shape objects: { shapeId, polyline }
 */
const getRoutePolylines = (routeId, shapes, routeShapeMapping) => {
  const shapeIds = routeShapeMapping[routeId] || [];
  return shapeIds
    .map((shapeId) => ({ shapeId, polyline: shapes[shapeId] || [] }))
    .filter((entry) => entry.polyline.length >= 2);
};

const findNearestRoutePolyline = (vehicle, routePolylines) => {
  let best = null;
  let minDistance = Infinity;

  for (const candidate of routePolylines) {
    const distance = pointToPolylineDistance(vehicle.coordinate, candidate.polyline);
    if (distance < minDistance) {
      minDistance = distance;
      best = candidate;
    }
  }

  return {
    bestMatch: best,
    minDistanceMeters: minDistance,
  };
};

/**
 * Process a single vehicle for detour detection
 * Updates tracking state and checks for detour patterns
 * @param {Object} vehicle - Vehicle data with coordinate, routeId, directionId, id
 * @param {Object} shapes - Map of shapeId to coordinates
 * @param {Object} tripMapping - Map of tripId to trip info (includes directionId)
 * @param {Object} routeShapeMapping - Map of routeId to array of shapeIds
 * @param {Object} state - Mutable detour detection state
 * @returns {Object|null} New or updated detour if detected, null otherwise
 */
export const processVehicleForDetour = (
  vehicle,
  shapes,
  tripMapping,
  routeShapeMapping,
  state
) => {
  if (!vehicle || !vehicle.routeId || !vehicle.coordinate) {
    return null;
  }

  const vehicleId = vehicle.id;
  const routeId = vehicle.routeId;
  const directionId = vehicle.directionId;
  const routeKey = getRouteKey(routeId, directionId);
  const now = Date.now();
  const routeConfig = resolveRouteDetourConfig(routeId);

  // Compare against all candidate shape variants for the route
  const routePolylines = getRoutePolylines(routeId, shapes, routeShapeMapping);
  if (routePolylines.length === 0) {
    return null;
  }

  // Check if vehicle is off route based on nearest shape variant
  const nearestMatch = findNearestRoutePolyline(vehicle, routePolylines);
  const isOffRoute = nearestMatch.minDistanceMeters > routeConfig.OFF_ROUTE_THRESHOLD_METERS;

  // Get or create tracking record for this vehicle
  let tracking = state.vehicleTracking[vehicleId];
  if (!tracking) {
    tracking = {
      vehicleId,
      tripId: vehicle.tripId,
      routeId,
      directionId,
      isCurrentlyOffRoute: false,
      offRouteBreadcrumbs: [],
      offRouteStartTime: null,
      lastMatchedShapeId: nearestMatch.bestMatch?.shapeId || null,
      lastUpdateTime: now,
    };
    state.vehicleTracking[vehicleId] = tracking;
  }

  // Update tracking based on current state
  if (isOffRoute) {
    if (!tracking.isCurrentlyOffRoute) {
      // Just went off route
      tracking.isCurrentlyOffRoute = true;
      tracking.offRouteStartTime = now;
      tracking.offRouteBreadcrumbs = [];
    }

    // Add breadcrumb
    tracking.offRouteBreadcrumbs.push({
      latitude: vehicle.coordinate.latitude,
      longitude: vehicle.coordinate.longitude,
      timestamp: now,
      matchedShapeId: nearestMatch.bestMatch?.shapeId || null,
      offRouteDistanceMeters: nearestMatch.minDistanceMeters,
    });

    tracking.lastMatchedShapeId = nearestMatch.bestMatch?.shapeId || null;
    tracking.lastUpdateTime = now;
  } else {
    if (tracking.isCurrentlyOffRoute) {
      // Just returned to route - process the off-route path
      const result = processCompletedOffRoutePath(tracking, routeKey, state, routeConfig);

      // Reset tracking
      tracking.isCurrentlyOffRoute = false;
      tracking.offRouteBreadcrumbs = [];
      tracking.offRouteStartTime = null;
      tracking.lastMatchedShapeId = nearestMatch.bestMatch?.shapeId || tracking.lastMatchedShapeId;
      tracking.lastUpdateTime = now;

      return result;
    }

    tracking.lastMatchedShapeId = nearestMatch.bestMatch?.shapeId || tracking.lastMatchedShapeId;
    tracking.lastUpdateTime = now;
  }

  return null;
};

/**
 * Process a completed off-route path when a vehicle returns to its route
 * Checks against pending paths to see if this confirms a detour pattern
 */
const processCompletedOffRoutePath = (tracking, routeKey, state, routeConfig) => {
  const { offRouteBreadcrumbs, offRouteStartTime, vehicleId } = tracking;
  const now = Date.now();

  // Check minimum requirements
  if (offRouteBreadcrumbs.length < routeConfig.MIN_OFF_ROUTE_POINTS) {
    return null;
  }

  const duration = now - offRouteStartTime;
  if (duration < routeConfig.MIN_OFF_ROUTE_DURATION_MS) {
    return null;
  }

  // Simplify the path to reduce noise
  const simplifiedPath = simplifyPath(offRouteBreadcrumbs);

  // Initialize pending paths for this route if needed
  if (!state.pendingPaths[routeKey]) {
    state.pendingPaths[routeKey] = [];
  }

  // Clean up expired pending paths
  state.pendingPaths[routeKey] = state.pendingPaths[routeKey].filter(
    (p) => now - p.timestamp < routeConfig.PENDING_PATH_EXPIRY_MS
  );

  // Check if this path matches any existing pending paths
  for (const pendingPath of state.pendingPaths[routeKey]) {
    const overlap = pathsOverlap(
      simplifiedPath,
      pendingPath.path,
      routeConfig.CORRIDOR_WIDTH_METERS,
      routeConfig.PATH_OVERLAP_PERCENTAGE
    );

    if (overlap) {
      // Found a match - create or update a suspected detour
      const detour = createOrUpdateDetour(
        routeKey,
        simplifiedPath,
        pendingPath,
        vehicleId,
        tracking,
        state,
        routeConfig
      );

      // Remove the matched pending path
      state.pendingPaths[routeKey] = state.pendingPaths[routeKey].filter(
        (p) => p !== pendingPath
      );

      return detour;
    }
  }

  // No match found - add this as a new pending path
  state.pendingPaths[routeKey].push({
    vehicleId,
    path: simplifiedPath,
    timestamp: now,
    routeId: tracking.routeId,
    directionId: tracking.directionId,
  });

  return null;
};

/**
 * Create or update a suspected detour based on confirmed pattern
 */
const createOrUpdateDetour = (routeKey, newPath, matchedPending, vehicleId, tracking, state) => {
  const now = Date.now();
  const routeConfig = resolveRouteDetourConfig(tracking.routeId);

  // Check if there's already an active detour for this route that matches
  for (const detourId of Object.keys(state.activeDetours)) {
    const existing = state.activeDetours[detourId];
    if (existing.routeKey === routeKey && existing.status === 'suspected') {
      const overlap = pathsOverlap(
        newPath,
        existing.polyline,
        routeConfig.CORRIDOR_WIDTH_METERS,
        routeConfig.PATH_OVERLAP_PERCENTAGE
      );

      if (overlap) {
        // Update existing detour
        existing.lastSeenAt = now;
        const recentlyConfirmed = existing.confirmedByVehicles.some(
          (entry) =>
            entry.vehicleId === vehicleId &&
            now - entry.timestamp < routeConfig.PENDING_PATH_EXPIRY_MS
        );

        if (!recentlyConfirmed) {
          existing.confirmedByVehicles.push({
            vehicleId,
            timestamp: now,
          });
        }

        updateDetourConfidence(existing);
        return existing;
      }
    }
  }

  // Create new suspected detour using the longer path
  const detourPath = getLongerPath(newPath, matchedPending.path);

  const detour = {
    id: generateDetourId(state),
    routeId: tracking.routeId,
    directionId: tracking.directionId,
    routeKey,
    polyline: detourPath,
    centroid: calculatePathCentroid(detourPath),
    confirmedByVehicles: [
      { vehicleId: matchedPending.vehicleId, timestamp: matchedPending.timestamp },
      { vehicleId, timestamp: now },
    ],
    firstDetectedAt: matchedPending.timestamp,
    lastSeenAt: now,
    status: 'suspected',
    evidenceCount: 2,
    confidenceScore: 0,
    confidenceLevel: 'suspected',
    officialAlert: { matched: false },
    alertCorrelation: 'none',
    affectedStops: [],
    segmentLabel: null,
  };

  updateDetourConfidence(detour);
  state.activeDetours[detour.id] = detour;
  return detour;
};

/**
 * Get the longer of two paths (used as the detour polyline)
 */
const getLongerPath = (path1, path2) =>
  path1.length >= path2.length ? path1 : path2;

/**
 * Check if a detour should be cleared because vehicles are following the normal route
 * Call this when a vehicle successfully traverses the detour area on the normal route
 */
export const checkDetourClearing = (vehicle, shapes, routeShapeMapping, state) => {
  if (!vehicle || !vehicle.routeId) return;

  const routeKey = getRouteKey(vehicle.routeId, vehicle.directionId);
  const routeConfig = resolveRouteDetourConfig(vehicle.routeId);

  // Find active detours for this route
  for (const detourId of Object.keys(state.activeDetours)) {
    const detour = state.activeDetours[detourId];
    if (detour.routeKey !== routeKey || detour.status !== 'suspected') continue;

    // Check if vehicle is near the detour area but on the normal route
    const routePolylines = getRoutePolylines(vehicle.routeId, shapes, routeShapeMapping);
    if (routePolylines.length === 0) continue;

    const nearestMatch = findNearestRoutePolyline(vehicle, routePolylines);
    const isOnRoute = nearestMatch.minDistanceMeters <= routeConfig.OFF_ROUTE_THRESHOLD_METERS;

    if (isOnRoute && detour.centroid) {
      // Check if vehicle is near the detour centroid (point-to-point distance)
      const distToCentroid = haversineDistance(
        vehicle.coordinate.latitude,
        vehicle.coordinate.longitude,
        detour.centroid.latitude,
        detour.centroid.longitude
      );
      if (distToCentroid < routeConfig.CORRIDOR_WIDTH_METERS * 3) {
        // Vehicle is near detour area but on normal route - potential clearing
        // Mark detour as cleared
        detour.status = 'cleared';
        detour.clearedAt = Date.now();
        detour.clearedByVehicle = vehicle.id;
        updateDetourConfidence(detour);
      }
    }
  }
};

const cloneDetourForHistory = (detour) => ({
  ...detour,
  polyline: (detour.polyline || []).map((point) => ({ ...point })),
  confirmedByVehicles: (detour.confirmedByVehicles || []).map((entry) => ({ ...entry })),
  affectedStops: (detour.affectedStops || []).map((stop) => ({ ...stop })),
  officialAlert: detour.officialAlert ? { ...detour.officialAlert } : null,
});

const archiveDetour = (state, detour, archiveReason) => {
  if (!state.detourHistory) {
    state.detourHistory = [];
  }

  const historyLimit = DETOUR_CONFIG.DETOUR_HISTORY_LIMIT ?? 100;
  state.detourHistory.unshift({
    ...cloneDetourForHistory(detour),
    archivedAt: Date.now(),
    archiveReason,
  });
  state.detourHistory = state.detourHistory.slice(0, historyLimit);
};

/**
 * Clean up expired detours and pending paths
 */
export const cleanupExpiredDetours = (state) => {
  const now = Date.now();
  const clearedRetentionMs = DETOUR_CONFIG.CLEARED_DETOUR_RETENTION_MS ?? 300000;

  // Clean up expired active detours
  for (const detourId of Object.keys(state.activeDetours)) {
    const detour = state.activeDetours[detourId];
    const routeConfig = resolveRouteDetourConfig(detour.routeId);
    if (
      detour.status === 'suspected' &&
      now - detour.lastSeenAt > routeConfig.DETOUR_EXPIRY_MS
    ) {
      archiveDetour(state, detour, 'expired');
      delete state.activeDetours[detourId];
    } else if (
      detour.status === 'cleared' &&
      now - detour.clearedAt > clearedRetentionMs
    ) {
      archiveDetour(state, detour, 'cleared');
      delete state.activeDetours[detourId];
    }
  }

  // Clean up expired pending paths
  for (const routeKey of Object.keys(state.pendingPaths)) {
    state.pendingPaths[routeKey] = state.pendingPaths[routeKey].filter((pendingPath) => {
      const routeConfig = resolveRouteDetourConfig(pendingPath.routeId);
      return now - pendingPath.timestamp < routeConfig.PENDING_PATH_EXPIRY_MS;
    });

    if (state.pendingPaths[routeKey].length === 0) {
      delete state.pendingPaths[routeKey];
    }
  }

  // Clean up stale vehicle tracking
  for (const vehicleId of Object.keys(state.vehicleTracking)) {
    const tracking = state.vehicleTracking[vehicleId];
    const routeConfig = resolveRouteDetourConfig(tracking.routeId);
    if (now - tracking.lastUpdateTime > routeConfig.PENDING_PATH_EXPIRY_MS) {
      delete state.vehicleTracking[vehicleId];
    }
  }
};

const getCorrelatingAlert = (detour, serviceAlerts) =>
  serviceAlerts.find(
    (alert) =>
      Array.isArray(alert.affectedRoutes) &&
      alert.affectedRoutes.includes(detour.routeId) &&
      DETOUR_ALERT_EFFECTS.has(alert.effect)
  ) || null;

/**
 * Correlate auto-detected detours with official GTFS service alerts
 * so confidence reflects whether official alerts support the same route impact.
 */
export const correlateDetoursWithServiceAlerts = (state, serviceAlerts = []) => {
  if (!state?.activeDetours) return;
  const now = Date.now();

  for (const detourId of Object.keys(state.activeDetours)) {
    const detour = state.activeDetours[detourId];
    if (detour.status !== 'suspected') continue;

    const matchingAlert = getCorrelatingAlert(detour, serviceAlerts);
    if (matchingAlert) {
      detour.officialAlert = {
        matched: true,
        alertId: matchingAlert.id,
        title: matchingAlert.title,
        effect: matchingAlert.effect,
        severity: matchingAlert.severity,
        matchedAt: now,
      };
      detour.alertCorrelation = 'matched';
    } else {
      detour.officialAlert = { matched: false };
      detour.alertCorrelation = 'none';
    }

    detour.lastAlertCheckAt = now;
    updateDetourConfidence(detour);
  }
};

const getNearestPathIndex = (stop, polyline) => {
  let nearestIndex = 0;
  let minDistance = Infinity;

  for (let i = 0; i < polyline.length; i += 1) {
    const point = polyline[i];
    const distance = haversineDistance(stop.latitude, stop.longitude, point.latitude, point.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
};

const buildSegmentLabel = (affectedStops) => {
  if (affectedStops.length === 0) return null;
  if (affectedStops.length === 1) return `Near ${affectedStops[0].name}`;
  const first = affectedStops[0];
  const last = affectedStops[affectedStops.length - 1];
  return `${first.name} to ${last.name}`;
};

/**
 * Enrich a detour with rider-facing context: nearby affected stops and segment label.
 */
export const enrichDetourWithRouteContext = (detour, stops = [], routeStopsMapping = {}) => {
  if (!detour || !Array.isArray(detour.polyline) || detour.polyline.length < 2) {
    return detour;
  }

  const routeConfig = resolveRouteDetourConfig(detour.routeId);
  const routeStopIds = new Set(routeStopsMapping[detour.routeId] || []);
  const candidateStops =
    routeStopIds.size > 0 ? stops.filter((stop) => routeStopIds.has(stop.id)) : stops;

  const affectedStops = candidateStops
    .map((stop) => {
      const distanceMeters = pointToPolylineDistance(
        { latitude: stop.latitude, longitude: stop.longitude },
        detour.polyline
      );
      return {
        id: stop.id,
        name: stop.name || stop.stopName || `Stop ${stop.id}`,
        code: stop.code || stop.stopCode || stop.id,
        latitude: stop.latitude,
        longitude: stop.longitude,
        distanceMeters,
        pathIndex: getNearestPathIndex(stop, detour.polyline),
      };
    })
    .filter((stop) => stop.distanceMeters <= routeConfig.STOP_MATCH_RADIUS_METERS)
    .sort((a, b) => {
      if (a.pathIndex !== b.pathIndex) return a.pathIndex - b.pathIndex;
      return a.distanceMeters - b.distanceMeters;
    })
    .slice(0, routeConfig.MAX_AFFECTED_STOPS)
    .map((stop) => ({
      id: stop.id,
      name: stop.name,
      code: stop.code,
      distanceMeters: Math.round(stop.distanceMeters),
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));

  return {
    ...detour,
    affectedStops,
    segmentLabel: buildSegmentLabel(affectedStops),
  };
};

/**
 * Enrich an array of detours with rider-facing route context.
 */
export const enrichDetoursWithRouteContext = (detours = [], stops = [], routeStopsMapping = {}) =>
  detours.map((detour) => enrichDetourWithRouteContext(detour, stops, routeStopsMapping));

/**
 * Get all active (suspected) detours
 */
export const getActiveDetours = (state) => {
  return Object.values(state.activeDetours)
    .filter((d) => d.status === 'suspected')
    .sort((a, b) => {
      if ((b.confidenceScore || 0) !== (a.confidenceScore || 0)) {
        return (b.confidenceScore || 0) - (a.confidenceScore || 0);
      }
      return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    });
};

/**
 * Get active detours for a specific route
 */
export const getDetoursForRoute = (state, routeId, directionId = null) => {
  return Object.values(state.activeDetours)
    .filter((d) => {
    if (d.status !== 'suspected') return false;
    if (d.routeId !== routeId) return false;
    if (directionId !== null && d.directionId !== directionId) return false;
    return true;
  })
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
};

/**
 * Check if a route has any active detours
 */
export const hasActiveDetour = (state, routeId, directionId = null) => {
  return getDetoursForRoute(state, routeId, directionId).length > 0;
};

/**
 * Read archived detour history, optionally filtered by route ID.
 */
export const getDetourHistory = (state, routeId = null, limit = null) => {
  const history = Array.isArray(state.detourHistory) ? state.detourHistory : [];
  const filtered = routeId ? history.filter((entry) => entry.routeId === routeId) : history;
  const maxItems = limit ?? DETOUR_CONFIG.DETOUR_HISTORY_LIMIT ?? 100;
  return filtered.slice(0, maxItems);
};
