'use strict';

const {
  buildBoundaryRefinedDisplayGeometry,
  doesPathUseBlockedSegment,
  getBoundaryProjectionRoute,
} = require('../detour/boundaryRefinement');
const { haversineDistance } = require('../detour/roadGeometry');

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

  test('slices a self-crossing route to the detector progress window', () => {
    const crossing = { latitude: 44.000, longitude: -78.990 };
    const loopShape = [
      { latitude: 44.000, longitude: -79.000 },
      crossing,
      { latitude: 44.010, longitude: -78.990 },
      crossing,
      { latitude: 44.000, longitude: -78.980 },
    ];
    const secondVisitStart =
      haversineDistance(loopShape[0], loopShape[1]) +
      haversineDistance(loopShape[1], loopShape[2]) +
      haversineDistance(loopShape[2], loopShape[3]);
    const secondVisitEnd = secondVisitStart + haversineDistance(loopShape[3], loopShape[4]);

    const projectionRoute = getBoundaryProjectionRoute(loopShape, {
      startProgressMeters: secondVisitStart,
      endProgressMeters: secondVisitEnd,
    }, {
      DETOUR_ROAD_MATCHING_DISPLAY_PROGRESS_PADDING_METERS: '0',
    });

    expect(projectionRoute.constrained).toBe(true);
    expect(projectionRoute.polyline).toEqual([crossing, loopShape[4]]);
    expect(projectionRoute.polyline).not.toContainEqual(loopShape[0]);
    expect(projectionRoute.polyline).not.toContainEqual(loopShape[2]);
  });

  test('falls back to the full route when progress bounds are unavailable', () => {
    const projectionRoute = getBoundaryProjectionRoute(routeShape, null);

    expect(projectionRoute).toMatchObject({
      constrained: false,
      polyline: routeShape,
    });
  });

  test('keeps the full-route overlap check outside the projection window', () => {
    const otherRegularBranch = [
      { latitude: 44.002, longitude: -78.998 },
      { latitude: 44.005, longitude: -78.998 },
      { latitude: 44.008, longitude: -78.998 },
    ];
    const fullRouteWithOtherBranch = [
      ...routeShape,
      { latitude: 44.010, longitude: -78.998 },
      ...otherRegularBranch.slice().reverse(),
    ];

    const refined = buildBoundaryRefinedDisplayGeometry(otherRegularBranch, {
      prefixTrimmed: true,
      suffixTrimmed: true,
    }, {
      routeShapePolyline: fullRouteWithOtherBranch,
      boundaryProjectionPolyline: routeShape,
      boundaryProjectionConstrained: true,
      blockedPolyline: routeShape,
    });

    expect(refined).toBeNull();
  });
});
