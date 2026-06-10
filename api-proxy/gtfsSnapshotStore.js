'use strict';

const crypto = require('crypto');
const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'gtfsBaselineSnapshots';
const LATEST_DOC = 'latest';

function normalizeStop(stop, fallbackId) {
  const id = String(stop?.id ?? stop?.stop_id ?? fallbackId ?? '').trim();
  if (!id) return null;
  return {
    id,
    code: String(stop?.code ?? stop?.stop_code ?? id).trim(),
    name: String(stop?.name ?? stop?.stop_name ?? '').trim(),
    latitude: Number(stop?.latitude ?? stop?.stop_lat),
    longitude: Number(stop?.longitude ?? stop?.stop_lon),
  };
}

function mapToObject(value, mapper) {
  if (!value) return {};
  const entries = typeof value.entries === 'function' ? [...value.entries()] : Object.entries(value);
  return Object.fromEntries(
    entries
      .map(([key, item]) => [String(key), mapper ? mapper(item, key) : item])
      .filter(([, item]) => item != null)
  );
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprintSnapshot(snapshot) {
  return crypto
    .createHash('sha256')
    .update(stableStringify({
      routeStopSequencesMapping: snapshot.routeStopSequencesMapping,
      stopsById: snapshot.stopsById,
    }))
    .digest('hex');
}

function buildGtfsSnapshot(staticData = {}, {
  createdAt = Date.now(),
} = {}) {
  const routeStopSequencesMapping = mapToObject(staticData.routeStopSequencesMapping || {});
  const stopsById = mapToObject(staticData.stopsById || {}, normalizeStop);
  const snapshot = {
    schemaVersion: 1,
    createdAt,
    sourceLastRefresh: staticData.lastRefresh || null,
    routeStopSequencesMapping,
    stopsById,
    routeCount: Object.keys(routeStopSequencesMapping).length,
    stopCount: Object.keys(stopsById).length,
  };
  return {
    ...snapshot,
    fingerprint: fingerprintSnapshot(snapshot),
  };
}

async function getLatestSnapshot({ db = getDb() } = {}) {
  if (!db) return null;
  const snap = await db.collection(COLLECTION).doc(LATEST_DOC).get();
  return snap.exists ? snap.data() : null;
}

async function saveLatestSnapshot(snapshot, {
  db = getDb(),
  now = Date.now(),
} = {}) {
  if (!db || !snapshot) {
    return { ok: false, skipped: true, reason: !db ? 'firestore_unavailable' : 'missing_snapshot' };
  }
  const doc = {
    ...snapshot,
    updatedAt: now,
  };
  await db.collection(COLLECTION).doc(LATEST_DOC).set(doc);
  return { ok: true, skipped: false, snapshot: doc };
}

module.exports = {
  buildGtfsSnapshot,
  getLatestSnapshot,
  saveLatestSnapshot,
};
