import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import runtimeConfig from '../../config/runtimeConfig';
import { getEnabledDevDetourFixtures } from '../devDetourFixtures';

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

export function normalizeRoadNames(roadNames) {
  if (!Array.isArray(roadNames)) return [];
  return roadNames
    .map((roadName) => String(roadName || '').trim())
    .filter(Boolean);
}

export function normalizeDetourSegment(segment) {
  if (!segment || typeof segment !== 'object') return null;

  return {
    ...segment,
    entryPoint: normalizeDetourCoordinate(segment.entryPoint),
    exitPoint: normalizeDetourCoordinate(segment.exitPoint),
    skippedSegmentPolyline: normalizeDetourPolyline(segment.skippedSegmentPolyline),
    inferredDetourPolyline: normalizeDetourPolyline(segment.inferredDetourPolyline),
    likelyDetourPolyline: normalizeDetourPolyline(segment.likelyDetourPolyline),
    likelyDetourRoadNames: normalizeRoadNames(segment.likelyDetourRoadNames),
    roadMatchConfidence: segment.roadMatchConfidence ?? null,
    roadMatchSource: segment.roadMatchSource ?? null,
    detourPathLabel: segment.detourPathLabel ?? 'Likely detour path',
    detourEventId: segment.detourEventId ?? null,
  };
}

export function mapActiveDetourDoc(docId, data) {
  return {
    routeId: docId,
    shapeId: data.shapeId ?? null,
    title: data.title ?? null,
    description: data.description ?? null,
    locationText: data.locationText ?? null,
    detectedAt: data.detectedAt?.toDate?.()?.toISOString() ?? null,
    lastSeenAt: data.lastSeenAt?.toDate?.()?.toISOString() ?? null,
    vehicleCount: data.vehicleCount ?? 0,
    uniqueVehicleCount: data.uniqueVehicleCount ?? data.vehicleCount ?? 0,
    currentVehicleCount: data.currentVehicleCount ?? data.vehicleCount ?? 0,
    state: data.state ?? 'active',
    clearReason: data.clearReason ?? null,
    riderVisible: data.riderVisible ?? true,
    riderVisibilityReason: data.riderVisibilityReason ?? null,
    staleForReview: Boolean(data.staleForReview),
    segments: Array.isArray(data.segments)
      ? data.segments.map((segment) => normalizeDetourSegment(segment)).filter(Boolean)
      : [],
    skippedSegmentPolyline: normalizeDetourPolyline(data.skippedSegmentPolyline),
    inferredDetourPolyline: normalizeDetourPolyline(data.inferredDetourPolyline),
    likelyDetourPolyline: normalizeDetourPolyline(data.likelyDetourPolyline),
    likelyDetourRoadNames: normalizeRoadNames(data.likelyDetourRoadNames),
    roadMatchConfidence: data.roadMatchConfidence ?? null,
    roadMatchRawConfidence: data.roadMatchRawConfidence ?? null,
    roadMatchSource: data.roadMatchSource ?? null,
    detourPathLabel: data.detourPathLabel ?? 'Likely detour path',
    detourEventId: data.detourEventId ?? null,
    skippedStopIds: Array.isArray(data.skippedStopIds) ? data.skippedStopIds : [],
    skippedStopCodes: Array.isArray(data.skippedStopCodes) ? data.skippedStopCodes : [],
    skippedStops: Array.isArray(data.skippedStops) ? data.skippedStops : [],
    affectedStopIds: Array.isArray(data.affectedStopIds) ? data.affectedStopIds : [],
    affectedStopCodes: Array.isArray(data.affectedStopCodes) ? data.affectedStopCodes : [],
    affectedStops: Array.isArray(data.affectedStops) ? data.affectedStops : [],
    entryStopId: data.entryStopId ?? null,
    exitStopId: data.exitStopId ?? null,
    entryPoint: normalizeDetourCoordinate(data.entryPoint),
    exitPoint: normalizeDetourCoordinate(data.exitPoint),
    confidence: data.confidence ?? null,
    evidencePointCount: data.evidencePointCount ?? null,
    lastEvidenceAt: data.lastEvidenceAt ?? null,
  };
}

export function subscribeToActiveDetours(onUpdate, onError) {
  const devFixtures = getEnabledDevDetourFixtures();
  if (Object.keys(devFixtures).length > 0) {
    onUpdate(devFixtures);
    return () => {};
  }

  const detoursRef = collection(db, runtimeConfig.detours.activeCollection || 'activeDetours');

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
