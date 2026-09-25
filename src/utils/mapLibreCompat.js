import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import * as NativeMapLibre from '@maplibre/maplibre-react-native';

// Keep the v10-shaped app call sites together while the Android v11 beta is
// evaluated. Do not silently pass old props to v11 native components.
export const toV11CameraStop = (camera = {}) => {
  const { centerCoordinate, zoomLevel, heading, animationDuration, animationMode,
    followUserLocation, followUserMode, bounds, padding, ...rest } = camera;
  const stop = { ...rest };
  if (centerCoordinate) stop.center = centerCoordinate;
  if (Number.isFinite(zoomLevel)) stop.zoom = zoomLevel;
  if (Number.isFinite(heading)) stop.bearing = heading;
  if (Number.isFinite(animationDuration)) stop.duration = animationDuration;
  if (animationMode) stop.easing = ({ moveTo: undefined, linearTo: 'linear', easeTo: 'ease', flyTo: 'fly' })[animationMode];
  if (bounds?.sw && bounds?.ne) stop.bounds = [...bounds.sw, ...bounds.ne];
  if (padding) stop.padding = {
    top: padding.paddingTop ?? padding.top ?? 0,
    right: padding.paddingRight ?? padding.right ?? 0,
    bottom: padding.paddingBottom ?? padding.bottom ?? 0,
    left: padding.paddingLeft ?? padding.left ?? 0,
  };
  return stop;
};

export const toLegacyRegionEvent = (event) => {
  const state = event?.nativeEvent || event;
  return {
    geometry: { coordinates: state?.center || [] },
    properties: {
      zoomLevel: state?.zoom,
      isUserInteraction: Boolean(state?.userInteraction),
      animated: Boolean(state?.animated),
    },
  };
};

export const toLegacyPressEvent = (event) => {
  const press = event?.nativeEvent || event;
  const [longitude, latitude] = press?.lngLat || [];
  return {
    features: press?.features || [],
    geometry: { coordinates: press?.lngLat || [] },
    nativeEvent: { coordinate: { longitude, latitude } },
  };
};

const toAnchor = (anchor) => {
  if (typeof anchor === 'string' || !anchor) return anchor;
  if (anchor.y >= 0.75) return 'bottom';
  if (anchor.y <= 0.25) return 'top';
  return 'center';
};

const MapView = forwardRef(({
  children, logoEnabled, compassEnabled, rotateEnabled, pitchEnabled, scrollEnabled,
  onPress, onRegionWillChange, onRegionIsChanging, onRegionDidChange,
  ...props
}, ref) => (
  <NativeMapLibre.Map
    {...props}
    ref={ref}
    androidView="texture"
    logo={logoEnabled}
    compass={compassEnabled}
    touchRotate={rotateEnabled}
    touchPitch={pitchEnabled}
    touchZoom={scrollEnabled}
    onPress={onPress && ((event) => onPress(toLegacyPressEvent(event)))}
    onRegionWillChange={onRegionWillChange && ((event) => onRegionWillChange(toLegacyRegionEvent(event)))}
    onRegionIsChanging={onRegionIsChanging && ((event) => onRegionIsChanging(toLegacyRegionEvent(event)))}
    onRegionDidChange={onRegionDidChange && ((event) => onRegionDidChange(toLegacyRegionEvent(event)))}
  >{children}</NativeMapLibre.Map>
));

const Camera = forwardRef(({ defaultSettings, followUserLocation, followUserMode, ...props }, ref) => {
  const cameraRef = useRef(null);
  // v11 receives this as a native prop. Freeze it at mount so ordinary React
  // renders cannot reassert the initial camera over a rider gesture.
  const initialViewStateRef = useRef(defaultSettings ? toV11CameraStop(defaultSettings) : undefined);
  useImperativeHandle(ref, () => ({
    setCamera: (settings) => cameraRef.current?.setStop(toV11CameraStop(settings)),
  }), []);
  return <NativeMapLibre.Camera
    {...props}
    ref={cameraRef}
    initialViewState={initialViewStateRef.current}
    trackUserLocation={followUserLocation ? ({ normal: 'default', compass: 'heading', course: 'course' })[followUserMode] || 'default' : undefined}
  />;
});

const ShapeSource = forwardRef(({
  shape, clusterMaxZoomLevel, hitbox, onPress, ...props
}, ref) => {
  const sourceRef = useRef(null);
  useImperativeHandle(ref, () => ({
    getClusterLeaves: async (feature, limit, offset) => ({
      features: await sourceRef.current?.getClusterLeaves(feature?.properties?.cluster_id, limit, offset) || [],
    }),
  }), []);
  return <NativeMapLibre.GeoJSONSource
    {...props}
    ref={sourceRef}
    data={shape}
    clusterMaxZoom={clusterMaxZoomLevel}
    hitbox={hitbox && {
      top: hitbox.height / 2, right: hitbox.width / 2,
      bottom: hitbox.height / 2, left: hitbox.width / 2,
    }}
    onPress={onPress && ((event) => { event.stopPropagation?.(); onPress(toLegacyPressEvent(event)); })}
  />;
});

const makeLayer = (type) => ({ aboveLayerID, belowLayerID, sourceID, sourceLayerID,
  minZoomLevel, maxZoomLevel, ...props }) => <NativeMapLibre.Layer
  {...props}
  type={type}
  afterId={aboveLayerID}
  beforeId={belowLayerID}
  source={sourceID}
  source-layer={sourceLayerID}
  minzoom={minZoomLevel}
  maxzoom={maxZoomLevel}
/>;

const MarkerView = ({ coordinate, anchor, allowOverlap, allowOverlapWithPuck, ...props }) => (
  <NativeMapLibre.Marker {...props} lngLat={coordinate} anchor={toAnchor(anchor)} />
);

const PointAnnotation = ({ coordinate, anchor, onSelected, onDeselected, ...props }) => (
  <NativeMapLibre.ViewAnnotation
    {...props}
    lngLat={coordinate}
    anchor={toAnchor(anchor)}
    onSelect={onSelected}
    onDeselect={onDeselected}
  />
);

const MapLibreGL = {
  ...NativeMapLibre,
  MapView,
  Camera,
  ShapeSource,
  MarkerView,
  PointAnnotation,
  CircleLayer: makeLayer('circle'),
  FillLayer: makeLayer('fill'),
  LineLayer: makeLayer('line'),
  SymbolLayer: makeLayer('symbol'),
};

export default MapLibreGL;
