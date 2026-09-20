const mockGet = jest.fn();
const mockSet = jest.fn().mockResolvedValue();
const mockDoc = jest.fn(() => ({ get: mockGet, set: mockSet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock('../firebaseAdmin', () => ({ getDb: () => ({ collection: mockCollection }) }));

describe('baselineAutoUpdateStateStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('round-trips pending stability evidence through Firestore', async () => {
    const pendingRoutes = [{
      routeId: 'KP1',
      signature: '__route_removed_from_live_gtfs__',
      firstSeenAt: 100,
      dueAt: 200,
    }];
    mockGet.mockResolvedValue({ exists: true, data: () => ({ pendingRoutes }) });
    const store = require('../baselineAutoUpdateStateStore');

    await expect(store.loadPendingRoutes()).resolves.toEqual(pendingRoutes);
    await store.savePendingRoutes(pendingRoutes);

    expect(mockCollection).toHaveBeenCalledWith('systemState');
    expect(mockDoc).toHaveBeenCalledWith('baselineAutoUpdate');
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ pendingRoutes }));
  });
});
