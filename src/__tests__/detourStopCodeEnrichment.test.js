const {
  enrichDetoursWithDerivedStopCodes,
} = require('../utils/detourStopCodeEnrichment');

describe('enrichDetoursWithDerivedStopCodes', () => {
  test('adds derived stop codes to detours that do not publish stop impacts yet', () => {
    const result = enrichDetoursWithDerivedStopCodes(
      {
        '10': {
          routeId: '10',
          confidence: 'high',
          likelyDetourRoadNames: ['Mulcaster Street', 'McDonald Street'],
          segments: [{ segmentId: 'route-10-detour' }],
        },
      },
      {
        '10': {
          segmentStopDetails: [{
            skippedStops: [],
            affectedStops: [
              { id: '946', code: '946', name: 'Mulcaster at Codrington' },
            ],
          }],
        },
      }
    );

    expect(result['10'].affectedStopCodes).toEqual(['946']);
    expect(result['10'].segments[0].affectedStopCodes).toEqual(['946']);
  });

  test('does not overwrite stop codes already published by the backend', () => {
    const result = enrichDetoursWithDerivedStopCodes(
      {
        '11': {
          routeId: '11',
          affectedStopCodes: ['191'],
          segments: [{ affectedStopCodes: ['191'] }],
        },
      },
      {
        '11': {
          segmentStopDetails: [{
            affectedStops: [{ id: '556', code: '556', name: 'Mulcaster at Collier' }],
          }],
        },
      }
    );

    expect(result['11'].affectedStopCodes).toEqual(['191']);
    expect(result['11'].segments[0].affectedStopCodes).toEqual(['191']);
  });
});
