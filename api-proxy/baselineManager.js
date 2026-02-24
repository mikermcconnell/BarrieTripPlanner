const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'baselineShapes';
const META_DOC = '_meta';
const AUTO_INIT = process.env.BASELINE_AUTO_INIT !== 'false'; // default true

let baselineCache = null;
let hydratePromise = null;

function serializeShapes(shapes, routeShapeMapping) {
  const docs = {};
  for (const [routeId, shapeIds] of routeShapeMapping) {
    const routeShapes = {};
    for (const shapeId of shapeIds) {
      const pts = shapes.get(shapeId);
      if (pts) {
        routeShapes[shapeId] = pts.map((p) => ({
          lat: p.latitude,
          lon: p.longitude,
          seq: p.sequence,
        }));
      }
    }
    docs[routeId] = { routeId, shapeIds: [...shapeIds], shapes: routeShapes };
  }
  return docs;
}

function deserializeDocs(routeDocs) {
  const shapes = new Map();
  const routeShapeMapping = new Map();

  for (const [routeId, doc] of Object.entries(routeDocs)) {
    routeShapeMapping.set(routeId, doc.shapeIds || []);
    for (const [shapeId, pts] of Object.entries(doc.shapes || {})) {
      if (!shapes.has(shapeId)) {
        shapes.set(
          shapeId,
          pts.map((p) => ({
            latitude: p.lat,
            longitude: p.lon,
            sequence: p.seq,
          }))
        );
      }
    }
  }

  return { shapes, routeShapeMapping };
}

async function hydrateFromFirestore() {
  const db = getDb();
  if (!db) return null;

  try {
    const metaSnap = await db.collection(COLLECTION).doc(META_DOC).get();
    if (!metaSnap.exists) return null;

    const meta = metaSnap.data();
    const allDocs = await db.collection(COLLECTION).get();
    const routeDocs = {};

    allDocs.forEach((doc) => {
      if (doc.id === META_DOC) return;
      routeDocs[doc.id] = doc.data();
    });

    if (Object.keys(routeDocs).length === 0) return null;

    const { shapes, routeShapeMapping } = deserializeDocs(routeDocs);
    console.log(
      `[baselineManager] Hydrated baseline from Firestore: ${shapes.size} shapes, ${routeShapeMapping.size} routes (created ${meta.createdAt})`
    );

    return {
      shapes,
      routeShapeMapping,
      loadedAt: meta.createdAt,
      source: 'firestore',
    };
  } catch (err) {
    console.error('[baselineManager] Hydrate failed:', err.message);
    return null;
  }
}

async function ensureHydrated(liveData) {
  if (baselineCache) return;

  if (!hydratePromise) {
    hydratePromise = (async () => {
      const fromFirestore = await hydrateFromFirestore();
      if (fromFirestore) {
        baselineCache = fromFirestore;
        return;
      }

      if (AUTO_INIT && liveData && liveData.shapes && liveData.routeShapeMapping) {
        console.log('[baselineManager] No baseline in Firestore — auto-initializing from live GTFS');
        await setBaseline(liveData);
      }
    })();
  }

  await hydratePromise;
  hydratePromise = null;
}

async function getBaselineData(liveData) {
  await ensureHydrated(liveData);

  if (baselineCache) return baselineCache;

  // Fallback: return live data when no baseline and no Firestore
  return {
    shapes: liveData.shapes,
    routeShapeMapping: liveData.routeShapeMapping,
    loadedAt: new Date().toISOString(),
    source: 'live-fallback',
  };
}

async function setBaseline(liveData) {
  const now = new Date().toISOString();
  const routeDocs = serializeShapes(liveData.shapes, liveData.routeShapeMapping);
  const routeCount = Object.keys(routeDocs).length;
  let shapeCount = 0;
  for (const doc of Object.values(routeDocs)) {
    shapeCount += doc.shapeIds.length;
  }

  const db = getDb();
  if (db) {
    try {
      // Write in batches (Firestore limit: 500 ops per batch)
      const BATCH_LIMIT = 400;
      const entries = Object.entries(routeDocs);
      for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        const chunk = entries.slice(i, i + BATCH_LIMIT);
        for (const [routeId, doc] of chunk) {
          batch.set(db.collection(COLLECTION).doc(routeId), doc);
        }
        if (i === 0) {
          batch.set(db.collection(COLLECTION).doc(META_DOC), {
            createdAt: now,
            source: 'setBaseline',
            routeCount,
            shapeCount,
          });
        }
        await batch.commit();
      }
      console.log(`[baselineManager] Saved baseline to Firestore: ${shapeCount} shapes, ${routeCount} routes`);
    } catch (err) {
      console.error('[baselineManager] Failed to write baseline to Firestore:', err.message);
    }
  }

  const { shapes, routeShapeMapping } = deserializeDocs(routeDocs);
  baselineCache = { shapes, routeShapeMapping, loadedAt: now, source: 'setBaseline' };
}

async function clearBaseline() {
  baselineCache = null;
  hydratePromise = null;

  const db = getDb();
  if (!db) return;

  try {
    const allDocs = await db.collection(COLLECTION).get();
    if (allDocs.empty) return;

    const BATCH_LIMIT = 400;
    const docs = allDocs.docs;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      docs.slice(i, i + BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    console.log(`[baselineManager] Cleared baseline from Firestore (${docs.length} docs)`);
  } catch (err) {
    console.error('[baselineManager] Failed to clear baseline:', err.message);
  }
}

function getBaselineStatus() {
  if (!baselineCache) {
    return { loaded: false, loadedAt: null, source: null, routeCount: 0, shapeCount: 0 };
  }
  return {
    loaded: true,
    loadedAt: baselineCache.loadedAt,
    source: baselineCache.source,
    routeCount: baselineCache.routeShapeMapping.size,
    shapeCount: baselineCache.shapes.size,
  };
}

function logShapeDivergence(liveData) {
  if (!baselineCache) return;

  const baselineMapping = baselineCache.routeShapeMapping;
  const liveMapping = liveData.routeShapeMapping;
  const changes = [];

  for (const [routeId, liveShapeIds] of liveMapping) {
    const baselineShapeIds = baselineMapping.get(routeId);
    if (!baselineShapeIds) {
      changes.push(`  ${routeId}: NEW route (${liveShapeIds.length} shapes)`);
      continue;
    }

    const baseSet = new Set(baselineShapeIds);
    const liveSet = new Set(liveShapeIds);
    const added = liveShapeIds.filter((id) => !baseSet.has(id));
    const removed = baselineShapeIds.filter((id) => !liveSet.has(id));

    if (added.length > 0 || removed.length > 0) {
      const parts = [];
      if (added.length > 0) parts.push(`+${added.length} added [${added.join(', ')}]`);
      if (removed.length > 0) parts.push(`-${removed.length} removed [${removed.join(', ')}]`);
      changes.push(`  ${routeId}: ${parts.join(', ')}`);
    }
  }

  for (const routeId of baselineMapping.keys()) {
    if (!liveMapping.has(routeId)) {
      changes.push(`  ${routeId}: REMOVED from live GTFS`);
    }
  }

  if (changes.length > 0) {
    console.log(`[baselineManager] Shape divergence from baseline:\n${changes.join('\n')}`);
  } else {
    console.log('[baselineManager] Live GTFS shapes match baseline (no divergence)');
  }
}

// Exported for testing
function _resetForTesting() {
  baselineCache = null;
  hydratePromise = null;
}

module.exports = {
  getBaselineData,
  setBaseline,
  clearBaseline,
  getBaselineStatus,
  logShapeDivergence,
  _resetForTesting,
};
