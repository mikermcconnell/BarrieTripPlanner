const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'activeDetours';
let hydratePromise = null;

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

function normalizeSnapshot(routeId, data = {}) {
  return {
    routeId,
    detectedAt: toMillis(data.detectedAt) || Date.now(),
    lastSeenAt: toMillis(data.lastSeenAt) || toMillis(data.detectedAt) || Date.now(),
    lastEvidenceAt: toMillis(data.lastEvidenceAt) || toMillis(data.lastSeenAt) || null,
    triggerVehicleId: data.triggerVehicleId || null,
    vehicleCount: toCount(data.uniqueVehicleCount ?? data.vehicleCount),
    currentVehicleCount: toCount(data.currentVehicleCount),
    matchedVehicleIds: Array.isArray(data.matchedVehicleIds)
      ? data.matchedVehicleIds.filter(Boolean)
      : [],
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
      lastEvidenceAt: toMillis(data.lastEvidenceAt) || null,
    },
    detourZone: cloneJson(data.detourZone) || null,
  };
}

async function loadActiveDetourSnapshots(options = {}) {
  const db = getDb();
  if (!db) return {};
  if (options.force) hydratePromise = null;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const records = {};
      const snapshot = await db.collection(COLLECTION).get();
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const routeId = data.routeId || doc.id;
        records[routeId] = normalizeSnapshot(routeId, data);
      });
      return records;
    })().catch((error) => {
      console.error('[activeDetourSnapshotStore] Failed to hydrate active detours:', error.message);
      return {};
    });
  }
  return hydratePromise;
}

module.exports = {
  COLLECTION,
  loadActiveDetourSnapshots,
  normalizeSnapshot,
};
