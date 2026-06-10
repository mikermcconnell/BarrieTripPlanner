const { publishOfficialBaselineImpactCandidates } = require('../officialBaselineImpactPublisher');

function createFakeDb() {
  const docs = new Map();
  return {
    docs,
    collection: (name) => ({
      doc: (id) => ({
        async set(value, options) {
          docs.set(`${name}/${id}`, { value, options });
        },
      }),
    }),
  };
}

describe('officialBaselineImpactPublisher', () => {
  test('publishes matched official baseline impact candidates for operations review', async () => {
    const db = createFakeDb();
    const result = await publishOfficialBaselineImpactCandidates([
      {
        id: 'baseline-detour-12b-1652',
        type: 'baseline_detour',
        routeId: '12B',
        title: 'Mapleview Detour and Shuttle',
      },
    ], { db, now: 1770000000000 });

    expect(result).toEqual({ ok: true, publishedCount: 1, skipped: false });
    expect(db.docs.get('officialServiceImpactCandidates/baseline-detour-12b-1652')).toEqual({
      options: { merge: true },
      value: expect.objectContaining({
        id: 'baseline-detour-12b-1652',
        routeId: '12B',
        status: 'candidate',
        archivedAt: null,
        updatedAt: 1770000000000,
      }),
    });
  });

  test('skips publishing safely when Firestore is unavailable', async () => {
    const result = await publishOfficialBaselineImpactCandidates([
      { id: 'candidate-1' },
    ], { db: null });

    expect(result).toEqual({ ok: false, publishedCount: 0, skipped: true, reason: 'firestore_unavailable' });
  });
});
