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
});
