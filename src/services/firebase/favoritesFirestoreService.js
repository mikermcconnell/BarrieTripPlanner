// Favorites Firestore Service - Manages user favorites (stops and routes)
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const getUserFavoritesCollection = (uid, type) =>
  collection(db, 'users', uid, 'favorites', type, 'items');

const getUserFavoritesDoc = (uid, type) =>
  doc(db, 'users', uid, 'favorites', type);

export const favoritesFirestoreService = {
  // ==================== STOPS ====================

  // Add a favorite stop
  async addFavoriteStop(uid, stop) {
    try {
      const stopRef = doc(db, 'users', uid, 'favoriteStops', stop.id);

      await setDoc(stopRef, {
        ...stop,
        addedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('Error adding favorite stop:', error);
      return { success: false, error: error.message };
    }
  },

  // Remove a favorite stop
  async removeFavoriteStop(uid, stopId) {
    try {
      const stopRef = doc(db, 'users', uid, 'favoriteStops', stopId);
      await deleteDoc(stopRef);

      return { success: true };
    } catch (error) {
      console.error('Error removing favorite stop:', error);
      return { success: false, error: error.message };
    }
  },

  // Get all favorite stops
  async getFavoriteStops(uid) {
    try {
      const stopsRef = collection(db, 'users', uid, 'favoriteStops');
      const snapshot = await getDocs(stopsRef);

      return snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        addedAt: doc.data().addedAt?.toDate?.()?.toISOString() ?? null,
      }));
    } catch (error) {
      console.error('Error getting favorite stops:', error);
      return [];
    }
  },

  // Subscribe to favorite stops (real-time updates)
  subscribeToFavoriteStops(uid, onUpdate, onError) {
    const stopsRef = collection(db, 'users', uid, 'favoriteStops');

    return onSnapshot(
      stopsRef,
      (snapshot) => {
        const stops = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
          addedAt: doc.data().addedAt?.toDate?.()?.toISOString() ?? null,
        }));
        onUpdate(stops);
      },
      (error) => {
        console.error('Favorite stops subscription error:', error);
        onError?.(error);
      }
    );
  },

  // ==================== ROUTES ====================

  // Add a favorite route
  async addFavoriteRoute(uid, route) {
    try {
      const routeRef = doc(db, 'users', uid, 'favoriteRoutes', route.id);

      await setDoc(routeRef, {
        ...route,
        addedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('Error adding favorite route:', error);
      return { success: false, error: error.message };
    }
  },

  // Remove a favorite route
  async removeFavoriteRoute(uid, routeId) {
    try {
      const routeRef = doc(db, 'users', uid, 'favoriteRoutes', routeId);
      await deleteDoc(routeRef);

      return { success: true };
    } catch (error) {
      console.error('Error removing favorite route:', error);
      return { success: false, error: error.message };
    }
  },

  // Get all favorite routes
  async getFavoriteRoutes(uid) {
    try {
      const routesRef = collection(db, 'users', uid, 'favoriteRoutes');
      const snapshot = await getDocs(routesRef);

      return snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        addedAt: doc.data().addedAt?.toDate?.()?.toISOString() ?? null,
      }));
    } catch (error) {
      console.error('Error getting favorite routes:', error);
      return [];
    }
  },

  // Subscribe to favorite routes (real-time updates)
  subscribeToFavoriteRoutes(uid, onUpdate, onError) {
    const routesRef = collection(db, 'users', uid, 'favoriteRoutes');

    return onSnapshot(
      routesRef,
      (snapshot) => {
        const routes = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
          addedAt: doc.data().addedAt?.toDate?.()?.toISOString() ?? null,
        }));
        onUpdate(routes);
      },
      (error) => {
        console.error('Favorite routes subscription error:', error);
        onError?.(error);
      }
    );
  },

  // ==================== BATCH OPERATIONS ====================

  // Sync all favorites from local to Firestore (for migration)
  async syncFavoritesToFirestore(uid, favorites) {
    try {
      const batch = writeBatch(db);

      // Add all stops
      for (const stop of favorites.stops || []) {
        const stopRef = doc(db, 'users', uid, 'favoriteStops', stop.id);
        batch.set(stopRef, {
          ...stop,
          addedAt: serverTimestamp(),
        });
      }

      // Add all routes
      for (const route of favorites.routes || []) {
        const routeRef = doc(db, 'users', uid, 'favoriteRoutes', route.id);
        batch.set(routeRef, {
          ...route,
          addedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      return { success: true };
    } catch (error) {
      console.error('Error syncing favorites:', error);
      return { success: false, error: error.message };
    }
  },

  // Get all favorites (stops and routes)
  async getAllFavorites(uid) {
    try {
      const [stops, routes] = await Promise.all([
        this.getFavoriteStops(uid),
        this.getFavoriteRoutes(uid),
      ]);

      return { stops, routes };
    } catch (error) {
      console.error('Error getting all favorites:', error);
      return { stops: [], routes: [] };
    }
  },
};

export default favoritesFirestoreService;
