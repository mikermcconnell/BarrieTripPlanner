const {
  processVehicles,
  clearVehicleState,
  getActiveDetours,
  getState,
  getDetourEvidence,
  getPersistentDetours,
  hydratePersistentDetours,
  serializeDetectorRuntimeState,
  hydrateRuntimeState,
  CONSECUTIVE_READINGS_REQUIRED,
  DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  DETOUR_CLEAR_GRACE_MS,
  DETOUR_NO_VEHICLE_TIMEOUT_MS,
  DETOUR_CANDIDATE_EVIDENCE_TTL_MS,
  EVIDENCE_WINDOW_MS,
  DETOUR_PERSIST_CONSECUTIVE_MATCHES,
  DETOUR_PERSIST_MIN_AGE_MS,
} = require('../detourDetector');

// Route shape: straight line east along 44.39 latitude (11 points, step 0.002)
const shapes = new Map();
shapes.set('shape-1', [
  { latitude: 44.39, longitude: -79.700 },
  { latitude: 44.39, longitude: -79.698 },
  { latitude: 44.39, longitude: -79.696 },
  { latitude: 44.39, longitude: -79.694 },
  { latitude: 44.39, longitude: -79.692 },
  { latitude: 44.39, longitude: -79.690 },
  { latitude: 44.39, longitude: -79.688 },
  { latitude: 44.39, longitude: -79.686 },
  { latitude: 44.39, longitude: -79.684 },
  { latitude: 44.39, longitude: -79.682 },
  { latitude: 44.39, longitude: -79.680 },
]);

const routeShapeMapping = new Map();
routeShapeMapping.set('route-1', ['shape-1']);
routeShapeMapping.set('8A', ['shape-1']);
routeShapeMapping.set('8B', ['shape-1']);

// Off-route: ~555m north of the shape (0.005 deg latitude)
const OFF_ROUTE_COORD = { latitude: 44.395, longitude: -79.695 };
// On-route: directly on the shape (well within 40m clear threshold)
const ON_ROUTE_COORD = { latitude: 44.39, longitude: -79.695 };
// Dead band: ~55m from shape — between 40m clear threshold and 75m detect threshold
const DEAD_BAND_COORD = { latitude: 44.3905, longitude: -79.695 };

// Zone-specific coordinates for clearing tests
// Off-route at west end of shape — projects near index 0
const OFF_ROUTE_WEST = { latitude: 44.395, longitude: -79.698 };
// Off-route at middle of shape — projects near index 5
const OFF_ROUTE_MID = { latitude: 44.395, longitude: -79.690 };
// Off-route at east end of shape — projects near index 9
const OFF_ROUTE_EAST = { latitude: 44.395, longitude: -79.682 };
// On-route inside core zone — projects to index 4 (core ~2-6)
const ON_ROUTE_IN_ZONE = { latitude: 44.39, longitude: -79.690 };
const ON_ROUTE_ZONE_WEST = { latitude: 44.39, longitude: -79.696 };
const ON_ROUTE_ZONE_EAST = { latitude: 44.39, longitude: -79.684 };
// On-route outside core zone — projects to index 0 (outside core)
const ON_ROUTE_OUTSIDE_ZONE = { latitude: 44.39, longitude: -79.700 };
// Small detour: ~50m north of the shape, below the global threshold but above Route 8 tuning.
const SMALL_DETOUR_COORD = { latitude: 44.39045, longitude: -79.695 };

function makeVehicle(overrides = {}) {
  return {
    id: 'bus-1',
    routeId: 'route-1',
    tripId: 'trip-1',
    coordinate: { latitude: 44.39, longitude: -79.695 },
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// Helper: run N ticks with the same vehicle(s)
function runTicks(vehicles, n) {
  let result;
  for (let i = 0; i < n; i++) {
    result = processVehicles(vehicles, shapes, routeShapeMapping);
  }
  return result;
}

// Helper: confirm a detour by running CONSECUTIVE_READINGS_REQUIRED off-route ticks
function confirmDetour(vehicle) {
  return runTicks([vehicle || makeVehicle({ coordinate: OFF_ROUTE_COORD })], CONSECUTIVE_READINGS_REQUIRED);
}

// Helper: confirm a detour with spread evidence so zone is computed (3 evidence points)
function confirmDetourWithZone(vehicleId = 'bus-1') {
  // N ticks at west end → confirms detour (1 evidence point)
  runTicks([makeVehicle({ id: vehicleId, coordinate: OFF_ROUTE_WEST })], CONSECUTIVE_READINGS_REQUIRED);
  // 1 tick at middle → 2nd evidence point
  processVehicles([makeVehicle({ id: vehicleId, coordinate: OFF_ROUTE_MID })], shapes, routeShapeMapping);
  // 1 tick at east end → 3rd evidence point (zone can now be computed)
  return processVehicles([makeVehicle({ id: vehicleId, coordinate: OFF_ROUTE_EAST })], shapes, routeShapeMapping);
}

function runOnRouteTraversal(
  vehicleId = 'bus-1',
  tickCount = DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  coordinates = [ON_ROUTE_ZONE_WEST, ON_ROUTE_IN_ZONE, ON_ROUTE_ZONE_EAST]
) {
  let result;
  for (let i = 0; i < tickCount; i++) {
    result = processVehicles([
      makeVehicle({
        id: vehicleId,
        coordinate: coordinates[Math.min(i, coordinates.length - 1)],
      }),
    ], shapes, routeShapeMapping);
  }
  return result;
}

function runOnRouteTraversalForVehicles(vehicleIds, tickCount = DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE) {
  const coordinates = [ON_ROUTE_ZONE_WEST, ON_ROUTE_IN_ZONE, ON_ROUTE_ZONE_EAST];
  let result;
  for (let i = 0; i < tickCount; i++) {
    const coordinate = coordinates[Math.min(i, coordinates.length - 1)];
    result = processVehicles(
      vehicleIds.map((id) => makeVehicle({ id, coordinate })),
      shapes,
      routeShapeMapping
    );
  }
  return result;
}

beforeEach(() => {
  clearVehicleState();
});

describe('consecutive-reading confirmation', () => {
  test(`detour only appears after ${CONSECUTIVE_READINGS_REQUIRED} consecutive off-route ticks`, () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    // All ticks before the threshold — no detour yet
    for (let i = 1; i < CONSECUTIVE_READINGS_REQUIRED; i++) {
      const result = processVehicles([offVehicle], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    }

    // Final tick at threshold — detour should now appear
    const result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1']).toBeDefined();
    expect(result['route-1'].triggerVehicleId).toBe('bus-1');
    expect(result['route-1'].state).toBe('active');
  });
});

describe('hysteresis clearing', () => {
  test('detour does NOT clear on a single on-route tick', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });

    confirmDetourWithZone();

    // Single on-route tick should NOT clear (needs DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE ticks)
    const result = processVehicles([onVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].state).toBe('active');
  });

  test('detour transitions through clear-pending before final clear', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Confirm detour with zone at T=0
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      // Advance past grace period
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Run a same-bus traversal of the regular route through the affected segment.
      let result = runOnRouteTraversal();
      // After threshold tick: should be clear-pending (visible for one tick)
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('clear-pending');

      // Next tick: clear-pending finalizes → removed
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      result = processVehicles([onVehicle], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('grace period prevents clearing of young detours', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Confirm detour with zone at T=0
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      // Still within grace period (only 1 min elapsed, need 10 min)
      Date.now = () => BASE_TIME + 60_000;

      // Run enough same-bus regular-route traversal ticks to exceed the consecutive threshold.
      const result = runOnRouteTraversal('bus-1', DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE + 2);

      // Detour should persist because grace period hasn't elapsed
      expect(Object.keys(result)).toHaveLength(1);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('detour held in grace period clears after grace expires', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Confirm detour with zone at T=0
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      // Within grace: vehicle traverses the regular route, meets consecutive threshold
      // Vehicle stays in vehiclesOffRoute during grace — detour remains active
      Date.now = () => BASE_TIME + 60_000;
      runOnRouteTraversal('bus-1', DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE + 2);

      // Advance past grace period — first tick enters clear-pending
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      let result = processVehicles([onVehicle], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('clear-pending');

      // Second tick after grace — finalizes the clear
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      result = processVehicles([onVehicle], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('detour reactivates if vehicle goes off-route during clear-pending', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_MID });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Confirm detour with zone at T=0
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      // Advance past grace period
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Run same-bus regular-route traversal to enter clear-pending
      let result = runOnRouteTraversal();
      expect(result['route-1'].state).toBe('clear-pending');

      // Vehicle goes off-route again — needs full confirmation ticks to re-add to detour
      result = runTicks([offVehicle], CONSECUTIVE_READINGS_REQUIRED);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
    } finally {
      Date.now = realDateNow;
    }
  });

  test('on-route mid-streak resets consecutiveOnRoute counter', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_MID });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Start a regular-route traversal but stop before the clear threshold.
      runOnRouteTraversal('bus-1', DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE - 1);

      // One off-route tick resets the on-route counter
      processVehicles([offVehicle], shapes, routeShapeMapping);

      // Now run the traversal again — needs the full threshold count again.
      let result = runOnRouteTraversal();
      expect(result['route-1'].state).toBe('clear-pending');

      // Next tick finalizes the clear
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      result = processVehicles([onVehicle], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('dead band behavior', () => {
  test('vehicle in dead band (40-75m) does not clear an active detour', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const deadBandVehicle = makeVehicle({ coordinate: DEAD_BAND_COORD });

    confirmDetour(offVehicle);

    // Vehicle moves to dead band — should not increment on-route counter
    const result = runTicks([deadBandVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE + 2);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].state).toBe('active');
  });

  test('vehicle in dead band does not trigger a new detour', () => {
    const deadBandVehicle = makeVehicle({ coordinate: DEAD_BAND_COORD });

    // 10 ticks in dead band — should never trigger
    const result = runTicks([deadBandVehicle], 10);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('stale vehicle pruning', () => {
  test('stale vehicle keeps detour active (does not trigger clear-pending)', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      // Advance past stale timeout (6 min) but within no-vehicle timeout (30 min)
      Date.now = () => BASE_TIME + 6 * 60 * 1000;

      // Process empty — vehicle goes stale, but detour stays active
      const result = processVehicles([], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
    } finally {
      Date.now = realDateNow;
    }
  });

  test('stale one-vehicle candidate survives the no-vehicle timeout so a later bus can confirm it', () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_WEST });
    const bus2West = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_WEST });
    const bus2Mid = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_MID });
    const bus2East = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_EAST });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone('bus-1');

      // Advance past stale timeout + no-vehicle timeout. The first bus is gone,
      // but this should remain as retained evidence, not be cleared.
      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 6 * 60 * 1000;
      processVehicles([], shapes, routeShapeMapping);
      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 6 * 60 * 1000 + 1000;
      let result = processVehicles([], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
      expect(result['route-1'].uniqueVehicleCount).toBe(1);
      expect(result['route-1'].currentVehicleCount).toBe(0);

      // A later bus following the same detour promotes the retained candidate.
      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 10 * 60 * 1000;
      result = runTicks([bus2West], CONSECUTIVE_READINGS_REQUIRED);
      processVehicles([bus2Mid], shapes, routeShapeMapping);
      result = processVehicles([bus2East], shapes, routeShapeMapping);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
      expect(result['route-1'].uniqueVehicleCount).toBe(2);
      expect(result['route-1'].currentVehicleCount).toBe(1);
      expect(result['route-1'].vehicleCount).toBe(2);
      expect(result['route-1'].geometry.confidence).toBe('medium');
    } finally {
      Date.now = realDateNow;
    }
  });

  test('retained detour does not clear after candidate evidence TTL without normal-route GPS proof', () => {
    const realDateNow = Date.now;
    const BASE_TIME = Date.parse('2026-05-12T13:30:00Z');

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone('bus-1');

      Date.now = () => BASE_TIME + DETOUR_CANDIDATE_EVIDENCE_TTL_MS + 6 * 60 * 1000;
      const result = processVehicles([], shapes, routeShapeMapping);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
      expect(result['route-1'].currentVehicleCount).toBe(0);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('new vehicle on same route keeps detour active after stale prune', () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      // bus-1 triggers detour
      confirmDetour(bus1);

      // bus-1 goes stale
      Date.now = () => BASE_TIME + 6 * 60 * 1000;
      processVehicles([], shapes, routeShapeMapping);

      // bus-2 appears off-route on same route — detour stays active
      Date.now = () => BASE_TIME + 7 * 60 * 1000;
      let result;
      for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED; i++) {
        result = processVehicles([bus2], shapes, routeShapeMapping);
      }
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
      expect(result['route-1'].vehiclesOffRoute.has('bus-2')).toBe(true);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('retained medium detour clears only after a normal route traversal through the zone', () => {
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone('bus-1');

      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 6 * 60 * 1000;
      processVehicles([], shapes, routeShapeMapping);

      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 10 * 60 * 1000;
      runTicks([makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_WEST })], CONSECUTIVE_READINGS_REQUIRED);
      processVehicles([makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_MID })], shapes, routeShapeMapping);
      processVehicles([makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_EAST })], shapes, routeShapeMapping);

      // Bus 2 leaves; no clear should happen just because the detour has no current vehicle.
      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 16 * 60 * 1000;
      let result = processVehicles([], shapes, routeShapeMapping);
      expect(result['route-1'].uniqueVehicleCount).toBe(2);
      expect(result['route-1'].currentVehicleCount).toBe(0);

      // A different vehicle traverses the normal route inside the suspected zone.
      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 17 * 60 * 1000;
      result = runOnRouteTraversal('bus-3');
      expect(result['route-1'].state).toBe('clear-pending');

      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 17 * 60 * 1000 + 1000;
      result = processVehicles([makeVehicle({ id: 'bus-3', coordinate: ON_ROUTE_ZONE_EAST })], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('skip vehicles with no routeId', () => {
  test('vehicle with null routeId does not crash or create state', () => {
    const noRouteVehicle = makeVehicle({ routeId: null });

    const result = processVehicles([noRouteVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('vehicle with undefined routeId does not crash or create state', () => {
    const noRouteVehicle = makeVehicle({ routeId: undefined });

    const result = processVehicles([noRouteVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('clearVehicleState', () => {
  test('resets consecutive off-route counts so detour requires fresh confirmation ticks', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    // Build up readings just below the threshold (not yet a detour)
    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED - 1; i++) {
      processVehicles([offVehicle], shapes, routeShapeMapping);
    }

    // Clear state — should reset the consecutive counter
    clearVehicleState();

    // After clear, 1 more tick should NOT trigger detour
    const result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);

    // Need full threshold from fresh start to trigger
    for (let i = 1; i < CONSECUTIVE_READINGS_REQUIRED - 1; i++) {
      processVehicles([offVehicle], shapes, routeShapeMapping);
    }
    const result2 = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result2)).toHaveLength(1);
    expect(result2['route-1']).toBeDefined();
  });
});

describe('multiple vehicles on same route', () => {
  test('two off-route vehicles both counted in detour vehiclesOffRoute set', () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });

    // Confirm off-route for both vehicles
    const result = runTicks([bus1, bus2], CONSECUTIVE_READINGS_REQUIRED);

    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].vehiclesOffRoute.size).toBe(2);
  });

  test('detour persists when one vehicle returns but another stays off-route', () => {
    // Build detour with spread evidence from both buses
    runTicks([
      makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_WEST }),
      makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_WEST }),
    ], CONSECUTIVE_READINGS_REQUIRED);
    processVehicles([
      makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_MID }),
      makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_MID }),
    ], shapes, routeShapeMapping);
    processVehicles([
      makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_EAST }),
      makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_EAST }),
    ], shapes, routeShapeMapping);

    // bus-1 returns on-route in zone, bus-2 stays off — detour stays active
    const result = processVehicles([
      makeVehicle({ id: 'bus-1', coordinate: ON_ROUTE_IN_ZONE }),
      makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_MID }),
    ], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].state).toBe('active');
  });

  test('hybrid clearing: route clears when all vehicles meet on-route threshold', () => {
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      // Build detour with spread evidence from both buses
      runTicks([
        makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_WEST }),
        makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_WEST }),
      ], CONSECUTIVE_READINGS_REQUIRED);
      processVehicles([
        makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_MID }),
        makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_MID }),
      ], shapes, routeShapeMapping);
      processVehicles([
        makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_EAST }),
        makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_EAST }),
      ], shapes, routeShapeMapping);

      // Advance past grace
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Both traverse the regular route through the affected segment.
      let result = runOnRouteTraversalForVehicles(['bus-1', 'bus-2']);
      // Should be in clear-pending
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('clear-pending');

      // Next tick finalizes
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      result = processVehicles([
        makeVehicle({ id: 'bus-1', coordinate: ON_ROUTE_ZONE_EAST }),
        makeVehicle({ id: 'bus-2', coordinate: ON_ROUTE_ZONE_EAST }),
      ], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('minimum unique vehicle threshold', () => {
  beforeEach(() => {
    clearVehicleState();
    setMinVehicles(2);
  });

  afterEach(() => {
    clearVehicleState();
  });

  test('does not publish a detour from a single confirmed vehicle', () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });

    const result = runTicks([bus1], CONSECUTIVE_READINGS_REQUIRED + 2);

    expect(Object.keys(result)).toHaveLength(0);
    expect(getState().activeDetourCount).toBe(0);
  });

  test('publishes once two unique vehicles confirm the same route detour', () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });

    expect(runTicks([bus1], CONSECUTIVE_READINGS_REQUIRED)).toEqual({});

    const result = runTicks([bus1, bus2], CONSECUTIVE_READINGS_REQUIRED);

    expect(result['route-1']).toBeDefined();
    expect(result['route-1'].vehiclesOffRoute.size).toBe(2);
    expect(getState().activeDetourCount).toBe(1);
  });
});

describe('vehicle switching routes', () => {
  test('switching routes keeps old detour active (does not trigger clear-pending)', () => {
    // Add a second route shape
    shapes.set('shape-2', [
      { latitude: 44.40, longitude: -79.70 },
      { latitude: 44.40, longitude: -79.69 },
      { latitude: 44.40, longitude: -79.68 },
    ]);
    routeShapeMapping.set('route-2', ['shape-2']);

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      const busRoute1 = makeVehicle({ id: 'bus-1', routeId: 'route-1', coordinate: OFF_ROUTE_COORD });

      // Build detour on route-1
      let result = confirmDetour(busRoute1);
      expect(result['route-1']).toBeDefined();

      // Advance past grace but within no-vehicle timeout
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Vehicle switches to route-2 — old detour stays active (not clear-pending)
      const busRoute2 = makeVehicle({ id: 'bus-1', routeId: 'route-2', coordinate: OFF_ROUTE_COORD });
      result = processVehicles([busRoute2], shapes, routeShapeMapping);

      expect(result['route-1']).toBeDefined();
      expect(result['route-1'].state).toBe('active');
      // route-2 not yet triggered (counter reset)
      expect(result['route-2']).toBeUndefined();

      // Advance past no-vehicle timeout — route-1 retains evidence instead of clearing.
      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 1000;
      result = processVehicles([busRoute2], shapes, routeShapeMapping);
      expect(result['route-1']).toBeDefined();
      expect(result['route-1'].state).toBe('active');

      // Next tick: route-1 still waits for either confirming evidence or normal-route traversal.
      Date.now = () => BASE_TIME + DETOUR_NO_VEHICLE_TIMEOUT_MS + 2000;
      result = processVehicles([busRoute2], shapes, routeShapeMapping);
      expect(result['route-1']).toBeDefined();
      expect(result['route-1'].state).toBe('active');
    } finally {
      Date.now = realDateNow;
      shapes.delete('shape-2');
      routeShapeMapping.delete('route-2');
    }
  });
});

describe('minimum unique vehicle env config', () => {
  test('honors DETOUR_MIN_UNIQUE_VEHICLES during module initialization', () => {
    const originalMinVehicles = process.env.DETOUR_MIN_UNIQUE_VEHICLES;

    try {
      process.env.DETOUR_MIN_UNIQUE_VEHICLES = '2';
      jest.resetModules();

      const detector = require('../detourDetector');
      detector.clearVehicleState();

      const vehicle = makeVehicle({ id: 'env-bus-1', coordinate: OFF_ROUTE_COORD });
      let result = {};
      for (let i = 0; i < detector.CONSECUTIVE_READINGS_REQUIRED + 2; i++) {
        result = detector.processVehicles([vehicle], shapes, routeShapeMapping);
      }

      expect(Object.keys(result)).toHaveLength(0);
      expect(detector.getState().activeDetourCount).toBe(0);
    } finally {
      if (originalMinVehicles === undefined) {
        delete process.env.DETOUR_MIN_UNIQUE_VEHICLES;
      } else {
        process.env.DETOUR_MIN_UNIQUE_VEHICLES = originalMinVehicles;
      }
      jest.resetModules();
    }
  });

  test('current DETOUR_MIN_UNIQUE_VEHICLES overrides weaker persisted runtime state', () => {
    const originalMinVehicles = process.env.DETOUR_MIN_UNIQUE_VEHICLES;

    try {
      process.env.DETOUR_MIN_UNIQUE_VEHICLES = '2';
      jest.resetModules();

      const detector = require('../detourDetector');
      detector.clearVehicleState();
      detector.hydrateRuntimeState({
        version: 1,
        savedAt: Date.now(),
        minVehiclesForDetour: 1,
        vehicles: [],
        routes: [],
      });

      const vehicle = makeVehicle({ id: 'persisted-threshold-bus-1', coordinate: OFF_ROUTE_COORD });
      let result = {};
      for (let i = 0; i < detector.CONSECUTIVE_READINGS_REQUIRED + 2; i++) {
        result = detector.processVehicles([vehicle], shapes, routeShapeMapping);
      }

      expect(Object.keys(result)).toHaveLength(0);
      expect(detector.getState().activeDetourCount).toBe(0);
    } finally {
      if (originalMinVehicles === undefined) {
        delete process.env.DETOUR_MIN_UNIQUE_VEHICLES;
      } else {
        process.env.DETOUR_MIN_UNIQUE_VEHICLES = originalMinVehicles;
      }
      jest.resetModules();
    }
  });
});

describe('vehicle with no matching shapes', () => {
  test('vehicle on unknown route is skipped without error', () => {
    const unknownRoute = makeVehicle({ routeId: 'route-unknown', coordinate: OFF_ROUTE_COORD });

    const result = processVehicles([unknownRoute], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('vehicle with null coordinate', () => {
  test('vehicle with null coordinate is skipped', () => {
    const noCoord = makeVehicle({ coordinate: null });
    const result = processVehicles([noCoord], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('intermittent off-route readings', () => {
  test('returning on-route mid-streak resets off-route counter', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    // Build up readings just below the threshold
    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED - 1; i++) {
      processVehicles([offVehicle], shapes, routeShapeMapping);
    }

    // 1 on-route reading — resets off-route counter
    processVehicles([onVehicle], shapes, routeShapeMapping);

    // Off-route readings after reset — below threshold, should not trigger
    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED - 1; i++) {
      const result = processVehicles([offVehicle], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    }

    // Final consecutive off-route after reset — NOW triggers
    const result2 = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result2)).toHaveLength(1);
  });
});

describe('getState with detour states', () => {
  test('getState includes state and detourStates fields', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offVehicle);

    const state = getState();
    expect(state.detours['route-1'].state).toBe('active');
    expect(state.detourStates['route-1']).toBe('active');
  });

  test('getState reflects clear-pending state', () => {
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      runOnRouteTraversal();

      const state = getState();
      expect(state.detourStates['route-1']).toBe('clear-pending');
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('evidence capture', () => {
  test('evidence is collected after detour confirmation', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offVehicle);

    const evidence = getDetourEvidence();
    expect(evidence['route-1']).toBeDefined();
    // The confirming snapshot includes the pre-confirmation off-route streak.
    expect(evidence['route-1'].pointCount).toBe(CONSECUTIVE_READINGS_REQUIRED);
  });

  test('evidence is cleared by clearVehicleState', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offVehicle);

    expect(getDetourEvidence()['route-1']).toBeDefined();

    clearVehicleState();

    const evidence = getDetourEvidence();
    expect(evidence['route-1']).toBeUndefined();
  });

  test('evidence accumulates across multiple ticks', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offVehicle); // includes the pre-confirmation streak
    // 3 more ticks — each adds 1 evidence point (consecutiveOffRoute >= threshold)
    runTicks([offVehicle], 3);

    const evidence = getDetourEvidence();
    expect(evidence['route-1'].pointCount).toBe(CONSECUTIVE_READINGS_REQUIRED + 3);
  });

  test('evidence from multiple vehicles is captured', () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    runTicks([bus1, bus2], CONSECUTIVE_READINGS_REQUIRED);

    const evidence = getDetourEvidence();
    // Each vehicle contributes its pre-confirmation streak on the confirming tick.
    expect(evidence['route-1'].pointCount).toBe(CONSECUTIVE_READINGS_REQUIRED * 2);
  });

  test('stale evidence is pruned after evidence window', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);
      expect(getDetourEvidence()['route-1'].pointCount).toBe(CONSECUTIVE_READINGS_REQUIRED);

      // Advance past evidence window
      Date.now = () => BASE_TIME + EVIDENCE_WINDOW_MS + 1000;
      // Add new evidence — old should be pruned
      processVehicles([offVehicle], shapes, routeShapeMapping);

      const evidence = getDetourEvidence();
      // Only the latest point should survive (old 1 pruned)
      expect(evidence['route-1'].pointCount).toBe(1);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('evidence is cleaned up when detour is finalized', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();
      expect(getDetourEvidence()['route-1']).toBeDefined();

      // Clear the detour via same-bus regular-route traversal.
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      runOnRouteTraversal();

      // Finalize
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      processVehicles([makeVehicle({ coordinate: ON_ROUTE_ZONE_EAST })], shapes, routeShapeMapping);

      const evidence = getDetourEvidence();
      expect(evidence['route-1']).toBeUndefined();
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('geometry in snapshot', () => {
  test('processVehicles result includes geometry field', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const result = confirmDetour(offVehicle);

    expect(result['route-1']).toBeDefined();
    expect(result['route-1'].geometry).toBeDefined();
  });

  test('geometry has expected structure', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    // Run enough ticks for reasonable geometry
    runTicks([offVehicle], 5);

    const result = processVehicles([offVehicle], shapes, routeShapeMapping);
    const geo = result['route-1'].geometry;

    expect(geo).toHaveProperty('skippedSegmentPolyline');
    expect(geo).toHaveProperty('inferredDetourPolyline');
    expect(geo).toHaveProperty('entryPoint');
    expect(geo).toHaveProperty('exitPoint');
    expect(geo).toHaveProperty('confidence');
    expect(geo).toHaveProperty('evidencePointCount');
    expect(geo).toHaveProperty('lastEvidenceAt');
    expect(geo).toHaveProperty('canShowDetourPath');
  });

  test('first confirmed detour includes pre-confirmation off-route evidence for renderable geometry', () => {
    const realDateNow = Date.now;
    const baseTime = realDateNow();
    const coordinates = [
      OFF_ROUTE_WEST,
      OFF_ROUTE_MID,
      OFF_ROUTE_EAST,
      OFF_ROUTE_EAST,
    ];

    try {
      let result = {};
      for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED; i++) {
        Date.now = () => baseTime + i * 30_000;
        result = processVehicles([
          makeVehicle({
            coordinate: coordinates[i] || OFF_ROUTE_EAST,
          }),
        ], shapes, routeShapeMapping);
      }

      const geo = result['route-1']?.geometry;
      expect(geo).toBeDefined();
      expect(geo.evidencePointCount).toBeGreaterThanOrEqual(3);
      expect(geo.segments.length).toBeGreaterThanOrEqual(1);
      expect(
        geo.skippedSegmentPolyline?.length >= 2 ||
        geo.inferredDetourPolyline?.length >= 2
      ).toBe(true);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('geometry is present on clear-pending snapshots', () => {
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      const result = runOnRouteTraversal();

      expect(result['route-1'].state).toBe('clear-pending');
      expect(result['route-1'].geometry).toBeDefined();
    } finally {
      Date.now = realDateNow;
    }
  });

  test('getActiveDetours without shapes returns geometry as null', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    confirmDetour(offVehicle);

    const result = getActiveDetours();
    expect(result['route-1'].geometry).toBeNull();
  });
});

describe('multiple same-route detour segments', () => {
  test('separate same-route detours with on-route travel between them stay as two segments', () => {
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();
    const eastA = { latitude: 44.395, longitude: -79.684 };
    const eastB = { latitude: 44.395, longitude: -79.682 };

    try {
      Date.now = () => BASE_TIME;
      [
        OFF_ROUTE_WEST,
        OFF_ROUTE_WEST,
        OFF_ROUTE_MID,
        OFF_ROUTE_MID,
        OFF_ROUTE_WEST,
        OFF_ROUTE_MID,
      ].forEach((coordinate) => {
        processVehicles([makeVehicle({ coordinate })], shapes, routeShapeMapping);
      });

      Date.now = () => BASE_TIME + 60_000;
      processVehicles([makeVehicle({ coordinate: ON_ROUTE_COORD })], shapes, routeShapeMapping);
      processVehicles([makeVehicle({ coordinate: ON_ROUTE_COORD })], shapes, routeShapeMapping);

      Date.now = () => BASE_TIME + 120_000;
      let result;
      [
        eastA,
        eastA,
        eastB,
        eastB,
        eastA,
        eastB,
      ].forEach((coordinate) => {
        result = processVehicles([makeVehicle({ coordinate })], shapes, routeShapeMapping);
      });

      expect(result['route-1']).toBeDefined();
      expect(result['route-1'].state).toBe('active');
      expect(result['route-1'].geometry.segments).toHaveLength(2);

      const segmentCenters = result['route-1'].geometry.segments
        .map((segment) => ((segment.entryPoint?.longitude ?? 0) + (segment.exitPoint?.longitude ?? 0)) / 2)
        .sort((a, b) => a - b);

      expect(segmentCenters[0]).toBeLessThan(-79.686);
      expect(segmentCenters[1] - segmentCenters[0]).toBeGreaterThan(0.003);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('recurring short deviations', () => {
  test('publishes a detour after repeated short off-route streaks across trips', () => {
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();
    const tripMapping = new Map([
      ['trip-short-1', { routeId: 'route-1', shapeId: 'shape-1', headsign: 'Loop', directionId: 0 }],
      ['trip-short-2', { routeId: 'route-1', shapeId: 'shape-1', headsign: 'Loop', directionId: 0 }],
      ['trip-short-3', { routeId: 'route-1', shapeId: 'shape-1', headsign: 'Loop', directionId: 0 }],
    ]);

    const runShortDeviation = (index) => {
      const id = `short-bus-${index}`;
      const tripId = `trip-short-${index}`;
      const offset = (index - 1) * 20 * 60_000;

      Date.now = () => BASE_TIME + offset;
      let result = processVehicles([
        makeVehicle({ id, tripId, coordinate: OFF_ROUTE_WEST }),
      ], shapes, routeShapeMapping, tripMapping);
      expect(Object.keys(result)).toHaveLength(0);

      Date.now = () => BASE_TIME + offset + 30_000;
      result = processVehicles([
        makeVehicle({ id, tripId, coordinate: OFF_ROUTE_MID }),
      ], shapes, routeShapeMapping, tripMapping);
      expect(Object.keys(result)).toHaveLength(0);

      Date.now = () => BASE_TIME + offset + 60_000;
      return processVehicles([
        makeVehicle({ id, tripId, coordinate: ON_ROUTE_IN_ZONE }),
      ], shapes, routeShapeMapping, tripMapping);
    };

    try {
      expect(Object.keys(runShortDeviation(1))).toHaveLength(0);
      expect(Object.keys(runShortDeviation(2))).toHaveLength(0);

      const result = runShortDeviation(3);
      expect(result['route-1']).toBeDefined();
      expect(result['route-1'].state).toBe('active');
      expect(result['route-1'].vehicleCount).toBe(3);
      expect(result['route-1'].uniqueVehicleCount).toBe(3);
      expect(result['route-1'].currentVehicleCount).toBe(0);
      expect(result['route-1'].geometry.evidencePointCount).toBeGreaterThanOrEqual(6);
      expect(result['route-1'].geometry.segments.length).toBeGreaterThanOrEqual(1);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('zone-aware clearing', () => {
  test('does not clear when a bus only appears at one point in the detour zone', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      const result = runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE * 2);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
    } finally {
      Date.now = realDateNow;
    }
  });

  test('on-route outside zone core does NOT clear detour', () => {
    const onVehicleOutsideZone = makeVehicle({ coordinate: ON_ROUTE_OUTSIDE_ZONE });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      // Advance past grace period
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Run many on-route-outside-zone ticks — should never clear
      const result = runTicks([onVehicleOutsideZone], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE * 3);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
    } finally {
      Date.now = realDateNow;
    }
  });

  test('no zone data does not clear without a known affected segment', () => {
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      // confirmDetour produces only 1 evidence point — not enough for zone
      confirmDetour();

      // Advance past grace period
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // With sparse evidence and no computed zone, route should not clear.
      const result = runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE * 2);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
    } finally {
      Date.now = realDateNow;
    }
  });

  test('rich evidence clears only after a same-bus regular-route traversal', () => {
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Scenario 1: sparse evidence (1 point) does not clear because the affected segment is unknown.
      Date.now = () => BASE_TIME;
      confirmDetour(); // 1 evidence point

      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      const onVehicle = makeVehicle({ coordinate: ON_ROUTE_IN_ZONE });
      let result = runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE * 2);
      expect(result['route-1'].state).toBe('active');

      // Scenario 2: fresh start with rich evidence also clears.
      clearVehicleState();
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      confirmDetourWithZone(); // 3 spread evidence points

      Date.now = () => BASE_TIME + 2 * DETOUR_CLEAR_GRACE_MS + 3000;
      result = runOnRouteTraversal();
      expect(result['route-1'].state).toBe('clear-pending');
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('trip-aware shape resolution', () => {
  const multiShapes = new Map([
    ['shape-main', [
      { latitude: 44.39, longitude: -79.700 },
      { latitude: 44.39, longitude: -79.698 },
      { latitude: 44.39, longitude: -79.696 },
      { latitude: 44.39, longitude: -79.694 },
      { latitude: 44.39, longitude: -79.692 },
      { latitude: 44.39, longitude: -79.690 },
    ]],
    ['shape-variant-north', [
      { latitude: 44.395, longitude: -79.700 },
      { latitude: 44.395, longitude: -79.698 },
      { latitude: 44.395, longitude: -79.696 },
      { latitude: 44.395, longitude: -79.694 },
      { latitude: 44.395, longitude: -79.692 },
      { latitude: 44.395, longitude: -79.690 },
    ]],
    ['shape-variant-south', [
      { latitude: 44.385, longitude: -79.700 },
      { latitude: 44.385, longitude: -79.698 },
      { latitude: 44.385, longitude: -79.696 },
    ]],
  ]);
  const multiRouteMapping = new Map([
    ['route-8', ['shape-main', 'shape-variant-north', 'shape-variant-south']],
  ]);
  const tripMapping = new Map([
    ['trip-100', { routeId: 'route-8', shapeId: 'shape-main' }],
  ]);

  const offRouteForAssignedShape = { latitude: 44.395, longitude: -79.695 };

  it('detects detour when bus is near a non-assigned shape variant', () => {
    clearVehicleState();
    const vehicle = {
      id: 'bus-trip-aware',
      routeId: 'route-8',
      tripId: 'trip-100',
      coordinate: offRouteForAssignedShape,
    };

    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED; i++) {
      processVehicles([vehicle], multiShapes, multiRouteMapping, tripMapping);
    }

    const state = getState();
    expect(state.activeDetourCount).toBe(1);
    expect(state.detours['route-8']).toBeDefined();
  });

  it('falls back to all shapes when tripId is missing', () => {
    clearVehicleState();
    const vehicle = {
      id: 'bus-no-trip',
      routeId: 'route-8',
      tripId: null,
      coordinate: offRouteForAssignedShape,
    };

    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED; i++) {
      processVehicles([vehicle], multiShapes, multiRouteMapping, tripMapping);
    }

    const state = getState();
    expect(state.activeDetourCount).toBe(0);
  });

  it('falls back to all shapes when tripId is not in mapping', () => {
    clearVehicleState();
    const vehicle = {
      id: 'bus-unknown-trip',
      routeId: 'route-8',
      tripId: 'trip-unknown',
      coordinate: offRouteForAssignedShape,
    };

    for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED; i++) {
      processVehicles([vehicle], multiShapes, multiRouteMapping, tripMapping);
    }

    const state = getState();
    expect(state.activeDetourCount).toBe(0);
  });

  it('keeps snapshot geometry on the assigned trip shape when a nearby sibling shape is closer', () => {
    clearVehicleState();

    const hintedShapes = new Map([
      ['shape-main', [
        { latitude: 44.39, longitude: -79.700 },
        { latitude: 44.39, longitude: -79.695 },
        { latitude: 44.39, longitude: -79.690 },
        { latitude: 44.39, longitude: -79.685 },
      ]],
      ['shape-branch', [
        { latitude: 44.3909, longitude: -79.700 },
        { latitude: 44.3909, longitude: -79.695 },
        { latitude: 44.3909, longitude: -79.690 },
        { latitude: 44.3909, longitude: -79.685 },
      ]],
    ]);
    const hintedRouteMapping = new Map([
      ['route-hinted', ['shape-main', 'shape-branch']],
    ]);
    const hintedTripMapping = new Map([
      ['trip-branch', { routeId: 'route-hinted', shapeId: 'shape-branch' }],
    ]);
    const coords = [-79.699, -79.697, -79.695, -79.693, -79.691, -79.689];

    let result = {};
    coords.forEach((longitude) => {
      result = processVehicles([{
        id: 'bus-trip-shape',
        routeId: 'route-hinted',
        tripId: 'trip-branch',
        coordinate: { latitude: 44.3902, longitude },
      }], hintedShapes, hintedRouteMapping, hintedTripMapping);
    });

    expect(result['route-hinted']).toBeDefined();
    expect(result['route-hinted'].geometry).toBeDefined();
    expect(result['route-hinted'].geometry.shapeId).toBe('shape-branch');
    expect(result['route-hinted'].geometry.entryPoint).not.toBeNull();
    expect(result['route-hinted'].geometry.exitPoint).not.toBeNull();
    expect(result['route-hinted'].geometry.entryPoint.latitude).toBeCloseTo(44.3909, 3);
    expect(result['route-hinted'].geometry.exitPoint.latitude).toBeCloseTo(44.3909, 3);
  });
});

const {
  isWithinServiceHours,
  setMinVehicles,
  resolveRouteDetectorConfig,
  ROUTE_DETECTOR_OVERRIDES,
} = require('../detourDetector');

describe('route-specific detector tuning', () => {
  test('uses default detector thresholds for route 8 branches', () => {
    const config8A = resolveRouteDetectorConfig('8A');
    const configDefault = resolveRouteDetectorConfig('route-1');

    expect(ROUTE_DETECTOR_OVERRIDES['8A']).toBeUndefined();
    expect(config8A.offRouteThresholdMeters).toBe(configDefault.offRouteThresholdMeters);
    expect(config8A.onRouteClearThresholdMeters).toBe(configDefault.onRouteClearThresholdMeters);
    expect(config8A.consecutiveReadingsRequired).toBe(configDefault.consecutiveReadingsRequired);
    expect(config8A.evidenceWindowMs).toBe(configDefault.evidenceWindowMs);
  });

  test('does not detect the small route 8 detour on default-tuned routes', () => {
    const vehicle = makeVehicle({
      id: 'bus-default-small-detour',
      routeId: 'route-1',
      coordinate: SMALL_DETOUR_COORD,
    });

    const result = runTicks([vehicle], CONSECUTIVE_READINGS_REQUIRED + 2);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('does not detect the small route 8A deviation with default tuning', () => {
    const config8A = resolveRouteDetectorConfig('8A');
    const vehicle = makeVehicle({
      id: 'bus-8a-small-detour',
      routeId: '8A',
      coordinate: SMALL_DETOUR_COORD,
    });

    const result = runTicks([vehicle], config8A.consecutiveReadingsRequired);
    expect(result['8A']).toBeUndefined();
  });
});

describe('isWithinServiceHours', () => {
  // Service window: 5 AM - 1 AM (next day), America/Toronto

  test('returns true during midday (10 AM EST)', () => {
    // 2026-03-04 10:00 AM EST = 15:00 UTC
    const midday = new Date('2026-03-04T15:00:00Z').getTime();
    expect(isWithinServiceHours(midday)).toBe(true);
  });

  test('returns true at 11 PM EST (before midnight)', () => {
    // 2026-03-04 11:00 PM EST = 2026-03-05 04:00 UTC
    const lateNight = new Date('2026-03-05T04:00:00Z').getTime();
    expect(isWithinServiceHours(lateNight)).toBe(true);
  });

  test('returns true at 12:30 AM EST (before 1 AM cutoff)', () => {
    // 2026-03-05 00:30 AM EST = 2026-03-05 05:30 UTC
    const pastMidnight = new Date('2026-03-05T05:30:00Z').getTime();
    expect(isWithinServiceHours(pastMidnight)).toBe(true);
  });

  test('returns false at 3 AM EST (outside service)', () => {
    // 2026-03-05 03:00 AM EST = 2026-03-05 08:00 UTC
    const offHours = new Date('2026-03-05T08:00:00Z').getTime();
    expect(isWithinServiceHours(offHours)).toBe(false);
  });

  test('returns false at 2 AM EST (outside service)', () => {
    // 2026-03-05 02:00 AM EST = 2026-03-05 07:00 UTC
    const offHours = new Date('2026-03-05T07:00:00Z').getTime();
    expect(isWithinServiceHours(offHours)).toBe(false);
  });

  test('returns true at 5 AM EST (service start boundary)', () => {
    // 2026-03-04 05:00 AM EST = 2026-03-04 10:00 UTC
    const serviceStart = new Date('2026-03-04T10:00:00Z').getTime();
    expect(isWithinServiceHours(serviceStart)).toBe(true);
  });

  test('returns false at 1 AM EST (service end boundary)', () => {
    // 2026-03-05 01:00 AM EST = 2026-03-05 06:00 UTC
    const serviceEnd = new Date('2026-03-05T06:00:00Z').getTime();
    expect(isWithinServiceHours(serviceEnd)).toBe(false);
  });
});

describe('service hours guard', () => {
  beforeEach(() => clearVehicleState());

  test('processVehicles retains detours at service end and ignores vehicles outside service hours', () => {
    const originalNow = Date.now;

    try {
      const oneAmEst = new Date('2026-03-05T06:00:00Z').getTime();
      const sevenMinBeforeServiceEnd = oneAmEst - 7 * 60 * 1000;

      // Build a high-confidence detour before service ends.
      const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
      const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
      for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED + 6; i++) {
        Date.now = () => sevenMinBeforeServiceEnd + i * 30000;
        processVehicles([bus1, bus2], shapes, routeShapeMapping);
      }

      const before = getState();
      expect(before.activeDetourCount).toBe(1);

      // First off-service tick freezes active state instead of clearing without GPS proof.
      Date.now = () => oneAmEst;
      let result = processVehicles([], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
      expect(result['route-1'].currentVehicleCount).toBe(0);
      expect(getState().activeDetourCount).toBe(1);

      // Later off-service ticks ignore new off-route vehicles.
      const threeAmEst = new Date('2026-03-05T08:00:00Z').getTime();
      const newVehicle = makeVehicle({ id: 'bus-3', coordinate: OFF_ROUTE_COORD });
      for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED + 2; i++) {
        Date.now = () => threeAmEst + i * 30000;
        result = processVehicles([newVehicle], shapes, routeShapeMapping);
      }

      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].currentVehicleCount).toBe(0);
      expect(getState().activeDetourCount).toBe(1);
    } finally {
      Date.now = originalNow;
    }
  });

  test('processVehicles resumes normal processing during service hours', () => {
    const tenAmEst = new Date('2026-03-04T15:00:00Z').getTime();
    const originalNow = Date.now;

    try {
      Date.now = () => tenAmEst;

      const offRouteVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
      confirmDetour(offRouteVehicle);
      const state = getState();
      expect(state.activeDetourCount).toBe(1);
    } finally {
      Date.now = originalNow;
    }
  });

  test('Route 12 publishes medium-confidence path alerts when one bus in each direction repeats the same short detour area', () => {
    const route12Shapes = new Map(shapes);
    route12Shapes.set('shape-12a', [
      { latitude: 44.39, longitude: -79.700 },
      { latitude: 44.39, longitude: -79.696 },
      { latitude: 44.39, longitude: -79.692 },
      { latitude: 44.39, longitude: -79.688 },
      { latitude: 44.39, longitude: -79.684 },
      { latitude: 44.39, longitude: -79.680 },
    ]);
    route12Shapes.set('shape-12b', [
      { latitude: 44.39, longitude: -79.680 },
      { latitude: 44.39, longitude: -79.684 },
      { latitude: 44.39, longitude: -79.688 },
      { latitude: 44.39, longitude: -79.692 },
      { latitude: 44.39, longitude: -79.696 },
      { latitude: 44.39, longitude: -79.700 },
    ]);

    const route12Mapping = new Map(routeShapeMapping);
    route12Mapping.set('12A', ['shape-12a']);
    route12Mapping.set('12B', ['shape-12b']);

    const tripMapping = new Map([
      ['trip-12a', { routeId: '12A', shapeId: 'shape-12a', headsign: 'A', directionId: 0 }],
      ['trip-12b', { routeId: '12B', shapeId: 'shape-12b', headsign: 'B', directionId: 1 }],
    ]);

    const offRouteSameArea = { latitude: 44.391, longitude: -79.690 };
    const onRouteSameArea = { latitude: 44.39, longitude: -79.690 };
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    const runOneShortDeviation = ({ routeId, tripId, vehicleId, offsetMs }) => {
      Date.now = () => BASE_TIME + offsetMs;
      let result = processVehicles([
        makeVehicle({ id: vehicleId, routeId, tripId, coordinate: offRouteSameArea }),
      ], route12Shapes, route12Mapping, tripMapping);
      expect(result[routeId]).toBeUndefined();

      Date.now = () => BASE_TIME + offsetMs + 60_000;
      return processVehicles([
        makeVehicle({ id: vehicleId, routeId, tripId, coordinate: onRouteSameArea }),
      ], route12Shapes, route12Mapping, tripMapping);
    };

    try {
      expect(Object.keys(runOneShortDeviation({
        routeId: '12A',
        tripId: 'trip-12a',
        vehicleId: 'bus-12a',
        offsetMs: 0,
      }))).toHaveLength(0);

      const result = runOneShortDeviation({
        routeId: '12B',
        tripId: 'trip-12b',
        vehicleId: 'bus-12b',
        offsetMs: 2 * 60_000,
      });

      expect(result['12A']).toBeDefined();
      expect(result['12B']).toBeDefined();
      expect(result['12A'].state).toBe('active');
      expect(result['12B'].state).toBe('active');
      expect(result['12A'].currentVehicleCount).toBe(0);
      expect(result['12B'].currentVehicleCount).toBe(0);
      expect(result['12A'].geometry.confidence).toBe('medium');
      expect(result['12B'].geometry.confidence).toBe('medium');
      expect(result['12A'].geometry.canShowDetourPath).toBe(true);
      expect(result['12B'].geometry.canShowDetourPath).toBe(true);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('end-of-service retention', () => {
  beforeEach(() => clearVehicleState());

  test('retains low-confidence detours at service end', () => {
    const originalNow = Date.now;

    try {
      // Confirm a detour with minimal evidence (low confidence: <5 points, <2 min, 1 vehicle)
      const offRouteVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
      confirmDetour(offRouteVehicle);
      expect(getState().activeDetourCount).toBe(1);

      // Transition to out-of-service
      const oneAmEst = new Date('2026-03-05T06:00:00Z').getTime();
      Date.now = () => oneAmEst;

      processVehicles([], shapes, routeShapeMapping);

      expect(getState().activeDetourCount).toBe(1);
    } finally {
      Date.now = originalNow;
    }
  });

  test('retains high-confidence detours at service end', () => {
    const originalNow = Date.now;

    try {
      const oneAmEst = new Date('2026-03-05T06:00:00Z').getTime();
      const sevenMinBeforeServiceEnd = oneAmEst - 7 * 60 * 1000;

      const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
      const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
      for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED + 6; i++) {
        Date.now = () => sevenMinBeforeServiceEnd + i * 30000;
        processVehicles([bus1, bus2], shapes, routeShapeMapping);
      }

      const before = getState();
      expect(before.activeDetourCount).toBe(1);

      Date.now = () => oneAmEst;
      const result = processVehicles([], shapes, routeShapeMapping);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].currentVehicleCount).toBe(0);
      expect(getState().activeDetourCount).toBe(1);
    } finally {
      Date.now = originalNow;
    }
  });

  test('repeated off-service ticks keep detector state retained and ignore new detections', () => {
    const originalNow = Date.now;

    try {
      const offRouteVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
      confirmDetour(offRouteVehicle);

      const oneAmEst = new Date('2026-03-05T06:00:00Z').getTime();
      Date.now = () => oneAmEst;
      processVehicles([], shapes, routeShapeMapping);
      expect(getState().activeDetourCount).toBe(1);

      Date.now = () => oneAmEst + 30000;
      const result = processVehicles([makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD })], shapes, routeShapeMapping);
      expect(getState().activeDetourCount).toBe(1);
      expect(result['route-1'].currentVehicleCount).toBe(0);
    } finally {
      Date.now = originalNow;
    }
  });
});

describe('learned persistent detours', () => {
  test('learns a long-running detour and seeds it again when service resumes', () => {
    const realDateNow = Date.now;
    const BASE_TIME = new Date('2026-03-14T15:00:00.000Z').getTime(); // 11:00 America/Toronto
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_MID });

    try {
      Date.now = () => BASE_TIME;
      confirmDetourWithZone();

      Date.now = () => BASE_TIME + DETOUR_PERSIST_MIN_AGE_MS + 1000;
      confirmDetourWithZone();
      for (let i = 0; i < DETOUR_PERSIST_CONSECUTIVE_MATCHES; i++) {
        processVehicles([offVehicle], shapes, routeShapeMapping);
      }

      const persistentDetours = getPersistentDetours();
      expect(persistentDetours['route-1']).toBeDefined();
      expect(persistentDetours['route-1'].fingerprint).toBeTruthy();

      // End of service freezes active state and keeps the learned record.
      Date.now = () => new Date('2026-03-14T07:00:00.000Z').getTime(); // 03:00 America/Toronto
      let result = processVehicles([], shapes, routeShapeMapping);
      expect(result['route-1']).toBeDefined();
      expect(result['route-1'].currentVehicleCount).toBe(0);
      expect(getPersistentDetours()['route-1']).toBeDefined();

      // Next service day the retained detour is still available without waiting for a new bus.
      Date.now = () => new Date('2026-03-14T14:00:00.000Z').getTime(); // 10:00 America/Toronto
      result = processVehicles([], shapes, routeShapeMapping);
      expect(result['route-1']).toBeDefined();
      expect(getPersistentDetours()['route-1']).toBeDefined();
    } finally {
      Date.now = realDateNow;
    }
  });

  test('persistent detour only clears after repeated on-route traversal through the learned zone', () => {
    const realDateNow = Date.now;
    const persistedDetectedAt = new Date('2026-03-13T14:00:00.000Z').getTime();

    try {
      hydratePersistentDetours({
        'route-1': {
          fingerprint: 'route-1:shape-1:44.3900:-79.6900:44.3900:-79.6820',
          detectedAt: persistedDetectedAt,
          learnedAt: persistedDetectedAt + 1000,
          updatedAt: persistedDetectedAt + 2000,
          lastSeenAt: persistedDetectedAt + 2000,
          lastEvidenceAt: persistedDetectedAt + 2000,
          geometry: {
            shapeId: 'shape-1',
            segments: [{
              shapeId: 'shape-1',
              entryPoint: { latitude: 44.39, longitude: -79.690 },
              exitPoint: { latitude: 44.39, longitude: -79.682 },
              skippedSegmentPolyline: [
                { latitude: 44.39, longitude: -79.690 },
                { latitude: 44.39, longitude: -79.682 },
              ],
              inferredDetourPolyline: [
                { latitude: 44.395, longitude: -79.690 },
                { latitude: 44.395, longitude: -79.682 },
              ],
            }],
          },
          detourZone: {
            shapeId: 'shape-1',
            entryIndex: 5,
            exitIndex: 9,
            coreStart: 6,
            coreEnd: 8,
          },
        },
      });

      Date.now = () => new Date('2026-03-14T14:00:00.000Z').getTime(); // 10:00 America/Toronto
      let result = processVehicles([], shapes, routeShapeMapping);
      expect(result['route-1']).toBeDefined();

      const persistentClearPath = [
        ON_ROUTE_IN_ZONE,
        { latitude: 44.39, longitude: -79.686 },
        ON_ROUTE_ZONE_EAST,
      ];
      result = runOnRouteTraversal('bus-1', DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE, persistentClearPath);
      expect(result['route-1'].state).toBe('clear-pending');

      Date.now = () => new Date('2026-03-14T14:01:00.000Z').getTime();
      result = processVehicles([makeVehicle({ coordinate: ON_ROUTE_ZONE_EAST })], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
      expect(getPersistentDetours()['route-1']).toBeUndefined();
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('runtime state persistence', () => {
  test('serializes pre-confirmation off-route evidence between run-once ticks', () => {
    const realDateNow = Date.now;
    const baseTime = realDateNow();
    const coordinates = [
      OFF_ROUTE_WEST,
      OFF_ROUTE_MID,
      OFF_ROUTE_EAST,
      OFF_ROUTE_EAST,
    ];

    try {
      for (let i = 0; i < CONSECUTIVE_READINGS_REQUIRED - 1; i++) {
        Date.now = () => baseTime + i * 30_000;
        processVehicles([
          makeVehicle({
            coordinate: coordinates[i],
          }),
        ], shapes, routeShapeMapping);
      }

      const snapshot = serializeDetectorRuntimeState();
      expect(snapshot.vehicles[0].offRouteStreakPoints.length).toBeGreaterThanOrEqual(3);

      clearVehicleState();
      hydrateRuntimeState(snapshot);

      Date.now = () => baseTime + (CONSECUTIVE_READINGS_REQUIRED - 1) * 30_000;
      const result = processVehicles([
        makeVehicle({
          coordinate: coordinates[CONSECUTIVE_READINGS_REQUIRED - 1] || OFF_ROUTE_EAST,
        }),
      ], shapes, routeShapeMapping);

      const geo = result['route-1']?.geometry;
      expect(geo).toBeDefined();
      expect(geo.evidencePointCount).toBeGreaterThanOrEqual(3);
      expect(geo.segments.length).toBeGreaterThanOrEqual(1);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('serializes and hydrates in-flight detector state for run-once execution', () => {
    const realDateNow = Date.now;
    const baseTime = realDateNow();

    try {
      Date.now = () => baseTime;
      confirmDetourWithZone();

      Date.now = () => baseTime + DETOUR_CLEAR_GRACE_MS + 1000;
      runOnRouteTraversal();

      const snapshot = serializeDetectorRuntimeState();

      clearVehicleState();
      expect(Object.keys(getState().detours || {})).toHaveLength(0);

      hydrateRuntimeState(snapshot);
      const restoredState = getState();
      expect(restoredState.detours['route-1']).toBeDefined();
      expect(restoredState.detours['route-1'].state).toBe('clear-pending');

      Date.now = () => baseTime + DETOUR_CLEAR_GRACE_MS + 2000;
      const result = processVehicles([makeVehicle({ coordinate: ON_ROUTE_ZONE_EAST })], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      Date.now = realDateNow;
    }
  });
});
