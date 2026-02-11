const loadAuthService = ({ os = 'web', existingProfile = null } = {}) => {
  jest.resetModules();

  const signInWithPopup = jest.fn();
  const GoogleAuthProvider = jest.fn(() => ({ provider: 'google' }));
  const getUser = jest.fn().mockResolvedValue(existingProfile);
  const createUser = jest.fn().mockResolvedValue(undefined);
  const updateLastLogin = jest.fn().mockResolvedValue(undefined);

  jest.doMock('react-native', () => ({
    Platform: { OS: os },
  }));

  jest.doMock('firebase/auth', () => ({
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn(),
    updateProfile: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendEmailVerification: jest.fn(),
    GoogleAuthProvider,
    signInWithPopup,
  }));

  jest.doMock('../config/firebase', () => ({
    auth: { currentUser: null },
  }));

  jest.doMock('../services/firebase/userFirestoreService', () => ({
    userFirestoreService: {
      getUser,
      createUser,
      updateLastLogin,
    },
  }));

  const module = require('../services/firebase/authService');

  return {
    authService: module.authService,
    signInWithPopup,
    GoogleAuthProvider,
    getUser,
    createUser,
    updateLastLogin,
  };
};

const createFirebaseUser = (overrides = {}) => ({
  uid: 'user-1',
  email: 'mike@example.com',
  displayName: 'Mike',
  emailVerified: true,
  photoURL: null,
  metadata: {
    creationTime: '2025-01-01T00:00:00.000Z',
    lastSignInTime: '2025-01-02T00:00:00.000Z',
  },
  ...overrides,
});

describe('authService.signInWithGoogle', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('returns a web-only error on native platforms', async () => {
    const { authService, signInWithPopup } = loadAuthService({ os: 'android' });

    const result = await authService.signInWithGoogle();

    expect(result).toEqual({
      success: false,
      error: 'Google sign in is currently available on web only.',
    });
    expect(signInWithPopup).not.toHaveBeenCalled();
  });

  test('creates a profile for first-time Google sign in on web', async () => {
    const { authService, signInWithPopup, GoogleAuthProvider, getUser, createUser, updateLastLogin } =
      loadAuthService({ os: 'web', existingProfile: null });

    signInWithPopup.mockResolvedValue({
      user: createFirebaseUser({ uid: 'user-new' }),
    });

    const result = await authService.signInWithGoogle();

    expect(result.success).toBe(true);
    expect(GoogleAuthProvider).toHaveBeenCalledTimes(1);
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith('user-new');
    expect(createUser).toHaveBeenCalledWith({
      uid: 'user-new',
      email: 'mike@example.com',
      displayName: 'Mike',
      photoURL: null,
    });
    expect(updateLastLogin).not.toHaveBeenCalled();
  });

  test('updates last login for returning Google user on web', async () => {
    const { authService, signInWithPopup, createUser, updateLastLogin } = loadAuthService({
      os: 'web',
      existingProfile: { uid: 'user-existing' },
    });

    signInWithPopup.mockResolvedValue({
      user: createFirebaseUser({ uid: 'user-existing' }),
    });

    const result = await authService.signInWithGoogle();

    expect(result.success).toBe(true);
    expect(updateLastLogin).toHaveBeenCalledWith('user-existing');
    expect(createUser).not.toHaveBeenCalled();
  });
});
