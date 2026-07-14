const { getDb } = require('./firebaseAdmin');
const { resolveDetourStorageConfig } = require('./detour/storageConfig');
const { gzipSync, gunzipSync } = require('zlib');

const COLLECTION = 'systemState';
const DOC_ID = 'detourRuntime';

let hydratePromise = null;
let hydrateCacheKey = null;
const V2_RUNTIME_ENCODING = 'gzip-json-v1';
const MAX_COMPRESSED_RUNTIME_BYTES = 900 * 1024;

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

function compactRuntimeStateForStorage(state = {}) {
  const compacted = stripUndefined(state || {});
  if (compacted?.detourVersion !== 'v2') return compacted;

  // V2 can still read the legacy aliases below, but writing both copies makes
  // the single Firestore runtime document grow past the 1 MiB document limit.
  // Keep only the event-keyed canonical structures in persisted state.
  if (compacted.eventCandidates && typeof compacted.eventCandidates === 'object') {
    delete compacted.candidates;
  }
  if (compacted.activeEvents && typeof compacted.activeEvents === 'object') {
    delete compacted.activeDetours;
  }
  if (compacted.clearTracksByEvent && typeof compacted.clearTracksByEvent === 'object') {
    delete compacted.clearTracks;
  }

  return compacted;
}

function encodeRuntimeStateForStorage(state = {}) {
  const compacted = compactRuntimeStateForStorage(state);
  if (compacted?.detourVersion !== 'v2') return compacted;

  const json = JSON.stringify(compacted);
  const compressedState = gzipSync(Buffer.from(json, 'utf8'));
  if (compressedState.length > MAX_COMPRESSED_RUNTIME_BYTES) {
    throw new Error(
      `Compressed V2 runtime state is ${compressedState.length} bytes; ` +
      `the safety limit is ${MAX_COMPRESSED_RUNTIME_BYTES} bytes.`
    );
  }

  return {
    encoding: V2_RUNTIME_ENCODING,
    compressedState,
    uncompressedBytes: Buffer.byteLength(json, 'utf8'),
    compressedBytes: compressedState.length,
  };
}

function decodeRuntimeStateFromStorage(stored = {}) {
  if (stored?.encoding !== V2_RUNTIME_ENCODING || stored?.compressedState == null) {
    return stored;
  }

  const compressedState = Buffer.isBuffer(stored.compressedState)
    ? stored.compressedState
    : Buffer.from(stored.compressedState);
  return JSON.parse(gunzipSync(compressedState).toString('utf8'));
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
      const doc = await db
        .collection(storageConfig.runtimeStateCollection)
        .doc(storageConfig.runtimeStateDoc)
        .get();
      if (!doc.exists) return null;
      return decodeRuntimeStateFromStorage(doc.data() || null);
    })().catch((error) => {
      hydratePromise = null;
      console.error('[detourRuntimeStateStore] Failed to load runtime state:', error.message);
      throw error;
    });
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
    const sanitizedState = compactRuntimeStateForStorage(state || {});
    const storedState = encodeRuntimeStateForStorage(sanitizedState);
    hydratePromise = Promise.resolve(sanitizedState || null);
    await db.collection(storageConfig.runtimeStateCollection).doc(storageConfig.runtimeStateDoc).set({
      ...(storedState || {}),
      updatedAt: Date.now(),
    });
  } catch (error) {
    hydratePromise = null;
    console.error('[detourRuntimeStateStore] Failed to save runtime state:', error.message);
    throw error;
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
  compactRuntimeStateForStorage,
  encodeRuntimeStateForStorage,
  decodeRuntimeStateFromStorage,
};
