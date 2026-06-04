const fs = require('fs');
const path = require('path');
const route10GroundTruth = require('../../docs/detour-ground-truth/route-10-mulcaster-simcoe-2026-05-26.json');
const {
  fetchLiveActiveDetours,
  getRenderableDetourPath,
  validateDetourAgainstGroundTruth,
} = require('../../scripts/detourGroundTruthValidator');

describe('detour ground-truth validator', () => {
  test('validates every ground-truth fixture against equivalent detector output', () => {
    const fixtureDir = path.resolve(__dirname, '../../docs/detour-ground-truth');
    const fixtures = fs.readdirSync(fixtureDir)
      .filter((fileName) => fileName.endsWith('.json'))
      .map((fileName) => require(path.join(fixtureDir, fileName)));

    expect(fixtures.length).toBeGreaterThanOrEqual(2);

    fixtures.forEach((fixture) => {
      const result = validateDetourAgainstGroundTruth({
        routeId: fixture.routeId,
        state: fixture.status,
        riderVisible: true,
        skippedSegmentPolyline: [
          fixture.closedSection.start,
          fixture.closedSection.end,
        ],
        canShowDetourPath: true,
        inferredDetourPolyline: fixture.detourPath,
      }, fixture);

      expect(result.pass).toBe(true);
      expect(result.failures).toEqual([]);
    });
  });

  test('validates Route 10 ground truth against matching detector output', () => {
    const result = validateDetourAgainstGroundTruth({
      routeId: '10',
      state: 'active',
      riderVisible: true,
      skippedSegmentPolyline: [
        { latitude: 44.3904722222, longitude: -79.6880277778 },
        { latitude: 44.3878611111, longitude: -79.6891666667 },
      ],
      canShowDetourPath: true,
      inferredDetourPolyline: [
        { latitude: 44.3902777778, longitude: -79.6854722222 },
        { latitude: 44.3886944444, longitude: -79.6855277778 },
        { latitude: 44.3879722222, longitude: -79.6888333333 },
      ],
    }, route10GroundTruth);

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('fails when the detector path misses the expected corridor', () => {
    const result = validateDetourAgainstGroundTruth({
      routeId: '10',
      state: 'active',
      riderVisible: true,
      skippedSegmentPolyline: [
        { latitude: 44.3904722222, longitude: -79.6880277778 },
        { latitude: 44.3878611111, longitude: -79.6891666667 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.4000, longitude: -79.7000 },
        { latitude: 44.4010, longitude: -79.7010 },
      ],
    }, route10GroundTruth);

    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.name.includes('detour path'))).toBe(true);
  });

  test('fetches the configured active-detour collection from Firestore REST', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          {
            name: 'projects/proj/databases/(default)/documents/activeDetourEventsV2/12A:shape-1:100-300',
            fields: {
              routeId: { stringValue: '12A' },
              riderVisible: { booleanValue: true },
            },
          },
        ],
      }),
    });

    const result = await fetchLiveActiveDetours({
      apiKey: 'public-key',
      projectId: 'proj',
      collectionName: 'activeDetourEventsV2',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents/activeDetourEventsV2?key=public-key'
    );
    expect(result['12A:shape-1:100-300']).toEqual(expect.objectContaining({
      routeId: '12A',
      riderVisible: true,
    }));
  });

  test('uses trusted inferred geometry when road-matched geometry is unavailable', () => {
    const detour = {
      canShowDetourPath: true,
      likelyDetourPolyline: null,
      inferredDetourPolyline: [
        { latitude: 44.3902777778, longitude: -79.6854722222 },
        { latitude: 44.3886944444, longitude: -79.6855277778 },
      ],
    };

    expect(getRenderableDetourPath(detour)).toEqual(detour.inferredDetourPolyline);
  });
});
