import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import logger from '../../utils/logger';

const ACTIVE_COLLECTION = 'publicDetoursActive';
const META_COLLECTION = 'publicSystem';
const META_DOC = 'detours';

const normalizeDetourDoc = (snapshotDoc) => {
  const data = snapshotDoc.data() || {};
  return {
    id: snapshotDoc.id,
    ...data,
    routeId: data.routeId ? String(data.routeId) : null,
    directionId:
      data.directionId === null || data.directionId === undefined
        ? null
        : String(data.directionId),
    firstDetectedAt:
      typeof data.firstDetectedAt === 'number'
        ? data.firstDetectedAt
        : data.firstDetectedAt?.toMillis?.() ?? null,
    lastSeenAt:
      typeof data.lastSeenAt === 'number' ? data.lastSeenAt : data.lastSeenAt?.toMillis?.() ?? null,
    updatedAt:
      typeof data.updatedAt === 'number' ? data.updatedAt : data.updatedAt?.toMillis?.() ?? null,
    polyline: Array.isArray(data.polyline) ? data.polyline : [],
    affectedStops: Array.isArray(data.affectedStops) ? data.affectedStops : [],
  };
};

export const publicDetourService = {
  subscribeToActiveDetours(onUpdate, onStatus) {
    const ref = collection(db, ACTIVE_COLLECTION);
    return onSnapshot(
      ref,
      (snapshot) => {
        const detours = snapshot.docs.map(normalizeDetourDoc);
        detours.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
        onUpdate(detours);
        onStatus?.({
          connected: true,
          updatedAt: Date.now(),
          error: null,
        });
      },
      (error) => {
        logger.error('publicDetourService subscribeToActiveDetours error:', error);
        onStatus?.({
          connected: false,
          updatedAt: Date.now(),
          error: error.message || 'detour-feed-error',
        });
      }
    );
  },

  subscribeToDetourMeta(onUpdate, onStatus) {
    const ref = doc(db, META_COLLECTION, META_DOC);
    return onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.data() || {};
        onUpdate({
          ...data,
          updatedAt:
            typeof data.updatedAt === 'number'
              ? data.updatedAt
              : data.updatedAt?.toMillis?.() ?? null,
        });
        onStatus?.({
          connected: true,
          updatedAt: Date.now(),
          error: null,
        });
      },
      (error) => {
        logger.error('publicDetourService subscribeToDetourMeta error:', error);
        onStatus?.({
          connected: false,
          updatedAt: Date.now(),
          error: error.message || 'detour-meta-error',
        });
      }
    );
  },
};

export default publicDetourService;

