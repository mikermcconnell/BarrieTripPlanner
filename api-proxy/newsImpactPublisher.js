const { getDb } = require('./firebaseAdmin');
const { extractStopClosureImpacts } = require('./newsImpactParser');
const { getStaticData } = require('./gtfsLoader');

const COLLECTION = 'transitNewsImpacts';

async function loadStopIndex() {
  try {
    const staticData = await getStaticData();
    return {
      stopsById: staticData.stopsById || new Map(),
      stopsByCode: staticData.stopsByCode || new Map(),
    };
  } catch (error) {
    console.error('[newsImpactPublisher] Failed to load GTFS stops:', error.message);
    return { stopsById: new Map(), stopsByCode: new Map() };
  }
}

async function archiveMissingImpacts(db, currentIds, now) {
  const snapshot = await db
    .collection(COLLECTION)
    .where('source', '==', 'myridebarrie')
    .where('archivedAt', '==', null)
    .get();

  const writes = [];
  snapshot.forEach((doc) => {
    if (!currentIds.has(doc.id)) {
      writes.push(doc.ref.update({ archivedAt: now, updatedAt: now, status: 'archived' }));
    }
  });
  await Promise.all(writes);
}

async function publishNewsImpacts(newsItems) {
  const db = getDb();
  if (!db) {
    console.warn('[newsImpactPublisher] Firestore not configured — skipping impacts');
    return [];
  }

  const stopIndex = await loadStopIndex();
  const impacts = await extractStopClosureImpacts(newsItems, stopIndex, {
    fetchOfficialNotices: true,
  });
  const currentIds = new Set(impacts.map((impact) => impact.id));
  const now = Date.now();

  await archiveMissingImpacts(db, currentIds, now);

  await Promise.all(impacts.map((impact) => db.collection(COLLECTION).doc(impact.id).set({
    ...impact,
    updatedAt: now,
    archivedAt: null,
  }, { merge: true })));

  return impacts;
}

module.exports = {
  publishNewsImpacts,
};
