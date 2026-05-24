const {
  getSelectedDetourSegments,
  mergeFamilySegmentStopDetails,
} = require('../utils/detourSheetSelection');

describe('getSelectedDetourSegments', () => {
  const segments = [
    { id: 'welham', skippedStops: [{ id: 'w1' }] },
    { id: 'sophia', skippedStops: [{ id: 's1' }] },
  ];

  test('returns only the tapped segment when a valid index is provided', () => {
    expect(getSelectedDetourSegments(segments, 1)).toEqual([segments[1]]);
  });

  test('returns all segments when no specific segment was tapped', () => {
    expect(getSelectedDetourSegments(segments, null)).toEqual(segments);
  });

  test('falls back to all segments for an invalid index', () => {
    expect(getSelectedDetourSegments(segments, 4)).toEqual(segments);
  });
});

describe('mergeFamilySegmentStopDetails', () => {
  test('builds one shared details section with stops from both route directions', () => {
    const result = mergeFamilySegmentStopDetails({
      routeIds: ['12A', '12B'],
      primaryRouteId: '12A',
      segmentStopDetails: [{
        id: '12a-segment',
        skippedStops: [{ id: '932', code: '932' }],
      }],
      detourStopDetailsByRouteId: {
        '12A': {
          segmentStopDetails: [{
            skippedStops: [{ id: '932', code: '932' }],
          }],
        },
        '12B': {
          segmentStopDetails: [{
            skippedStops: [{ id: '618', code: '618' }],
          }],
        },
      },
    });

    expect(result).toEqual([expect.objectContaining({
      id: '12a-segment',
      routeIds: ['12A', '12B'],
      skippedStops: [
        expect.objectContaining({ code: '932', routeId: '12A' }),
        expect.objectContaining({ code: '618', routeId: '12B' }),
      ],
    })]);
  });
});
