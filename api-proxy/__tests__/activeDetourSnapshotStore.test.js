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

test('keeps separate V2 event snapshots for the same route', async () => {
  jest.resetModules();
  const get = jest.fn().mockResolvedValue({
    forEach(callback) {
      callback({
        id: '11:shape-11:9600-11500',
        data: () => ({
          detourEventId: '11:shape-11:9600-11500',
          routeId: '11',
          detourVersion: 'v2',
          detourModel: 'event-window',
          riderVisible: true,
          canShowDetourPath: true,
          latestGpsEvidenceAt: 1779620300000,
          likelyDetourPolyline: [
            { latitude: 44.40, longitude: -79.72 },
            { latitude: 44.41, longitude: -79.71 },
          ],
          eventWindow: {
            routeId: '11',
            shapeId: 'shape-11',
            coreStartProgressMeters: 9600,
            coreEndProgressMeters: 11500,
          },
        }),
      });
      callback({
        id: '11:shape-11:13300-13400',
        data: () => ({
          detourEventId: '11:shape-11:13300-13400',
          routeId: '11',
          detourVersion: 'v2',
          detourModel: 'event-window',
          riderVisible: false,
          canShowDetourPath: false,
          latestGpsEvidenceAt: 1779620310000,
        }),
      });
    },
  });

  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => ({ collection: () => ({ get }) }),
  }));

  const { loadActiveDetourSnapshots } = require('../activeDetourSnapshotStore');
  const snapshots = await loadActiveDetourSnapshots({
    force: true,
    storageConfig: { activeCollection: 'activeDetourEventsV2' },
  });

  expect(Object.keys(snapshots)).toEqual([
    '11:shape-11:9600-11500',
    '11:shape-11:13300-13400',
  ]);
  expect(snapshots['11:shape-11:9600-11500']).toEqual(expect.objectContaining({
    eventId: '11:shape-11:9600-11500',
    routeId: '11',
    detourModel: 'event-window',
    riderVisible: true,
    eventWindow: expect.objectContaining({ shapeId: 'shape-11' }),
  }));
  expect(snapshots['11:shape-11:13300-13400']).toEqual(expect.objectContaining({
    eventId: '11:shape-11:13300-13400',
    routeId: '11',
    riderVisible: false,
  }));
});

test('uses Firestore document IDs as canonical V2 event identities', async () => {
  jest.resetModules();
  const sharedPhysicalEventId = 'detour-event-shared-physical-geometry';
  const get = jest.fn().mockResolvedValue({
    forEach(callback) {
      for (const documentId of ['11:shape-11:9600-11500', '11:shape-11:13300-13400']) {
        callback({
          id: documentId,
          data: () => ({
            eventId: documentId,
            detourEventId: sharedPhysicalEventId,
            routeId: '11',
            detourVersion: 'v2',
            detourModel: 'event-window',
            eventWindow: {
              routeId: '11',
              shapeId: 'shape-11',
              coreStartProgressMeters: documentId.includes('9600') ? 9600 : 13300,
              coreEndProgressMeters: documentId.includes('9600') ? 11500 : 13400,
            },
          }),
        });
      }
    },
  });

  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => ({ collection: () => ({ get }) }),
  }));

  const { loadActiveDetourSnapshots } = require('../activeDetourSnapshotStore');
  const snapshots = await loadActiveDetourSnapshots({
    force: true,
    storageConfig: { activeCollection: 'activeDetourEventsV2' },
  });

  expect(Object.keys(snapshots)).toEqual([
    '11:shape-11:9600-11500',
    '11:shape-11:13300-13400',
  ]);
  expect(snapshots['11:shape-11:9600-11500']).toEqual(expect.objectContaining({
    eventId: '11:shape-11:9600-11500',
    detourEventId: sharedPhysicalEventId,
  }));
});

test('returns an empty snapshot set when Firestore is unavailable', async () => {
  jest.resetModules();
  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => null,
  }));

  const { loadActiveDetourSnapshots } = require('../activeDetourSnapshotStore');
  await expect(loadActiveDetourSnapshots({ force: true })).resolves.toEqual({});
});

test('surfaces Firestore read failures and retries instead of caching an empty snapshot set', async () => {
  jest.resetModules();
  const get = jest.fn()
    .mockRejectedValueOnce(new Error('active snapshot read failed'))
    .mockResolvedValueOnce({
      size: 0,
      docs: [],
      forEach: () => {},
    });
  jest.doMock('../firebaseAdmin', () => ({
    getDb: () => ({ collection: () => ({ get }) }),
  }));

  const { loadActiveDetourSnapshots } = require('../activeDetourSnapshotStore');
  await expect(loadActiveDetourSnapshots({ force: true })).rejects.toThrow('active snapshot read failed');
  await expect(loadActiveDetourSnapshots()).resolves.toEqual({});
  expect(get).toHaveBeenCalledTimes(2);
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
