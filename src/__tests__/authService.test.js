const loadAuthService = ({
  os = 'web',
  existingProfile = null,
  nativeGoogleSignInError = null,
  nativeGoogleSignInResult = { data: { idToken: 'native-id-token' } },
} = {}) => {
  jest.resetModules();

  const signInWithPopup = jest.fn();
  const signInWithCredential = jest.fn();
  const GoogleAuthProvider = jest.fn(() => ({ provider: 'google' }));
  GoogleAuthProvider.credential = jest.fn((token) => ({ token }));
  const getUser = jest.fn().mockResolvedValue(existingProfile);
  const createUser = jest.fn().mockResolvedValue(undefined);
  const updateLastLogin = jest.fn().mockResolvedValue(undefined);
  const nativeConfigure = jest.fn();
  const nativeSignIn = nativeGoogleSignInError
    ? jest.fn().mockRejectedValue(nativeGoogleSignInError)
    : jest.fn().mockResolvedValue(nativeGoogleSignInResult);

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
    signInWithCredential,
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
  jest.doMock('@react-native-google-signin/google-signin', () => ({
    GoogleSignin: {
      configure: nativeConfigure,
      signIn: nativeSignIn,
    },
  }));

  const module = require('../services/firebase/authService');

  return {
    authService: module.authService,
    signInWithPopup,
    signInWithCredential,
    GoogleAuthProvider,
    getUser,
    createUser,
    updateLastLogin,
    nativeConfigure,
    nativeSignIn,
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

  test('supports native Google sign in when running on Android/iOS', async () => {
    const {
      authService,
      signInWithPopup,
      signInWithCredential,
      nativeConfigure,
      nativeSignIn,
      createUser,
    } = loadAuthService({ os: 'android' });
    signInWithCredential.mockResolvedValue({
      user: createFirebaseUser({ uid: 'native-user' }),
    });

    const result = await authService.signInWithGoogle();

    expect(result.success).toBe(true);
    expect(nativeConfigure).toHaveBeenCalledTimes(1);
    expect(nativeSignIn).toHaveBeenCalledTimes(1);
    expect(signInWithCredential).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith({
      uid: 'native-user',
      email: 'mike@example.com',
      displayName: 'Mike',
      photoURL: null,
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
