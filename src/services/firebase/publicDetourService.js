import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import logger from '../../utils/logger';

const ACTIVE_COLLECTION = 'publicDetoursActive';
const META_COLLECTION = 'publicSystem';
const META_DOC = 'detours';

const isPermissionDeniedError = (error) => {
  if (!error) return false;
  if (error.code === 'permission-denied') return true;
  return typeof error.message === 'string' && error.message.includes('Missing or insufficient permissions');
};

const normalizeDetourDoc = (snapshotDoc) => {
  const data = snapshotDoc.data() || {};
  const routeId =
    data.routeId === null || data.routeId === undefined ? null : String(data.routeId).trim().toUpperCase();
  const directionId =
    data.directionId === null || data.directionId === undefined
      ? null
      : String(data.directionId).trim();
  return {
    id: snapshotDoc.id,
    ...data,
    routeId,
    directionId,
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
        if (isPermissionDeniedError(error)) {
          logger.warn('publicDetourService active detours unavailable (permission denied).');
          onUpdate([]);
        } else {
          logger.error('publicDetourService subscribeToActiveDetours error:', error);
        }
        onStatus?.({
          connected: false,
          updatedAt: Date.now(),
          error: isPermissionDeniedError(error)
            ? 'detour-feed-permission-denied'
            : (error.message || 'detour-feed-error'),
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
        if (isPermissionDeniedError(error)) {
          logger.warn('publicDetourService detour metadata unavailable (permission denied).');
          onUpdate(null);
        } else {
          logger.error('publicDetourService subscribeToDetourMeta error:', error);
        }
        onStatus?.({
          connected: false,
          updatedAt: Date.now(),
          error: isPermissionDeniedError(error)
            ? 'detour-meta-permission-denied'
            : (error.message || 'detour-meta-error'),
        });
      }
    );
  },
};

export default publicDetourService;
