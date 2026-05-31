global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('@maplibre/maplibre-react-native', () => ({
  MarkerView: 'MarkerView',
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Path: 'Path',
  Rect: 'Rect',
}));

jest.mock('../components/WebMapView', () => ({
  WebBusHubLayer: 'WebBusHubLayer',
}));

const BusHubOverlay = require('../components/BusHubOverlay').default;
const WebBusHubOverlay = require('../components/BusHubOverlay.web').default;
const { BUS_HUBS, BUS_HUB_MINOR_LABEL_MIN_ZOOM } = require('../config/busHubs');

describe('BusHubOverlay', () => {
  test('native renders cartoon hub marker views above route lines but below priority marker callouts', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(BusHubOverlay, {
        currentZoom: BUS_HUB_MINOR_LABEL_MIN_ZOOM - 0.5,
      }));
    });

    const markers = inst.root.findAllByType('MarkerView');
    const text = inst.root.findAllByType('Text');
    const images = inst.root.findAllByType('Image');
    const frames = inst.root.findAll((node) => node.props.testID === 'bus-hub-marker-frame');
    const labelPills = inst.root.findAll((node) => node.props.testID === 'bus-hub-label-pill');
    const iconWraps = inst.root.findAll((node) => node.props.testID === 'bus-hub-icon-wrap');

    expect(markers).toHaveLength(BUS_HUBS.length);
    expect(markers[0].props.id).toBe('bus-hub-allandale-terminal');
    expect(markers[0].props.anchor).toEqual({ x: 0.5, y: 0.42 });
    expect(markers.every((marker) => marker.props.pointerEvents === 'none')).toBe(true);
    expect(images).toHaveLength(BUS_HUBS.length);
    expect(images[0].props.accessibilityLabel).toBe('Bus hub');
    expect(images[0].props.style).toEqual(expect.objectContaining({ width: 81, height: 81 }));
    expect(iconWraps[0].props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 84, height: 84 }),
    ]));
    expect(text.some((node) => node.children.includes('Barrie Allandale Hub'))).toBe(true);
    expect(text.some((node) => node.children.includes('Barrie Allandale Transit Terminal'))).toBe(false);
    expect(text.some((node) => node.children.includes('Georgian Mall'))).toBe(true);
    expect(frames.every((frame) => frame.props.style.some((style) => style?.zIndex === 65))).toBe(true);
    const majorLabelText = text.find((node) => node.children.includes('Barrie Allandale Hub'));
    expect(majorLabelText.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ fontSize: 11 }),
    ]));
    expect(labelPills[0].props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ marginTop: -10 }),
    ]));
  });

  test('web forwards the same feature collection to the MapLibre layer renderer', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebBusHubOverlay, {
        currentZoom: BUS_HUB_MINOR_LABEL_MIN_ZOOM,
      }));
    });

    const layer = inst.root.findByType('WebBusHubLayer');
    expect(layer.props.featureCollection.features).toHaveLength(BUS_HUBS.length);
    expect(layer.props.featureCollection.features.every((feature) => feature.properties.showLabel)).toBe(true);
    expect(layer.props.layerOrder).toEqual(expect.objectContaining({
      aboveRegularStops: true,
      belowPriorityMarkers: true,
    }));
  });
});
