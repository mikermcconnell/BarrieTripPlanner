const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'systemState';
const DOC_ID = 'detourRuntime';

let hydratePromise = null;

async function loadDetourRuntimeState(options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[detourRuntimeStateStore] Firestore not configured — runtime state persistence disabled');
    return null;
  }

  if (options.force) {
    hydratePromise = null;
  }

  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const doc = await db.collection(COLLECTION).doc(DOC_ID).get();
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

async function saveDetourRuntimeState(state) {
  const db = getDb();
  if (!db) {
    console.warn('[detourRuntimeStateStore] Firestore not configured — skipping runtime state save');
    return;
  }

  try {
    hydratePromise = Promise.resolve(state || null);
    await db.collection(COLLECTION).doc(DOC_ID).set({
      ...(state || {}),
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error('[detourRuntimeStateStore] Failed to save runtime state:', error.message);
  }
}

async function clearDetourRuntimeState() {
  const db = getDb();
  hydratePromise = Promise.resolve(null);
  if (!db) return;
  try {
    await db.collection(COLLECTION).doc(DOC_ID).delete();
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
