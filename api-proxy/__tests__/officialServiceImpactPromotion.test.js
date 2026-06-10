const {
  IMPACT_COLLECTION,
  promoteOfficialServiceImpactCandidates,
} = require('../officialServiceImpactPublisher');

function createDoc(initialValue = null) {
  let value = initialValue;
  return {
    async get() {
      return {
        exists: value != null,
        data: () => value,
      };
    },
    async set(nextValue, options) {
      value = options?.merge ? { ...(value || {}), ...nextValue } : nextValue;
    },
    async update(nextValue) {
      value = { ...(value || {}), ...nextValue };
    },
    value: () => value,
  };
}

function createFakeDb() {
  const docs = new Map();
  return {
    docs,
    collection: (name) => ({
      doc: (id) => {
        const key = `${name}/${id}`;
        if (!docs.has(key)) docs.set(key, createDoc());
        return docs.get(key);
      },
    }),
  };
}

describe('officialServiceImpactPublisher promotion', () => {
  test('promotes reviewed candidates into rider-facing official impacts', async () => {
    const db = createFakeDb();
    const candidateDoc = db.collection('officialServiceImpactCandidates').doc('baseline-detour-12b-1652');
    await candidateDoc.set({
      id: 'baseline-detour-12b-1652',
      type: 'baseline_detour',
      status: 'reviewed',
      routeId: '12B',
      routes: ['12B'],
      replacementRoutes: ['15'],
      title: 'Mapleview Detour and Shuttle',
      summary: 'Route 12B no longer directly serves Barrie South GO. Use Route 15 shuttle.',
      sourceUrl: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
      archivedAt: null,
    });

    const result = await promoteOfficialServiceImpactCandidates(['baseline-detour-12b-1652'], {
      db,
      now: 1770000000000,
    });

    expect(result).toEqual({
      ok: true,
      promotedCount: 1,
      missingIds: [],
      skippedIds: [],
    });
    expect(db.docs.get(`${IMPACT_COLLECTION}/baseline-detour-12b-1652`).value()).toMatchObject({
      id: 'baseline-detour-12b-1652',
      type: 'baseline_detour',
      status: 'active',
      routeId: '12B',
      affectedRoutes: ['12B'],
      replacementRoutes: ['15'],
      title: 'Mapleview Detour and Shuttle',
      message: 'Route 12B no longer directly serves Barrie South GO. Use Route 15 shuttle.',
      sourceType: 'official_gtfs_change',
      promotedAt: 1770000000000,
      archivedAt: null,
    });
    expect(candidateDoc.value()).toMatchObject({
      status: 'promoted',
      promotedAt: 1770000000000,
      officialImpactId: 'baseline-detour-12b-1652',
    });
  });
});
