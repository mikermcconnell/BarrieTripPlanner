/**
 * Tests for detour detection service
 * Tests the core detection logic that identifies when buses deviate from routes
 */

const {
  initializeDetourState,
  checkVehicleOffRoute,
  processVehicleForDetour,
  checkDetourClearing,
  correlateDetoursWithServiceAlerts,
  enrichDetourWithRouteContext,
  resolveRouteDetourConfig,
  getActiveDetours,
  getDetoursForRoute,
  getDetourHistory,
  hasActiveDetour,
  cleanupExpiredDetours,
} = require('../services/detourDetectionService');

// Mock route shape - straight north-south line through Barrie
const mockRouteShape = [
  { latitude: 44.38, longitude: -79.69 },
  { latitude: 44.39, longitude: -79.69 },
  { latitude: 44.40, longitude: -79.69 },
  { latitude: 44.41, longitude: -79.69 },
];

// Mock shapes object
const mockShapes = {
  'shape_1': mockRouteShape,
  // Alternate branch shape a little east of shape_1
  'shape_1_variant': [
    { latitude: 44.38, longitude: -79.685 },
    { latitude: 44.39, longitude: -79.685 },
    { latitude: 44.40, longitude: -79.685 },
    { latitude: 44.41, longitude: -79.685 },
  ],
};

// Mock route-shape mapping
const mockRouteShapeMapping = {
  '1': ['shape_1', 'shape_1_variant'],
};

// Mock trip mapping
const mockTripMapping = {
  'trip_1': { routeId: '1', directionId: '0' },
  'trip_2': { routeId: '1', directionId: '0' },
};

describe('detourDetectionService', () => {
  describe('resolveRouteDetourConfig', () => {
    test('applies base route override to branch route IDs', () => {
      const branchConfig = resolveRouteDetourConfig('2A');
      const baseConfig = resolveRouteDetourConfig('2');

      expect(branchConfig.OFF_ROUTE_THRESHOLD_METERS).toBe(baseConfig.OFF_ROUTE_THRESHOLD_METERS);
      expect(branchConfig.CORRIDOR_WIDTH_METERS).toBe(baseConfig.CORRIDOR_WIDTH_METERS);
      expect(branchConfig.PATH_OVERLAP_PERCENTAGE).toBe(baseConfig.PATH_OVERLAP_PERCENTAGE);
    });
  });

  describe('initializeDetourState', () => {
    test('creates empty state structure', () => {
      const state = initializeDetourState();

      expect(state).toHaveProperty('vehicleTracking');
      expect(state).toHaveProperty('pendingPaths');
      expect(state).toHaveProperty('activeDetours');
      expect(state).toHaveProperty('detourIdCounter');
      expect(Object.keys(state.vehicleTracking)).toHaveLength(0);
      expect(Object.keys(state.pendingPaths)).toHaveLength(0);
      expect(Object.keys(state.activeDetours)).toHaveLength(0);
    });
  });

  describe('checkVehicleOffRoute', () => {
    test('returns false for vehicle on route', () => {
      const vehicle = {
        coordinate: { latitude: 44.39, longitude: -79.69 }, // On the route
      };

      const result = checkVehicleOffRoute(vehicle, mockRouteShape);
      expect(result).toBe(false);
    });

    test('returns true for vehicle >50m from route', () => {
      const vehicle = {
        coordinate: { latitude: 44.39, longitude: -79.68 }, // ~750m east of route
      };

      const result = checkVehicleOffRoute(vehicle, mockRouteShape);
      expect(result).toBe(true);
    });

    test('returns false for vehicle slightly off route (<50m)', () => {
      const vehicle = {
        // About 30m east of route
        coordinate: { latitude: 44.39, longitude: -79.6896 },
      };

      const result = checkVehicleOffRoute(vehicle, mockRouteShape);
      expect(result).toBe(false);
    });

    test('returns false for null/invalid inputs', () => {
      expect(checkVehicleOffRoute(null, mockRouteShape)).toBe(false);
      expect(checkVehicleOffRoute({}, mockRouteShape)).toBe(false);
      expect(checkVehicleOffRoute({ coordinate: { latitude: 44.39, longitude: -79.69 } }, null)).toBe(false);
      expect(checkVehicleOffRoute({ coordinate: { latitude: 44.39, longitude: -79.69 } }, [])).toBe(false);
    });
  });

  describe('processVehicleForDetour', () => {
    test('creates tracking record for new vehicle', () => {
      const state = initializeDetourState();
      const vehicle = {
        id: 'bus_1',
        routeId: '1',
        directionId: '0',
        tripId: 'trip_1',
        coordinate: { latitude: 44.39, longitude: -79.69 }, // On route
      };

      processVehicleForDetour(vehicle, mockShapes, mockTripMapping, mockRouteShapeMapping, state);

      expect(state.vehicleTracking['bus_1']).toBeDefined();
      expect(state.vehicleTracking['bus_1'].vehicleId).toBe('bus_1');
      expect(state.vehicleTracking['bus_1'].isCurrentlyOffRoute).toBe(false);
    });

    test('marks vehicle as off-route when it deviates', () => {
      const state = initializeDetourState();
      const vehicle = {
        id: 'bus_1',
        routeId: '1',
        directionId: '0',
        tripId: 'trip_1',
        coordinate: { latitude: 44.39, longitude: -79.68 }, // Off route (east)
      };

      processVehicleForDetour(vehicle, mockShapes, mockTripMapping, mockRouteShapeMapping, state);

      expect(state.vehicleTracking['bus_1'].isCurrentlyOffRoute).toBe(true);
      expect(state.vehicleTracking['bus_1'].offRouteBreadcrumbs.length).toBe(1);
    });

    test('accumulates breadcrumbs while off-route', () => {
      const state = initializeDetourState();

      // Simulate bus going off route for several positions
      const offRoutePositions = [
        { latitude: 44.39, longitude: -79.68 },
        { latitude: 44.395, longitude: -79.68 },
        { latitude: 44.40, longitude: -79.68 },
      ];

      for (const coord of offRoutePositions) {
        const vehicle = {
          id: 'bus_1',
          routeId: '1',
          directionId: '0',
          tripId: 'trip_1',
          coordinate: coord,
        };
        processVehicleForDetour(vehicle, mockShapes, mockTripMapping, mockRouteShapeMapping, state);
      }

      expect(state.vehicleTracking['bus_1'].offRouteBreadcrumbs.length).toBe(3);
    });

    test('creates pending path when vehicle returns to route', () => {
      const state = initializeDetourState();

      // First, set up tracking with off-route breadcrumbs
      state.vehicleTracking['bus_1'] = {
        vehicleId: 'bus_1',
        tripId: 'trip_1',
        routeId: '1',
        directionId: '0',
        isCurrentlyOffRoute: true,
        offRouteBreadcrumbs: [
          { latitude: 44.39, longitude: -79.68, timestamp: Date.now() - 60000 },
          { latitude: 44.395, longitude: -79.68, timestamp: Date.now() - 45000 },
          { latitude: 44.40, longitude: -79.68, timestamp: Date.now() - 30000 },
          { latitude: 44.405, longitude: -79.68, timestamp: Date.now() - 15000 },
          { latitude: 44.41, longitude: -79.68, timestamp: Date.now() },
        ],
        offRouteStartTime: Date.now() - 60000,
        lastUpdateTime: Date.now(),
      };

      // Now vehicle returns to route
      const vehicle = {
        id: 'bus_1',
        routeId: '1',
        directionId: '0',
        tripId: 'trip_1',
        coordinate: { latitude: 44.41, longitude: -79.69 }, // Back on route
      };

      processVehicleForDetour(vehicle, mockShapes, mockTripMapping, mockRouteShapeMapping, state);

      // Should have created a pending path
      expect(state.pendingPaths['1_0']).toBeDefined();
      expect(state.pendingPaths['1_0'].length).toBe(1);
      expect(state.vehicleTracking['bus_1'].isCurrentlyOffRoute).toBe(false);
    });

    test('returns null for vehicles without route info', () => {
      const state = initializeDetourState();
      const vehicle = {
        id: 'bus_1',
        // Missing routeId
        coordinate: { latitude: 44.39, longitude: -79.69 },
      };

      const result = processVehicleForDetour(vehicle, mockShapes, mockTripMapping, mockRouteShapeMapping, state);
      expect(result).toBeNull();
    });

    test('uses nearest shape variant for off-route checks', () => {
      const state = initializeDetourState();
      const vehicle = {
        id: 'bus_branch',
        routeId: '1',
        directionId: '0',
        tripId: 'trip_1',
        // On the variant shape and far from primary shape
        coordinate: { latitude: 44.39, longitude: -79.685 },
      };

      processVehicleForDetour(vehicle, mockShapes, mockTripMapping, mockRouteShapeMapping, state);

      expect(state.vehicleTracking['bus_branch']).toBeDefined();
      expect(state.vehicleTracking['bus_branch'].isCurrentlyOffRoute).toBe(false);
    });
  });

  describe('detour confirmation', () => {
    test('creates suspected detour when two buses take same off-route path', () => {
      const state = initializeDetourState();

      // Simulated off-route path east of the main route
      const offRoutePath = [
        { latitude: 44.39, longitude: -79.68, timestamp: Date.now() - 60000 },
        { latitude: 44.395, longitude: -79.68, timestamp: Date.now() - 45000 },
        { latitude: 44.40, longitude: -79.68, timestamp: Date.now() - 30000 },
        { latitude: 44.405, longitude: -79.68, timestamp: Date.now() - 15000 },
        { latitude: 44.41, longitude: -79.68, timestamp: Date.now() },
      ];

      // First bus completes off-route journey - creates pending path
      state.vehicleTracking['bus_1'] = {
        vehicleId: 'bus_1',
        tripId: 'trip_1',
        routeId: '1',
        directionId: '0',
        isCurrentlyOffRoute: true,
        offRouteBreadcrumbs: [...offRoutePath],
        offRouteStartTime: Date.now() - 60000,
        lastUpdateTime: Date.now(),
      };

      // Bus 1 returns to route
      processVehicleForDetour({
        id: 'bus_1',
        routeId: '1',
        directionId: '0',
        tripId: 'trip_1',
        coordinate: { latitude: 44.41, longitude: -79.69 },
      }, mockShapes, mockTripMapping, mockRouteShapeMapping, state);

      // Should have pending path now
      expect(state.pendingPaths['1_0']).toBeDefined();
      expect(state.pendingPaths['1_0'].length).toBe(1);

      // Second bus takes the same path
      state.vehicleTracking['bus_2'] = {
        vehicleId: 'bus_2',
        tripId: 'trip_2',
        routeId: '1',
        directionId: '0',
        isCurrentlyOffRoute: true,
        offRouteBreadcrumbs: [...offRoutePath],
        offRouteStartTime: Date.now() - 60000,
        lastUpdateTime: Date.now(),
      };

      // Bus 2 returns to route - should NOW create detour (2 vehicles is enough)
      const result = processVehicleForDetour({
        id: 'bus_2',
        routeId: '1',
        directionId: '0',
        tripId: 'trip_2',
        coordinate: { latitude: 44.41, longitude: -79.69 },
      }, mockShapes, mockTripMapping, mockRouteShapeMapping, state);

      // Should have created a suspected detour with 2 vehicles
      expect(result).not.toBeNull();
      expect(result.status).toBe('suspected');
      expect(result.routeId).toBe('1');
      expect(result.confirmedByVehicles.length).toBeGreaterThanOrEqual(2);
      expect(result.confidenceScore).toBeGreaterThan(0);
      expect(['suspected', 'likely', 'high-confidence']).toContain(result.confidenceLevel);
      expect(Object.keys(state.activeDetours).length).toBe(1);
    });
  });

  describe('alert correlation and confidence', () => {
    test('matches official route alert and updates confidence metadata', () => {
      const state = initializeDetourState();
      state.activeDetours['detour_1'] = {
        id: 'detour_1',
        status: 'suspected',
        routeId: '1',
        directionId: '0',
        routeKey: '1_0',
        polyline: mockRouteShape,
        confirmedByVehicles: [
          { vehicleId: 'bus_1', timestamp: Date.now() - 60000 },
          { vehicleId: 'bus_2', timestamp: Date.now() - 30000 },
          { vehicleId: 'bus_3', timestamp: Date.now() - 15000 },
        ],
        firstDetectedAt: Date.now() - 60000,
        lastSeenAt: Date.now() - 10000,
      };

      correlateDetoursWithServiceAlerts(state, [
        {
          id: 'alert_1',
          title: 'Route 1 Detour',
          effect: 'Detour',
          severity: 'medium',
          affectedRoutes: ['1'],
        },
      ]);

      const detour = state.activeDetours['detour_1'];
      expect(detour.officialAlert.matched).toBe(true);
      expect(detour.officialAlert.alertId).toBe('alert_1');
      expect(detour.confidenceScore).toBeGreaterThanOrEqual(60);
      expect(['suspected', 'likely', 'high-confidence']).toContain(detour.confidenceLevel);
    });
  });

  describe('route context enrichment', () => {
    test('adds affected stops and segment label', () => {
      const detour = {
        id: 'detour_1',
        routeId: '1',
        polyline: [
          { latitude: 44.389, longitude: -79.69 },
          { latitude: 44.395, longitude: -79.69 },
          { latitude: 44.401, longitude: -79.69 },
        ],
      };
      const stops = [
        { id: 'stop_a', name: 'Maple Terminal', code: '1001', latitude: 44.3891, longitude: -79.6901 },
        { id: 'stop_b', name: 'Bayfield @ Grove', code: '1002', latitude: 44.4009, longitude: -79.6899 },
        { id: 'stop_far', name: 'Far Away', code: '9999', latitude: 44.45, longitude: -79.8 },
      ];
      const routeStopsMapping = { '1': ['stop_a', 'stop_b', 'stop_far'] };

      const enriched = enrichDetourWithRouteContext(detour, stops, routeStopsMapping);
      expect(enriched.affectedStops.length).toBe(2);
      expect(enriched.segmentLabel).toContain('to');
      expect(enriched.affectedStops[0]).toHaveProperty('distanceMeters');
    });
  });

  describe('getActiveDetours', () => {
    test('returns only suspected detours', () => {
      const state = initializeDetourState();
      state.activeDetours['detour_1'] = {
        id: 'detour_1',
        status: 'suspected',
        routeId: '1',
      };
      state.activeDetours['detour_2'] = {
        id: 'detour_2',
        status: 'cleared',
        routeId: '1',
      };

      const active = getActiveDetours(state);
      expect(active.length).toBe(1);
      expect(active[0].id).toBe('detour_1');
    });
  });

  describe('getDetoursForRoute', () => {
    test('returns detours for specific route', () => {
      const state = initializeDetourState();
      state.activeDetours['detour_1'] = {
        id: 'detour_1',
        status: 'suspected',
        routeId: '1',
        directionId: '0',
      };
      state.activeDetours['detour_2'] = {
        id: 'detour_2',
        status: 'suspected',
        routeId: '2',
        directionId: '0',
      };

      const route1Detours = getDetoursForRoute(state, '1');
      expect(route1Detours.length).toBe(1);
      expect(route1Detours[0].routeId).toBe('1');

      const route2Detours = getDetoursForRoute(state, '2');
      expect(route2Detours.length).toBe(1);

      const route3Detours = getDetoursForRoute(state, '3');
      expect(route3Detours.length).toBe(0);
    });

    test('filters by direction when specified', () => {
      const state = initializeDetourState();
      state.activeDetours['detour_1'] = {
        id: 'detour_1',
        status: 'suspected',
        routeId: '1',
        directionId: '0',
      };
      state.activeDetours['detour_2'] = {
        id: 'detour_2',
        status: 'suspected',
        routeId: '1',
        directionId: '1',
      };

      const dir0Detours = getDetoursForRoute(state, '1', '0');
      expect(dir0Detours.length).toBe(1);
      expect(dir0Detours[0].directionId).toBe('0');

      const dir1Detours = getDetoursForRoute(state, '1', '1');
      expect(dir1Detours.length).toBe(1);
      expect(dir1Detours[0].directionId).toBe('1');
    });
  });

  describe('hasActiveDetour', () => {
    test('returns true when route has active detour', () => {
      const state = initializeDetourState();
      state.activeDetours['detour_1'] = {
        id: 'detour_1',
        status: 'suspected',
        routeId: '1',
        directionId: '0',
      };

      expect(hasActiveDetour(state, '1')).toBe(true);
      expect(hasActiveDetour(state, '2')).toBe(false);
    });

    test('returns false when only cleared detours exist', () => {
      const state = initializeDetourState();
      state.activeDetours['detour_1'] = {
        id: 'detour_1',
        status: 'cleared',
        routeId: '1',
        directionId: '0',
      };

      expect(hasActiveDetour(state, '1')).toBe(false);
    });
  });

  describe('cleanupExpiredDetours', () => {
    test('removes expired suspected detours but keeps likely detours', () => {
      const state = initializeDetourState();
      const threeHoursAgo = Date.now() - 10900000; // More than 3 hours ago

      state.activeDetours['detour_old_suspected'] = {
        id: 'detour_old_suspected',
        status: 'suspected',
        confidenceLevel: 'suspected',
        lastSeenAt: threeHoursAgo,
        firstDetectedAt: threeHoursAgo,
      };
      state.activeDetours['detour_old_likely'] = {
        id: 'detour_old_likely',
        status: 'suspected',
        confidenceLevel: 'likely',
        lastSeenAt: threeHoursAgo,
        firstDetectedAt: threeHoursAgo,
      };
      state.activeDetours['detour_recent'] = {
        id: 'detour_recent',
        status: 'suspected',
        confidenceLevel: 'suspected',
        lastSeenAt: Date.now(),
        firstDetectedAt: Date.now(),
      };

      cleanupExpiredDetours(state);

      // Suspected + old → expired
      expect(state.activeDetours['detour_old_suspected']).toBeUndefined();
      // Likely + old → survives (persists until cleared or 24h max)
      expect(state.activeDetours['detour_old_likely']).toBeDefined();
      // Recent → survives
      expect(state.activeDetours['detour_recent']).toBeDefined();
    });

    test('removes cleared detours after 5 minutes', () => {
      const state = initializeDetourState();
      const sixMinutesAgo = Date.now() - 360000;

      state.activeDetours['detour_cleared'] = {
        id: 'detour_cleared',
        status: 'cleared',
        clearedAt: sixMinutesAgo,
      };

      cleanupExpiredDetours(state);

      expect(state.activeDetours['detour_cleared']).toBeUndefined();
    });

    test('removes expired pending paths', () => {
      const state = initializeDetourState();
      const oneHourAgo = Date.now() - 3700000;

      state.pendingPaths['1_0'] = [
        { timestamp: oneHourAgo, path: [] },
        { timestamp: Date.now(), path: [] },
      ];

      cleanupExpiredDetours(state);

      expect(state.pendingPaths['1_0'].length).toBe(1);
    });

    test('archives detours into history when cleaned up', () => {
      const state = initializeDetourState();
      const oldTimestamp = Date.now() - 10900000; // More than 3 hours ago
      state.activeDetours['detour_old'] = {
        id: 'detour_old',
        status: 'suspected',
        confidenceLevel: 'suspected',
        routeId: '1',
        directionId: '0',
        routeKey: '1_0',
        polyline: mockRouteShape,
        confirmedByVehicles: [{ vehicleId: 'bus_1', timestamp: oldTimestamp }],
        lastSeenAt: oldTimestamp,
        firstDetectedAt: oldTimestamp,
      };

      cleanupExpiredDetours(state);

      const history = getDetourHistory(state);
      expect(history.length).toBe(1);
      expect(history[0].id).toBe('detour_old');
      expect(history[0].archiveReason).toBe('expired');
    });
  });

  describe('evidence-based clearing', () => {
    // Detour centroid must be within CORRIDOR_WIDTH * 3 = 150m of the route
    // Route is at longitude -79.69; at lat 44.395, 0.001° lon ≈ 80m
    // So centroid at -79.6888 is ~95m from route — within the 150m clearing radius
    const nearRouteCentroid = { latitude: 44.395, longitude: -79.6888 };

    test('1 on-route vehicle does not clear suspected detour, 2nd does', () => {
      const state = initializeDetourState();
      const now = Date.now();

      state.activeDetours['detour_1'] = {
        id: 'detour_1',
        status: 'suspected',
        routeId: '1',
        directionId: '0',
        routeKey: '1_0',
        polyline: [
          { latitude: 44.39, longitude: -79.6888 },
          { latitude: 44.40, longitude: -79.6888 },
        ],
        centroid: nearRouteCentroid,
        confirmedByVehicles: [
          { vehicleId: 'bus_1', timestamp: now - 60000 },
          { vehicleId: 'bus_2', timestamp: now - 30000 },
        ],
        firstDetectedAt: now - 60000,
        lastSeenAt: now,
        evidenceCount: 2,
        confidenceScore: 65,
        confidenceLevel: 'suspected',
        clearingEvidence: [],
      };

      // 1st on-route vehicle near detour centroid
      checkDetourClearing({
        id: 'bus_clear_1',
        routeId: '1',
        directionId: '0',
        coordinate: { latitude: 44.395, longitude: -79.69 }, // on route, near centroid
      }, mockShapes, mockRouteShapeMapping, state);

      // Should still be suspected (need 2 clearing vehicles for suspected tier)
      expect(state.activeDetours['detour_1'].status).toBe('suspected');
      expect(state.activeDetours['detour_1'].clearingEvidence.length).toBe(1);

      // 2nd on-route vehicle
      checkDetourClearing({
        id: 'bus_clear_2',
        routeId: '1',
        directionId: '0',
        coordinate: { latitude: 44.395, longitude: -79.69 },
      }, mockShapes, mockRouteShapeMapping, state);

      // Now should be cleared
      expect(state.activeDetours['detour_1'].status).toBe('cleared');
      expect(state.activeDetours['detour_1'].clearedByEvidenceCount).toBe(2);
    });

    test('same vehicle does not count twice as clearing evidence', () => {
      const state = initializeDetourState();
      const now = Date.now();

      state.activeDetours['detour_1'] = {
        id: 'detour_1',
        status: 'suspected',
        routeId: '1',
        directionId: '0',
        routeKey: '1_0',
        polyline: [
          { latitude: 44.39, longitude: -79.6888 },
          { latitude: 44.40, longitude: -79.6888 },
        ],
        centroid: nearRouteCentroid,
        confirmedByVehicles: [
          { vehicleId: 'bus_1', timestamp: now - 60000 },
          { vehicleId: 'bus_2', timestamp: now - 30000 },
        ],
        firstDetectedAt: now - 60000,
        lastSeenAt: now,
        evidenceCount: 2,
        confidenceScore: 65,
        confidenceLevel: 'suspected',
        clearingEvidence: [],
      };

      // Same vehicle passes three times
      for (let i = 0; i < 3; i++) {
        checkDetourClearing({
          id: 'bus_same',
          routeId: '1',
          directionId: '0',
          coordinate: { latitude: 44.395, longitude: -79.69 },
        }, mockShapes, mockRouteShapeMapping, state);
      }

      // Should not be cleared — only 1 unique vehicle
      expect(state.activeDetours['detour_1'].status).toBe('suspected');
      expect(state.activeDetours['detour_1'].clearingEvidence.length).toBe(1);
    });
  });

  describe('confidence-tiered expiry', () => {
    test('high-confidence detours persist past 1-hour mark', () => {
      const state = initializeDetourState();
      const twoHoursAgo = Date.now() - 7200000;

      state.activeDetours['detour_hc'] = {
        id: 'detour_hc',
        status: 'suspected',
        confidenceLevel: 'high-confidence',
        routeId: '1',
        lastSeenAt: twoHoursAgo,
        firstDetectedAt: twoHoursAgo,
      };

      cleanupExpiredDetours(state);

      // high-confidence should survive past 1 hour
      expect(state.activeDetours['detour_hc']).toBeDefined();
    });

    test('all detours expire at 24-hour max retention', () => {
      const state = initializeDetourState();
      const twentyFiveHoursAgo = Date.now() - 90000000; // 25 hours

      state.activeDetours['detour_zombie'] = {
        id: 'detour_zombie',
        status: 'suspected',
        confidenceLevel: 'high-confidence',
        routeId: '1',
        lastSeenAt: twentyFiveHoursAgo,
        firstDetectedAt: twentyFiveHoursAgo,
      };

      cleanupExpiredDetours(state);

      // Should be archived even though high-confidence
      expect(state.activeDetours['detour_zombie']).toBeUndefined();
      const history = getDetourHistory(state);
      expect(history.length).toBe(1);
      expect(history[0].archiveReason).toBe('expired_max_retention');
    });
  });

  describe('clearing threshold capping', () => {
    test('clearing threshold is capped at evidence count for 2-bus routes', () => {
      const state = initializeDetourState();
      const now = Date.now();

      // Detour confirmed by only 2 vehicles but scored as "likely" (e.g. with alert boost)
      state.activeDetours['detour_likely_2bus'] = {
        id: 'detour_likely_2bus',
        status: 'suspected',
        routeId: '1',
        directionId: '0',
        routeKey: '1_0',
        polyline: [
          { latitude: 44.39, longitude: -79.6888 },
          { latitude: 44.40, longitude: -79.6888 },
        ],
        centroid: { latitude: 44.395, longitude: -79.6888 },
        confirmedByVehicles: [
          { vehicleId: 'bus_1', timestamp: now - 60000 },
          { vehicleId: 'bus_2', timestamp: now - 30000 },
        ],
        firstDetectedAt: now - 60000,
        lastSeenAt: now,
        evidenceCount: 2,
        confidenceScore: 72,
        confidenceLevel: 'likely', // normally needs 3 clearing vehicles
        clearingEvidence: [],
      };

      // Provide 2 on-route vehicles (capped threshold: min(3, 2) = 2)
      checkDetourClearing({
        id: 'bus_c1',
        routeId: '1',
        directionId: '0',
        coordinate: { latitude: 44.395, longitude: -79.69 },
      }, mockShapes, mockRouteShapeMapping, state);

      checkDetourClearing({
        id: 'bus_c2',
        routeId: '1',
        directionId: '0',
        coordinate: { latitude: 44.395, longitude: -79.69 },
      }, mockShapes, mockRouteShapeMapping, state);

      // Should clear with 2 vehicles despite "likely" normally requiring 3
      expect(state.activeDetours['detour_likely_2bus'].status).toBe('cleared');
    });
  });
});
