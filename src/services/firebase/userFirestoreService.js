// User Firestore Service - Manages user profile data
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { getUserFacingErrorMessage } from '../../utils/userFacingErrors';

const COLLECTION = 'users';

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
      console.error('Error creating user:', error);
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
      console.error('Error getting user:', error);
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
      console.error('Error updating user:', error);
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
      console.error('Error updating last login:', error);
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
      console.error('Error updating notification settings:', error);
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
      console.error('Error updating push token:', error);
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
      console.error('Error updating subscribed routes:', error);
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
