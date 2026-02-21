const {
  processVehicles,
  clearVehicleState,
  getActiveDetours,
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
// On-route: directly on the shape
const ON_ROUTE_COORD = { latitude: 44.39, longitude: -79.695 };

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
  });
});

describe('clearing when vehicle returns', () => {
  test('detour clears after vehicle returns on-route', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    // Build up detour: 3 off-route ticks
    processVehicles([offVehicle], shapes, routeShapeMapping);
    processVehicles([offVehicle], shapes, routeShapeMapping);
    let result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);

    // Vehicle returns on-route — detour should clear
    result = processVehicles([onVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('stale vehicle pruning', () => {
  test('vehicle state is pruned when lastCheckedAt exceeds 5min timeout', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    // Build up detour
    processVehicles([offVehicle], shapes, routeShapeMapping);
    processVehicles([offVehicle], shapes, routeShapeMapping);
    let result = processVehicles([offVehicle], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);

    // Simulate time passing beyond the 5-minute stale timeout
    const realDateNow = Date.now;
    Date.now = () => realDateNow() + 6 * 60 * 1000;

    try {
      // Process with empty vehicles array — stale vehicle should be pruned
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
    // (would have been tick 3 without the clear)
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
    processVehicles([bus1, bus2], shapes, routeShapeMapping);
    processVehicles([bus1, bus2], shapes, routeShapeMapping);
    const result = processVehicles([bus1, bus2], shapes, routeShapeMapping);

    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].vehiclesOffRoute.size).toBe(2);
  });

  test('detour persists when one vehicle returns but another stays off-route', () => {
    const bus1off = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2off = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });
    const bus1on = makeVehicle({ id: 'bus-1', coordinate: ON_ROUTE_COORD });

    // Build up detour with both buses
    processVehicles([bus1off, bus2off], shapes, routeShapeMapping);
    processVehicles([bus1off, bus2off], shapes, routeShapeMapping);
    processVehicles([bus1off, bus2off], shapes, routeShapeMapping);

    // bus-1 returns on-route, bus-2 stays off
    const result = processVehicles([bus1on, bus2off], shapes, routeShapeMapping);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['route-1'].vehiclesOffRoute.size).toBe(1);
  });
});

describe('vehicle switching routes', () => {
  test('switching routes clears old route detour and resets counter for new route', () => {
    // Add a second route shape
    shapes.set('shape-2', [
      { latitude: 44.40, longitude: -79.70 },
      { latitude: 44.40, longitude: -79.69 },
      { latitude: 44.40, longitude: -79.68 },
    ]);
    routeShapeMapping.set('route-2', ['shape-2']);

    const busRoute1 = makeVehicle({ id: 'bus-1', routeId: 'route-1', coordinate: OFF_ROUTE_COORD });

    // Build detour on route-1
    processVehicles([busRoute1], shapes, routeShapeMapping);
    processVehicles([busRoute1], shapes, routeShapeMapping);
    let result = processVehicles([busRoute1], shapes, routeShapeMapping);
    expect(result['route-1']).toBeDefined();

    // Vehicle switches to route-2 (still at same off-route coord, which is also off route-2)
    const busRoute2 = makeVehicle({ id: 'bus-1', routeId: 'route-2', coordinate: OFF_ROUTE_COORD });
    result = processVehicles([busRoute2], shapes, routeShapeMapping);

    // route-1 detour should clear, route-2 not yet triggered (counter reset)
    expect(result['route-1']).toBeUndefined();
    expect(result['route-2']).toBeUndefined();

    // Clean up test-specific shapes
    shapes.delete('shape-2');
    routeShapeMapping.delete('route-2');
  });
});

describe('vehicle with no matching shapes', () => {
  test('vehicle on unknown route is skipped without error', () => {
    const unknownRoute = makeVehicle({ routeId: 'route-unknown', coordinate: OFF_ROUTE_COORD });

    // Should not crash and should return no detours
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
  test('returning on-route mid-streak resets counter', () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    // 2 off-route readings
    processVehicles([offVehicle], shapes, routeShapeMapping);
    processVehicles([offVehicle], shapes, routeShapeMapping);

    // 1 on-route reading — resets counter
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
