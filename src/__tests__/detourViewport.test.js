const {
  getDetourViewportCoordinates,
  shouldAutoFitDetourViewport,
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
});

describe('shouldAutoFitDetourViewport', () => {
  test('returns true when entering detour view', () => {
    expect(
      shouldAutoFitDetourViewport({
        isDetourView: true,
        previousIsDetourView: false,
        focusedRouteId: null,
        previousFocusedRouteId: null,
      })
    ).toBe(true);
  });

  test('returns true when focused detour route changes while already in detour view', () => {
    expect(
      shouldAutoFitDetourViewport({
        isDetourView: true,
        previousIsDetourView: true,
        focusedRouteId: '8A',
        previousFocusedRouteId: null,
      })
    ).toBe(true);
  });

  test('returns false when still in regular view', () => {
    expect(
      shouldAutoFitDetourViewport({
        isDetourView: false,
        previousIsDetourView: false,
        focusedRouteId: null,
        previousFocusedRouteId: null,
      })
    ).toBe(false);
  });

  test('returns false when detour view state and focus are unchanged', () => {
    expect(
      shouldAutoFitDetourViewport({
        isDetourView: true,
        previousIsDetourView: true,
        focusedRouteId: '8A',
        previousFocusedRouteId: '8A',
      })
    ).toBe(false);
  });
});

