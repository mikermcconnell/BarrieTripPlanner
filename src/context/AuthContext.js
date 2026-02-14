import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/firebase/authService';
import { userFirestoreService } from '../services/firebase/userFirestoreService';
import { favoritesFirestoreService } from '../services/firebase/favoritesFirestoreService';
import { tripHistoryFirestoreService } from '../services/firebase/tripHistoryFirestoreService';
import { secureSet, secureGet, secureDelete } from '../utils/secureStorage';
import logger from '../utils/logger';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Storage keys for local cache/fallback
const STORAGE_KEYS = {
  USER: '@barrie_transit_user',
  FAVORITES: '@barrie_transit_favorites',
  TRIP_HISTORY: '@barrie_transit_history',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [favorites, setFavorites] = useState({ stops: [], routes: [] });
  const [tripHistory, setTripHistory] = useState([]);
  const [authError, setAuthError] = useState(null);

  // Unsubscribe functions for real-time listeners (ref to avoid stale closures)
  const unsubscribersRef = useRef({
    stops: null,
    routes: null,
    history: null,
  });

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        // Load user profile from Firestore
        const profile = await userFirestoreService.getUser(firebaseUser.uid);
        setUserProfile(profile);

        // Set up real-time listeners for user data
        setupRealtimeListeners(firebaseUser.uid);

        // Cache user locally for offline access (encrypted on native)
        await secureSet(STORAGE_KEYS.USER, JSON.stringify(firebaseUser));
      } else {
        setUser(null);
        setUserProfile(null);

        // Clean up listeners
        cleanupListeners();

        // Try to load cached data for offline mode
        await loadCachedData();
      }

      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      cleanupListeners();
    };
  }, []);

  // Set up real-time listeners for favorites and history
  const setupRealtimeListeners = (uid) => {
    // Clean up any existing listeners first
    cleanupListeners();

    // Subscribe to favorite stops
    const stopsUnsubscribe = favoritesFirestoreService.subscribeToFavoriteStops(
      uid,
      (stops) => {
        setFavorites((prev) => {
          const updated = { ...prev, stops };
          // Cache using latest state from updater
          AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated));
          return updated;
        });
      },
      (error) => logger.error('Stops listener error:', error)
    );

    // Subscribe to favorite routes
    const routesUnsubscribe = favoritesFirestoreService.subscribeToFavoriteRoutes(
      uid,
      (routes) => {
        setFavorites((prev) => {
          const updated = { ...prev, routes };
          // Cache using latest state from updater
          AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated));
          return updated;
        });
      },
      (error) => logger.error('Routes listener error:', error)
    );

    // Subscribe to trip history
    const historyUnsubscribe = tripHistoryFirestoreService.subscribeToTripHistory(
      uid,
      (history) => {
        setTripHistory(history);
        // Cache locally
        AsyncStorage.setItem(STORAGE_KEYS.TRIP_HISTORY, JSON.stringify(history));
      },
      (error) => logger.error('History listener error:', error)
    );

    unsubscribersRef.current = {
      stops: stopsUnsubscribe,
      routes: routesUnsubscribe,
      history: historyUnsubscribe,
    };
  };

  // Clean up all listeners
  const cleanupListeners = () => {
    Object.values(unsubscribersRef.current).forEach((unsubscribe) => {
      if (unsubscribe) unsubscribe();
    });
    unsubscribersRef.current = { stops: null, routes: null, history: null };
  };

  // Load cached data for offline mode
  const loadCachedData = async () => {
    try {
      const [favoritesData, historyData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.FAVORITES),
        AsyncStorage.getItem(STORAGE_KEYS.TRIP_HISTORY),
      ]);

      if (favoritesData) setFavorites(JSON.parse(favoritesData));
      if (historyData) setTripHistory(JSON.parse(historyData));
    } catch (error) {
      logger.error('Error loading cached data:', error);
    }
  };

  // Sign in with email and password
  const signIn = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      const result = await authService.signInWithEmail(email, password);

      if (!result.success) {
        setAuthError(result.error);
      }

      return result;
    } catch (error) {
      const errorMessage = error.message || 'Sign in failed';
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Sign up with email and password
  const signUp = useCallback(async (email, password, displayName) => {
    setAuthError(null);
    try {
      const result = await authService.signUpWithEmail(email, password, displayName);

      if (!result.success) {
        setAuthError(result.error);
      }

      return result;
    } catch (error) {
      const errorMessage = error.message || 'Sign up failed';
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      cleanupListeners();
      const result = await authService.signOut();

      if (result.success) {
        setUser(null);
        setUserProfile(null);
        // Optionally clear local cache on sign out
        // await AsyncStorage.multiRemove([STORAGE_KEYS.USER, STORAGE_KEYS.FAVORITES, STORAGE_KEYS.TRIP_HISTORY]);
      }

      return result;
    } catch (error) {
      logger.error('Sign out error:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      const result = await authService.signInWithGoogle();

      if (!result.success && result.error) {
        setAuthError(result.error);
      }

      return result;
    } catch (error) {
      const errorMessage = error.message || 'Google sign in failed';
      setAuthError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Send password reset email
  const sendPasswordReset = useCallback(async (email) => {
    return await authService.sendPasswordReset(email);
  }, []);

  // ==================== FAVORITES ====================

  // Add favorite stop
  const addFavoriteStop = useCallback(
    async (stop) => {
      try { const { trackEvent } = require('../services/analyticsService'); trackEvent('favorite_added', { type: 'stop' }); } catch {}
      if (!user) {
        // Fallback to local storage for non-authenticated users
        const newFavorites = {
          ...favorites,
          stops: [...favorites.stops.filter((s) => s.id !== stop.id), stop],
        };
        setFavorites(newFavorites);
        await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavorites));
        return { success: true };
      }

      return await favoritesFirestoreService.addFavoriteStop(user.uid, stop);
    },
    [user, favorites]
  );

  // Remove favorite stop
  const removeFavoriteStop = useCallback(
    async (stopId) => {
      if (!user) {
        const newFavorites = {
          ...favorites,
          stops: favorites.stops.filter((s) => s.id !== stopId),
        };
        setFavorites(newFavorites);
        await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavorites));
        return { success: true };
      }

      return await favoritesFirestoreService.removeFavoriteStop(user.uid, stopId);
    },
    [user, favorites]
  );

  // Add favorite route
  const addFavoriteRoute = useCallback(
    async (route) => {
      if (!user) {
        const newFavorites = {
          ...favorites,
          routes: [...favorites.routes.filter((r) => r.id !== route.id), route],
        };
        setFavorites(newFavorites);
        await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavorites));
        return { success: true };
      }

      return await favoritesFirestoreService.addFavoriteRoute(user.uid, route);
    },
    [user, favorites]
  );

  // Remove favorite route
  const removeFavoriteRoute = useCallback(
    async (routeId) => {
      if (!user) {
        const newFavorites = {
          ...favorites,
          routes: favorites.routes.filter((r) => r.id !== routeId),
        };
        setFavorites(newFavorites);
        await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavorites));
        return { success: true };
      }

      return await favoritesFirestoreService.removeFavoriteRoute(user.uid, routeId);
    },
    [user, favorites]
  );

  // Check if stop is favorite
  const isStopFavorite = useCallback(
    (stopId) => {
      return favorites.stops.some((s) => s.id === stopId);
    },
    [favorites.stops]
  );

  // Check if route is favorite
  const isRouteFavorite = useCallback(
    (routeId) => {
      return favorites.routes.some((r) => r.id === routeId);
    },
    [favorites.routes]
  );

  // ==================== TRIP HISTORY ====================

  // Add trip to history
  const addTripToHistory = useCallback(
    async (trip) => {
      if (!user) {
        // Fallback to local storage
        const newHistory = [
          { ...trip, searchedAt: new Date().toISOString() },
          ...tripHistory.slice(0, 19),
        ];
        setTripHistory(newHistory);
        await AsyncStorage.setItem(STORAGE_KEYS.TRIP_HISTORY, JSON.stringify(newHistory));
        return { success: true };
      }

      return await tripHistoryFirestoreService.addTripToHistory(user.uid, trip);
    },
    [user, tripHistory]
  );

  // Clear trip history
  const clearTripHistory = useCallback(async () => {
    if (!user) {
      setTripHistory([]);
      await AsyncStorage.removeItem(STORAGE_KEYS.TRIP_HISTORY);
      return { success: true };
    }

    return await tripHistoryFirestoreService.clearTripHistory(user.uid);
  }, [user]);

  // ==================== SETTINGS ====================

  // Update notification settings
  const updateNotificationSettings = useCallback(
    async (settings) => {
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      return await userFirestoreService.updateNotificationSettings(user.uid, settings);
    },
    [user]
  );

  // Update push token
  const updatePushToken = useCallback(
    async (token) => {
      if (!user) {
        // Store locally for later sync
        await secureSet('@barrie_transit_push_token', token);
        return { success: true };
      }

      return await userFirestoreService.updatePushToken(user.uid, token);
    },
    [user]
  );

  // ==================== DATA MIGRATION ====================

  // Migrate local data to Firebase after sign in
  const migrateLocalDataToFirebase = useCallback(async () => {
    if (!user) return;

    try {
      // Get local data
      const [localFavorites, localHistory] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.FAVORITES),
        AsyncStorage.getItem(STORAGE_KEYS.TRIP_HISTORY),
      ]);

      // Sync favorites if they exist locally
      if (localFavorites) {
        const parsed = JSON.parse(localFavorites);
        if (parsed.stops?.length > 0 || parsed.routes?.length > 0) {
          await favoritesFirestoreService.syncFavoritesToFirestore(user.uid, parsed);
        }
      }

      // Sync trip history if it exists locally
      if (localHistory) {
        const parsed = JSON.parse(localHistory);
        if (parsed.length > 0) {
          await tripHistoryFirestoreService.syncHistoryToFirestore(user.uid, parsed);
        }
      }

      // Clear local data after successful migration
      // await AsyncStorage.multiRemove([STORAGE_KEYS.FAVORITES, STORAGE_KEYS.TRIP_HISTORY]);

      return { success: true };
    } catch (error) {
      logger.error('Error migrating local data:', error);
      return { success: false, error: error.message };
    }
  }, [user]);

  const value = {
    // User state
    user,
    userProfile,
    isLoading,
    isAuthenticated: !!user,
    authError,

    // Auth methods
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    sendPasswordReset,

    // Favorites
    favorites,
    addFavoriteStop,
    removeFavoriteStop,
    addFavoriteRoute,
    removeFavoriteRoute,
    isStopFavorite,
    isRouteFavorite,

    // History
    tripHistory,
    addTripToHistory,
    clearTripHistory,

    // Settings
    updateNotificationSettings,
    updatePushToken,

    // Migration
    migrateLocalDataToFirebase,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
