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

  test('loads and syncs global learned geometry separately from route records', async () => {
    const set = jest.fn(async () => {});
    const del = jest.fn(async () => {});
    const routeGet = jest.fn(async () => ({
      forEach: () => {},
    }));
    const geometryGet = jest.fn(async () => ({
      forEach: (callback) => {
        callback({
          id: 'shared-geometry-1',
          data: () => ({
            sharedGeometryFingerprint: 'shared-geometry-1',
            routeIds: ['12A'],
            latestGpsEvidenceAt: 2000,
            geometryLastEvidenceAt: 1500,
            geometry: {
              shapeId: 'shape-12',
              canShowDetourPath: true,
              inferredDetourPolyline: [
                { latitude: 44.39, longitude: -79.69 },
                { latitude: 44.391, longitude: -79.691 },
              ],
            },
            evidence: {
              points: [{ latitude: 44.395, longitude: -79.690, timestampMs: 2000, vehicleId: 'bus-1' }],
            },
          }),
        });
      },
    }));

    jest.doMock('../firebaseAdmin', () => ({
      getDb: () => ({
        collection: (name) => ({
          get: name === 'persistentDetourGeometriesAuto' ? geometryGet : routeGet,
          doc: () => ({ set, delete: del }),
        }),
      }),
    }));

    const {
      loadPersistentDetourGeometries,
      syncPersistentDetours,
    } = require('../persistentDetourStore');

    const loaded = await loadPersistentDetourGeometries();

    expect(loaded['shared-geometry-1'].geometry.canShowDetourPath).toBe(true);
    expect(loaded['shared-geometry-1'].latestGpsEvidenceAt).toBe(2000);
    expect(loaded['shared-geometry-1'].geometryLastEvidenceAt).toBe(1500);

    await syncPersistentDetours({}, loaded);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      sharedGeometryFingerprint: 'shared-geometry-1',
      routeIds: ['12A'],
      latestGpsEvidenceAt: 2000,
      geometryLastEvidenceAt: 1500,
      geometry: expect.objectContaining({
        canShowDetourPath: true,
      }),
    }));
  });
});
