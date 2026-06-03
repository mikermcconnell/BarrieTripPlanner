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
