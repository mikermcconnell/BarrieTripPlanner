const mockFirestore = {
  collection: jest.fn((...parts) => ({ type: 'collection', path: parts.filter(Boolean).join('/') })),
  doc: jest.fn((...parts) => ({ type: 'doc', path: parts.filter(Boolean).join('/') })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
  updateDoc: jest.fn(),
  onSnapshot: jest.fn(),
  orderBy: jest.fn((field, direction) => ({ field, direction })),
  query: jest.fn((ref, ...constraints) => ({ ref, constraints })),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  increment: jest.fn((amount) => ({ incrementBy: amount })),
};

jest.mock('firebase/firestore', () => mockFirestore);

jest.mock('../config/firebase', () => ({
  db: 'DB',
}));

describe('savedTransitFirestoreService', () => {
  let savedTransitFirestoreService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockFirestore.getDoc.mockResolvedValue({ exists: () => false });
    jest.doMock('firebase/firestore', () => mockFirestore);
    jest.doMock('../config/firebase', () => ({ db: 'DB' }));
    savedTransitFirestoreService = require('../services/firebase/savedTransitFirestoreService').savedTransitFirestoreService;
  });

  test('adds saved places under the signed-in user', async () => {
    await savedTransitFirestoreService.addSavedPlace('uid-1', { id: 'home', name: 'Home', lat: 44.38, lon: -79.69 });

    expect(mockFirestore.doc).toHaveBeenCalledWith('DB', 'users', 'uid-1', 'savedPlaces', 'home');
    expect(mockFirestore.setDoc).toHaveBeenCalledWith(
      { type: 'doc', path: 'DB/users/uid-1/savedPlaces/home' },
      expect.objectContaining({
        id: 'home',
        name: 'Home',
        createdAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
      }),
      { merge: true }
    );
  });

  test('does not overwrite createdAt when updating an existing saved place', async () => {
    mockFirestore.getDoc.mockResolvedValue({ exists: () => true });

    await savedTransitFirestoreService.addSavedPlace('uid-1', { id: 'home', name: 'Home', lat: 44.38, lon: -79.69 });

    expect(mockFirestore.setDoc).toHaveBeenCalledWith(
      { type: 'doc', path: 'DB/users/uid-1/savedPlaces/home' },
      expect.not.objectContaining({ createdAt: expect.anything() }),
      { merge: true }
    );
  });

  test('adds saved trips under the signed-in user', async () => {
    await savedTransitFirestoreService.addSavedTrip('uid-1', {
      id: 'trip-home-work',
      name: 'Home to Work',
      from: { name: 'Home', lat: 44.38, lon: -79.69 },
      to: { name: 'Work', lat: 44.4, lon: -79.7 },
    });

    expect(mockFirestore.doc).toHaveBeenCalledWith('DB', 'users', 'uid-1', 'savedTrips', 'trip-home-work');
    expect(mockFirestore.setDoc).toHaveBeenCalledWith(
      { type: 'doc', path: 'DB/users/uid-1/savedTrips/trip-home-work' },
      expect.objectContaining({
        id: 'trip-home-work',
        name: 'Home to Work',
        useCount: 0,
        createdAt: 'SERVER_TIMESTAMP',
      }),
      { merge: true }
    );
  });

  test('does not overwrite createdAt when updating an existing saved trip', async () => {
    mockFirestore.getDoc.mockResolvedValue({ exists: () => true });

    await savedTransitFirestoreService.addSavedTrip('uid-1', {
      id: 'trip-home-work',
      name: 'Home to Work',
      from: { name: 'Home', lat: 44.38, lon: -79.69 },
      to: { name: 'Work', lat: 44.4, lon: -79.7 },
    });

    expect(mockFirestore.setDoc).toHaveBeenCalledWith(
      { type: 'doc', path: 'DB/users/uid-1/savedTrips/trip-home-work' },
      expect.not.objectContaining({ createdAt: expect.anything() }),
      { merge: true }
    );
  });

  test('touching a saved trip updates last used time and increments use count', async () => {
    await savedTransitFirestoreService.touchSavedTrip('uid-1', 'trip-1');

    expect(mockFirestore.setDoc).toHaveBeenCalledWith(
      { type: 'doc', path: 'DB/users/uid-1/savedTrips/trip-1' },
      expect.objectContaining({
        lastUsedAt: 'SERVER_TIMESTAMP',
        updatedAt: 'SERVER_TIMESTAMP',
        useCount: { incrementBy: 1 },
      }),
      { merge: true }
    );
  });

  test('removes saved places and trips by id', async () => {
    await savedTransitFirestoreService.removeSavedPlace('uid-1', 'home');
    await savedTransitFirestoreService.removeSavedTrip('uid-1', 'trip-1');

    expect(mockFirestore.deleteDoc).toHaveBeenCalledWith({ type: 'doc', path: 'DB/users/uid-1/savedPlaces/home' });
    expect(mockFirestore.deleteDoc).toHaveBeenCalledWith({ type: 'doc', path: 'DB/users/uid-1/savedTrips/trip-1' });
  });

  test('maps snapshot timestamp fields to ISO strings', () => {
    const unsubscribe = jest.fn();
    mockFirestore.onSnapshot.mockImplementation((_ref, onUpdate) => {
      onUpdate({
        docs: [
          {
            id: 'home',
            data: () => ({
              name: 'Home',
              createdAt: { toDate: () => new Date('2026-05-03T12:00:00.000Z') },
              updatedAt: { toDate: () => new Date('2026-05-03T13:00:00.000Z') },
              lastUsedAt: null,
            }),
          },
        ],
      });
      return unsubscribe;
    });

    const onUpdate = jest.fn();
    const result = savedTransitFirestoreService.subscribeToSavedPlaces('uid-1', onUpdate);

    expect(result).toBe(unsubscribe);
    expect(onUpdate).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'home',
        name: 'Home',
        createdAt: '2026-05-03T12:00:00.000Z',
        updatedAt: '2026-05-03T13:00:00.000Z',
        lastUsedAt: null,
      }),
    ]);
  });
});
