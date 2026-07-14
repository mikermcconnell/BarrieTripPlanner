global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Platform: { OS: 'android' },
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('@maplibre/maplibre-react-native', () => ({
  MarkerView: 'MarkerView',
  ShapeSource: 'ShapeSource',
  CircleLayer: 'CircleLayer',
  SymbolLayer: 'SymbolLayer',
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
const {
  BUS_HUBS,
  BUS_HUB_MAJOR_IDS,
  BUS_HUB_MINOR_IDS,
  BUS_HUB_CORRIDOR_LABEL_MIN_ZOOM,
  BUS_HUB_MINOR_LABEL_MIN_ZOOM,
} = require('../config/busHubs');

describe('BusHubOverlay', () => {
  test('Android renders bus hubs as passive style layers instead of touch-blocking native views', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(BusHubOverlay, {
        currentZoom: BUS_HUB_CORRIDOR_LABEL_MIN_ZOOM - 0.5,
      }));
    });

    const source = inst.root.findByType('ShapeSource');
    const dots = inst.root.findByType('CircleLayer');
    const labels = inst.root.findByType('SymbolLayer');

    expect(inst.root.findAllByType('MarkerView')).toHaveLength(0);
    expect(source.props.shape.features).toHaveLength(BUS_HUBS.length);
    expect(source.props.shape.features[0].properties.label).toBe('Barrie Allandale Hub');
    expect(source.props.shape.features.find((feature) => feature.id === 'georgian-mall').properties.label).toBe('');
    expect(dots.props.layerIndex).toBe(650);
    expect(labels.props.layerIndex).toBe(651);
    expect(labels.props.style.textFont).toEqual(['Noto Sans Bold']);
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
