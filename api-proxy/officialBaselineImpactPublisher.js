'use strict';

const { getDb } = require('./firebaseAdmin');

const CANDIDATE_COLLECTION = 'officialServiceImpactCandidates';

async function publishOfficialBaselineImpactCandidates(candidates = [], {
  db = getDb(),
  now = Date.now(),
} = {}) {
  if (!db) {
    return {
      ok: false,
      publishedCount: 0,
      skipped: true,
      reason: 'firestore_unavailable',
    };
  }

  let publishedCount = 0;
  for (const candidate of candidates || []) {
    const id = String(candidate?.id || '').trim();
    if (!id) continue;
    await db.collection(CANDIDATE_COLLECTION).doc(id).set({
      ...candidate,
      id,
      status: 'candidate',
      archivedAt: null,
      updatedAt: now,
      createdAt: candidate.createdAt || now,
    }, { merge: true });
    publishedCount++;
  }

  return {
    ok: true,
    publishedCount,
    skipped: false,
  };
}

module.exports = {
  CANDIDATE_COLLECTION,
  publishOfficialBaselineImpactCandidates,
};
