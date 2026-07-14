import React, { useCallback, useMemo, useRef } from 'react';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { HOME_MAP_THEME } from '../../config/homeMapTheme';
import { HOME_MAP_VEHICLE_LAYER_ANCHOR_ID } from '../../config/homeMapLayerIds';
import { useAnimatedHomeVehicleShape } from '../../hooks/useAnimatedHomeVehicleShape';
import { buildHomeVehicleFeatureCollection } from '../../utils/homeVehicleFeatures';
import { inferHomeVehicleBearings } from '../../utils/homeVehicleInterpolation';
import { isRouteInSameDetourFamily } from '../../utils/detourVehicleFiltering';
import { routeIsDetouring } from '../../utils/routeDetourMatching';

const CLUSTER_FILTER = ['has', 'point_count'];
const VEHICLE_FILTER = ['all', ['!', ['has', 'point_count']], ['==', ['get', 'isActive'], 1]];
const DIRECTION_FILTER = ['all', VEHICLE_FILTER, ['==', ['get', 'hasBearing'], 1]];

const HomeMapVehicleLayer = ({
  vehicles = [],
  cameraRef,
  getRouteColor,
  getRouteLabel,
  selectedVehicleId,
  onSelectVehicle,
  onSelectVehicleCluster,
  hasSelection = false,
  activeDetourRouteIds = new Set(),
  hasDetourFocus = false,
  focusedDetourRouteId = null,
  isDetourView = false,
  feedIsStale = false,
  animationActive = true,
}) => {
  const sourceRef = useRef(null);
  const previousVehiclesRef = useRef([]);
  const vehiclesWithBearings = useMemo(() => {
    const nextVehicles = inferHomeVehicleBearings({
      fromVehicles: previousVehiclesRef.current,
      toVehicles: vehicles,
    });
    previousVehiclesRef.current = nextVehicles;
    return nextVehicles;
  }, [vehicles]);
  const clusteringEnabled = !isDetourView && !hasDetourFocus;

  const isVehicleDimmed = useCallback((vehicle) => {
    const isDetouring = routeIsDetouring(vehicle.routeId, activeDetourRouteIds);
    const isFocusedDetour = hasDetourFocus && isRouteInSameDetourFamily(focusedDetourRouteId, vehicle.routeId);
    if (hasDetourFocus) return !isFocusedDetour;
    if (isDetourView && !hasSelection) return !isDetouring;
    return false;
  }, [activeDetourRouteIds, focusedDetourRouteId, hasDetourFocus, hasSelection, isDetourView]);

  const isVehicleFullyOpaque = useCallback((vehicle) => (
    hasDetourFocus && isRouteInSameDetourFamily(focusedDetourRouteId, vehicle.routeId)
  ), [focusedDetourRouteId, hasDetourFocus]);

  const featureCollection = useMemo(() => buildHomeVehicleFeatureCollection({
    vehicles: vehiclesWithBearings,
    getRouteColor,
    getRouteLabel,
    selectedVehicleId,
    feedIsStale,
    isVehicleDimmed,
    isVehicleFullyOpaque,
  }), [feedIsStale, getRouteColor, getRouteLabel, isVehicleDimmed, isVehicleFullyOpaque, selectedVehicleId, vehiclesWithBearings]);
  const animatedShape = useAnimatedHomeVehicleShape(featureCollection, {
    active: animationActive,
    feedIsStale,
  });

  const handlePress = useCallback(async (event) => {
    const feature = event?.features?.[0];
    if (!feature) return;

    if (feature?.properties?.point_count != null || feature?.properties?.cluster) {
      try {
        const leafCollection = await sourceRef.current?.getClusterLeaves?.(
          feature,
          feature?.properties?.point_count || 20,
          0
        );
        const vehicleIds = (leafCollection?.features || [])
          .map((leaf) => leaf?.properties?.id ?? leaf?.id)
          .filter((id) => id != null)
          .map(String);
        if (vehicleIds.length > 1 && onSelectVehicleCluster) {
          onSelectVehicleCluster(vehicleIds);
          return;
        }
        const zoom = await sourceRef.current?.getClusterExpansionZoom?.(feature);
        const centerCoordinate = feature?.geometry?.coordinates;
        if (Array.isArray(centerCoordinate) && Number.isFinite(zoom)) {
          cameraRef?.current?.setCamera?.({
            centerCoordinate,
            zoomLevel: Math.max(13, zoom),
            animationDuration: 420,
          });
        }
      } catch (_) {
        // Cluster expansion is a convenience; leave the map usable if native lookup fails.
      }
      return;
    }

    const vehicleId = feature?.properties?.id ?? feature?.id;
    if (vehicleId != null) onSelectVehicle?.(String(vehicleId));
  }, [cameraRef, onSelectVehicle, onSelectVehicleCluster]);

  return (
    <MapLibreGL.Animated.ShapeSource
      ref={sourceRef}
      id="home-live-vehicles"
      shape={animatedShape}
      cluster={clusteringEnabled}
      clusterRadius={HOME_MAP_THEME.vehicleClusterRadius}
      clusterMinPoints={2}
      clusterMaxZoomLevel={HOME_MAP_THEME.vehicleClusterMaxZoom}
      hitbox={{ width: HOME_MAP_THEME.busMarkerHitTarget, height: HOME_MAP_THEME.busMarkerHitTarget }}
      onPress={handlePress}
    >
      <MapLibreGL.CircleLayer
        id={HOME_MAP_VEHICLE_LAYER_ANCHOR_ID}
        filter={CLUSTER_FILTER}
        style={{
          circleRadius: HOME_MAP_THEME.busClusterDiameter / 2,
          circleColor: '#E6F4FF',
          circleStrokeColor: '#0C8CE5',
          circleStrokeWidth: 2,
        }}
      />
      <MapLibreGL.SymbolLayer
        id="home-live-vehicle-cluster-counts"
        aboveLayerID={HOME_MAP_VEHICLE_LAYER_ANCHOR_ID}
        filter={CLUSTER_FILTER}
        style={{
          textField: ['to-string', ['get', 'point_count']],
          textSize: 12,
          textFont: ['Noto Sans Bold'],
          textColor: '#005EA8',
          textHaloColor: '#FFFFFF',
          textHaloWidth: 0.5,
          textAllowOverlap: true,
          textIgnorePlacement: true,
        }}
      />
      <MapLibreGL.CircleLayer
        id="home-live-vehicle-selected-ring"
        aboveLayerID="home-live-vehicle-cluster-counts"
        filter={VEHICLE_FILTER}
        style={{
          circleRadius: ['case', ['==', ['get', 'isSelected'], 1], HOME_MAP_THEME.busMarkerSelectedDiameter / 2 + 4, 0],
          circleColor: '#E6F4FF',
          circleStrokeColor: '#0C8CE5',
          circleStrokeWidth: 2,
          circleOpacity: ['case', ['==', ['get', 'isSelected'], 1], 1, 0],
        }}
      />
      <MapLibreGL.CircleLayer
        id="home-live-vehicle-bodies"
        aboveLayerID="home-live-vehicle-selected-ring"
        filter={VEHICLE_FILTER}
        style={{
          circleRadius: ['case', ['==', ['get', 'isSelected'], 1], HOME_MAP_THEME.busMarkerSelectedDiameter / 2, HOME_MAP_THEME.busMarkerDiameter / 2],
          circleColor: ['get', 'routeColor'],
          circleOpacity: 1,
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: ['case', ['==', ['get', 'isSelected'], 1], 3, 2],
          circleSortKey: ['get', 'sortKey'],
        }}
      />
      <MapLibreGL.SymbolLayer
        id="home-live-vehicle-labels"
        aboveLayerID="home-live-vehicle-bodies"
        filter={VEHICLE_FILTER}
        style={{
          textField: ['get', 'routeLabel'],
          textSize: ['case', ['>=', ['length', ['get', 'routeLabel']], 3], 12, 13],
          textFont: ['Noto Sans Bold'],
          textColor: '#FFFFFF',
          textHaloColor: 'rgba(23,43,77,0.72)',
          textHaloWidth: 1,
          textOffset: [0, 0],
          textAllowOverlap: true,
          textIgnorePlacement: true,
          textOpacity: 1,
        }}
      />
      <MapLibreGL.SymbolLayer
        id="home-live-vehicle-direction"
        aboveLayerID="home-live-vehicle-labels"
        filter={DIRECTION_FILTER}
        style={{
          textField: '▲',
          textSize: 15,
          textFont: ['Noto Sans Bold'],
          textColor: ['get', 'routeColor'],
          textHaloColor: '#FFFFFF',
          textHaloWidth: 1.75,
          textRotate: ['get', 'bearing'],
          textOffset: [0, -1.45],
          textAllowOverlap: true,
          textIgnorePlacement: true,
          textOpacity: 1,
          textRotationAlignment: 'map',
        }}
      />
    </MapLibreGL.Animated.ShapeSource>
  );
};

export default React.memo(HomeMapVehicleLayer);
