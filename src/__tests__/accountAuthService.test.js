const mockUpdateProfile = jest.fn();
const mockVerifyBeforeUpdateEmail = jest.fn();
const mockUpdateUser = jest.fn();

const firebaseUser = {
  uid: 'user-1',
  email: 'old@example.com',
  displayName: 'Old Name',
  emailVerified: true,
  photoURL: null,
  providerData: [{ providerId: 'password' }],
  metadata: {},
};

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  updateProfile: (...args) => mockUpdateProfile(...args),
  verifyBeforeUpdateEmail: (...args) => mockVerifyBeforeUpdateEmail(...args),
  sendPasswordResetEmail: jest.fn(),
  sendEmailVerification: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
  signInWithCredential: jest.fn(),
}));
jest.mock('../config/firebase', () => ({ auth: { currentUser: firebaseUser } }));
jest.mock('../config/runtimeConfig', () => ({
  __esModule: true,
  default: { googleAuth: { webClientId: 'test' } },
  GOOGLE_SIGN_IN_DISABLED_MESSAGE: 'disabled',
}));
jest.mock('../services/firebase/userFirestoreService', () => ({
  userFirestoreService: {
    updateUser: (...args) => mockUpdateUser(...args),
    updateLastLogin: jest.fn(),
    createUser: jest.fn(),
    getUser: jest.fn(),
  },
}));
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), log: jest.fn() },
}));

const { authService } = require('../services/firebase/authService');

describe('account auth operations', () => {
  beforeEach(() => {
    firebaseUser.displayName = 'Old Name';
    mockUpdateProfile.mockReset().mockImplementation(async (_user, updates) => {
      if (Object.prototype.hasOwnProperty.call(updates, 'displayName')) firebaseUser.displayName = updates.displayName;
    });
    mockVerifyBeforeUpdateEmail.mockReset().mockResolvedValue(undefined);
    mockUpdateUser.mockReset().mockResolvedValue({ success: true });
  });

  test('updates Firebase Auth and Firestore display names together', async () => {
    const result = await authService.updateDisplayName('  Mike McConnell  ');
    expect(result.success).toBe(true);
    expect(mockUpdateProfile).toHaveBeenCalledWith(firebaseUser, { displayName: 'Mike McConnell' });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { displayName: 'Mike McConnell' });
    expect(result.user.displayName).toBe('Mike McConnell');
  });

  test('rolls back the Auth display name when Firestore persistence fails', async () => {
    mockUpdateUser.mockResolvedValue({ success: false, error: 'offline' });
    const result = await authService.updateDisplayName('New Name');
    expect(result).toEqual({ success: false, error: 'offline' });
    expect(mockUpdateProfile).toHaveBeenLastCalledWith(firebaseUser, { displayName: 'Old Name' });
  });

  test('reports and returns the current user when display-name rollback also fails', async () => {
    mockUpdateUser.mockResolvedValue({ success: false, error: 'offline' });
    mockUpdateProfile
      .mockImplementationOnce(async (_user, updates) => {
        firebaseUser.displayName = updates.displayName;
      })
      .mockRejectedValueOnce(new Error('rollback failed'));

    const result = await authService.updateDisplayName('New Name');

    expect(result).toMatchObject({
      success: false,
      partial: true,
      user: { displayName: 'New Name' },
    });
    expect(result.error).toMatch(/could not be updated/i);
  });

  test('uses Firebase verified email-change flow', async () => {
    const result = await authService.requestEmailChange(' NEW@example.com ');
    expect(result.success).toBe(true);
    expect(mockVerifyBeforeUpdateEmail).toHaveBeenCalledWith(firebaseUser, 'new@example.com');
  });

  test('preserves the anonymous-account flag in formatted auth state', () => {
    expect(authService.formatUser({ ...firebaseUser, isAnonymous: true })).toMatchObject({
      isAnonymous: true,
    });
  });
});
