export const shouldShowDetailedDetourOverlay = ({ isDetourView = false, hasDetourFocus = false } = {}) =>
  Boolean(isDetourView || hasDetourFocus);

export const shouldShowDetourGeometryOverlay = () => true;

export const getDetourLabelDensity = ({ isDetourView = false, hasDetourFocus = false } = {}) => {
  if (hasDetourFocus) return 'full';
  if (isDetourView) return 'medium';
  return 'minimal';
};

export const getDetourGeometryOverlayProps = ({
  overlay,
  isDetourView = false,
  hasDetourFocus = false,
} = {}) => {
  const detailed = shouldShowDetailedDetourOverlay({ isDetourView, hasDetourFocus });

  if (detailed) {
    return overlay;
  }

  return {
    ...overlay,
    showCallouts: false,
    showLineLabels: false,
    showStopMarkers: false,
    showClosedStopMarkers: true,
    showClosedRouteMask: false,
    opacity: Math.min(overlay?.opacity ?? 0.95, 0.58),
    lineStyleScale: 0.72,
    directionArrowMode: 'none',
  };
};

export default {
  getDetourLabelDensity,
  getDetourGeometryOverlayProps,
  shouldShowDetourGeometryOverlay,
  shouldShowDetailedDetourOverlay,
};
