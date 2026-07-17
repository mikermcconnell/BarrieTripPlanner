'use strict';

const {
  buildBoundaryRefinedDisplayGeometry,
  doesPathUseBlockedSegment,
} = require('../detour/boundaryRefinement');

describe('boundary refinement', () => {
  const routeShape = [
    { latitude: 44.000, longitude: -79.000 },
    { latitude: 44.010, longitude: -79.000 },
  ];

  test('rejects a path whose interior follows the closed segment', () => {
    const path = [
      { latitude: 44.002, longitude: -79.000 },
      { latitude: 44.004, longitude: -79.000 },
      { latitude: 44.006, longitude: -79.000 },
      { latitude: 44.008, longitude: -79.000 },
    ];

    expect(doesPathUseBlockedSegment(path, routeShape)).toBe(true);
  });

  test('builds a rider path from narrower display boundaries', () => {
    const trimmedDetourPath = [
      { latitude: 44.002, longitude: -78.999 },
      { latitude: 44.004, longitude: -78.998 },
      { latitude: 44.006, longitude: -78.998 },
      { latitude: 44.008, longitude: -78.999 },
    ];
    const refined = buildBoundaryRefinedDisplayGeometry(trimmedDetourPath, {
      prefixTrimmed: true,
      suffixTrimmed: true,
      prefixOverlapMeters: 90,
      suffixOverlapMeters: 80,
    }, {
      routeShapePolyline: routeShape,
      blockedPolyline: routeShape,
    });

    expect(refined).toMatchObject({
      displayBoundaryRefined: true,
      displayBoundaryReason: 'trimmed-normal-route-approaches',
      displayPrefixTrimmedMeters: 90,
      displaySuffixTrimmedMeters: 80,
    });
    expect(refined.displayDetourPolyline.length).toBeGreaterThanOrEqual(4);
    expect(refined.displaySeparatedRunMeters).toBeGreaterThanOrEqual(75);
  });

  test('does not refine a path when no normal-route approach was trimmed', () => {
    expect(buildBoundaryRefinedDisplayGeometry([
      { latitude: 44.002, longitude: -78.999 },
      { latitude: 44.008, longitude: -78.999 },
    ], {
      prefixTrimmed: false,
      suffixTrimmed: false,
    }, {
      routeShapePolyline: routeShape,
      blockedPolyline: routeShape,
    })).toBeNull();
  });
});
