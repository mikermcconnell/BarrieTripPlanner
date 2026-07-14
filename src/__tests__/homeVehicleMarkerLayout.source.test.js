import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('@maplibre/maplibre-react-native', () => ({
  Animated: {
    ShapeSource: 'ShapeSource',
  },
  CircleLayer: 'CircleLayer',
  SymbolLayer: 'SymbolLayer',
}));

jest.mock('../hooks/useAnimatedHomeVehicleShape', () => ({
  useAnimatedHomeVehicleShape: (shape) => shape,
}));

const HomeMapVehicleLayer = require('../components/home-map/HomeMapVehicleLayer').default;
const { HOME_MAP_VEHICLE_LAYER_ANCHOR_ID } = require('../config/homeMapLayerIds');

describe('home vehicle marker layout', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../components/home-map/HomeMapVehicleLayer.js'),
    'utf8'
  );

  test('centres route labels and places the bearing pointer outside the marker', () => {
    expect(source).toContain('textSize: 15');
    expect(source).toContain('textOffset: [0, -1.45]');
    expect(source).toContain('textOffset: [0, 0]');
    expect(source).toContain("textColor: ['get', 'routeColor']");
    expect(source).toContain("textHaloColor: '#FFFFFF'");
  });

  test('renders every visible part of a bus icon at full opacity', () => {
    expect(source).toContain('circleOpacity: 1');
    expect(source.match(/textOpacity: 1/g)).toHaveLength(2);
    expect(source).not.toContain("circleOpacity: ['get', 'opacity']");
    expect(source).not.toContain("textOpacity: ['get', 'opacity']");
  });

  test('keeps a stable native anchor mounted and explicitly chains the bus icon stack above it', () => {
    let instance;
    act(() => {
      instance = create(React.createElement(HomeMapVehicleLayer, {
        vehicles: [],
        getRouteColor: () => '#005EA8',
        getRouteLabel: () => '8A',
      }));
    });

    const layers = instance.root
      .findAll((node) => node.type === 'CircleLayer' || node.type === 'SymbolLayer')
      .map((node) => node.props);
    const byId = Object.fromEntries(layers.map((layer) => [layer.id, layer]));

    expect(instance.root.findByType('ShapeSource').props.shape.features).toEqual([]);
    expect(byId[HOME_MAP_VEHICLE_LAYER_ANCHOR_ID].aboveLayerID).toBeUndefined();
    expect(byId['home-live-vehicle-cluster-counts'].aboveLayerID).toBe(HOME_MAP_VEHICLE_LAYER_ANCHOR_ID);
    expect(byId['home-live-vehicle-selected-ring'].aboveLayerID).toBe('home-live-vehicle-cluster-counts');
    expect(byId['home-live-vehicle-bodies'].aboveLayerID).toBe('home-live-vehicle-selected-ring');
    expect(byId['home-live-vehicle-labels'].aboveLayerID).toBe('home-live-vehicle-bodies');
    expect(byId['home-live-vehicle-direction'].aboveLayerID).toBe('home-live-vehicle-labels');
    expect(layers.every((layer) => layer.layerIndex == null)).toBe(true);
  });

  test('renders buses after detour callouts on native and web maps', () => {
    const nativeHome = fs.readFileSync(
      path.join(__dirname, '../screens/HomeScreen.js'),
      'utf8'
    );
    const webHome = fs.readFileSync(
      path.join(__dirname, '../screens/HomeScreen.web.impl.js'),
      'utf8'
    );

    expect(nativeHome.lastIndexOf('<HomeMapVehiclesLayer')).toBeGreaterThan(
      nativeHome.lastIndexOf('key={`detour-callouts-${overlay.routeId}`}')
    );
    expect(nativeHome).toContain("Platform.OS === 'android'");
    expect(nativeHome).toContain('belowLayerID={HOME_ROUTE_LAYER_BELOW_ID}');
    expect(webHome.indexOf('Live buses render after detour geometry/callouts')).toBeGreaterThan(
      webHome.lastIndexOf('key={`detour-callouts-${overlay.routeId}`}')
    );
  });
});
