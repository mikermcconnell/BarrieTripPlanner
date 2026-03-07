// Firebase configuration and initialization
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import runtimeConfig from './runtimeConfig';
import logger from '../utils/logger';

const firebaseConfig = runtimeConfig.firebase.config;
const missingFirebaseConfigMessage =
  'Firebase configuration is incomplete. Update EXPO_PUBLIC_FIREBASE_* environment variables before running the app.';

// Initialize Firebase (prevent re-initialization)
let app = null;
let auth = null;
let db = null;
let analytics = null;
let firebaseStartupError = null;

if (!runtimeConfig.firebase.isConfigured) {
  firebaseStartupError = new Error(missingFirebaseConfigMessage);
  if (!runtimeConfig.isProductionLike) {
    logger.warn(missingFirebaseConfigMessage);
  }
} else {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApps()[0];
    }
  } catch (error) {
    firebaseStartupError = error;
    logger.error('Firebase initialization failed:', error);
  }
}

// Initialize Auth with platform-specific persistence
if (app) {
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch (error) {
      auth = getAuth(app);
    }
  }

  db = getFirestore(app);
}

export { app, auth, db, analytics, firebaseStartupError };
export default app;
