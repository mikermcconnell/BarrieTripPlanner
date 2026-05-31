const indexes = require('../../firestore.indexes.json');

describe('Firestore indexes', () => {
  test('includes V2 detour history indexes', () => {
    const v2Indexes = indexes.indexes.filter((index) => index.collectionGroup === 'detourHistoryV2');
    expect(v2Indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ fieldPath: 'routeId' })]) }),
      expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ fieldPath: 'eventType' })]) }),
    ]));
  });
});
