export const shouldShowDetailedDetourOverlay = ({ isDetourView = false, hasDetourFocus = false } = {}) =>
  Boolean(isDetourView || hasDetourFocus);

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
    opacity: Math.min(overlay?.opacity ?? 0.95, 0.58),
  };
};

export default {
  getDetourGeometryOverlayProps,
  shouldShowDetailedDetourOverlay,
};
