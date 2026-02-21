// Firebase Authentication Service
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from '../../config/firebase';
import { userFirestoreService } from './userFirestoreService';

export const authService = {
  // Sign in with email and password
  async signInWithEmail(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update last login in Firestore
      await userFirestoreService.updateLastLogin(user.uid);

      return {
        success: true,
        user: this.formatUser(user),
      };
    } catch (error) {
      console.error('Sign in error:', error);
      return {
        success: false,
        error: this.getErrorMessage(error.code),
      };
    }
  },

  // Sign up with email and password
  async signUpWithEmail(email, password, displayName) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update display name
      if (displayName) {
        await updateProfile(user, { displayName });
      }

      // Create user document in Firestore
      await userFirestoreService.createUser({
        uid: user.uid,
        email: user.email,
        displayName: displayName || email.split('@')[0],
      });

      // Send email verification
      await sendEmailVerification(user);

      return {
        success: true,
        user: this.formatUser(user),
        message: 'Account created. Please check your email to verify your account.',
      };
    } catch (error) {
      console.error('Sign up error:', error);
      return {
        success: false,
        error: this.getErrorMessage(error.code),
      };
    }
  },

  // Sign out
  async signOut() {
    try {
      await firebaseSignOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  // Send password reset email
  async sendPasswordReset(email) {
    try {
      await sendPasswordResetEmail(auth, email);
      return {
        success: true,
        message: 'Password reset email sent. Check your inbox.',
      };
    } catch (error) {
      console.error('Password reset error:', error);
      return {
        success: false,
        error: this.getErrorMessage(error.code),
      };
    }
  },

  // Listen to auth state changes
  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, (user) => {
      callback(user ? this.formatUser(user) : null);
    });
  },

  // Get current user
  getCurrentUser() {
    const user = auth.currentUser;
    return user ? this.formatUser(user) : null;
  },

  // Format Firebase user to app user format
  formatUser(firebaseUser) {
    return {
      id: firebaseUser.uid,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
      emailVerified: firebaseUser.emailVerified,
      photoURL: firebaseUser.photoURL,
      createdAt: firebaseUser.metadata?.creationTime,
      lastLoginAt: firebaseUser.metadata?.lastSignInTime,
    };
  },

  // Sign in with Google (web uses popup, native uses @react-native-google-signin)
  async signInWithGoogle() {
    try {
      let userCredential;

      if (Platform.OS === 'web') {
        const provider = new GoogleAuthProvider();
        userCredential = await signInWithPopup(auth, provider);
      } else {
        // Native: use @react-native-google-signin
        const { GoogleSignin } = require('@react-native-google-signin/google-signin');
        GoogleSignin.configure({
          webClientId: '648843426695-7o1ji1vd60fgrckv1gd9kvnqok8uuprl.apps.googleusercontent.com',
        });
        const signInResult = await GoogleSignin.signIn();
        const idToken = signInResult.data?.idToken;
        if (!idToken) {
          return { success: false, error: 'Failed to get Google credentials.' };
        }
        const credential = GoogleAuthProvider.credential(idToken);
        userCredential = await signInWithCredential(auth, credential);
      }

      const user = userCredential.user;

      // Check if this is a new user — create Firestore profile if needed
      const existingProfile = await userFirestoreService.getUser(user.uid);
      if (!existingProfile) {
        await userFirestoreService.createUser({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0],
          photoURL: user.photoURL,
        });
      } else {
        await userFirestoreService.updateLastLogin(user.uid);
      }

      return {
        success: true,
        user: this.formatUser(user),
      };
    } catch (error) {
      console.error('Google sign in error:', error);
      // User cancelled
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'SIGN_IN_CANCELLED') {
        return { success: false, error: null };
      }
      return {
        success: false,
        error: this.getErrorMessage(error.code),
      };
    }
  },

  // Get user-friendly error messages
  getErrorMessage(errorCode) {
    const errorMessages = {
      'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/operation-not-allowed': 'Email/password accounts are not enabled.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };

    return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
  },
};

export default authService;
