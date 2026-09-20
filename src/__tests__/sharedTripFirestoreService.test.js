const mockFirestore = {
  collection: jest.fn((...parts) => ({ type: 'collection', path: parts.filter(Boolean).join('/') })),
  doc: jest.fn((...parts) => {
    if (parts.length === 1 && parts[0]?.type === 'collection') {
      return { type: 'doc', id: 'random-share-id', path: `${parts[0].path}/random-share-id` };
    }
    return { type: 'doc', id: parts[parts.length - 1], path: parts.filter(Boolean).join('/') };
  }),
  onSnapshot: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  setDoc: jest.fn(),
};

const mockEnsureFirebaseUser = jest.fn();

jest.mock('firebase/firestore', () => mockFirestore);
jest.mock('../config/firebase', () => ({ db: 'DB' }));
jest.mock('../services/proxyAuth', () => ({
  ensureFirebaseUser: (...args) => mockEnsureFirebaseUser(...args),
}));

const { sharedTripFirestoreService } = require('../services/firebase/sharedTripFirestoreService');

const trip = {
  id: 'trip-home-work',
  name: 'Home to Work',
  icon: 'Route',
  from: { name: 'Home', addressText: '1 Home St', lat: 44.4, lon: -79.7 },
  to: { name: 'Work', addressText: '2 Work Rd', lat: 44.5, lon: -79.6 },
  timePreference: null,
  summary: { duration: 1200, transfers: 0, walkDistance: 100 },
  isPinned: false,
};

describe('sharedTripFirestoreService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureFirebaseUser.mockResolvedValue({ uid: 'anonymous-editor' });
  });

  test('creates an unguessable shared document owned by the invisible Firebase user', async () => {
    const result = await sharedTripFirestoreService.createSharedTrip(trip);

    expect(result).toEqual({ success: true, shareId: 'random-share-id' });
    expect(mockFirestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'DB/sharedTrips/random-share-id' }),
      expect.objectContaining({
        shareId: 'random-share-id',
        trip,
        createdBy: 'anonymous-editor',
        lastEditedBy: 'anonymous-editor',
        revision: 1,
      })
    );
  });

  test('updates only the expected revision and records the editor', async () => {
    const transaction = {
      get: jest.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ revision: 4 }),
      }),
      update: jest.fn(),
    };
    mockFirestore.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    const result = await sharedTripFirestoreService.updateSharedTrip('share-1', trip, 4);

    expect(result).toEqual({ success: true, revision: 5 });
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'DB/sharedTrips/share-1' }),
      expect.objectContaining({ revision: 5, lastEditedBy: 'anonymous-editor', trip })
    );
  });

  test('rejects a stale edit rather than overwriting someone else', async () => {
    const transaction = {
      get: jest.fn().mockResolvedValue({ exists: () => true, data: () => ({ revision: 5 }) }),
      update: jest.fn(),
    };
    mockFirestore.runTransaction.mockImplementation(async (_db, callback) => callback(transaction));

    const result = await sharedTripFirestoreService.updateSharedTrip('share-1', trip, 4);

    expect(result.success).toBe(false);
    expect(result.code).toBe('shared-trip/revision-conflict');
    expect(transaction.update).not.toHaveBeenCalled();
  });
});
