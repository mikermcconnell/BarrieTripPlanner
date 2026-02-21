const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'transitNews';
const knownNewsIds = new Set();
let hydratePromise = null;

async function hydrateKnownNewsIds(db) {
  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    try {
      const snapshot = await db.collection(COLLECTION).where('archivedAt', '==', null).get();
      snapshot.forEach((doc) => knownNewsIds.add(doc.id));
      console.log(`[newsPublisher] Hydrated ${knownNewsIds.size} active news IDs`);
    } catch (err) {
      console.error('[newsPublisher] Failed to hydrate known IDs:', err.message);
    }
  })();

  await hydratePromise;
}

/**
 * Publish fetched news items to Firestore. Returns array of newly detected items.
 * Items no longer on the page get soft-deleted via archivedAt timestamp.
 */
async function publishNews(items) {
  const db = getDb();
  if (!db) {
    console.warn('[newsPublisher] Firestore not configured — skipping publish');
    return [];
  }
  await hydrateKnownNewsIds(db);

  const currentIds = new Set(items.map((item) => item.id));
  const newItems = [];
  const now = Date.now();

  // Soft-delete items that disappeared from the page
  for (const id of knownNewsIds) {
    if (!currentIds.has(id)) {
      try {
        await db.collection(COLLECTION).doc(id).update({
          archivedAt: now,
          updatedAt: now,
        });
        knownNewsIds.delete(id);
      } catch (err) {
        console.error(`[newsPublisher] Failed to archive ${id}:`, err.message);
      }
    }
  }

  // Upsert current items
  for (const item of items) {
    const isNew = !knownNewsIds.has(item.id);

    const doc = {
      title: item.title,
      body: item.body,
      date: item.date,
      affectedRoutes: item.affectedRoutes,
      url: item.url,
      updatedAt: now,
      archivedAt: null,
    };

    try {
      if (isNew) {
        doc.publishedAt = now;
        await db.collection(COLLECTION).doc(item.id).set(doc);
        knownNewsIds.add(item.id);
        newItems.push(item);
      } else {
        await db.collection(COLLECTION).doc(item.id).update(doc);
      }
    } catch (err) {
      console.error(`[newsPublisher] Failed to write ${item.id}:`, err.message);
    }
  }

  return newItems;
}

function getKnownNewsIds() {
  return new Set(knownNewsIds);
}

module.exports = { publishNews, getKnownNewsIds };
