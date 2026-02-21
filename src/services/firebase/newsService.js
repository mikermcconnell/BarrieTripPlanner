import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

/**
 * Subscribe to active transit news from Firestore.
 * Returns an unsubscribe function.
 */
export function subscribeToTransitNews(onUpdate, onError) {
  const newsRef = collection(db, 'transitNews');
  const q = query(
    newsRef,
    where('archivedAt', '==', null),
    orderBy('publishedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const newsItems = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title ?? '',
          body: data.body ?? '',
          date: data.date ?? null,
          affectedRoutes: data.affectedRoutes ?? [],
          url: data.url ?? null,
          publishedAt: data.publishedAt ?? null,
        };
      });
      onUpdate(newsItems);
    },
    (error) => {
      if (error.code === 'permission-denied') {
        console.warn('News subscription: permission denied, returning empty');
        onUpdate([]);
      } else {
        console.error('News subscription error:', error);
        onError?.(error);
      }
    }
  );
}
