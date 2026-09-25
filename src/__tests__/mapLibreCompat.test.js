import React from 'react';
import { act, create } from 'react-test-renderer';
import MapLibreGL, {
  toLegacyPressEvent,
  toLegacyRegionEvent,
  toV11CameraStop,
} from '../utils/mapLibreCompat';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@maplibre/maplibre-react-native', () => ({
  Map: 'NativeMap',
  Layer: 'NativeLayer',
  Marker: 'NativeMarker',
  ViewAnnotation: 'NativeViewAnnotation',
  GeoJSONSource: 'NativeGeoJSONSource',
  Camera: 'NativeCamera',
  Animated: { GeoJSONSource: 'AnimatedGeoJSONSource' },
}));

const render = (element) => {
  let tree;
  act(() => { tree = create(element); });
  return tree;
};

describe('MapLibre v11 beta compatibility', () => {
  test('converts camera commands and initial bounds without leaking v10 prop names', () => {
    expect(toV11CameraStop({
      bounds: { sw: [-79.7, 44.3], ne: [-79.6, 44.4] },
      padding: { paddingTop: 180, paddingBottom: 340 },
      animationDuration: 500,
    })).toEqual({
      bounds: [-79.7, 44.3, -79.6, 44.4],
      padding: { top: 180, right: 0, bottom: 340, left: 0 },
      duration: 500,
    });
    expect(toV11CameraStop({ centerCoordinate: [-79.7, 44.3], zoomLevel: 14, heading: 90 }))
      .toEqual({ center: [-79.7, 44.3], zoom: 14, bearing: 90 });
  });

  test('preserves rider-gesture classification and map taps', () => {
    expect(toLegacyRegionEvent({ nativeEvent: {
      center: [-79.7, 44.3], zoom: 15, userInteraction: true,
    } })).toEqual({
      geometry: { coordinates: [-79.7, 44.3] },
      properties: { zoomLevel: 15, isUserInteraction: true, animated: false },
    });
    expect(toLegacyPressEvent({ nativeEvent: { lngLat: [-79.7, 44.3] } }).nativeEvent.coordinate)
      .toEqual({ longitude: -79.7, latitude: 44.3 });
  });

  test('does not reassert an initial camera when its parent rerenders', () => {
    const first = { centerCoordinate: [-79.7, 44.3], zoomLevel: 14 };
    const tree = render(<MapLibreGL.Camera defaultSettings={first} />);
    const initial = tree.root.findByType('NativeCamera').props.initialViewState;
    act(() => tree.update(<MapLibreGL.Camera defaultSettings={{ centerCoordinate: [-79.6, 44.4], zoomLevel: 16 }} />));
    expect(tree.root.findByType('NativeCamera').props.initialViewState).toBe(initial);
    expect(initial).toEqual({ center: [-79.7, 44.3], zoom: 14 });
  });

  test('maps native map props and detour layers to v11 names', () => {
    const onRegionDidChange = jest.fn();
    const tree = render(<MapLibreGL.MapView
      mapStyle="style"
      logoEnabled={false}
      rotateEnabled={false}
      onRegionDidChange={onRegionDidChange}
    ><MapLibreGL.LineLayer id="detour-line" aboveLayerID="base" style={{ lineColor: 'red' }} /></MapLibreGL.MapView>);
    const map = tree.root.findByType('NativeMap');
    const layer = tree.root.findByType('NativeLayer');
    expect(map.props).toMatchObject({ logo: false, touchRotate: false, androidView: 'texture' });
    expect(layer.props).toMatchObject({ type: 'line', afterId: 'base', style: { lineColor: 'red' } });
    act(() => map.props.onRegionDidChange({ nativeEvent: { center: [-79.7, 44.3], zoom: 14, userInteraction: true } }));
    expect(onRegionDidChange).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({ isUserInteraction: true }),
    }));
  });

  test('maps source presses and cluster options to v11', () => {
    const onPress = jest.fn();
    const tree = render(<MapLibreGL.ShapeSource
      id="detour"
      shape={{ type: 'FeatureCollection', features: [] }}
      clusterMaxZoomLevel={15}
      hitbox={{ width: 44, height: 44 }}
      onPress={onPress}
    />);
    const source = tree.root.findByType('NativeGeoJSONSource');
    expect(source.props).toMatchObject({
      clusterMaxZoom: 15,
      hitbox: { top: 22, right: 22, bottom: 22, left: 22 },
      data: { type: 'FeatureCollection', features: [] },
    });
    const stopPropagation = jest.fn();
    act(() => source.props.onPress({ nativeEvent: { features: [{ properties: { id: '8A' } }] }, stopPropagation }));
    expect(stopPropagation).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ features: [{ properties: { id: '8A' } }] }));
  });
});
