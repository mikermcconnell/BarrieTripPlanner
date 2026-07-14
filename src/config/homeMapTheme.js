export const HOME_MAP_THEME = Object.freeze({
  topMargin: 8,
  sideMargin: 8,
  controlGap: 8,
  searchHeight: 58,
  searchRadius: 22,
  noticeCollapsedMinHeight: 44,
  bottomTrayMinHeight: 52,
  bottomTrayRadius: 26,
  routeChipHeight: 44,
  routeChipMinWidth: 48,
  locationButtonSize: 44,
  tabContentHeight: 64,
  busMarkerDiameter: 34,
  busMarkerSelectedDiameter: 40,
  busMarkerHitTarget: 44,
  busClusterDiameter: 36,
  contextZoomMax: 13,
  corridorZoomMax: 14.2,
  routeOpacityContext: 0.42,
  routeOpacityCorridor: 0.5,
  routeOpacityDetail: 0.58,
  routeOpacitySelected: 0.96,
  routeOpacityMuted: 0.18,
  // Cluster only near-coincident buses. MapLibre compares two cluster radii,
  // so 7 keeps separate icons visible until their centres are about 14 px apart.
  vehicleClusterRadius: 7,
  vehicleClusterMaxZoom: 16.5,
  staleVehicleThresholdMs: 90_000,
  vehicleAnimationFrameMs: 40,
});

export const getAllRoutesOpacity = (zoom) => {
  const safeZoom = Number.isFinite(zoom) ? zoom : HOME_MAP_THEME.contextZoomMax;
  if (safeZoom < HOME_MAP_THEME.contextZoomMax) {
    return HOME_MAP_THEME.routeOpacityContext;
  }
  if (safeZoom < HOME_MAP_THEME.corridorZoomMax) {
    return HOME_MAP_THEME.routeOpacityCorridor;
  }
  return HOME_MAP_THEME.routeOpacityDetail;
};

export const shouldClusterHomeVehicles = ({ zoom }) => (
  Number.isFinite(zoom) &&
  zoom <= HOME_MAP_THEME.vehicleClusterMaxZoom
);
