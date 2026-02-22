const {
  processVehicles,
  clearVehicleState,
  getActiveDetours,
  getState,
  getDetourEvidence,
  DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE,
  DETOUR_CLEAR_GRACE_MS,
  EVIDENCE_WINDOW_MS,
} = require('../detourDetector');

// A simple route shape: straight line east along 44.39 latitude
const shapes = new Map();
shapes.set('shape-1', [
  { latitude: 44.39, longitude: -79.70 },
  { latitude: 44.39, longitude: -79.69 },
  { latitude: 44.39, longitude: -79.68 },
]);

const routeShapeMapping = new Map();
routeShapeMapping.set('route-1', ['shape-1']);

// Off-route: ~555m north of the shape (0.005 deg latitude)
const OFF_ROUTE_COORD = { latitude: 44.395, longitude: -79.695 };
// On-route: directly on the shape (well within 40m clear threshold)
const ON_ROUTE_COORD = { latitude: 44.39, longitude: -79.695 };
// Dead band: ~55m from shape — between 40m clear threshold and 75m detect threshold
const DEAD_BAND_COORD = { latitude: 44.3905, longitude: -79.695 };

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

// Helper: confirm a detour by running 3 off-route ticks
function confirmDetour(vehicle) {
  return runTicks([vehicle || makeVehicle({ coordinate: OFF_ROUTE_COORD })], 3);
}

beforeEach(() => {
  clearVehicleState();
});

describe('3-reading confirmation', () => {
  test('detour only appears after 3 consecutive off-route ticks', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    // Tick 1: off-route — no detour yet
    let result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);

    // Tick 2: still off-route — no detour yet
    result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);

    // Tick 3: still off-route — detour should now appear
    result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1']).toBeDefined();
    expect(result['route-1'].triggerVehicleId).toBe('bus-1');
    expect(result['route-1'].state).toBe('active');
  });
});

describe('hysteresis clearing', () => {
  test('detour does NOT clear on a single on-route tick', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    confirmDetour(offVehicle);

    // Single on-route tick should NOT clear (needs DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE ticks)
    const result = processVehicles([onVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].state).toBe('active');
  });

  test('detour transitions through clear-pending before final clear', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Confirm detour at T=0
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      // Advance past grace period
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Run on-route ticks up to threshold: should enter clear-pending
      let result;
      for (let i = 0; i < DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE; i++) {
        result = processVehicles([onVehicle], shapes, routeShapeMapping);
      }
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
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Confirm detour at T=0
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      // Still within grace period (only 1 min elapsed, need 10 min)
      Date.now = () => BASE_TIME + 60_000;

      // Run enough on-route ticks to exceed the consecutive threshold
      const result = runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE + 2);

      // Detour should persist because grace period hasn't elapsed
      // It enters clear-pending but tickClearPending holds it due to grace
      expect(Object.keys(result)).toHaveLength(1);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('detour held in grace period clears after grace expires', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Confirm detour at T=0
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      // Within grace: vehicle goes on-route, meets consecutive threshold
      // Vehicle stays in vehiclesOffRoute during grace — detour remains active
      Date.now = () => BASE_TIME + 60_000;
      runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE + 2);

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
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      // Confirm detour at T=0
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      // Advance past grace period
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Run on-route ticks to enter clear-pending
      let result = runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE);
      expect(result['route-1'].state).toBe('clear-pending');

      // Vehicle goes off-route again — needs 3 ticks to re-add to detour
      result = runTicks([offVehicle], 3);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('active');
    } finally {
      Date.now = realDateNow;
    }
  });

  test('on-route mid-streak resets consecutiveOnRoute counter', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Run on-route for threshold - 1 ticks
      runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE - 1);

      // One off-route tick resets the on-route counter
      processVehicles([offVehicle], shapes, routeShapeMapping);

      // Now run on-route again — needs full threshold count again
      for (let i = 0; i < DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE - 1; i++) {
        const result = processVehicles([onVehicle], shapes, routeShapeMapping);
        expect(Object.keys(result)).toHaveLength(1);
        expect(result['route-1'].state).toBe('active');
      }

      // This tick hits the threshold — should enter clear-pending
      let result = processVehicles([onVehicle], shapes, routeShapeMapping);
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
  test('stale vehicle transitions detour to clear-pending, not instant delete', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      // Advance past stale timeout (6 min) but within grace period (10 min)
      Date.now = () => BASE_TIME + 6 * 60 * 1000;

      // Process empty — vehicle goes stale, detour transitions to clear-pending
      // but grace period holds it
      let result = processVehicles([], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('clear-pending');

      // Advance past grace period — next tick should finalize
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      result = processVehicles([], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      Date.now = realDateNow;
    }
  });

  test('stale prune after grace period finalizes on next tick', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      // Advance past both stale timeout AND grace period
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 6 * 60 * 1000;

      // First tick: stale prune → clear-pending (observable for this tick)
      let result = processVehicles([], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('clear-pending');

      // Second tick: finalize clear
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 6 * 60 * 1000 + 1000;
      result = processVehicles([], shapes, routeShapeMapping);
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
  test('resets consecutive off-route counts so detour requires fresh 3 ticks', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    // Build up 2 consecutive off-route readings (not yet a detour)
    processVehicles([offVehicle], shapes, routeShapeMapping);
    processVehicles([offVehicle], shapes, routeShapeMapping);

    // Clear state — should reset the consecutive counter
    clearVehicleState();

    // After clear, 1 more tick should NOT trigger detour
    const result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);

    // Need 2 more ticks (total 3 from fresh start) to trigger
    processVehicles([offVehicle], shapes, routeShapeMapping);
    const result2 = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result2)).toHaveLength(1);
    expect(result2['route-1']).toBeDefined();
  });
});

describe('multiple vehicles on same route', () => {
  test('two off-route vehicles both counted in detour vehiclesOffRoute set', () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });

    // 3 ticks with both vehicles off-route
    const result = runTicks([bus1, bus2], 3);

    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].vehiclesOffRoute.size).toBe(2);
  });

  test('detour persists when one vehicle returns but another stays off-route', () => {
    const bus1off = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2off = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    const bus1on = makeVehicle({ id: 'bus-1', coordinate: ON_ROUTE_COORD });

    // Build up detour with both buses
    runTicks([bus1off, bus2off], 3);

    // bus-1 returns on-route, bus-2 stays off — detour stays active
    const result = processVehicles([bus1on, bus2off], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].state).toBe('active');
  });

  test('hybrid clearing: route clears when all vehicles meet on-route threshold', () => {
    const bus1off = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2off = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    const bus1on = makeVehicle({ id: 'bus-1', coordinate: ON_ROUTE_COORD });
    const bus2on = makeVehicle({ id: 'bus-2', coordinate: ON_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      runTicks([bus1off, bus2off], 3);

      // Advance past grace
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Both return on-route — need consecutive ticks to clear
      let result = runTicks([bus1on, bus2on], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE);
      // Should be in clear-pending
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['route-1'].state).toBe('clear-pending');

      // Next tick finalizes
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      result = processVehicles([bus1on, bus2on], shapes, routeShapeMapping);
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('vehicle switching routes', () => {
  test('switching routes transitions old detour to clear-pending', () => {
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

      // Advance past grace
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;

      // Vehicle switches to route-2
      const busRoute2 = makeVehicle({ id: 'bus-1', routeId: 'route-2', coordinate: OFF_ROUTE_COORD });
      result = processVehicles([busRoute2], shapes, routeShapeMapping);

      // route-1 should be clear-pending (not instant delete)
      expect(result['route-1']).toBeDefined();
      expect(result['route-1'].state).toBe('clear-pending');
      // route-2 not yet triggered (counter reset)
      expect(result['route-2']).toBeUndefined();

      // Next tick: route-1 clears, route-2 still building
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      result = processVehicles([busRoute2], shapes, routeShapeMapping);
      expect(result['route-1']).toBeUndefined();
    } finally {
      Date.now = realDateNow;
      shapes.delete('shape-2');
      routeShapeMapping.delete('route-2');
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

    // 2 off-route readings
    processVehicles([offVehicle], shapes, routeShapeMapping);
    processVehicles([offVehicle], shapes, routeShapeMapping);

    // 1 on-route reading — resets off-route counter
    processVehicles([onVehicle], shapes, routeShapeMapping);

    // 2 more off-route readings — should still not trigger (only 2, not 3)
    processVehicles([offVehicle], shapes, routeShapeMapping);
    const result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);

    // 3rd consecutive off-route after reset — NOW triggers
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
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE);

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
    // Only tick 3 triggers addVehicleToDetour (when consecutiveOffRoute hits 3)
    expect(evidence['route-1'].pointCount).toBe(1);
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
    confirmDetour(offVehicle); // 1 point on tick 3
    // 3 more ticks — each adds 1 evidence point (consecutiveOffRoute >= 3)
    runTicks([offVehicle], 3);

    const evidence = getDetourEvidence();
    expect(evidence['route-1'].pointCount).toBe(4); // 1 initial + 3 more
  });

  test('evidence from multiple vehicles is captured', () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    runTicks([bus1, bus2], 3);

    const evidence = getDetourEvidence();
    // Each vehicle hits threshold on tick 3, contributing 1 point each = 2 total
    expect(evidence['route-1'].pointCount).toBe(2);
  });

  test('stale evidence is pruned after evidence window', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);
      expect(getDetourEvidence()['route-1'].pointCount).toBe(1);

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
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);
      expect(getDetourEvidence()['route-1']).toBeDefined();

      // Clear the detour
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE);

      // Finalize
      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
      processVehicles([onVehicle], shapes, routeShapeMapping);

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
  });

  test('geometry is present on clear-pending snapshots', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });
    const realDateNow = Date.now;
    const BASE_TIME = realDateNow();

    try {
      Date.now = () => BASE_TIME;
      confirmDetour(offVehicle);

      Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
      const result = runTicks([onVehicle], DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE);

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
