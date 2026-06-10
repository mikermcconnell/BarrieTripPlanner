import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import logger from '../../utils/logger';
import { normalizeOfficialServiceImpact } from '../../utils/officialServiceImpacts';

/**
 * Subscribe to active transit news from Firestore.
 * Returns an unsubscribe function.
 */
export function subscribeToTransitNews(onUpdate, onError) {
  const newsRef = collection(db, 'transitNews');
  // Keep this query single-field indexed so the app does not depend on a
  // composite index during startup. The collection is small; filtering archived
  // items client-side is cheaper than surfacing a rider-visible warning.
  const q = query(newsRef, orderBy('publishedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const newsItems = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title ?? '',
            body: data.body ?? '',
            date: data.date ?? null,
            affectedRoutes: data.affectedRoutes ?? [],
            url: data.url ?? null,
            archivedAt: data.archivedAt ?? null,
            publishedAt: data.publishedAt ?? null,
          };
        })
        .filter((item) => item.archivedAt == null);
      onUpdate(newsItems);
    },
    (error) => {
      if (error.code === 'permission-denied') {
        logger.warn('News subscription: permission denied, returning empty');
        onUpdate([]);
      } else {
        logger.error('News subscription error:', error);
        onError?.(error);
      }
    }
  );
}

export function subscribeToTransitNewsImpacts(onUpdate, onError) {
  const impactsRef = collection(db, 'transitNewsImpacts');

  return onSnapshot(
    impactsRef,
    (snapshot) => {
      const impacts = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            type: data.type ?? '',
            status: data.status ?? 'active',
            stopId: data.stopId ?? null,
            stopCode: data.stopCode ?? null,
            stopName: data.stopName ?? '',
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null,
            mappable: data.mappable ?? data.stopId != null,
            affectedRoutes: data.affectedRoutes ?? [],
            sourceNewsId: data.sourceNewsId ?? null,
            sourceTitle: data.sourceTitle ?? '',
            sourceUrl: data.sourceUrl ?? null,
            message: data.message ?? '',
            confidence: data.confidence ?? 'low',
            parser: data.parser ?? null,
            archivedAt: data.archivedAt ?? null,
            publishedAt: data.publishedAt ?? null,
            startsAt: data.startsAt ?? null,
            endsAt: data.endsAt ?? null,
          };
        })
        .filter((impact) => (
          impact.archivedAt == null &&
          impact.status !== 'archived' &&
          impact.status !== 'expired'
        ));
      onUpdate(impacts);
    },
    (error) => {
      if (error.code === 'permission-denied') {
        logger.warn('News impacts subscription: permission denied, returning empty');
        onUpdate([]);
      } else {
        logger.error('News impacts subscription error:', error);
        onError?.(error);
      }
    }
  );
}

export function subscribeToOfficialServiceImpacts(onUpdate, onError) {
  const impactsRef = collection(db, 'officialServiceImpacts');

  return onSnapshot(
    impactsRef,
    (snapshot) => {
      const impacts = snapshot.docs
        .map((doc) => normalizeOfficialServiceImpact(doc.id, doc.data()))
        .filter((impact) => (
          impact.archivedAt == null &&
          impact.status !== 'archived' &&
          impact.status !== 'expired'
        ));
      onUpdate(impacts);
    },
    (error) => {
      if (error.code === 'permission-denied') {
        logger.warn('Official service impacts subscription: permission denied, returning empty');
        onUpdate([]);
      } else {
        logger.error('Official service impacts subscription error:', error);
        onError?.(error);
      }
    }
  );
}
