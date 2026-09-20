const { getDb } = require('./firebaseAdmin');

const COLLECTION = 'systemState';
const DOC_ID = 'baselineAutoUpdate';

async function loadPendingRoutes() {
  const db = getDb();
  if (!db) return null;
  const snapshot = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snapshot.exists) return [];
  const routes = snapshot.data()?.pendingRoutes;
  return Array.isArray(routes) ? routes : [];
}

async function savePendingRoutes(pendingRoutes = []) {
  const db = getDb();
  if (!db) return;
  await db.collection(COLLECTION).doc(DOC_ID).set({
    pendingRoutes,
    updatedAt: Date.now(),
  });
}

module.exports = {
  COLLECTION,
  DOC_ID,
  loadPendingRoutes,
  savePendingRoutes,
};
