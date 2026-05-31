const {
  isPointLoopNoClosureSegment,
  isMisleadingTinySpanLongPathSegment,
  isInvalidNonClosureSegment,
  filterNonClosureSelfLoopSegments,
} = require('../detour/geometry/segmentValidity');

describe('segment validity filters', () => {
  test('rejects point-loop detour paths with no closed route segment or affected stops', () => {
    const segment = {
      entryPoint: { latitude: 44.392978601382225, longitude: -79.69339997158372 },
      exitPoint: { latitude: 44.392978601382225, longitude: -79.69339997158372 },
      inferredDetourPolyline: [
        { latitude: 44.392978601382225, longitude: -79.69339997158372 },
        { latitude: 44.3934, longitude: -79.6919 },
        { latitude: 44.392978601382225, longitude: -79.69339997158372 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.392978601382225, longitude: -79.69339997158372 },
        { latitude: 44.3934, longitude: -79.6919 },
        { latitude: 44.392978601382225, longitude: -79.69339997158372 },
      ],
      skippedSegmentPolyline: null,
      skippedStopIds: [],
      affectedStopIds: [],
    };

    expect(isPointLoopNoClosureSegment(segment)).toBe(true);
    expect(isInvalidNonClosureSegment(segment)).toBe(true);
    expect(filterNonClosureSelfLoopSegments([segment])).toEqual([]);
  });

  test('keeps same-area segments when a closed route segment is identified', () => {
    const segment = {
      entryPoint: { latitude: 44.3365, longitude: -79.6693 },
      exitPoint: { latitude: 44.3366, longitude: -79.6694 },
      skippedSegmentPolyline: [
        { latitude: 44.3365, longitude: -79.6693 },
        { latitude: 44.3342, longitude: -79.6710 },
      ],
      skippedStopIds: ['932', '933'],
      affectedStopIds: ['932', '933'],
    };

    expect(isPointLoopNoClosureSegment(segment)).toBe(false);
    expect(isInvalidNonClosureSegment(segment)).toBe(false);
    expect(filterNonClosureSelfLoopSegments([segment])).toEqual([segment]);
  });

  test('rejects long detour paths anchored to a tiny closed span with no skipped segment', () => {
    const segment = {
      spanMeters: 79,
      entryPoint: { latitude: 44.387414, longitude: -79.690039 },
      exitPoint: { latitude: 44.387761, longitude: -79.689189 },
      skippedSegmentPolyline: null,
      inferredDetourPolyline: [
        { latitude: 44.387414, longitude: -79.690039 },
        { latitude: 44.3899, longitude: -79.6892 },
        { latitude: 44.3917, longitude: -79.6881 },
        { latitude: 44.3936, longitude: -79.6870 },
        { latitude: 44.387761, longitude: -79.689189 },
      ],
      likelyDetourPolyline: [
        { latitude: 44.387414, longitude: -79.690039 },
        { latitude: 44.3899, longitude: -79.6892 },
        { latitude: 44.3917, longitude: -79.6881 },
        { latitude: 44.3936, longitude: -79.6870 },
        { latitude: 44.387761, longitude: -79.689189 },
      ],
      debug: {
        entryCandidateCount: 12,
        exitCandidateCount: 12,
        exitAnchorSource: 'boundary-candidate',
      },
    };

    expect(isMisleadingTinySpanLongPathSegment(segment)).toBe(true);
    expect(isInvalidNonClosureSegment(segment)).toBe(true);
    expect(filterNonClosureSelfLoopSegments([segment])).toEqual([]);
  });
});
