const { getDb } = require('./firebaseAdmin');
const { resolveDetourStorageConfig } = require('./detour/storageConfig');

const COLLECTION = 'activeDetours';
let hydratePromise = null;
let hydrateCacheKey = null;

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toCount(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDetourZone(data = {}) {
  const explicit = data.detourZone && typeof data.detourZone === 'object'
    ? cloneJson(data.detourZone)
    : null;
  const segments = Array.isArray(data.segments) ? data.segments : [];
  const primarySegment = segments.find((segment) => (
    Number.isFinite(Number(segment?.startProgressMeters)) &&
    Number.isFinite(Number(segment?.endProgressMeters))
  )) || null;
  const source = explicit || primarySegment || data;
  const start = toFiniteNumber(source?.startProgressMeters);
  const end = toFiniteNumber(source?.endProgressMeters);
  const shapeId = source?.shapeId || data.shapeId || primarySegment?.shapeId || null;

  if (Number.isFinite(start) && Number.isFinite(end) && end !== start && shapeId) {
    return {
      startProgressMeters: Math.min(start, end),
      endProgressMeters: Math.max(start, end),
      shapeId,
    };
  }

  return explicit;
}

function normalizeSnapshot(routeId, data = {}, eventId = null) {
  const lastEvidenceAt = toMillis(data.lastEvidenceAt) || toMillis(data.lastSeenAt) || null;
  const latestGpsEvidenceAt = toMillis(data.latestGpsEvidenceAt) || lastEvidenceAt;
  const geometryLastEvidenceAt = toMillis(data.geometryLastEvidenceAt) || lastEvidenceAt;
  const detourZone = normalizeDetourZone(data);
  return {
    eventId: eventId || data.detourEventId || data.eventId || routeId,
    detourEventId: data.detourEventId || null,
    routeId,
    detourVersion: data.detourVersion || null,
    detourModel: data.detourModel || null,
    sharedDetourEventId: data.sharedDetourEventId || null,
    detectedAt: toMillis(data.detectedAt) || Date.now(),
    lastSeenAt: toMillis(data.lastSeenAt) || toMillis(data.detectedAt) || Date.now(),
    lastEvidenceAt,
    latestGpsEvidenceAt,
    geometryLastEvidenceAt,
    triggerVehicleId: data.triggerVehicleId || null,
    vehicleCount: toCount(data.uniqueVehicleCount ?? data.vehicleCount),
    currentVehicleCount: toCount(data.currentVehicleCount),
    matchedVehicleIds: Array.isArray(data.matchedVehicleIds)
      ? data.matchedVehicleIds.filter(Boolean)
      : [],
    state: data.state || 'active',
    clearReason: data.clearReason || null,
    riderVisible: data.riderVisible !== false,
    riderVisibilityReason: data.riderVisibilityReason || null,
    staleForReview: Boolean(data.staleForReview),
    canShowDetourPath: data.canShowDetourPath ?? null,
    confidence: data.confidence || null,
    geometry: {
      shapeId: data.shapeId || null,
      segments: cloneJson(data.segments) || [],
      skippedSegmentPolyline: cloneJson(data.skippedSegmentPolyline) || null,
      inferredDetourPolyline: cloneJson(data.inferredDetourPolyline) || null,
      likelyDetourPolyline: cloneJson(data.likelyDetourPolyline) || null,
      entryPoint: cloneJson(data.entryPoint) || null,
      exitPoint: cloneJson(data.exitPoint) || null,
      confidence: data.confidence || null,
      evidencePointCount: data.evidencePointCount ?? null,
      lastEvidenceAt,
      startProgressMeters: detourZone?.startProgressMeters ?? null,
      endProgressMeters: detourZone?.endProgressMeters ?? null,
      canShowDetourPath: data.canShowDetourPath ?? null,
    },
    eventWindow: cloneJson(data.eventWindow) || null,
    detourZone,
    clearWindow: cloneJson(data.clearWindow) || null,
    clearWindows: cloneJson(data.clearWindows) || [],
    clearedSegments: cloneJson(data.clearedSegments) || [],
  };
}

async function loadActiveDetourSnapshots(options = {}) {
  const db = getDb();
  if (!db) return {};
  const storageConfig = resolveDetourStorageConfig(options.storageConfig);
  const collectionName = storageConfig.activeCollection;
  if (options.force || hydrateCacheKey !== collectionName) {
    hydratePromise = null;
    hydrateCacheKey = collectionName;
  }
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const records = {};
      const snapshot = await db.collection(collectionName).get();
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const routeId = data.routeId || doc.id;
        // Firestore document identity owns the V2 lifecycle. detourEventId can
        // be shared physical-geometry metadata and must not collapse records.
        const eventId = doc.id;
        records[eventId] = normalizeSnapshot(routeId, data, eventId);
      });
      return records;
    })().catch((error) => {
      hydratePromise = null;
      console.error('[activeDetourSnapshotStore] Failed to hydrate active detours:', error.message);
      throw error;
    });
  }
  return hydratePromise;
}

module.exports = {
  COLLECTION,
  loadActiveDetourSnapshots,
  normalizeSnapshot,
};
