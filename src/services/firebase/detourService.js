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

export function normalizeDetourSegment(segment, fallbackDetourEventId = null) {
  if (!segment || typeof segment !== 'object') return null;

  return {
    ...segment,
    entryPoint: normalizeDetourCoordinate(segment.entryPoint),
    exitPoint: normalizeDetourCoordinate(segment.exitPoint),
    skippedSegmentPolyline: normalizeDetourPolyline(segment.skippedSegmentPolyline),
    inferredDetourPolyline: normalizeDetourPolyline(segment.inferredDetourPolyline),
    likelyDetourPolyline: normalizeDetourPolyline(segment.likelyDetourPolyline),
    entryConnectorPolyline: normalizeDetourPolyline(segment.entryConnectorPolyline),
    exitConnectorPolyline: normalizeDetourPolyline(segment.exitConnectorPolyline),
    likelyDetourRoadNames: normalizeRoadNames(segment.likelyDetourRoadNames),
    roadMatchConfidence: segment.roadMatchConfidence ?? null,
    roadMatchSource: segment.roadMatchSource ?? null,
    detourPathLabel: segment.detourPathLabel ?? 'Likely detour path',
    detourEventId: segment.detourEventId ?? fallbackDetourEventId ?? null,
  };
}

export function mapActiveDetourDoc(docId, data = {}) {
  const eventId = data.eventId ?? data.detourEventId ?? docId;
  const routeId = data.routeId ?? docId;

  return {
    eventId,
    detourEventId: eventId,
    routeId,
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
      ? data.segments.map((segment) => normalizeDetourSegment(segment, eventId)).filter(Boolean)
      : [],
    skippedSegmentPolyline: normalizeDetourPolyline(data.skippedSegmentPolyline),
    inferredDetourPolyline: normalizeDetourPolyline(data.inferredDetourPolyline),
    likelyDetourPolyline: normalizeDetourPolyline(data.likelyDetourPolyline),
    entryConnectorPolyline: normalizeDetourPolyline(data.entryConnectorPolyline),
    exitConnectorPolyline: normalizeDetourPolyline(data.exitConnectorPolyline),
    likelyDetourRoadNames: normalizeRoadNames(data.likelyDetourRoadNames),
    roadMatchConfidence: data.roadMatchConfidence ?? null,
    roadMatchRawConfidence: data.roadMatchRawConfidence ?? null,
    roadMatchSource: data.roadMatchSource ?? null,
    detourPathLabel: data.detourPathLabel ?? 'Likely detour path',
    eventWindow: data.eventWindow ?? null,
    detourVersion: data.detourVersion ?? null,
    detourModel: data.detourModel ?? null,
    eventCount: data.eventCount ?? 1,
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

const confidenceRank = (confidence) => {
  const value = String(confidence || '').trim().toLowerCase();
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
};

const betterConfidence = (first, second) => (
  confidenceRank(second) > confidenceRank(first) ? second : first
);

const mergeArrays = (...arrays) => (
  arrays.flatMap((items) => (Array.isArray(items) ? items : []))
);

const mergeUniqueScalars = (...arrays) => {
  const seen = new Set();
  const merged = [];
  mergeArrays(...arrays).forEach((value) => {
    const key = String(value ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(value);
  });
  return merged;
};

export function groupActiveDetourEventsByRoute(eventMap = {}) {
  const grouped = {};

  Object.values(eventMap || {}).forEach((event) => {
    if (!event?.routeId) return;
    const routeId = event.routeId;
    const existing = grouped[routeId];
    if (!existing) {
      grouped[routeId] = {
        ...event,
        eventCount: 1,
        detourEvents: [event],
        eventWindows: event.eventWindow ? [event.eventWindow] : [],
        segments: Array.isArray(event.segments) ? [...event.segments] : [],
      };
      return;
    }

    existing.eventCount += 1;
    existing.detourEvents.push(event);
    if (event.eventWindow) {
      existing.eventWindows = [
        ...(Array.isArray(existing.eventWindows) ? existing.eventWindows : []),
        event.eventWindow,
      ];
    }
    existing.vehicleCount = Math.max(existing.vehicleCount || 0, event.vehicleCount || 0);
    existing.uniqueVehicleCount = Math.max(existing.uniqueVehicleCount || 0, event.uniqueVehicleCount || 0);
    existing.currentVehicleCount = Math.max(existing.currentVehicleCount || 0, event.currentVehicleCount || 0);
    existing.riderVisible = existing.riderVisible || event.riderVisible;
    existing.staleForReview = Boolean(existing.staleForReview || event.staleForReview);
    existing.confidence = betterConfidence(existing.confidence, event.confidence);
    existing.state = existing.state === 'active' || event.state === 'active' ? 'active' : (existing.state || event.state || 'active');
    existing.segments = mergeArrays(existing.segments, event.segments);
    existing.skippedStopIds = mergeUniqueScalars(existing.skippedStopIds, event.skippedStopIds);
    existing.skippedStopCodes = mergeUniqueScalars(existing.skippedStopCodes, event.skippedStopCodes);
    existing.affectedStopIds = mergeUniqueScalars(existing.affectedStopIds, event.affectedStopIds);
    existing.affectedStopCodes = mergeUniqueScalars(existing.affectedStopCodes, event.affectedStopCodes);
    existing.skippedStops = mergeArrays(existing.skippedStops, event.skippedStops);
    existing.affectedStops = mergeArrays(existing.affectedStops, event.affectedStops);
  });

  return grouped;
}


export function subscribeToActiveDetours(onUpdate, onError) {
  const devFixtures = getEnabledDevDetourFixtures();
  if (Object.keys(devFixtures).length > 0) {
    onUpdate(devFixtures);
    return () => {};
  }

  const detoursRef = collection(db, runtimeConfig.detours.activeCollection || 'activeDetourEventsV2');

  return onSnapshot(
    detoursRef,
    (snapshot) => {
      const eventMap = {};
      snapshot.docs.forEach((doc) => {
        eventMap[doc.id] = mapActiveDetourDoc(doc.id, doc.data());
      });
      onUpdate(groupActiveDetourEventsByRoute(eventMap));
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
