const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'persistentDetoursAuto';
const GEOMETRY_COLLECTION = 'persistentDetourGeometriesAuto';

let hydratePromise = null;
let geometryHydratePromise = null;
const lastSyncedIds = new Set();
const lastSyncedGeometryIds = new Set();

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

function normalizeEvidenceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const latitude = Number(entry.latitude ?? entry.lat);
  const longitude = Number(entry.longitude ?? entry.lon);
  const timestampMs = toMillis(entry.timestampMs ?? entry.timestamp);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(timestampMs)) {
    return null;
  }
  return {
    latitude,
    longitude,
    timestampMs,
    vehicleId: entry.vehicleId || null,
    tripShapeId: entry.tripShapeId || null,
    tripId: entry.tripId || null,
    recurringObservationId: entry.recurringObservationId || null,
  };
}

function normalizeEvidence(data = {}) {
  const evidence = data && typeof data === 'object' ? data : {};
  return {
    points: (evidence.points || []).map(normalizeEvidenceEntry).filter(Boolean),
    confidencePoints: (evidence.confidencePoints || []).map(normalizeEvidenceEntry).filter(Boolean),
    entryCandidates: (evidence.entryCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
    exitCandidates: (evidence.exitCandidates || []).map(normalizeEvidenceEntry).filter(Boolean),
  };
}

function normalizeRecord(routeId, data) {
  return {
    routeId,
    fingerprint: data.fingerprint || null,
    sharedGeometryFingerprint: data.sharedGeometryFingerprint || null,
    detectedAt: toMillis(data.detectedAt) || Date.now(),
    learnedAt: toMillis(data.learnedAt) || Date.now(),
    updatedAt: toMillis(data.updatedAt) || Date.now(),
    recordUpdatedAt: toMillis(data.recordUpdatedAt) || toMillis(data.updatedAt) || Date.now(),
    lastSeenAt: toMillis(data.lastSeenAt) || toMillis(data.detectedAt) || Date.now(),
    lastEvidenceAt: toMillis(data.lastEvidenceAt) || toMillis(data.lastSeenAt) || toMillis(data.detectedAt) || Date.now(),
    latestGpsEvidenceAt: toMillis(data.latestGpsEvidenceAt) ||
      toMillis(data.lastEvidenceAt) ||
      toMillis(data.lastSeenAt) ||
      toMillis(data.detectedAt) ||
      Date.now(),
    geometryLastEvidenceAt: toMillis(data.geometryLastEvidenceAt) ||
      toMillis(data.geometry?.lastEvidenceAt) ||
      null,
    triggerVehicleId: data.triggerVehicleId || null,
    geometry: cloneJson(data.geometry) || null,
    detourZone: cloneJson(data.detourZone) || null,
    evidence: normalizeEvidence(data.evidence),
  };
}

function normalizeGeometryRecord(fingerprint, data = {}) {
  const sharedGeometryFingerprint = data.sharedGeometryFingerprint || fingerprint || null;
  return {
    sharedGeometryFingerprint,
    routeIds: Array.isArray(data.routeIds) ? data.routeIds.filter(Boolean).sort() : [],
    learnedAt: toMillis(data.learnedAt) || Date.now(),
    updatedAt: toMillis(data.updatedAt) || Date.now(),
    recordUpdatedAt: toMillis(data.recordUpdatedAt) || toMillis(data.updatedAt) || Date.now(),
    lastEvidenceAt: toMillis(data.lastEvidenceAt) ||
      toMillis(data.latestGpsEvidenceAt) ||
      toMillis(data.geometryLastEvidenceAt) ||
      Date.now(),
    latestGpsEvidenceAt: toMillis(data.latestGpsEvidenceAt) ||
      toMillis(data.lastEvidenceAt) ||
      Date.now(),
    geometryLastEvidenceAt: toMillis(data.geometryLastEvidenceAt) ||
      toMillis(data.geometry?.lastEvidenceAt) ||
      null,
    geometry: cloneJson(data.geometry) || null,
    evidence: normalizeEvidence(data.evidence),
  };
}

async function loadPersistentDetours(options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[persistentDetourStore] Firestore not configured — persistence disabled');
    return {};
  }

  if (options.force) {
    hydratePromise = null;
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
        return {};
      }
      return records;
    })();
  }

  return hydratePromise;
}

async function loadPersistentDetourGeometries(options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[persistentDetourStore] Firestore not configured — persistence disabled');
    return {};
  }

  if (options.force) {
    geometryHydratePromise = null;
  }

  if (!geometryHydratePromise) {
    geometryHydratePromise = (async () => {
      const records = {};
      try {
        const snapshot = await db.collection(GEOMETRY_COLLECTION).get();
        snapshot.forEach((doc) => {
          const fingerprint = doc.id;
          const normalized = normalizeGeometryRecord(fingerprint, doc.data() || {});
          if (!normalized.sharedGeometryFingerprint) return;
          records[normalized.sharedGeometryFingerprint] = normalized;
          lastSyncedGeometryIds.add(normalized.sharedGeometryFingerprint);
        });
      } catch (error) {
        console.error('[persistentDetourStore] Failed to hydrate persistent detour geometries:', error.message);
        return {};
      }
      return records;
    })();
  }

  return geometryHydratePromise;
}

async function syncPersistentDetours(records = {}, geometryRecords = null) {
  const db = getDb();
  if (!db) {
    console.warn('[persistentDetourStore] Firestore not configured — skipping sync');
    return;
  }

  try {
    await loadPersistentDetours();
    if (geometryRecords != null) {
      await loadPersistentDetourGeometries();
    }

    const currentIds = new Set(Object.keys(records || {}));
    const removedIds = [...lastSyncedIds].filter((routeId) => !currentIds.has(routeId));
    const currentGeometryIds = geometryRecords == null
      ? null
      : new Set(Object.keys(geometryRecords || {}));
    const removedGeometryIds = currentGeometryIds == null
      ? []
      : [...lastSyncedGeometryIds].filter((fingerprint) => !currentGeometryIds.has(fingerprint));

    for (const routeId of removedIds) {
      await db.collection(COLLECTION).doc(routeId).delete();
      lastSyncedIds.delete(routeId);
    }

    for (const fingerprint of removedGeometryIds) {
      await db.collection(GEOMETRY_COLLECTION).doc(fingerprint).delete();
      lastSyncedGeometryIds.delete(fingerprint);
    }

    for (const [routeId, rawRecord] of Object.entries(records || {})) {
      if (!rawRecord?.fingerprint) continue;
      const record = normalizeRecord(routeId, rawRecord);
      await db.collection(COLLECTION).doc(routeId).set({
        routeId,
        fingerprint: record.fingerprint,
        sharedGeometryFingerprint: record.sharedGeometryFingerprint,
        detectedAt: record.detectedAt,
        learnedAt: record.learnedAt,
        updatedAt: Date.now(),
        recordUpdatedAt: Date.now(),
        lastSeenAt: record.lastSeenAt,
        lastEvidenceAt: record.lastEvidenceAt,
        latestGpsEvidenceAt: record.latestGpsEvidenceAt,
        geometryLastEvidenceAt: record.geometryLastEvidenceAt,
        triggerVehicleId: record.triggerVehicleId,
        geometry: record.geometry,
        detourZone: record.detourZone,
        evidence: record.evidence,
      });
      lastSyncedIds.add(routeId);
    }

    if (geometryRecords != null) {
      for (const [fingerprint, rawRecord] of Object.entries(geometryRecords || {})) {
        const record = normalizeGeometryRecord(fingerprint, rawRecord);
        if (!record.sharedGeometryFingerprint) continue;
        await db.collection(GEOMETRY_COLLECTION).doc(record.sharedGeometryFingerprint).set({
          sharedGeometryFingerprint: record.sharedGeometryFingerprint,
          routeIds: record.routeIds,
          learnedAt: record.learnedAt,
          updatedAt: Date.now(),
          recordUpdatedAt: Date.now(),
          lastEvidenceAt: record.lastEvidenceAt,
          latestGpsEvidenceAt: record.latestGpsEvidenceAt,
          geometryLastEvidenceAt: record.geometryLastEvidenceAt,
          geometry: record.geometry,
          evidence: record.evidence,
        });
        lastSyncedGeometryIds.add(record.sharedGeometryFingerprint);
      }
    }
  } catch (error) {
    console.error('[persistentDetourStore] Failed to sync persistent detours:', error.message);
  }
}

module.exports = {
  COLLECTION,
  GEOMETRY_COLLECTION,
  loadPersistentDetours,
  loadPersistentDetourGeometries,
  syncPersistentDetours,
};
