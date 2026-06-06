const {
  selectDetourForGroundTruth,
  validateDetourAgainstGroundTruth,
} = require('../../scripts/detourGroundTruthValidator');

describe('detourGroundTruthValidator', () => {
  const route12bGroundTruth = {
    id: 'route-12b-bayfield-sophia-2026-06-05',
    routeId: '12B',
    eventId: 'event-short',
    status: 'active',
    closedSection: {
      start: { latitude: 44.3919167, longitude: -79.69275 },
      end: { latitude: 44.3908333, longitude: -79.6930278 },
      maxLengthMeters: 290,
    },
    expectedSkippedStopCodes: [],
    disallowedNoticeSourceIds: ['1637'],
    disallowedStopCodes: ['617', '618', '931', '6170', '7560', '9310'],
    tolerances: {
      closedSectionMaxDistanceMeters: 40,
    },
  };

  test('selects a matching V2 event document from a saved docs payload', () => {
    const selected = selectDetourForGroundTruth({
      docs: [
        {
          id: 'event-other',
          routeId: '12B',
          skippedSegmentPolyline: [
            { latitude: 44.33325, longitude: -79.67405 },
            { latitude: 44.33658, longitude: -79.66955 },
          ],
        },
        {
          id: 'event-short',
          routeId: '12B',
          skippedSegmentPolyline: [
            { latitude: 44.39192, longitude: -79.69275 },
            { latitude: 44.39083, longitude: -79.69303 },
          ],
        },
      ],
    }, route12bGroundTruth);

    expect(selected.id).toBe('event-short');
  });

  test('fails short-detour ground truth when span, skipped stops, or distant notice fields expand it', () => {
    const result = validateDetourAgainstGroundTruth({
      id: 'event-short',
      routeId: '12B',
      state: 'active',
      riderVisible: true,
      skippedSegmentPolyline: [
        { latitude: 44.392021, longitude: -79.692628 },
        { latitude: 44.390741, longitude: -79.692893 },
        { latitude: 44.388699, longitude: -79.69122 },
      ],
      skippedStopCodes: ['617'],
      noticeTemporaryStopCodes: ['6170'],
      noticeActiveStopCodes: ['618', '931'],
      noticeStopImpactSourceNewsIds: ['1637'],
    }, route12bGroundTruth);

    expect(result.pass).toBe(false);
    expect(result.failures.map((failure) => failure.name)).toEqual(expect.arrayContaining([
      'closed section: length is within maximum',
      'skipped stop codes match expected',
      'disallowed notice source ids are absent',
      'disallowed stop codes are absent',
    ]));
  });
});
