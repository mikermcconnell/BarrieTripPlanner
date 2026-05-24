describe('persistentDetourStore', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('force reload bypasses cached persistent detour records', async () => {
    const snapshots = [
      [{ id: '10', data: () => ({ fingerprint: 'old-fingerprint' }) }],
      [],
    ];
    let readIndex = 0;
    const get = jest.fn(async () => ({
      forEach: (callback) => {
        snapshots[Math.min(readIndex++, snapshots.length - 1)].forEach(callback);
      },
    }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: () => ({ get }),
      }),
    }));

    const { loadPersistentDetours } = require('../persistentDetourStore');

    const first = await loadPersistentDetours();
    const cached = await loadPersistentDetours();
    const forced = await loadPersistentDetours({ force: true });

    expect(first['10']).toBeDefined();
    expect(cached['10']).toBeDefined();
    expect(forced['10']).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('loads and syncs learned GPS evidence with persistent detours', async () => {
    const set = jest.fn(async () => {});
    const del = jest.fn(async () => {});
    const get = jest.fn(async () => ({
      forEach: (callback) => {
        callback({
          id: '12B',
          data: () => ({
            fingerprint: '12B:shape-12b:a:b',
            evidence: {
              points: [{ latitude: 44.395, longitude: -79.690, timestampMs: 1000, vehicleId: 'bus-1' }],
              confidencePoints: [{ latitude: 44.396, longitude: -79.689, timestampMs: 2000, vehicleId: 'bus-2' }],
              entryCandidates: [{ latitude: 44.39, longitude: -79.692, timestampMs: 900, vehicleId: 'bus-1' }],
              exitCandidates: [{ latitude: 44.39, longitude: -79.688, timestampMs: 2100, vehicleId: 'bus-2' }],
            },
          }),
        });
      },
    }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: () => ({
          get,
          doc: () => ({ set, delete: del }),
        }),
      }),
    }));

    const { loadPersistentDetours, syncPersistentDetours } = require('../persistentDetourStore');

    const loaded = await loadPersistentDetours();
    expect(loaded['12B'].evidence.points).toHaveLength(1);
    expect(loaded['12B'].evidence.confidencePoints[0].vehicleId).toBe('bus-2');

    await syncPersistentDetours(loaded);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      routeId: '12B',
      evidence: expect.objectContaining({
        points: expect.any(Array),
        confidencePoints: expect.any(Array),
        entryCandidates: expect.any(Array),
        exitCandidates: expect.any(Array),
      }),
    }));
  });
});
