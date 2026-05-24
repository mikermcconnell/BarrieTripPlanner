const {
  getDetourLabelDensity,
  getDetourGeometryOverlayProps,
  shouldShowDetourGeometryOverlay,
  shouldShowDetailedDetourOverlay,
} = require('../utils/detourViewMode');

describe('detourViewMode', () => {
  const overlay = {
    routeId: '10',
    opacity: 0.95,
    showCallouts: true,
    showLineLabels: true,
    showStopMarkers: true,
  };

  test('regular map view keeps detours lightweight', () => {
    expect(shouldShowDetourGeometryOverlay({ isDetourView: false, hasDetourFocus: false })).toBe(true);
    expect(shouldShowDetailedDetourOverlay({ isDetourView: false, hasDetourFocus: false })).toBe(false);

    expect(getDetourGeometryOverlayProps({
      overlay,
      isDetourView: false,
      hasDetourFocus: false,
    })).toEqual(expect.objectContaining({
      routeId: '10',
      showCallouts: false,
      showLineLabels: false,
      showStopMarkers: false,
      showClosedStopMarkers: false,
      opacity: 0.58,
      lineStyleScale: expect.any(Number),
      directionArrowMode: 'none',
    }));
    expect(getDetourGeometryOverlayProps({
      overlay,
      isDetourView: false,
      hasDetourFocus: false,
    }).lineStyleScale).toBeLessThan(1);
  });

  test('detour view keeps the full detail treatment', () => {
    expect(shouldShowDetourGeometryOverlay({ isDetourView: true, hasDetourFocus: false })).toBe(true);
    expect(shouldShowDetailedDetourOverlay({ isDetourView: true, hasDetourFocus: false })).toBe(true);
    expect(getDetourGeometryOverlayProps({
      overlay,
      isDetourView: true,
      hasDetourFocus: false,
    })).toBe(overlay);
  });

  test('focused detour view also keeps full details', () => {
    expect(shouldShowDetourGeometryOverlay({ isDetourView: false, hasDetourFocus: true })).toBe(true);
    expect(shouldShowDetailedDetourOverlay({ isDetourView: false, hasDetourFocus: true })).toBe(true);
  });

  test('detour label density escalates from regular to focused mode', () => {
    expect(getDetourLabelDensity({ isDetourView: false, hasDetourFocus: false })).toBe('minimal');
    expect(getDetourLabelDensity({ isDetourView: true, hasDetourFocus: false })).toBe('medium');
    expect(getDetourLabelDensity({ isDetourView: false, hasDetourFocus: true })).toBe('full');
  });
});
