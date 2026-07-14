describe('detourRuntimeStateStore', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('force reload bypasses the cached runtime state document', async () => {
    const snapshots = [
      { version: 1, savedAt: 1000 },
      { version: 1, savedAt: 2000 },
    ];
    let readIndex = 0;
    const get = jest.fn(async () => ({
      exists: true,
      data: () => snapshots[Math.min(readIndex++, snapshots.length - 1)],
    }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: () => ({
          doc: () => ({ get }),
        }),
      }),
    }));

    const { loadDetourRuntimeState } = require('../detourRuntimeStateStore');

    const first = await loadDetourRuntimeState();
    const cached = await loadDetourRuntimeState();
    const forced = await loadDetourRuntimeState({ force: true });

    expect(first.savedAt).toBe(1000);
    expect(cached.savedAt).toBe(1000);
    expect(forced.savedAt).toBe(2000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('surfaces runtime read failures and retries instead of caching a missing state', async () => {
    const get = jest.fn()
      .mockRejectedValueOnce(new Error('runtime state read failed'))
      .mockResolvedValueOnce({ exists: false });

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: () => ({
          doc: () => ({ get }),
        }),
      }),
    }));

    const { loadDetourRuntimeState } = require('../detourRuntimeStateStore');
    await expect(loadDetourRuntimeState({ force: true })).rejects.toThrow('runtime state read failed');
    await expect(loadDetourRuntimeState()).resolves.toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('save strips undefined fields before writing Firestore runtime state', async () => {
    const set = jest.fn(async () => {});
    const doc = jest.fn(() => ({ set }));
    const collection = jest.fn(() => ({ doc }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({ collection }),
    }));

    const { saveDetourRuntimeState } = require('../detourRuntimeStateStore');
    await saveDetourRuntimeState({
      activeDetours: {
        '12A': {
          state: 'active',
          clearPendingTick: undefined,
          nested: {
            keep: true,
            drop: undefined,
          },
          values: [1, undefined, { keep: 'yes', drop: undefined }],
        },
      },
    });

    const written = set.mock.calls[0][0];
    expect(written.activeDetours['12A']).not.toHaveProperty('clearPendingTick');
    expect(written.activeDetours['12A'].nested).toEqual({ keep: true });
    expect(written.activeDetours['12A'].values).toEqual([1, { keep: 'yes' }]);
    expect(written.updatedAt).toEqual(expect.any(Number));
  });

  test('save compacts duplicate V2 compatibility fields before writing Firestore', async () => {
    const set = jest.fn(async () => {});

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: () => ({
          doc: () => ({ set }),
        }),
      }),
    }));

    const {
      decodeRuntimeStateFromStorage,
      saveDetourRuntimeState,
    } = require('../detourRuntimeStateStore');
    await saveDetourRuntimeState({
      detourVersion: 'v2',
      eventCandidates: { event: { routeId: '11' } },
      candidates: [{ routeId: '11' }],
      activeEvents: { event: { routeId: '11' } },
      activeDetours: { '11': { routeId: '11' } },
      clearTracksByEvent: { event: { trip: [{ timestampMs: 1000 }] } },
      clearTracks: { '11': { trip: [{ timestampMs: 1000 }] } },
      seenSamples: ['sample'],
    });

    const stored = set.mock.calls[0][0];
    const written = decodeRuntimeStateFromStorage(stored);
    expect(stored).toEqual(expect.objectContaining({
      encoding: 'gzip-json-v1',
      compressedState: expect.any(Buffer),
      compressedBytes: expect.any(Number),
      uncompressedBytes: expect.any(Number),
      updatedAt: expect.any(Number),
    }));
    expect(written).toEqual(expect.objectContaining({
      detourVersion: 'v2',
      eventCandidates: { event: { routeId: '11' } },
      activeEvents: { event: { routeId: '11' } },
      clearTracksByEvent: { event: { trip: [{ timestampMs: 1000 }] } },
      seenSamples: ['sample'],
    }));
    expect(written).not.toHaveProperty('candidates');
    expect(written).not.toHaveProperty('activeDetours');
    expect(written).not.toHaveProperty('clearTracks');
  });

  test('loads compressed V2 runtime state and remains backward compatible with flat state', async () => {
    const { encodeRuntimeStateForStorage } = require('../detourRuntimeStateStore');
    const compressed = encodeRuntimeStateForStorage({
      detourVersion: 'v2',
      eventCandidates: { event: { routeId: '11' } },
      activeEvents: {},
      clearTracksByEvent: {},
    });
    const snapshots = [compressed, { detourVersion: 'v2', eventCandidates: { legacy: {} } }];
    let index = 0;

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => snapshots[index++] }),
          }),
        }),
      }),
    }));

    jest.resetModules();
    const { loadDetourRuntimeState } = require('../detourRuntimeStateStore');
    await expect(loadDetourRuntimeState({ force: true })).resolves.toMatchObject({
      detourVersion: 'v2',
      eventCandidates: { event: { routeId: '11' } },
    });
    await expect(loadDetourRuntimeState({ force: true })).resolves.toMatchObject({
      eventCandidates: { legacy: {} },
    });
  });

  test('propagates runtime persistence failures to the worker', async () => {
    const writeError = new Error('Firestore document is too large');
    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: () => ({
          doc: () => ({ set: jest.fn().mockRejectedValue(writeError) }),
        }),
      }),
    }));

    const { saveDetourRuntimeState } = require('../detourRuntimeStateStore');
    await expect(saveDetourRuntimeState({ detourVersion: 'v2' })).rejects.toThrow(
      'Firestore document is too large'
    );
  });
});

test('V2 runtime state uses the configured V2 runtime document', async () => {
  jest.resetModules();
  const get = jest.fn(async () => ({ exists: false }));
  const doc = jest.fn(() => ({ get }));
  const collection = jest.fn(() => ({ doc }));

  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => ({ collection }),
  }));

  const { loadDetourRuntimeState } = require('../detourRuntimeStateStore');
  await loadDetourRuntimeState({
    force: true,
    storageConfig: {
      runtimeStateCollection: 'systemState',
      runtimeStateDoc: 'detourRuntimeV2',
    },
  });

  expect(collection).toHaveBeenCalledWith('systemState');
  expect(doc).toHaveBeenCalledWith('detourRuntimeV2');
  expect(doc).not.toHaveBeenCalledWith('detourRuntime');
});
