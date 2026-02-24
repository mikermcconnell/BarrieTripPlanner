import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

/**
 * Subscribe to active on-demand zones in Firestore.
 * Returns an unsubscribe function.
 */
export function subscribeToOnDemandZones(onUpdate, onError) {
  const zonesRef = collection(db, 'onDemandZones');
  const activeQuery = query(zonesRef, where('active', '==', true));

  return onSnapshot(
    activeQuery,
    (snapshot) => {
      const zoneMap = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        zoneMap[doc.id] = {
          id: doc.id,
          name: data.name ?? '',
          geometry: data.geometry ?? null,
          serviceHours: data.serviceHours ?? {},
          hubStops: data.hubStops ?? [],
          bookingPhone: data.bookingPhone ?? null,
          bookingUrl: data.bookingUrl ?? null,
          color: data.color ?? '#4CAF50',
          active: true,
        };
      });
      onUpdate(zoneMap);
    },
    (error) => {
      if (error.code === 'permission-denied') {
        console.warn('Zone subscription: permission denied, returning empty');
        onUpdate({});
      } else {
        console.error('Zone subscription error:', error);
        onError?.(error);
      }
    }
  );
}
