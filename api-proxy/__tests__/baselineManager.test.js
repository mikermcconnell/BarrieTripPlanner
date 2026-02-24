jest.setTimeout(15000);

const ORIGINAL_ENV = process.env;

// Mock Firestore
const mockBatchSet = jest.fn();
const mockBatchDelete = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue();
const mockDocGet = jest.fn();
const mockDocSet = jest.fn().mockResolvedValue();
const mockDocDelete = jest.fn().mockResolvedValue();
const mockCollectionGet = jest.fn();

const mockDoc = jest.fn((docId) => ({
  get: mockDocGet,
  set: mockDocSet,
  delete: mockDocDelete,
  id: docId,
}));

const mockCollection = jest.fn(() => ({
  doc: mockDoc,
  get: mockCollectionGet,
}));

const mockBatch = jest.fn(() => ({
  set: mockBatchSet,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}));

const mockDb = {
  collection: mockCollection,
  batch: mockBatch,
};

jest.mock('../firebaseAdmin', () => ({
  getDb: jest.fn(() => mockDb),
}));

// Helper: create test shape data matching gtfsLoader format
function makeLiveData(routes) {
  const shapes = new Map();
  const routeShapeMapping = new Map();

  for (const [routeId, shapeIds] of Object.entries(routes)) {
    routeShapeMapping.set(routeId, shapeIds);
    for (const shapeId of shapeIds) {
      if (!shapes.has(shapeId)) {
        shapes.set(shapeId, [
          { latitude: 44.3, longitude: -79.7, sequence: 1 },
          { latitude: 44.31, longitude: -79.71, sequence: 2 },
        ]);
      }
    }
  }

  return { shapes, routeShapeMapping, lastRefresh: Date.now() };
}

// Helper: create Firestore doc snapshots
function makeFirestoreDoc(id, data) {
  return { id, exists: true, data: () => data };
}

function makeFirestoreSnapshot(docs) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (fn) => docs.forEach(fn),
  };
}

describe('baselineManager', () => {
  let baselineManager;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, BASELINE_AUTO_INIT: 'true' };

    // Default: no baseline in Firestore
    mockDocGet.mockResolvedValue({ exists: false, data: () => null });
    mockCollectionGet.mockResolvedValue(makeFirestoreSnapshot([]));

    baselineManager = require('../baselineManager');
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    baselineManager._resetForTesting();
  });

  test('getBaselineStatus returns unloaded when no baseline', () => {
    const status = baselineManager.getBaselineStatus();
    expect(status.loaded).toBe(false);
    expect(status.routeCount).toBe(0);
    expect(status.shapeCount).toBe(0);
  });

  test('auto-initializes from live data when no baseline in Firestore', async () => {
    const liveData = makeLiveData({ '8A': ['s1', 's2'], '8B': ['s3'] });

    const result = await baselineManager.getBaselineData(liveData);

    expect(result.source).toBe('setBaseline');
    expect(result.shapes.size).toBe(3);
    expect(result.routeShapeMapping.size).toBe(2);
    expect(result.routeShapeMapping.get('8A')).toEqual(['s1', 's2']);

    // Verify Firestore writes
    expect(mockBatch).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();

    const status = baselineManager.getBaselineStatus();
    expect(status.loaded).toBe(true);
    expect(status.routeCount).toBe(2);
    expect(status.shapeCount).toBe(3);
  });

  test('hydrates from Firestore when baseline exists', async () => {
    const metaDoc = makeFirestoreDoc('_meta', {
      createdAt: '2025-01-15T00:00:00Z',
      source: 'setBaseline',
      routeCount: 1,
      shapeCount: 2,
    });

    const routeDoc = makeFirestoreDoc('8A', {
      routeId: '8A',
      shapeIds: ['s1', 's2'],
      shapes: {
        s1: [{ lat: 44.3, lon: -79.7, seq: 1 }],
        s2: [{ lat: 44.31, lon: -79.71, seq: 1 }],
      },
    });

    // First call to doc('_meta').get() returns existing meta
    mockDocGet.mockResolvedValue(metaDoc);
    // Collection-level get returns all docs
    mockCollectionGet.mockResolvedValue(makeFirestoreSnapshot([metaDoc, routeDoc]));

    const liveData = makeLiveData({ '8A': ['s1', 's2', 's3'] });
    const result = await baselineManager.getBaselineData(liveData);

    expect(result.source).toBe('firestore');
    expect(result.shapes.size).toBe(2);
    expect(result.routeShapeMapping.get('8A')).toEqual(['s1', 's2']);
    // Should NOT have auto-initialized (baseline already existed)
    expect(mockBatch).not.toHaveBeenCalled();
  });

  test('setBaseline writes correct docs to Firestore', async () => {
    const liveData = makeLiveData({ '8A': ['s1'], '1': ['s2'] });
    await baselineManager.setBaseline(liveData);

    expect(mockBatch).toHaveBeenCalled();
    expect(mockBatchSet).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();

    const status = baselineManager.getBaselineStatus();
    expect(status.loaded).toBe(true);
    expect(status.source).toBe('setBaseline');
    expect(status.routeCount).toBe(2);
    expect(status.shapeCount).toBe(2);
  });

  test('clearBaseline removes docs and resets cache', async () => {
    // Set a baseline first
    const liveData = makeLiveData({ '8A': ['s1'] });
    await baselineManager.setBaseline(liveData);
    expect(baselineManager.getBaselineStatus().loaded).toBe(true);

    // Mock Firestore having docs to delete
    const docs = [
      { id: '_meta', ref: { id: '_meta' } },
      { id: '8A', ref: { id: '8A' } },
    ];
    mockCollectionGet.mockResolvedValue(makeFirestoreSnapshot(docs));

    await baselineManager.clearBaseline();

    expect(baselineManager.getBaselineStatus().loaded).toBe(false);
    expect(mockBatchDelete).toHaveBeenCalled();
  });

  test('logShapeDivergence detects added and removed shapes', async () => {
    const liveDataOld = makeLiveData({ '8A': ['s1', 's2'], '8B': ['s3'] });
    await baselineManager.setBaseline(liveDataOld);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Live data has a new shape on 8A and removed one
    const liveDataNew = makeLiveData({ '8A': ['s1', 's4'], '8B': ['s3'] });
    baselineManager.logShapeDivergence(liveDataNew);

    const divergenceLog = consoleSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('Shape divergence')
    );
    expect(divergenceLog).toBeTruthy();

    consoleSpy.mockRestore();
  });

  test('logShapeDivergence logs no divergence when shapes match', async () => {
    const liveData = makeLiveData({ '8A': ['s1'] });
    await baselineManager.setBaseline(liveData);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    baselineManager.logShapeDivergence(liveData);

    const noChangeLog = consoleSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('no divergence')
    );
    expect(noChangeLog).toBeTruthy();

    consoleSpy.mockRestore();
  });

  test('falls back to live data when getDb returns null and auto-init is off', async () => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, BASELINE_AUTO_INIT: 'false' };
    jest.mock('../firebaseAdmin', () => ({ getDb: jest.fn(() => null) }));

    const bm = require('../baselineManager');
    const liveData = makeLiveData({ '1': ['s1'] });
    const result = await bm.getBaselineData(liveData);

    expect(result.source).toBe('live-fallback');
    expect(result.shapes).toBe(liveData.shapes);

    bm._resetForTesting();
  });

  test('auto-inits in memory even when getDb returns null', async () => {
    const { getDb } = require('../firebaseAdmin');
    getDb.mockReturnValue(null);
    baselineManager._resetForTesting();

    const liveData = makeLiveData({ '1': ['s1'] });
    const result = await baselineManager.getBaselineData(liveData);

    // Auto-init still sets cache in memory even without Firestore
    expect(result.source).toBe('setBaseline');
    expect(result.shapes.size).toBe(1);

    getDb.mockReturnValue(mockDb);
  });

  test('skips auto-init when BASELINE_AUTO_INIT=false', async () => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, BASELINE_AUTO_INIT: 'false' };
    jest.mock('../firebaseAdmin', () => ({ getDb: jest.fn(() => mockDb) }));
    mockDocGet.mockResolvedValue({ exists: false, data: () => null });
    mockCollectionGet.mockResolvedValue(makeFirestoreSnapshot([]));

    const bm = require('../baselineManager');
    const liveData = makeLiveData({ '8A': ['s1'] });
    const result = await bm.getBaselineData(liveData);

    // Should fall back to live, not auto-init
    expect(result.source).toBe('live-fallback');
    expect(mockBatch).not.toHaveBeenCalled();

    bm._resetForTesting();
  });

  test('serialization round-trips correctly', async () => {
    const liveData = makeLiveData({ '8A': ['s1', 's2'], '1': ['s3'] });
    await baselineManager.setBaseline(liveData);

    const result = await baselineManager.getBaselineData(liveData);

    // Verify shapes are deserialized with correct field names
    const shape = result.shapes.get('s1');
    expect(shape).toBeDefined();
    expect(shape[0]).toHaveProperty('latitude');
    expect(shape[0]).toHaveProperty('longitude');
    expect(shape[0]).toHaveProperty('sequence');
  });
});
