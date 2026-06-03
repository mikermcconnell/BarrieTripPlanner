const { getDb } = require('./firebaseAdmin');
const { resolveDetourStorageConfig } = require('./detour/storageConfig');

const COLLECTION = 'systemState';
const DOC_ID = 'detourRuntime';

let hydratePromise = null;
let hydrateCacheKey = null;

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value
      .map(stripUndefined)
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, stripUndefined(item)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return value;
}

async function loadDetourRuntimeState(options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[detourRuntimeStateStore] Firestore not configured — runtime state persistence disabled');
    return null;
  }

  const storageConfig = resolveDetourStorageConfig(options.storageConfig);
  const cacheKey = `${storageConfig.runtimeStateCollection}/${storageConfig.runtimeStateDoc}`;

  if (options.force || hydrateCacheKey !== cacheKey) {
    hydratePromise = null;
    hydrateCacheKey = cacheKey;
  }

  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const doc = await db
          .collection(storageConfig.runtimeStateCollection)
          .doc(storageConfig.runtimeStateDoc)
          .get();
        if (!doc.exists) return null;
        return doc.data() || null;
      } catch (error) {
        console.error('[detourRuntimeStateStore] Failed to load runtime state:', error.message);
        return null;
      }
    })();
  }

  return hydratePromise;
}

async function saveDetourRuntimeState(state, options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[detourRuntimeStateStore] Firestore not configured — skipping runtime state save');
    return;
  }

  const storageConfig = resolveDetourStorageConfig(options.storageConfig);
  hydrateCacheKey = `${storageConfig.runtimeStateCollection}/${storageConfig.runtimeStateDoc}`;

  try {
    const sanitizedState = stripUndefined(state || {});
    hydratePromise = Promise.resolve(sanitizedState || null);
    await db.collection(storageConfig.runtimeStateCollection).doc(storageConfig.runtimeStateDoc).set({
      ...(sanitizedState || {}),
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error('[detourRuntimeStateStore] Failed to save runtime state:', error.message);
  }
}

async function clearDetourRuntimeState(options = {}) {
  const db = getDb();
  const storageConfig = resolveDetourStorageConfig(options.storageConfig);
  hydrateCacheKey = `${storageConfig.runtimeStateCollection}/${storageConfig.runtimeStateDoc}`;
  hydratePromise = Promise.resolve(null);
  if (!db) return;
  try {
    await db.collection(storageConfig.runtimeStateCollection).doc(storageConfig.runtimeStateDoc).delete();
  } catch (error) {
    console.error('[detourRuntimeStateStore] Failed to clear runtime state:', error.message);
  }
}

module.exports = {
  COLLECTION,
  DOC_ID,
  loadDetourRuntimeState,
  saveDetourRuntimeState,
  clearDetourRuntimeState,
};
