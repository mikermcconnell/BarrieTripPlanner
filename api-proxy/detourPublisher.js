const { getDb } = require('./firebaseAdmin');

const ACTIVE_COLLECTION = 'activeDetours';
const HISTORY_COLLECTION = 'detourHistory';
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const HISTORY_MAX_LIMIT = 200;
const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_RETENTION_DAYS = Number.parseInt(process.env.DETOUR_HISTORY_RETENTION_DAYS || '30', 10);
const HISTORY_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const HISTORY_ENABLED = process.env.DETOUR_HISTORY_ENABLED
  ? process.env.DETOUR_HISTORY_ENABLED === 'true'
  : true;

const configuredGeoThrottleMs = Number.parseFloat(
  process.env.DETOUR_GEOMETRY_WRITE_THROTTLE_MS || '120000'
);
const GEOMETRY_WRITE_THROTTLE_MS =
  Number.isFinite(configuredGeoThrottleMs) && configuredGeoThrottleMs >= 0
    ? configuredGeoThrottleMs
    : 120_000;
// Minimum point count change to trigger a geometry write within throttle window
const GEOMETRY_POINT_CHANGE_THRESHOLD = 5;

const lastPublishedIds = new Set();
const lastPublishedState = new Map();
const lastSeenUpdateTime = new Map();
const lastGeometryWriteTime = new Map();
const lastKnownGeometry = new Map(); // Tracks geometry state for throttle decisions
let hydratePromise = null;
let lastHistoryPruneAt = 0;

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') {
    const dateValue = value.toDate();
    return dateValue instanceof Date ? dateValue.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value, fallbackMs) {
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();

  const valueMs = toMillis(value);
  if (valueMs != null) return new Date(valueMs);

  if (Number.isFinite(fallbackMs)) return new Date(fallbackMs);
  return new Date();
}

function normalizeVehicleCount(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function makeSnapshot(doc) {
  return {
    routeId: doc.routeId,
    detectedAtMs: toMillis(doc.detectedAt),
    lastSeenAtMs: toMillis(doc.lastSeenAt),
    updatedAtMs: toMillis(doc.updatedAt),
    triggerVehicleId: doc.triggerVehicleId || null,
    vehicleCount: normalizeVehicleCount(doc.vehicleCount),
    state: doc.state || 'active',
    confidence: doc.confidence || null,
    evidencePointCount: doc.evidencePointCount ?? null,
    lastEvidenceAt: toMillis(doc.lastEvidenceAt) ?? null,
  };
}

/**
 * Determine if geometry should be written to Firestore this tick.
 * Writes are throttled to avoid write amplification on every 30s tick.
 * Uses lastKnownGeometry (not lastPublishedState) to avoid false positives
 * when geometry was suppressed on a previous tick.
 */
function shouldWriteGeometry(routeId, detour, previousSnapshot, now) {
  const lastGeoWrite = lastGeometryWriteTime.get(routeId) || 0;
  const timeSinceLastWrite = now - lastGeoWrite;
  const geo = detour.geometry;

  // No geometry to write
  if (!geo) return false;

  // Always write on state change
  const prevState = previousSnapshot?.state || 'active';
  const currState = detour.state || 'active';
  if (prevState !== currState) return true;

  // Use the last-known geometry state (tracks actual geometry, not just what was written)
  const prevGeo = lastKnownGeometry.get(routeId);

  // Always write on confidence change
  const prevConfidence = prevGeo?.confidence || null;
  if (prevConfidence !== geo.confidence) return true;

  // Write if point count changed significantly since last write
  const prevPointCount = prevGeo?.evidencePointCount ?? 0;
  const pointCountDelta = Math.abs((geo.evidencePointCount || 0) - prevPointCount);
  if (pointCountDelta >= GEOMETRY_POINT_CHANGE_THRESHOLD) return true;

  // Write if throttle window elapsed
  if (timeSinceLastWrite >= GEOMETRY_WRITE_THROTTLE_MS) return true;

  return false;
}

function buildDetectedEvent(routeId, current, now) {
  const detectedAt = toMillis(current.detectedAt) ?? now;
  return {
    eventType: 'DETOUR_DETECTED',
    routeId,
    occurredAt: now,
    detectedAt,
    lastSeenAt: toMillis(current.lastSeenAt) ?? detectedAt,
    triggerVehicleId: current.triggerVehicleId || null,
    vehicleCount: current.vehicleCount,
    confidence: current.confidence || null,
    evidencePointCount: current.evidencePointCount ?? null,
    source: 'detour-worker-v2',
  };
}

function buildUpdatedEvent(routeId, previous, current, now) {
  if (!previous) return null;

  const changedFields = [];
  if (previous.vehicleCount !== current.vehicleCount) changedFields.push('vehicleCount');
  if ((previous.triggerVehicleId || null) !== (current.triggerVehicleId || null)) {
    changedFields.push('triggerVehicleId');
  }
  if ((previous.state || 'active') !== (current.state || 'active')) changedFields.push('state');
  if ((previous.confidence || null) !== (current.confidence || null)) changedFields.push('confidence');
  if ((previous.evidencePointCount ?? null) !== (current.evidencePointCount ?? null)) {
    changedFields.push('evidencePointCount');
  }

  if (changedFields.length === 0) return null;
  const detectedAt = toMillis(current.detectedAt) ?? previous.detectedAtMs ?? now;

  return {
    eventType: 'DETOUR_UPDATED',
    routeId,
    occurredAt: now,
    detectedAt,
    lastSeenAt: toMillis(current.lastSeenAt) ?? previous.lastSeenAtMs ?? detectedAt,
    triggerVehicleId: current.triggerVehicleId || null,
    previousTriggerVehicleId: previous.triggerVehicleId || null,
    vehicleCount: current.vehicleCount,
    previousVehicleCount: previous.vehicleCount,
    changedFields,
    source: 'detour-worker-v2',
  };
}

function buildClearedEvent(routeId, previous, now) {
  const detectedAt = previous?.detectedAtMs ?? null;
  return {
    eventType: 'DETOUR_CLEARED',
    routeId,
    occurredAt: now,
    detectedAt,
    clearedAt: now,
    durationMs: detectedAt != null ? Math.max(0, now - detectedAt) : null,
    triggerVehicleId: previous?.triggerVehicleId || null,
    previousVehicleCount: previous?.vehicleCount ?? 0,
    source: 'detour-worker-v2',
  };
}

async function writeHistoryEvent(db, event) {
  if (!HISTORY_ENABLED || !event) return;
  const suffix = Math.random().toString(36).slice(2, 8);
  const docId = `${event.occurredAt}-${event.routeId}-${event.eventType}-${suffix}`;
  await db.collection(HISTORY_COLLECTION).doc(docId).set(event);
}

async function hydratePublisherState(db) {
  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    try {
      const snapshot = await db.collection(ACTIVE_COLLECTION).get();
      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const routeId = data.routeId || doc.id;
        const normalized = {
          routeId,
          detectedAt: data.detectedAt || null,
          lastSeenAt: data.lastSeenAt || null,
          updatedAt: data.updatedAt || null,
          triggerVehicleId: data.triggerVehicleId || null,
          vehicleCount: normalizeVehicleCount(data.vehicleCount),
          state: data.state || 'active',
          confidence: data.confidence || null,
          evidencePointCount: data.evidencePointCount ?? null,
          lastEvidenceAt: data.lastEvidenceAt || null,
        };
        lastPublishedIds.add(routeId);
        lastPublishedState.set(routeId, makeSnapshot(normalized));
        const updatedAtMs = toMillis(normalized.updatedAt);
        if (updatedAtMs != null) {
          lastSeenUpdateTime.set(routeId, updatedAtMs);
        }
      });
      if (snapshot.size > 0) {
        console.log(`[detourPublisher] Hydrated ${snapshot.size} active detours`);
      }
    } catch (err) {
      console.error('[detourPublisher] Failed to hydrate existing detours:', err.message);
    }
  })();

  await hydratePromise;
}

async function pruneHistoryIfNeeded(db, now) {
  if (!HISTORY_ENABLED) return;
  if (!Number.isFinite(HISTORY_RETENTION_DAYS) || HISTORY_RETENTION_DAYS <= 0) return;
  if ((now - lastHistoryPruneAt) < HISTORY_PRUNE_INTERVAL_MS) return;

  lastHistoryPruneAt = now;
  const cutoff = now - (HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    let totalDeleted = 0;
    for (let i = 0; i < 10; i++) {
      const snapshot = await db
        .collection(HISTORY_COLLECTION)
        .where('occurredAt', '<', cutoff)
        .orderBy('occurredAt', 'asc')
        .limit(200)
        .get();

      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += snapshot.size;

      if (snapshot.size < 200) break;
    }

    if (totalDeleted > 0) {
      console.log(
        `[detourPublisher] Pruned ${totalDeleted} detour history records older than ${HISTORY_RETENTION_DAYS} days`
      );
    }
  } catch (err) {
    console.error('[detourPublisher] Failed to prune detour history:', err.message);
  }
}

function normalizeHistoryDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...data,
    occurredAt: toMillis(data.occurredAt),
    detectedAt: toMillis(data.detectedAt),
    lastSeenAt: toMillis(data.lastSeenAt),
    clearedAt: toMillis(data.clearedAt),
  };
}

async function publishDetours(activeDetours) {
  const db = getDb();
  if (!db) {
    console.warn('[detourPublisher] Firestore not configured — skipping publish');
    return;
  }
  await hydratePublisherState(db);

  const currentIds = new Set(Object.keys(activeDetours));
  const now = Date.now();

  const removedIds = [...lastPublishedIds].filter(id => !currentIds.has(id));
  for (const routeId of removedIds) {
    const previous = lastPublishedState.get(routeId);
    try {
      await db.collection(ACTIVE_COLLECTION).doc(routeId).delete();
      await writeHistoryEvent(db, buildClearedEvent(routeId, previous, now));
      lastPublishedIds.delete(routeId);
      lastPublishedState.delete(routeId);
      lastSeenUpdateTime.delete(routeId);
      lastGeometryWriteTime.delete(routeId);
      lastKnownGeometry.delete(routeId);
    } catch (err) {
      console.error(`[detourPublisher] Failed to delete ${routeId}:`, err.message);
    }
  }

  for (const [routeId, detour] of Object.entries(activeDetours)) {
    const isNew = !lastPublishedIds.has(routeId);
    const lastUpdate = lastSeenUpdateTime.get(routeId) || 0;
    const shouldUpdateLastSeen = isNew || (now - lastUpdate >= LAST_SEEN_THROTTLE_MS);
    const previousSnapshot = lastPublishedState.get(routeId);

    const doc = {
      routeId,
      detectedAt: toDate(detour.detectedAt, now),
      updatedAt: now,
      triggerVehicleId: detour.triggerVehicleId || null,
      vehicleCount: detour.vehiclesOffRoute
        ? detour.vehiclesOffRoute.size
        : normalizeVehicleCount(detour.vehicleCount),
      state: detour.state || 'active',
    };

    if (shouldUpdateLastSeen) {
      doc.lastSeenAt = toDate(detour.lastSeenAt, now);
    }

    // Geometry write throttle: only write geometry when criteria are met
    const geo = detour.geometry;
    const writeGeo = isNew || shouldWriteGeometry(routeId, detour, previousSnapshot, now);
    if (writeGeo && geo) {
      doc.skippedSegmentPolyline = geo.skippedSegmentPolyline || null;
      doc.inferredDetourPolyline = geo.inferredDetourPolyline || null;
      doc.entryPoint = geo.entryPoint || null;
      doc.exitPoint = geo.exitPoint || null;
      doc.confidence = geo.confidence || null;
      doc.evidencePointCount = geo.evidencePointCount ?? null;
      doc.lastEvidenceAt = geo.lastEvidenceAt ?? null;
    }

    try {
      await db.collection(ACTIVE_COLLECTION).doc(routeId).set(doc, { merge: true });
      if (isNew) {
        await writeHistoryEvent(db, buildDetectedEvent(routeId, doc, now));
      } else {
        await writeHistoryEvent(db, buildUpdatedEvent(routeId, previousSnapshot, doc, now));
      }
      lastPublishedIds.add(routeId);
      lastPublishedState.set(routeId, makeSnapshot(doc));
      if (shouldUpdateLastSeen) {
        lastSeenUpdateTime.set(routeId, now);
      }
      if (writeGeo && geo) {
        lastGeometryWriteTime.set(routeId, now);
      }
      // Always track geometry state for accurate throttle decisions on next tick
      if (geo) {
        lastKnownGeometry.set(routeId, {
          confidence: geo.confidence,
          evidencePointCount: geo.evidencePointCount,
          lastEvidenceAt: geo.lastEvidenceAt,
        });
      }
    } catch (err) {
      console.error(`[detourPublisher] Failed to write ${routeId}:`, err.message);
    }
  }

  await pruneHistoryIfNeeded(db, now);
}

async function getDetourHistory(options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[detourPublisher] Firestore not configured — detour history unavailable');
    return [];
  }

  const parsedLimit = Number.parseInt(String(options.limit ?? HISTORY_DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), HISTORY_MAX_LIMIT)
    : HISTORY_DEFAULT_LIMIT;

  const routeId = options.routeId ? String(options.routeId).trim() : '';
  const eventTypes = Array.isArray(options.eventTypes)
    ? options.eventTypes
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean)
    : [];

  const startMs = Number.isFinite(options.startMs) ? options.startMs : null;
  const endMs = Number.isFinite(options.endMs) ? options.endMs : null;

  let query = db.collection(HISTORY_COLLECTION).orderBy('occurredAt', 'desc');
  if (startMs != null) {
    query = query.where('occurredAt', '>=', startMs);
  }
  if (endMs != null) {
    query = query.where('occurredAt', '<=', endMs);
  }

  const needsFilter = Boolean(routeId) || eventTypes.length > 0;
  const fetchLimit = needsFilter
    ? Math.min(1000, Math.max(limit * 10, limit))
    : limit;

  const snapshot = await query.limit(fetchLimit).get();
  let logs = snapshot.docs.map(normalizeHistoryDoc);

  if (routeId) {
    logs = logs.filter((entry) => entry.routeId === routeId);
  }

  if (eventTypes.length > 0) {
    const allowedTypes = new Set(eventTypes);
    logs = logs.filter((entry) => allowedTypes.has(String(entry.eventType || '').toUpperCase()));
  }

  return logs.slice(0, limit);
}

function getLastPublishedIds() {
  return new Set(lastPublishedIds);
}

module.exports = {
  publishDetours,
  getLastPublishedIds,
  getDetourHistory,
  HISTORY_MAX_LIMIT,
  GEOMETRY_WRITE_THROTTLE_MS,
  // Exported for testing
  shouldWriteGeometry,
  makeSnapshot,
  buildUpdatedEvent,
  buildDetectedEvent,
  buildClearedEvent,
};
