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
  WebLineLabelLayer: 'WebLineLabelLayer',
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

  test('web callouts shift overlapping detour labels away from the same map point', () => {
    const sharedPoint = LINE[1];
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        routeLineLabel: '11',
        showCallouts: true,
        showLineLabels: true,
        currentZoom: 16,
        segmentStopDetails: [{
          skippedSegmentPolyline: LINE,
          inferredDetourPolyline: LINE,
          likelyDetourPolyline: LINE,
          skippedStops: [],
          entryPoint: sharedPoint,
          exitPoint: sharedPoint,
        }],
        labelDensity: 'full',
        renderMode: 'callouts',
      }));
    });

    const markers = inst.root.findAllByType('WebHtmlMarker');
    const routeResumes = markers.find((marker) => marker.props.html.includes('ROUTE') && marker.props.html.includes('RESUMES'));

    expect(routeResumes).toBeTruthy();
    expect(routeResumes.props.offset).not.toEqual([0, -22]);
  });

  test('native detour line labels use a single collision-aware line symbol layer', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        routeLineLabel: '11',
        showCallouts: true,
        showLineLabels: true,
        currentZoom: 12,
        labelDensity: 'medium',
        renderMode: 'callouts',
      }));
    });

    const sources = inst.root.findAllByType('ShapeSource');
    const symbolLayers = inst.root.findAllByType('SymbolLayer');
    const labelSource = sources.find((source) => source.props.id === 'detour-line-labels-10');
    const labelLayer = symbolLayers.find((layer) => layer.props.id === 'detour-line-labels-10-symbols');

    expect(labelSource).toBeTruthy();
    expect(labelSource.props.shape.features.map((feature) => feature.properties.label)).toEqual([
      'Route 11 detour',
      'Route closed',
    ]);
    expect(labelSource.props.shape.features.map((feature) => feature.properties.priority)).toEqual([100, 80]);
    expect(labelSource.props.shape.features.map((feature) => feature.properties.sortKey)).toEqual([0, 20]);
    expect(labelLayer.props.style).toEqual(expect.objectContaining({
      symbolPlacement: 'line',
      textOffset: [0, 0],
      textAllowOverlap: false,
      textIgnorePlacement: false,
      textColor: ['match', ['get', 'kind'], 'closed', '#991B1B', 'detour', '#92400E', '#374151'],
      textHaloColor: '#FFFBEB',
      textHaloWidth: 2.4,
      textSize: 12,
      symbolSpacing: 420,
      textPadding: 6,
    }));
    expect(inst.root.findAllByType('MarkerView').some((marker) => (
      String(marker.props.id || '').includes('detour-line-label') ||
      String(marker.props.id || '').includes('detour-closed-point')
    ))).toBe(false);
  });

  test('web detour line labels use one collision-aware line label layer, not HTML marker badges', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        routeLineLabel: '11',
        showCallouts: true,
        showLineLabels: true,
        currentZoom: 12,
        labelDensity: 'medium',
        renderMode: 'callouts',
      }));
    });

    const labelLayers = inst.root.findAllByType('WebLineLabelLayer');
    const htmlMarkers = inst.root.findAllByType('WebHtmlMarker');

    expect(labelLayers).toHaveLength(1);
    expect(labelLayers[0].props.labels.map((label) => label.label)).toEqual(['Route 11 detour', 'Route closed']);
    expect(labelLayers[0].props.labels.map((label) => label.priority)).toEqual([100, 80]);
    expect(labelLayers[0].props.labels.map((label) => label.sortKey)).toEqual([0, 20]);
    expect(labelLayers[0].props.labelStyle).toEqual(expect.objectContaining({
      textOffset: [0, 0],
      textAllowOverlap: false,
      textIgnorePlacement: false,
      color: ['match', ['get', 'kind'], 'closed', '#991B1B', 'detour', '#92400E', '#374151'],
      haloColor: '#FFFBEB',
      haloWidth: 2.4,
      size: 12,
      spacing: 420,
      textPadding: 6,
    }));
    expect(htmlMarkers.some((marker) => (
      marker.props.html.includes('Route 11 detour') ||
      marker.props.html.includes('Route closed')
    ))).toBe(false);
  });

  test('web medium-density callouts keep map labels concise', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        routeLineLabel: '11',
        showCallouts: true,
        showLineLabels: true,
        currentZoom: 16,
        labelDensity: 'medium',
        renderMode: 'callouts',
      }));
    });

    const labelText = inst.root
      .findAllByType('WebLineLabelLayer')
      .flatMap((layer) => layer.props.labels.map((label) => label.label))
      .join('\n');
    const html = inst.root.findAllByType('WebHtmlMarker').map((marker) => marker.props.html).join('\n');

    expect(labelText).toContain('Route 11 detour');
    expect(labelText).toContain('Route closed');
    expect(html).not.toContain('ROUTE</span>');
    expect(html).not.toContain('RESUMES');
    expect(html).not.toContain('PATH');
  });

  test('web route-closed label uses the full closed line as its label anchor geometry', () => {
    const closedLine = [
      { latitude: 44.39047, longitude: -79.6855 },
      { latitude: 44.39267, longitude: -79.68558 },
    ];
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        routeLineLabel: '11',
        showCallouts: true,
        showLineLabels: false,
        currentZoom: 16,
        labelDensity: 'medium',
        renderMode: 'callouts',
        segmentStopDetails: [{
          skippedSegmentPolyline: closedLine,
          inferredDetourPolyline: [],
          skippedStops: [],
        }],
      }));
    });

    const routeClosed = inst.root
      .findAllByType('WebLineLabelLayer')
      .flatMap((layer) => layer.props.labels)
      .find((label) => label.label === 'Route closed');

    expect(routeClosed.coordinates).toEqual(closedLine);
    expect(inst.root.findByType('WebLineLabelLayer').props.labelStyle.textOffset).toEqual([0, 0]);
  });

  test('web full-density callouts describe the detour route instead of path', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        routeLineLabel: '11',
        showCallouts: true,
        showLineLabels: true,
        currentZoom: 16,
        labelDensity: 'full',
        renderMode: 'callouts',
      }));
    });

    const html = inst.root.findAllByType('WebHtmlMarker').map((marker) => marker.props.html).join('\n');

    expect(html).toContain('DETOUR');
    expect(html).toContain('ROUTE');
    expect(html).not.toContain('PATH');
  });
});
