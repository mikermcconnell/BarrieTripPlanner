// User Firestore Service - Manages user profile data
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import logger from '../../utils/logger';
import { getUserFacingErrorMessage } from '../../utils/userFacingErrors';

const COLLECTION = 'users';

const isExpectedOfflineFirestoreError = (error) => {
  const code = String(error?.code || error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const combined = `${code} ${message}`;

  return /unavailable|offline|network|timeout|timed out/.test(combined);
};

const logUserFirestoreError = (message, error) => {
  if (isExpectedOfflineFirestoreError(error)) {
    logger.info(`${message} Firestore is offline; using local fallback where available.`, {
      code: error?.code,
    });
    return;
  }

  logger.error(message, error);
};

export const userFirestoreService = {
  // Create new user document
  async createUser({ uid, email, displayName }) {
    try {
      const userRef = doc(db, COLLECTION, uid);

      await setDoc(userRef, {
        uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        settings: {
          notifications: {
            serviceAlerts: true,
            tripReminders: true,
            nearbyAlerts: false,
            transitNews: false,
          },
          preferences: {
            defaultMapType: 'standard',
            showWheelchairAccessible: false,
          },
        },
      });

      return { success: true };
    } catch (error) {
      logUserFirestoreError('Error creating user:', error);
      return { success: false, error: getUserFacingErrorMessage(error, 'Could not create your profile. Please try again.') };
    }
  },

  // Get user profile
  async getUser(uid) {
    try {
      const userRef = doc(db, COLLECTION, uid);
      const snapshot = await getDoc(userRef);

      if (!snapshot.exists()) {
        return null;
      }

      return this.docToUser(snapshot);
    } catch (error) {
      logUserFirestoreError('Error getting user:', error);
      return null;
    }
  },

  // Update user profile
  async updateUser(uid, updates) {
    try {
      const userRef = doc(db, COLLECTION, uid);

      await updateDoc(userRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      logUserFirestoreError('Error updating user:', error);
      return { success: false, error: getUserFacingErrorMessage(error, 'Could not update your profile. Please try again.') };
    }
  },

  // Update last login timestamp
  async updateLastLogin(uid) {
    try {
      const userRef = doc(db, COLLECTION, uid);

      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      logUserFirestoreError('Error updating last login:', error);
      return { success: false, error: getUserFacingErrorMessage(error, 'Could not update your account. Please try again.') };
    }
  },

  // Update notification settings
  async updateNotificationSettings(uid, settings) {
    try {
      const userRef = doc(db, COLLECTION, uid);

      await updateDoc(userRef, {
        'settings.notifications': settings,
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      logUserFirestoreError('Error updating notification settings:', error);
      return { success: false, error: getUserFacingErrorMessage(error, 'Could not update notification settings. Please try again.') };
    }
  },

  // Update push token
  async updatePushToken(uid, pushToken) {
    try {
      const userRef = doc(db, COLLECTION, uid);

      await updateDoc(userRef, {
        pushToken,
        pushTokenUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      logUserFirestoreError('Error updating push token:', error);
      return { success: false, error: getUserFacingErrorMessage(error, 'Could not update notification settings. Please try again.') };
    }
  },

  // Update subscribed routes for news notifications
  async updateSubscribedRoutes(uid, routes) {
    try {
      const userRef = doc(db, COLLECTION, uid);

      await updateDoc(userRef, {
        subscribedRoutes: routes,
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      logUserFirestoreError('Error updating subscribed routes:', error);
      return { success: false, error: getUserFacingErrorMessage(error, 'Could not update route subscriptions. Please try again.') };
    }
  },

  // Convert Firestore document to user object
  docToUser(doc) {
    const data = doc.data();
    return {
      ...data,
      uid: doc.id,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      lastLoginAt: data.lastLoginAt?.toDate?.()?.toISOString() ?? null,
    };
  },
};

export default userFirestoreService;
