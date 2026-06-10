'use strict';

const { getDb } = require('./firebaseAdmin');

const CANDIDATE_COLLECTION = 'officialServiceImpactCandidates';
const IMPACT_COLLECTION = 'officialServiceImpacts';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeImpact(candidate, now) {
  const id = String(candidate?.id || '').trim();
  const routes = toArray(candidate?.routes).length > 0
    ? toArray(candidate.routes)
    : toArray(candidate?.affectedRoutes).length > 0
      ? toArray(candidate.affectedRoutes)
      : candidate?.routeId
        ? [candidate.routeId]
        : [];

  return {
    ...candidate,
    id,
    type: candidate?.type || 'baseline_detour',
    status: 'active',
    sourceType: candidate?.sourceType || 'official_gtfs_change',
    routeId: candidate?.routeId || routes[0] || null,
    routes,
    affectedRoutes: routes,
    replacementRoutes: toArray(candidate?.replacementRoutes),
    title: candidate?.title || 'Official service notice',
    message: candidate?.message || candidate?.summary || '',
    summary: candidate?.summary || candidate?.message || '',
    isOfficial: true,
    archivedAt: null,
    promotedAt: candidate?.promotedAt || now,
    updatedAt: now,
    createdAt: candidate?.createdAt || now,
  };
}

async function promoteOfficialServiceImpactCandidates(candidateIds = [], {
  db = getDb(),
  now = Date.now(),
} = {}) {
  if (!db) {
    return {
      ok: false,
      promotedCount: 0,
      missingIds: [],
      skippedIds: [],
      skipped: true,
      reason: 'firestore_unavailable',
    };
  }

  const ids = [...new Set((candidateIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const missingIds = [];
  const skippedIds = [];
  let promotedCount = 0;

  for (const id of ids) {
    const candidateRef = db.collection(CANDIDATE_COLLECTION).doc(id);
    const snapshot = await candidateRef.get();
    if (!snapshot.exists) {
      missingIds.push(id);
      continue;
    }

    const candidate = snapshot.data() || {};
    if (candidate.archivedAt != null || candidate.status === 'archived') {
      skippedIds.push(id);
      continue;
    }

    const impact = normalizeImpact({ ...candidate, id }, now);
    await db.collection(IMPACT_COLLECTION).doc(id).set(impact, { merge: true });
    await candidateRef.update({
      status: 'promoted',
      promotedAt: now,
      officialImpactId: id,
      updatedAt: now,
    });
    promotedCount++;
  }

  return {
    ok: true,
    promotedCount,
    missingIds,
    skippedIds,
  };
}

module.exports = {
  IMPACT_COLLECTION,
  promoteOfficialServiceImpactCandidates,
};
