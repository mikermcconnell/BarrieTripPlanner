const mockFirestore = {
  doc: jest.fn((...parts) => ({ type: 'doc', path: parts.filter(Boolean).join('/') })),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
};

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

jest.mock('firebase/firestore', () => mockFirestore);

jest.mock('../config/firebase', () => ({
  db: 'DB',
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: mockLogger,
}));

describe('userFirestoreService', () => {
  let userFirestoreService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.doMock('firebase/firestore', () => mockFirestore);
    jest.doMock('../config/firebase', () => ({ db: 'DB' }));
    jest.doMock('../utils/logger', () => ({
      __esModule: true,
      default: mockLogger,
    }));
    userFirestoreService = require('../services/firebase/userFirestoreService').userFirestoreService;
  });

  test('returns null without console.error when a user profile read fails offline', async () => {
    const consoleError = jest.spyOn(console, 'error');
    const offlineError = new Error('FirebaseError: Failed to get document because the client is offline.');
    offlineError.code = 'unavailable';
    mockFirestore.getDoc.mockRejectedValue(offlineError);

    await expect(userFirestoreService.getUser('user-1')).resolves.toBeNull();

    expect(mockFirestore.doc).toHaveBeenCalledWith('DB', 'users', 'user-1');
    expect(consoleError).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Error getting user: Firestore is offline; using local fallback where available.',
      { code: 'unavailable' }
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('still logs unexpected user profile read failures as errors', async () => {
    const unexpectedError = new Error('bad document shape');
    mockFirestore.getDoc.mockRejectedValue(unexpectedError);

    await expect(userFirestoreService.getUser('user-1')).resolves.toBeNull();

    expect(mockLogger.error).toHaveBeenCalledWith('Error getting user:', unexpectedError);
  });

  test('does not console.error when syncing push token fails offline', async () => {
    const consoleError = jest.spyOn(console, 'error');
    const offlineError = new Error('FirebaseError: Failed to update document because the client is offline.');
    offlineError.code = 'unavailable';
    mockFirestore.updateDoc.mockRejectedValue(offlineError);

    const result = await userFirestoreService.updatePushToken('user-1', 'ExponentPushToken[test]');

    expect(result).toEqual({
      success: false,
      error: 'Check your connection, then try again.',
    });
    expect(consoleError).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Error updating push token: Firestore is offline; using local fallback where available.',
      { code: 'unavailable' }
    );
  });
});
