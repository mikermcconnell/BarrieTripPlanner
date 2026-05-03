// Saved Transit Firestore Service - Manages signed-in saved places and reusable trip templates
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const timestampToIso = (value) => value?.toDate?.()?.toISOString?.() ?? value ?? null;

const mapSavedDoc = (snapshotDoc) => {
  const data = snapshotDoc.data();
  return {
    ...data,
    id: data.id || snapshotDoc.id,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    lastUsedAt: timestampToIso(data.lastUsedAt),
  };
};

const getSavedPlacesCollection = (uid) => collection(db, 'users', uid, 'savedPlaces');
const getSavedTripsCollection = (uid) => collection(db, 'users', uid, 'savedTrips');
const getSavedPlaceDoc = (uid, placeId) => doc(db, 'users', uid, 'savedPlaces', placeId);
const getSavedTripDoc = (uid, tripId) => doc(db, 'users', uid, 'savedTrips', tripId);

const sortSavedItems = (items) => items.sort((a, b) => {
  if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
  return String(a.name || '').localeCompare(String(b.name || ''));
});

export const savedTransitFirestoreService = {
  async addSavedPlace(uid, place) {
    try {
      if (!uid || !place?.id) return { success: false, error: 'Missing saved place details' };
      const placeRef = getSavedPlaceDoc(uid, place.id);
      const existing = await getDoc(placeRef);
      const data = {
        ...place,
        updatedAt: serverTimestamp(),
      };
      if (!existing.exists()) {
        data.createdAt = place.createdAt || serverTimestamp();
      }
      await setDoc(placeRef, data, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('Error adding saved place:', error);
      return { success: false, error: error.message };
    }
  },

  async removeSavedPlace(uid, placeId) {
    try {
      await deleteDoc(getSavedPlaceDoc(uid, placeId));
      return { success: true };
    } catch (error) {
      console.error('Error removing saved place:', error);
      return { success: false, error: error.message };
    }
  },

  async getSavedPlaces(uid) {
    try {
      const snapshot = await getDocs(query(getSavedPlacesCollection(uid), orderBy('updatedAt', 'desc')));
      return sortSavedItems(snapshot.docs.map(mapSavedDoc));
    } catch (error) {
      console.error('Error getting saved places:', error);
      return [];
    }
  },

  subscribeToSavedPlaces(uid, onUpdate, onError) {
    const q = query(getSavedPlacesCollection(uid), orderBy('updatedAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => onUpdate(sortSavedItems(snapshot.docs.map(mapSavedDoc))),
      (error) => {
        console.error('Saved places subscription error:', error);
        onError?.(error);
      }
    );
  },

  async touchSavedPlace(uid, placeId) {
    try {
      await setDoc(getSavedPlaceDoc(uid, placeId), {
        lastUsedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('Error updating saved place usage:', error);
      return { success: false, error: error.message };
    }
  },

  async addSavedTrip(uid, trip) {
    try {
      if (!uid || !trip?.id) return { success: false, error: 'Missing saved trip details' };
      const tripRef = getSavedTripDoc(uid, trip.id);
      const existing = await getDoc(tripRef);
      const data = {
        ...trip,
        updatedAt: serverTimestamp(),
      };
      if (!existing.exists()) {
        data.createdAt = trip.createdAt || serverTimestamp();
        data.useCount = trip.useCount || 0;
      } else if (trip.useCount !== undefined) {
        data.useCount = trip.useCount;
      }
      await setDoc(tripRef, data, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('Error adding saved trip:', error);
      return { success: false, error: error.message };
    }
  },

  async removeSavedTrip(uid, tripId) {
    try {
      await deleteDoc(getSavedTripDoc(uid, tripId));
      return { success: true };
    } catch (error) {
      console.error('Error removing saved trip:', error);
      return { success: false, error: error.message };
    }
  },

  async getSavedTrips(uid) {
    try {
      const snapshot = await getDocs(query(getSavedTripsCollection(uid), orderBy('updatedAt', 'desc')));
      return sortSavedItems(snapshot.docs.map(mapSavedDoc));
    } catch (error) {
      console.error('Error getting saved trips:', error);
      return [];
    }
  },

  subscribeToSavedTrips(uid, onUpdate, onError) {
    const q = query(getSavedTripsCollection(uid), orderBy('updatedAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => onUpdate(sortSavedItems(snapshot.docs.map(mapSavedDoc))),
      (error) => {
        console.error('Saved trips subscription error:', error);
        onError?.(error);
      }
    );
  },

  async touchSavedTrip(uid, tripId) {
    try {
      await setDoc(getSavedTripDoc(uid, tripId), {
        lastUsedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        useCount: increment(1),
      }, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('Error updating saved trip usage:', error);
      return { success: false, error: error.message };
    }
  },
};

export default savedTransitFirestoreService;
