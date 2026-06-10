const { buildGtfsSnapshot, saveLatestSnapshot, getLatestSnapshot } = require('../gtfsSnapshotStore');

function createFakeDb() {
  const docs = new Map();
  return {
    docs,
    collection: (name) => ({
      doc: (id) => ({
        async get() {
          return {
            exists: docs.has(`${name}/${id}`),
            data: () => docs.get(`${name}/${id}`),
          };
        },
        async set(value) {
          docs.set(`${name}/${id}`, value);
        },
      }),
    }),
  };
}

describe('gtfsSnapshotStore', () => {
  test('builds a compact GTFS snapshot from static data maps', () => {
    const snapshot = buildGtfsSnapshot({
      routeStopSequencesMapping: {
        '12B': { __default__: ['100', '725'] },
      },
      stopsById: new Map([
        ['725', { id: '725', code: '725', name: 'Barrie South GO', latitude: 44.36, longitude: -79.63 }],
      ]),
      lastRefresh: 1770000000000,
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      routeStopSequencesMapping: {
        '12B': { __default__: ['100', '725'] },
      },
      stopsById: {
        '725': { id: '725', code: '725', name: 'Barrie South GO' },
      },
      sourceLastRefresh: 1770000000000,
    });
    expect(snapshot.routeCount).toBe(1);
    expect(snapshot.stopCount).toBe(1);
    expect(snapshot.fingerprint).toEqual(expect.any(String));
  });

  test('saves and loads the latest snapshot from Firestore', async () => {
    const db = createFakeDb();
    const snapshot = buildGtfsSnapshot({
      routeStopSequencesMapping: { '12B': { __default__: ['100', '725'] } },
      stopsById: {},
    });

    await saveLatestSnapshot(snapshot, { db, now: 1770000001234 });
    const loaded = await getLatestSnapshot({ db });

    expect(loaded).toMatchObject({
      ...snapshot,
      updatedAt: 1770000001234,
    });
  });
});
