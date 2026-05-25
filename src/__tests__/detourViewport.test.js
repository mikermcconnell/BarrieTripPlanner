const {
  getDetourViewportCoordinates,
  focusMapToDetour,
} = require('../utils/detourViewport');

describe('getDetourViewportCoordinates', () => {
  test('returns all segment geometry when no focused route is set', () => {
    const coordinates = getDetourViewportCoordinates({
      activeDetours: {
        '8A': {
          segments: [
            {
              skippedSegmentPolyline: [
                { latitude: 44.39, longitude: -79.70 },
                { latitude: 44.39, longitude: -79.69 },
              ],
              inferredDetourPolyline: [
                { latitude: 44.391, longitude: -79.699 },
                { latitude: 44.392, longitude: -79.698 },
              ],
              entryPoint: { latitude: 44.3895, longitude: -79.7005 },
              exitPoint: { latitude: 44.3896, longitude: -79.6895 },
            },
          ],
        },
        '8B': {
          inferredDetourPolyline: [
            { latitude: 44.38, longitude: -79.68 },
            { latitude: 44.381, longitude: -79.679 },
          ],
          entryPoint: { latitude: 44.379, longitude: -79.681 },
          exitPoint: { latitude: 44.382, longitude: -79.678 },
        },
      },
    });

    expect(coordinates).toEqual(
      expect.arrayContaining([
        { latitude: 44.39, longitude: -79.70 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.392, longitude: -79.698 },
        { latitude: 44.38, longitude: -79.68 },
        { latitude: 44.382, longitude: -79.678 },
      ])
    );
  });

  test('returns only the focused route geometry when a focused route is set', () => {
    const coordinates = getDetourViewportCoordinates({
      focusedRouteId: '8B',
      activeDetours: {
        '8A': {
          inferredDetourPolyline: [
            { latitude: 44.39, longitude: -79.70 },
            { latitude: 44.39, longitude: -79.69 },
          ],
        },
        '8B': {
          inferredDetourPolyline: [
            { latitude: 44.38, longitude: -79.68 },
            { latitude: 44.381, longitude: -79.679 },
          ],
        },
      },
    });

    expect(coordinates).toEqual([
      { latitude: 44.38, longitude: -79.68 },
      { latitude: 44.381, longitude: -79.679 },
    ]);
  });

  test('normalizes lat/lon fallback fields and deduplicates repeated coordinates', () => {
    const coordinates = getDetourViewportCoordinates({
      activeDetours: {
        '8A': {
          segments: [
            {
              inferredDetourPolyline: [
                { lat: 44.39, lon: -79.70 },
                { latitude: 44.39, longitude: -79.70 },
                { latitude: 44.391, longitude: -79.699 },
              ],
              entryPoint: { lat: 44.39, lon: -79.70 },
              exitPoint: { latitude: 44.391, longitude: -79.699 },
            },
          ],
        },
      },
    });

    expect(coordinates).toEqual([
      { latitude: 44.39, longitude: -79.70 },
      { latitude: 44.391, longitude: -79.699 },
    ]);
  });

  test('focuses a selected segment and includes likely detour paths', () => {
    const coordinates = getDetourViewportCoordinates({
      focusedRouteId: '12B',
      segmentIndex: 1,
      activeDetours: {
        '12B': {
          segments: [
            {
              likelyDetourPolyline: [
                { latitude: 44.40, longitude: -79.70 },
                { latitude: 44.401, longitude: -79.701 },
              ],
            },
            {
              skippedSegmentPolyline: [
                { latitude: 44.41, longitude: -79.71 },
                { latitude: 44.411, longitude: -79.711 },
              ],
              likelyDetourPolyline: [
                { latitude: 44.412, longitude: -79.712 },
                { latitude: 44.413, longitude: -79.713 },
              ],
            },
          ],
        },
      },
    });

    expect(coordinates).toEqual([
      { latitude: 44.41, longitude: -79.71 },
      { latitude: 44.411, longitude: -79.711 },
      { latitude: 44.412, longitude: -79.712 },
      { latitude: 44.413, longitude: -79.713 },
    ]);
  });

  test('can focus a grouped detour event across multiple route ids', () => {
    const coordinates = getDetourViewportCoordinates({
      focusedRouteIds: ['12A', '12B'],
      activeDetours: {
        '12A': {
          inferredDetourPolyline: [
            { latitude: 44.38, longitude: -79.68 },
            { latitude: 44.381, longitude: -79.679 },
          ],
        },
        '12B': {
          inferredDetourPolyline: [
            { latitude: 44.39, longitude: -79.69 },
            { latitude: 44.391, longitude: -79.689 },
          ],
        },
        '10': {
          inferredDetourPolyline: [
            { latitude: 44.40, longitude: -79.70 },
            { latitude: 44.401, longitude: -79.699 },
          ],
        },
      },
    });

    expect(coordinates).toEqual([
      { latitude: 44.38, longitude: -79.68 },
      { latitude: 44.381, longitude: -79.679 },
      { latitude: 44.39, longitude: -79.69 },
      { latitude: 44.391, longitude: -79.689 },
    ]);
  });

  test('fits map bounds for a clicked detour with geometry', () => {
    const fitToCoordinates = jest.fn();
    const animateToRegion = jest.fn();

    const result = focusMapToDetour({
      activeDetours: {
        '8A': {
          inferredDetourPolyline: [
            { latitude: 44.38, longitude: -79.68 },
            { latitude: 44.381, longitude: -79.679 },
          ],
        },
      },
      routeId: '8A',
      mapRef: { current: { fitToCoordinates, animateToRegion } },
      edgePadding: { top: 180, right: 60, bottom: 340, left: 60 },
    });

    expect(result).toEqual({ focused: true, coordinateCount: 2 });
    expect(fitToCoordinates).toHaveBeenCalledWith([
      { latitude: 44.38, longitude: -79.68 },
      { latitude: 44.381, longitude: -79.679 },
    ], {
      edgePadding: { top: 180, right: 60, bottom: 340, left: 60 },
      animated: true,
    });
    expect(animateToRegion).not.toHaveBeenCalled();
  });
});
