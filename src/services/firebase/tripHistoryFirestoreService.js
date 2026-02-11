// Trip History Firestore Service - Manages user trip search history
import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

const MAX_HISTORY_ITEMS = 20;

export const tripHistoryFirestoreService = {
  // Add a trip to history
  async addTripToHistory(uid, trip) {
    try {
      const historyRef = collection(db, 'users', uid, 'tripHistory');

      // Create a simplified version of the trip for storage
      const tripData = {
        from: {
          name: trip.from?.name || 'Unknown',
          lat: trip.from?.lat || null,
          lon: trip.from?.lon || null,
        },
        to: {
          name: trip.to?.name || 'Unknown',
          lat: trip.to?.lat || null,
          lon: trip.to?.lon || null,
        },
        searchedAt: serverTimestamp(),
        // Store key trip metadata but not full itinerary details
        summary: trip.itineraries?.[0]
          ? {
              duration: trip.itineraries[0].duration,
              transfers: trip.itineraries[0].transfers,
              walkDistance: trip.itineraries[0].walkDistance,
            }
          : null,
      };

      await addDoc(historyRef, tripData);

      // Clean up old entries to maintain max limit
      await this.cleanupOldEntries(uid);

      return { success: true };
    } catch (error) {
      console.error('Error adding trip to history:', error);
      return { success: false, error: error.message };
    }
  },

  // Get trip history
  async getTripHistory(uid, maxItems = MAX_HISTORY_ITEMS) {
    try {
      const historyRef = collection(db, 'users', uid, 'tripHistory');
      const q = query(historyRef, orderBy('searchedAt', 'desc'), limit(maxItems));

      const snapshot = await getDocs(q);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        searchedAt: doc.data().searchedAt?.toDate?.()?.toISOString() ?? null,
      }));
    } catch (error) {
      console.error('Error getting trip history:', error);
      return [];
    }
  },

  // Subscribe to trip history (real-time updates)
  subscribeToTripHistory(uid, onUpdate, onError, maxItems = MAX_HISTORY_ITEMS) {
    const historyRef = collection(db, 'users', uid, 'tripHistory');
    const q = query(historyRef, orderBy('searchedAt', 'desc'), limit(maxItems));

    return onSnapshot(
      q,
      (snapshot) => {
        const history = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          searchedAt: doc.data().searchedAt?.toDate?.()?.toISOString() ?? null,
        }));
        onUpdate(history);
      },
      (error) => {
        console.error('Trip history subscription error:', error);
        onError?.(error);
      }
    );
  },

  // Delete a single trip from history
  async deleteTripFromHistory(uid, tripId) {
    try {
      const tripRef = doc(db, 'users', uid, 'tripHistory', tripId);
      await deleteDoc(tripRef);

      return { success: true };
    } catch (error) {
      console.error('Error deleting trip from history:', error);
      return { success: false, error: error.message };
    }
  },

  // Clear all trip history
  async clearTripHistory(uid) {
    try {
      const historyRef = collection(db, 'users', uid, 'tripHistory');
      const snapshot = await getDocs(historyRef);

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      return { success: true };
    } catch (error) {
      console.error('Error clearing trip history:', error);
      return { success: false, error: error.message };
    }
  },

  // Clean up old entries to maintain max limit
  async cleanupOldEntries(uid) {
    try {
      const historyRef = collection(db, 'users', uid, 'tripHistory');
      const q = query(historyRef, orderBy('searchedAt', 'desc'));

      const snapshot = await getDocs(q);

      // If we have more than max items, delete the oldest ones
      if (snapshot.docs.length > MAX_HISTORY_ITEMS) {
        const batch = writeBatch(db);
        const docsToDelete = snapshot.docs.slice(MAX_HISTORY_ITEMS);

        docsToDelete.forEach((doc) => {
          batch.delete(doc.ref);
        });

        await batch.commit();
      }
    } catch (error) {
      console.error('Error cleaning up old entries:', error);
    }
  },

  // Sync local history to Firestore (for migration)
  async syncHistoryToFirestore(uid, localHistory) {
    try {
      const batch = writeBatch(db);
      const historyRef = collection(db, 'users', uid, 'tripHistory');

      for (const trip of localHistory.slice(0, MAX_HISTORY_ITEMS)) {
        const docRef = doc(historyRef);
        batch.set(docRef, {
          from: {
            name: trip.from?.name || 'Unknown',
            lat: trip.from?.lat || null,
            lon: trip.from?.lon || null,
          },
          to: {
            name: trip.to?.name || 'Unknown',
            lat: trip.to?.lat || null,
            lon: trip.to?.lon || null,
          },
          searchedAt: trip.searchedAt
            ? new Date(trip.searchedAt)
            : serverTimestamp(),
          summary: trip.summary || null,
        });
      }

      await batch.commit();

      return { success: true };
    } catch (error) {
      console.error('Error syncing history:', error);
      return { success: false, error: error.message };
    }
  },
};

export default tripHistoryFirestoreService;
