/**
 * Sprint D: Backend pipeline integration tests.
 * Tests the full detector → geometry → publisher flow with a mocked Firestore.
 *
 * Mock surface: only firebaseAdmin.getDb() — all other modules run real code.
 */

'use strict';

// ─── Shared test fixtures ────────────────────────────────────────────────────

const shapes = new Map();
shapes.set('shape-1', [
  { latitude: 44.39, longitude: -79.70 },
  { latitude: 44.39, longitude: -79.69 },
  { latitude: 44.39, longitude: -79.68 },
  { latitude: 44.39, longitude: -79.67 },
  { latitude: 44.39, longitude: -79.66 },
]);

const routeShapeMapping = new Map();
routeShapeMapping.set('route-1', ['shape-1']);

const OFF_ROUTE_COORD = { latitude: 44.395, longitude: -79.695 };
const ON_ROUTE_COORD = { latitude: 44.39, longitude: -79.695 };

function makeVehicle(overrides = {}) {
  return {
    id: 'bus-1',
    routeId: 'route-1',
    tripId: 'trip-1',
    coordinate: ON_ROUTE_COORD,
    timestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

// ─── Firestore mock factory ──────────────────────────────────────────────────

function makeFirestoreMock() {
  const writes = [];
  const hydrationDocs = [];

  const mockDoc = (collectionName, docId) => ({
    set: jest.fn(async (data, opts) => {
      writes.push({ op: 'set', collection: collectionName, docId, data, opts });
    }),
    delete: jest.fn(async () => {
      writes.push({ op: 'delete', collection: collectionName, docId });
    }),
  });

  const mockCollection = (name) => ({
    doc: jest.fn((id) => mockDoc(name, id)),
    get: jest.fn(async () => ({
      forEach: jest.fn((cb) => hydrationDocs.forEach(cb)),
      size: hydrationDocs.length,
      docs: hydrationDocs,
      empty: hydrationDocs.length === 0,
    })),
    where: jest.fn(() => ({
      orderBy: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(async () => ({ docs: [], empty: true, size: 0 })),
        })),
      })),
    })),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  });

  const db = {
    collection: jest.fn((name) => mockCollection(name)),
    batch: jest.fn(() => ({
      delete: jest.fn(),
      commit: jest.fn(async () => {}),
    })),
    _writes: writes,
  };

  return db;
}

// ─── Pipeline smoke tests ────────────────────────────────────────────────────

describe('detector → publisher: full pipeline', () => {
  let processVehicles, clearVehicleState;
  let publishDetours;
  let mockDb;

  beforeEach(() => {
    mockDb = makeFirestoreMock();
    jest.resetModules();
    jest.mock('../firebaseAdmin', () => ({ getDb: jest.fn(() => mockDb), getAuth: jest.fn() }));

    const detector = require('../detourDetector');
    processVehicles = detector.processVehicles;
    clearVehicleState = detector.clearVehicleState;
    publishDetours = require('../detourPublisher').publishDetours;

    clearVehicleState();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('3 off-route ticks produce a Firestore document with correct shape', async () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });

    processVehicles([offVehicle], shapes, routeShapeMapping);
    processVehicles([offVehicle], shapes, routeShapeMapping);
    const activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);

    expect(Object.keys(activeDetours)).toHaveLength(1);

    await publishDetours(activeDetours);

    const setOps = mockDb._writes.filter(w => w.op === 'set' && w.collection === 'activeDetours');
    expect(setOps).toHaveLength(1);
    expect(setOps[0].docId).toBe('route-1');
    expect(setOps[0].data.state).toBe('active');
    expect(setOps[0].data.routeId).toBe('route-1');
    expect(setOps[0].data.vehicleCount).toBe(1);
    expect(setOps[0].data.triggerVehicleId).toBe('bus-1');
    expect(setOps[0].data.detectedAt).toBeInstanceOf(Date);
    expect(setOps[0].data.updatedAt).toBeDefined();
  });

  test('publisher writes DETOUR_DETECTED history event on first publish', async () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    for (let i = 0; i < 2; i++) processVehicles([offVehicle], shapes, routeShapeMapping);
    const activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);

    await publishDetours(activeDetours);

    const historyWrites = mockDb._writes.filter(w => w.collection === 'detourHistory');
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0].data.eventType).toBe('DETOUR_DETECTED');
    expect(historyWrites[0].data.routeId).toBe('route-1');
    expect(historyWrites[0].data.source).toBe('detour-worker-v2');
  });

  test('geometry fields written to Firestore when evidence is sufficient', async () => {
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    // Run 6 ticks to accumulate evidence for geometry
    for (let i = 0; i < 6; i++) processVehicles([offVehicle], shapes, routeShapeMapping);
    const activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);

    expect(activeDetours['route-1'].geometry).toBeDefined();

    await publishDetours(activeDetours);

    const setOps = mockDb._writes.filter(w => w.op === 'set' && w.collection === 'activeDetours');
    expect(setOps).toHaveLength(1);
    const doc = setOps[0].data;
    // Geometry fields present on first write (isNew=true always writes geometry)
    expect(doc).toHaveProperty('confidence');
    expect(doc).toHaveProperty('evidencePointCount');
    expect(doc).toHaveProperty('skippedSegmentPolyline');
    expect(doc).toHaveProperty('inferredDetourPolyline');
  });

  test('multi-vehicle detour reports correct vehicleCount in Firestore', async () => {
    const bus1 = makeVehicle({ id: 'bus-1', coordinate: OFF_ROUTE_COORD });
    const bus2 = makeVehicle({ id: 'bus-2', coordinate: OFF_ROUTE_COORD });

    for (let i = 0; i < 3; i++) processVehicles([bus1, bus2], shapes, routeShapeMapping);
    const activeDetours = processVehicles([bus1, bus2], shapes, routeShapeMapping);

    await publishDetours(activeDetours);

    const setOps = mockDb._writes.filter(w => w.op === 'set' && w.collection === 'activeDetours');
    expect(setOps[0].data.vehicleCount).toBe(2);
  });
});

// ─── State transition history events ─────────────────────────────────────────

describe('state transitions: active → clear-pending → cleared', () => {
  let processVehicles, clearVehicleState, DETOUR_CLEAR_GRACE_MS, DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE;
  let publishDetours;
  let mockDb;
  const realDateNow = Date.now;

  beforeEach(() => {
    mockDb = makeFirestoreMock();
    jest.resetModules();
    jest.mock('../firebaseAdmin', () => ({ getDb: jest.fn(() => mockDb), getAuth: jest.fn() }));

    const detector = require('../detourDetector');
    processVehicles = detector.processVehicles;
    clearVehicleState = detector.clearVehicleState;
    DETOUR_CLEAR_GRACE_MS = detector.DETOUR_CLEAR_GRACE_MS;
    DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE = detector.DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE;
    publishDetours = require('../detourPublisher').publishDetours;

    clearVehicleState();
  });

  afterEach(() => {
    Date.now = realDateNow;
    jest.restoreAllMocks();
  });

  test('active → clear-pending writes DETOUR_UPDATED with state changedField', async () => {
    const BASE_TIME = realDateNow();
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    // Confirm detour
    Date.now = () => BASE_TIME;
    for (let i = 0; i < 3; i++) processVehicles([offVehicle], shapes, routeShapeMapping);
    let activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);
    await publishDetours(activeDetours);

    // Advance past grace, enter clear-pending
    Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
    for (let i = 0; i < DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE; i++) {
      activeDetours = processVehicles([onVehicle], shapes, routeShapeMapping);
    }
    expect(activeDetours['route-1'].state).toBe('clear-pending');

    await publishDetours(activeDetours);

    const historyWrites = mockDb._writes.filter(w => w.collection === 'detourHistory');
    const updatedEvent = historyWrites.find(w => w.data.eventType === 'DETOUR_UPDATED');
    expect(updatedEvent).toBeDefined();
    expect(updatedEvent.data.changedFields).toContain('state');
  });

  test('finalized clear writes DETOUR_CLEARED and removes Firestore document', async () => {
    const BASE_TIME = realDateNow();
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    Date.now = () => BASE_TIME;
    for (let i = 0; i < 3; i++) processVehicles([offVehicle], shapes, routeShapeMapping);
    let activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);
    await publishDetours(activeDetours);

    // Enter clear-pending
    Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
    for (let i = 0; i < DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE; i++) {
      activeDetours = processVehicles([onVehicle], shapes, routeShapeMapping);
    }
    await publishDetours(activeDetours);

    // Finalize clear
    Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 2000;
    activeDetours = processVehicles([onVehicle], shapes, routeShapeMapping);
    expect(Object.keys(activeDetours)).toHaveLength(0);

    await publishDetours(activeDetours);

    const deleteOps = mockDb._writes.filter(w => w.op === 'delete' && w.collection === 'activeDetours');
    expect(deleteOps).toHaveLength(1);
    expect(deleteOps[0].docId).toBe('route-1');

    const clearedEvent = mockDb._writes.find(
      w => w.collection === 'detourHistory' && w.data?.eventType === 'DETOUR_CLEARED'
    );
    expect(clearedEvent).toBeDefined();
    expect(clearedEvent.data.durationMs).toBeGreaterThan(0);
  });

  test('reactivation from clear-pending writes DETOUR_UPDATED with state restored', async () => {
    const BASE_TIME = realDateNow();
    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    const onVehicle = makeVehicle({ coordinate: ON_ROUTE_COORD });

    Date.now = () => BASE_TIME;
    for (let i = 0; i < 3; i++) processVehicles([offVehicle], shapes, routeShapeMapping);
    let activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);
    await publishDetours(activeDetours);

    // Enter clear-pending
    Date.now = () => BASE_TIME + DETOUR_CLEAR_GRACE_MS + 1000;
    for (let i = 0; i < DETOUR_CLEAR_CONSECUTIVE_ON_ROUTE; i++) {
      activeDetours = processVehicles([onVehicle], shapes, routeShapeMapping);
    }
    expect(activeDetours['route-1'].state).toBe('clear-pending');
    await publishDetours(activeDetours);

    // Reactivate: vehicle goes off-route again
    for (let i = 0; i < 3; i++) {
      activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);
    }
    expect(activeDetours['route-1'].state).toBe('active');

    await publishDetours(activeDetours);

    const historyWrites = mockDb._writes.filter(w => w.collection === 'detourHistory');
    const stateChanges = historyWrites.filter(
      w => w.data.eventType === 'DETOUR_UPDATED' && w.data.changedFields?.includes('state')
    );
    // Two state changes: active→clear-pending, then clear-pending→active
    expect(stateChanges.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Geometry write throttling ───────────────────────────────────────────────

describe('geometry write throttling across pipeline', () => {
  let processVehicles, clearVehicleState;
  let publishDetours, GEOMETRY_WRITE_THROTTLE_MS;
  let mockDb;
  const realDateNow = Date.now;

  beforeEach(() => {
    mockDb = makeFirestoreMock();
    jest.resetModules();
    jest.mock('../firebaseAdmin', () => ({ getDb: jest.fn(() => mockDb), getAuth: jest.fn() }));

    const detector = require('../detourDetector');
    processVehicles = detector.processVehicles;
    clearVehicleState = detector.clearVehicleState;
    const publisher = require('../detourPublisher');
    publishDetours = publisher.publishDetours;
    GEOMETRY_WRITE_THROTTLE_MS = publisher.GEOMETRY_WRITE_THROTTLE_MS;

    clearVehicleState();
  });

  afterEach(() => {
    Date.now = realDateNow;
    jest.restoreAllMocks();
  });

  test('geometry included on first publish but suppressed on second tick within throttle window', async () => {
    const BASE_TIME = realDateNow();
    Date.now = () => BASE_TIME;

    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    for (let i = 0; i < 6; i++) processVehicles([offVehicle], shapes, routeShapeMapping);
    let activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);

    // First publish: isNew=true, geometry always written
    await publishDetours(activeDetours);
    const firstSet = mockDb._writes.filter(w => w.op === 'set' && w.collection === 'activeDetours');
    expect(firstSet[0].data).toHaveProperty('skippedSegmentPolyline');

    // Second tick within throttle window
    mockDb._writes.length = 0;
    Date.now = () => BASE_TIME + 1000;
    activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);
    await publishDetours(activeDetours);

    const secondSet = mockDb._writes.filter(w => w.op === 'set' && w.collection === 'activeDetours');
    expect(secondSet.length).toBeGreaterThan(0);
    // Geometry fields should NOT be in this write (throttled)
    expect(secondSet[0].data.skippedSegmentPolyline).toBeUndefined();
  });

  test('geometry re-written after throttle window expires', async () => {
    const BASE_TIME = realDateNow();
    Date.now = () => BASE_TIME;

    const offVehicle = makeVehicle({ coordinate: OFF_ROUTE_COORD });
    for (let i = 0; i < 6; i++) processVehicles([offVehicle], shapes, routeShapeMapping);
    let activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);
    await publishDetours(activeDetours);

    // Advance past throttle window
    mockDb._writes.length = 0;
    Date.now = () => BASE_TIME + GEOMETRY_WRITE_THROTTLE_MS + 1000;
    activeDetours = processVehicles([offVehicle], shapes, routeShapeMapping);
    await publishDetours(activeDetours);

    const setOps = mockDb._writes.filter(w => w.op === 'set' && w.collection === 'activeDetours');
    expect(setOps.length).toBeGreaterThan(0);
    expect(setOps[0].data).toHaveProperty('skippedSegmentPolyline');
  });
});
