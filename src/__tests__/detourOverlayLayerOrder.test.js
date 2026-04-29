global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (styles) => styles },
}));

jest.mock('@maplibre/maplibre-react-native', () => ({
  PointAnnotation: 'PointAnnotation',
  MarkerView: 'MarkerView',
  ShapeSource: 'ShapeSource',
  CircleLayer: 'CircleLayer',
  SymbolLayer: 'SymbolLayer',
}));

jest.mock('../components/RoutePolyline', () => 'RoutePolyline');

jest.mock('../components/WebMapView', () => ({
  WebHtmlMarker: 'WebHtmlMarker',
  WebRoutePolyline: 'WebRoutePolyline',
}));

const NativeDetourOverlay = require('../components/DetourOverlay').default;
const WebDetourOverlay = require('../components/DetourOverlay.web').default;

const LINE = [
  { latitude: 44.38, longitude: -79.70 },
  { latitude: 44.39, longitude: -79.69 },
  { latitude: 44.40, longitude: -79.68 },
];

const BASE_PROPS = {
  routeId: '10',
  skippedSegmentPolyline: LINE,
  inferredDetourPolyline: LINE,
  routeStops: [
    { id: 'open-1', latitude: 44.381, longitude: -79.701 },
    { id: 'open-2', latitude: 44.382, longitude: -79.702 },
  ],
  skippedStops: [
    { id: 'closed-1', latitude: 44.383, longitude: -79.703 },
  ],
  entryPoint: LINE[0],
  exitPoint: LINE[2],
  segmentStopDetails: [{
    skippedSegmentPolyline: LINE,
    inferredDetourPolyline: LINE,
    skippedStops: [
      { id: 'closed-1', latitude: 44.383, longitude: -79.703 },
    ],
    entryPoint: LINE[0],
    exitPoint: LINE[2],
  }],
  opacity: 1,
  skippedColor: '#D92D20',
  detourColor: '#6B145F',
  routeBaseColor: '#6B145F',
  routeStopFillColor: '#FFFFFF',
  routeStopStrokeColor: '#111827',
  showCallouts: false,
  showStopMarkers: true,
};

describe('DetourOverlay layer split', () => {
  test('native geometry mode renders route lines without stop markers', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'geometry',
      }));
    });

    const lines = inst.root.findAllByType('RoutePolyline');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((line) => line.props.layerIndex)).toEqual([300, 304, 320]);
    expect(inst.root.findAllByType('ShapeSource')).toHaveLength(0);
  });

  test('native markers mode renders open and closed stops above route lines', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'markers',
      }));
    });

    expect(inst.root.findAllByType('RoutePolyline')).toHaveLength(0);
    expect(inst.root.findAllByType('ShapeSource')).toHaveLength(0);
    expect(inst.root.findAllByType('MarkerView')).toHaveLength(3);
  });

  test('web markers mode puts detour stop markers above regular route markers', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'markers',
      }));
    });

    const markers = inst.root.findAllByType('WebHtmlMarker');
    expect(inst.root.findAllByType('WebRoutePolyline')).toHaveLength(0);
    expect(markers).toHaveLength(3);
    expect(markers.map((marker) => marker.props.zIndexOffset)).toEqual([660, 660, 700]);
  });
});
