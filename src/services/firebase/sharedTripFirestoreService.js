import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ensureFirebaseUser } from '../proxyAuth';

const timestampToIso = (value) => value?.toDate?.()?.toISOString?.() ?? value ?? null;

const normalizeSharedTrip = (snapshot) => {
  if (!snapshot?.exists?.()) return null;
  const data = snapshot.data();
  return {
    ...data,
    shareId: snapshot.id,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
};

const cleanTripPayload = (trip) => JSON.parse(JSON.stringify({
  id: trip?.id,
  name: trip?.name || 'Shared trip',
  icon: trip?.icon || 'Route',
  from: trip?.from,
  to: trip?.to,
  timePreference: trip?.timePreference ?? null,
  summary: trip?.summary ?? null,
  isPinned: false,
}));

const getSharedTripRef = (shareId) => doc(db, 'sharedTrips', shareId);

export const sharedTripFirestoreService = {
  async createSharedTrip(trip) {
    try {
      const firebaseUser = await ensureFirebaseUser();
      if (!firebaseUser) {
        return { success: false, error: 'Trip sharing is unavailable. Please try again.' };
      }

      const tripRef = doc(collection(db, 'sharedTrips'));
      await setDoc(tripRef, {
        shareId: tripRef.id,
        trip: cleanTripPayload(trip),
        createdBy: firebaseUser.uid,
        lastEditedBy: firebaseUser.uid,
        revision: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { success: true, shareId: tripRef.id };
    } catch (error) {
      return { success: false, error: error?.message || 'Could not share this trip. Please try again.' };
    }
  },

  subscribeToSharedTrip(shareId, onUpdate, onError) {
    if (!shareId) {
      onError?.(new Error('Missing shared trip link'));
      return () => {};
    }

    return onSnapshot(
      getSharedTripRef(shareId),
      (snapshot) => onUpdate(normalizeSharedTrip(snapshot)),
      (error) => onError?.(error)
    );
  },

  async updateSharedTrip(shareId, trip, expectedRevision = null) {
    try {
      const firebaseUser = await ensureFirebaseUser();
      if (!firebaseUser) {
        return { success: false, error: 'Trip editing is unavailable. Please try again.' };
      }

      const tripRef = getSharedTripRef(shareId);
      const revision = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(tripRef);
        if (!snapshot.exists()) throw new Error('This shared trip is no longer available.');

        const currentRevision = Number(snapshot.data()?.revision) || 0;
        if (Number.isFinite(expectedRevision) && currentRevision !== expectedRevision) {
          const conflict = new Error('Someone else updated this trip. Open the latest version and try again.');
          conflict.code = 'shared-trip/revision-conflict';
          throw conflict;
        }

        const nextRevision = currentRevision + 1;
        transaction.update(tripRef, {
          trip: cleanTripPayload(trip),
          lastEditedBy: firebaseUser.uid,
          revision: nextRevision,
          updatedAt: serverTimestamp(),
        });
        return nextRevision;
      });

      return { success: true, revision };
    } catch (error) {
      return { success: false, code: error?.code, error: error?.message || 'Could not update this shared trip.' };
    }
  },
};

export default sharedTripFirestoreService;
