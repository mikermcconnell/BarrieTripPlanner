import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';

/**
 * Subscribe to active detours collection in Firestore.
 * Returns an unsubscribe function.
 */
export function normalizeDetourCoordinate(coordinate) {
  if (!coordinate || typeof coordinate !== 'object') return null;

  const rawLatitude =
    coordinate.latitude != null ? coordinate.latitude : coordinate.lat != null ? coordinate.lat : null;
  const rawLongitude =
    coordinate.longitude != null ? coordinate.longitude : coordinate.lon != null ? coordinate.lon : null;

  if (rawLatitude == null || rawLongitude == null) {
    return null;
  }

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function normalizeDetourPolyline(polyline) {
  if (!Array.isArray(polyline)) return null;

  const normalized = polyline
    .map((point) => normalizeDetourCoordinate(point))
    .filter(Boolean);

  return normalized;
}

export function normalizeDetourSegment(segment) {
  if (!segment || typeof segment !== 'object') return null;

  return {
    ...segment,
    entryPoint: normalizeDetourCoordinate(segment.entryPoint),
    exitPoint: normalizeDetourCoordinate(segment.exitPoint),
    skippedSegmentPolyline: normalizeDetourPolyline(segment.skippedSegmentPolyline),
    inferredDetourPolyline: normalizeDetourPolyline(segment.inferredDetourPolyline),
  };
}

export function mapActiveDetourDoc(docId, data) {
  return {
    routeId: docId,
    shapeId: data.shapeId ?? null,
    detectedAt: data.detectedAt?.toDate?.()?.toISOString() ?? null,
    lastSeenAt: data.lastSeenAt?.toDate?.()?.toISOString() ?? null,
    vehicleCount: data.vehicleCount ?? 0,
    state: data.state ?? 'active',
    segments: Array.isArray(data.segments)
      ? data.segments.map((segment) => normalizeDetourSegment(segment)).filter(Boolean)
      : [],
    skippedSegmentPolyline: normalizeDetourPolyline(data.skippedSegmentPolyline),
    inferredDetourPolyline: normalizeDetourPolyline(data.inferredDetourPolyline),
    entryPoint: normalizeDetourCoordinate(data.entryPoint),
    exitPoint: normalizeDetourCoordinate(data.exitPoint),
    confidence: data.confidence ?? null,
    evidencePointCount: data.evidencePointCount ?? null,
    lastEvidenceAt: data.lastEvidenceAt ?? null,
  };
}

export function subscribeToActiveDetours(onUpdate, onError) {
  const detoursRef = collection(db, 'activeDetours');

  return onSnapshot(
    detoursRef,
    (snapshot) => {
      const detourMap = {};
      snapshot.docs.forEach((doc) => {
        detourMap[doc.id] = mapActiveDetourDoc(doc.id, doc.data());
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
