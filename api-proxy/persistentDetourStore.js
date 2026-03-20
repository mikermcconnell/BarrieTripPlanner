const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'persistentDetoursAuto';

let hydratePromise = null;
const lastSyncedIds = new Set();

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') {
    const dateValue = value.toDate();
    return dateValue instanceof Date ? dateValue.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeRecord(routeId, data) {
  return {
    routeId,
    fingerprint: data.fingerprint || null,
    detectedAt: toMillis(data.detectedAt) || Date.now(),
    learnedAt: toMillis(data.learnedAt) || Date.now(),
    updatedAt: toMillis(data.updatedAt) || Date.now(),
    lastSeenAt: toMillis(data.lastSeenAt) || toMillis(data.detectedAt) || Date.now(),
    lastEvidenceAt: toMillis(data.lastEvidenceAt) || toMillis(data.lastSeenAt) || toMillis(data.detectedAt) || Date.now(),
    triggerVehicleId: data.triggerVehicleId || null,
    geometry: cloneJson(data.geometry) || null,
    detourZone: cloneJson(data.detourZone) || null,
  };
}

async function loadPersistentDetours() {
  const db = getDb();
  if (!db) {
    console.warn('[persistentDetourStore] Firestore not configured — persistence disabled');
    return {};
  }

  if (!hydratePromise) {
    hydratePromise = (async () => {
      const records = {};
      try {
        const snapshot = await db.collection(COLLECTION).get();
        snapshot.forEach((doc) => {
          const routeId = doc.id;
          const normalized = normalizeRecord(routeId, doc.data() || {});
          if (!normalized.fingerprint) return;
          records[routeId] = normalized;
          lastSyncedIds.add(routeId);
        });
      } catch (error) {
        console.error('[persistentDetourStore] Failed to hydrate persistent detours:', error.message);
        throw error;
      }
      return records;
    })();
  }

  return hydratePromise;
}

async function syncPersistentDetours(records = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[persistentDetourStore] Firestore not configured — skipping sync');
    return;
  }

  await loadPersistentDetours();

  const currentIds = new Set(Object.keys(records || {}));
  const removedIds = [...lastSyncedIds].filter((routeId) => !currentIds.has(routeId));

  for (const routeId of removedIds) {
    await db.collection(COLLECTION).doc(routeId).delete();
    lastSyncedIds.delete(routeId);
  }

  for (const [routeId, rawRecord] of Object.entries(records || {})) {
    if (!rawRecord?.fingerprint) continue;
    const record = normalizeRecord(routeId, rawRecord);
    await db.collection(COLLECTION).doc(routeId).set({
      routeId,
      fingerprint: record.fingerprint,
      detectedAt: record.detectedAt,
      learnedAt: record.learnedAt,
      updatedAt: Date.now(),
      lastSeenAt: record.lastSeenAt,
      lastEvidenceAt: record.lastEvidenceAt,
      triggerVehicleId: record.triggerVehicleId,
      geometry: record.geometry,
      detourZone: record.detourZone,
    });
    lastSyncedIds.add(routeId);
  }
}

module.exports = {
  COLLECTION,
  loadPersistentDetours,
  syncPersistentDetours,
};
