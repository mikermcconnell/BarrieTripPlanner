import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

/**
 * Subscribe to active detours collection in Firestore.
 * Returns an unsubscribe function.
 */
export function subscribeToActiveDetours(onUpdate, onError) {
  const detoursRef = collection(db, 'activeDetours');

  return onSnapshot(
    detoursRef,
    (snapshot) => {
      const detourMap = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        detourMap[doc.id] = {
          routeId: doc.id,
          detectedAt: data.detectedAt?.toDate?.()?.toISOString() ?? null,
          lastSeenAt: data.lastSeenAt?.toDate?.()?.toISOString() ?? null,
          vehicleCount: data.vehicleCount ?? 0,
        };
      });
      onUpdate(detourMap);
    },
    (error) => {
      if (error.code === 'permission-denied') {
        console.warn('Detour subscription: permission denied, returning empty');
        onUpdate({});
      } else {
        console.error('Detour subscription error:', error);
        onError?.(error);
      }
    }
  );
}
