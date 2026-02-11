/**
 * Tests for detour detection service
 * Tests the core detection logic that identifies when buses deviate from routes
 */

const {
  initializeDetourState,
  checkVehicleOffRoute,
  processVehicleForDetour,
  correlateDetoursWithServiceAlerts,
  enrichDetourWithRouteContext,
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

      // Bus 2 returns to route - should create suspected detour
      const result = processVehicleForDetour({
        id: 'bus_2',
        routeId: '1',
        directionId: '0',
        tripId: 'trip_2',
        coordinate: { latitude: 44.41, longitude: -79.69 },
      }, mockShapes, mockTripMapping, mockRouteShapeMapping, state);

      // Should have created a suspected detour
      expect(result).not.toBeNull();
      expect(result.status).toBe('suspected');
      expect(result.routeId).toBe('1');
      expect(result.confirmedByVehicles.length).toBe(2);
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
    test('removes expired detours', () => {
      const state = initializeDetourState();
      const oneHourAgo = Date.now() - 3700000; // More than 1 hour ago

      state.activeDetours['detour_old'] = {
        id: 'detour_old',
        status: 'suspected',
        lastSeenAt: oneHourAgo,
      };
      state.activeDetours['detour_recent'] = {
        id: 'detour_recent',
        status: 'suspected',
        lastSeenAt: Date.now(),
      };

      cleanupExpiredDetours(state);

      expect(state.activeDetours['detour_old']).toBeUndefined();
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
      const oldTimestamp = Date.now() - 3700000;
      state.activeDetours['detour_old'] = {
        id: 'detour_old',
        status: 'suspected',
        routeId: '1',
        directionId: '0',
        routeKey: '1_0',
        polyline: mockRouteShape,
        confirmedByVehicles: [{ vehicleId: 'bus_1', timestamp: oldTimestamp }],
        lastSeenAt: oldTimestamp,
      };

      cleanupExpiredDetours(state);

      const history = getDetourHistory(state);
      expect(history.length).toBe(1);
      expect(history[0].id).toBe('detour_old');
      expect(history[0].archiveReason).toBe('expired');
    });
  });
});
