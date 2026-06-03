test('loads active detour snapshots from Firestore', async () => {
  jest.resetModules();
  const get = jest.fn().mockResolvedValue({
    forEach(callback) {
      callback({
        id: '8A',
        data: () => ({
          routeId: '8A',
          detectedAt: 1779620000000,
          lastSeenAt: 1779620300000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          confidence: 'medium',
          shapeId: 'shape-8a',
          entryPoint: { latitude: 44.39, longitude: -79.69 },
          exitPoint: { latitude: 44.39, longitude: -79.68 },
          skippedSegmentPolyline: [
            { latitude: 44.39, longitude: -79.69 },
            { latitude: 44.39, longitude: -79.68 },
          ],
          segments: [],
        }),
      });
    },
  });

  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => ({ collection: () => ({ get }) }),
  }));

  const { loadActiveDetourSnapshots } = require('../activeDetourSnapshotStore');
  const snapshots = await loadActiveDetourSnapshots({ force: true });

  expect(snapshots['8A'].routeId).toBe('8A');
  expect(snapshots['8A'].vehicleCount).toBe(2);
  expect(snapshots['8A'].geometry.shapeId).toBe('shape-8a');
});

test('returns an empty snapshot set when Firestore is unavailable', async () => {
  jest.resetModules();
  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => null,
  }));

  const { loadActiveDetourSnapshots } = require('../activeDetourSnapshotStore');
  await expect(loadActiveDetourSnapshots({ force: true })).resolves.toEqual({});
});

test('normalizes active snapshots with clear state and a recoverable clear window', () => {
  const { normalizeSnapshot } = require('../activeDetourSnapshotStore');

  const snapshot = normalizeSnapshot('100', {
    routeId: '100',
    detectedAt: 1779620000000,
    lastSeenAt: 1779620300000,
    latestGpsEvidenceAt: 1779620250000,
    geometryLastEvidenceAt: 1779620240000,
    state: 'clear-pending',
    clearReason: 'normal-route-observed',
    shapeId: 'shape-100',
    clearWindow: {
      shapeId: 'shape-100',
      startProgressMeters: 0,
      endProgressMeters: 1000,
      minCoverageRatio: 0.95,
    },
    segments: [{
      shapeId: 'shape-100',
      startProgressMeters: 125,
      endProgressMeters: 625,
    }],
  });

  expect(snapshot.state).toBe('clear-pending');
  expect(snapshot.clearReason).toBe('normal-route-observed');
  expect(snapshot.latestGpsEvidenceAt).toBe(1779620250000);
  expect(snapshot.geometryLastEvidenceAt).toBe(1779620240000);
  expect(snapshot.detourZone).toEqual({
    shapeId: 'shape-100',
    startProgressMeters: 125,
    endProgressMeters: 625,
  });
  expect(snapshot.clearWindow).toEqual({
    shapeId: 'shape-100',
    startProgressMeters: 0,
    endProgressMeters: 1000,
    minCoverageRatio: 0.95,
  });
  expect(snapshot.geometry.startProgressMeters).toBe(125);
  expect(snapshot.geometry.endProgressMeters).toBe(625);
});

test('V2 active snapshot hydration reads only the configured V2 collection', async () => {
  jest.resetModules();
  const get = jest.fn().mockResolvedValue({ forEach() {} });
  const collection = jest.fn(() => ({ get }));

  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => ({ collection }),
  }));

  const { loadActiveDetourSnapshots } = require('../activeDetourSnapshotStore');
  await loadActiveDetourSnapshots({ force: true, storageConfig: { activeCollection: 'activeDetoursV2' } });

  expect(collection).toHaveBeenCalledWith('activeDetoursV2');
  expect(collection).not.toHaveBeenCalledWith('activeDetours');
});
