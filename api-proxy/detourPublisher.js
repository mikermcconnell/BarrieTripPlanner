const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'activeDetours';
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

const lastPublishedIds = new Set();
const lastSeenUpdateTime = new Map();

async function publishDetours(activeDetours) {
  const db = getDb();
  if (!db) {
    console.warn('[detourPublisher] Firestore not configured — skipping publish');
    return;
  }

  const currentIds = new Set(Object.keys(activeDetours));
  const now = Date.now();

  const removedIds = [...lastPublishedIds].filter(id => !currentIds.has(id));
  for (const routeId of removedIds) {
    try {
      await db.collection(COLLECTION).doc(routeId).delete();
      lastPublishedIds.delete(routeId);
      lastSeenUpdateTime.delete(routeId);
    } catch (err) {
      console.error(`[detourPublisher] Failed to delete ${routeId}:`, err.message);
    }
  }

  for (const [routeId, detour] of Object.entries(activeDetours)) {
    const isNew = !lastPublishedIds.has(routeId);
    const lastUpdate = lastSeenUpdateTime.get(routeId) || 0;
    const shouldUpdateLastSeen = isNew || (now - lastUpdate >= LAST_SEEN_THROTTLE_MS);

    const doc = {
      routeId,
      detectedAt: detour.detectedAt,
      updatedAt: now,
      triggerVehicleId: detour.triggerVehicleId,
      vehicleCount: detour.vehiclesOffRoute ? detour.vehiclesOffRoute.size : 0,
    };

    if (shouldUpdateLastSeen) {
      doc.lastSeenAt = detour.lastSeenAt;
      lastSeenUpdateTime.set(routeId, now);
    }

    try {
      if (isNew) {
        await db.collection(COLLECTION).doc(routeId).set(doc);
        lastPublishedIds.add(routeId);
      } else {
        await db.collection(COLLECTION).doc(routeId).update(doc);
      }
    } catch (err) {
      console.error(`[detourPublisher] Failed to write ${routeId}:`, err.message);
    }
  }
}

function getLastPublishedIds() {
  return new Set(lastPublishedIds);
}

module.exports = { publishDetours, getLastPublishedIds };
