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
