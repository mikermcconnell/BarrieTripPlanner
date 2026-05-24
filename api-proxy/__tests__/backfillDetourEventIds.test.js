const {
  buildBackfillUpdates,
  groupSegments,
  samePhysicalEvent,
} = require('../scripts/backfillDetourEventIds');

const hooperSaunders12A = {
  routeId: '12A',
  segment: {
    skippedSegmentPolyline: [
      { latitude: 44.336549, longitude: -79.669368 },
      { latitude: 44.332859, longitude: -79.674827 },
    ],
    likelyDetourRoadNames: ['Hooper Road', 'Saunders Road'],
  },
};

const saundersHooper12B = {
  routeId: '12B',
  segment: {
    skippedSegmentPolyline: [
      { latitude: 44.333056, longitude: -79.673548 },
      { latitude: 44.337171, longitude: -79.669351 },
    ],
    likelyDetourRoadNames: ['Saunders Road', 'Hooper Road', 'Welham Road'],
  },
};

const sophiaMaple12B = {
  routeId: '12B',
  segment: {
    skippedSegmentPolyline: [
      { latitude: 44.391997, longitude: -79.692606 },
      { latitude: 44.390741, longitude: -79.692893 },
    ],
    likelyDetourRoadNames: ['Sophia Street West', 'Maple Avenue', 'Ross Street'],
  },
};

describe('backfillDetourEventIds', () => {
  test('treats opposite-direction route-family segments around the same closure as one event', () => {
    expect(samePhysicalEvent(hooperSaunders12A, saundersHooper12B)).toBe(true);
    expect(samePhysicalEvent(hooperSaunders12A, sophiaMaple12B)).toBe(false);
  });

  test('groups live-style Route 12A/12B documents into two physical detour events', () => {
    const updates = buildBackfillUpdates([
      {
        id: '12A',
        data: {
          routeId: '12A',
          segments: [
            hooperSaunders12A.segment,
            {
              skippedSegmentPolyline: [
                { latitude: 44.390768, longitude: -79.692831 },
                { latitude: 44.391981, longitude: -79.692577 },
              ],
            },
          ],
        },
      },
      {
        id: '12B',
        data: {
          routeId: '12B',
          segments: [
            saundersHooper12B.segment,
            sophiaMaple12B.segment,
          ],
        },
      },
    ]);

    const route12A = updates.find((item) => item.docId === '12A');
    const route12B = updates.find((item) => item.docId === '12B');

    expect(route12A.segmentEventIds[0]).toBe(route12B.segmentEventIds[0]);
    expect(route12A.segmentEventIds[1]).toBe(route12B.segmentEventIds[1]);
    expect(route12A.segmentEventIds[0]).not.toBe(route12A.segmentEventIds[1]);
  });

  test('keeps route-family clusters separate from unrelated route families', () => {
    const groups = groupSegments([
      { docId: '12A', segmentIndex: 0, ...hooperSaunders12A, baseEventId: 'route-12-event' },
      { docId: '8A', segmentIndex: 0, routeId: '8A', segment: hooperSaunders12A.segment, baseEventId: 'route-8-event' },
    ]);

    expect(groups).toHaveLength(2);
  });
});
