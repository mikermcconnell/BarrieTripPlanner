global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
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
  likelyDetourPolyline: LINE,
  routeStops: [
    { id: 'open-1', latitude: 44.381, longitude: -79.701 },
    { id: 'open-2', latitude: 44.382, longitude: -79.702 },
  ],
  skippedStops: [
    { id: 'closed-1', code: '123', name: 'Closed Stop', latitude: 44.383, longitude: -79.703 },
  ],
  entryPoint: LINE[0],
  exitPoint: LINE[2],
  segmentStopDetails: [{
    skippedSegmentPolyline: LINE,
    inferredDetourPolyline: LINE,
    likelyDetourPolyline: LINE,
    skippedStops: [
      { id: 'closed-1', code: '123', name: 'Closed Stop', latitude: 44.383, longitude: -79.703 },
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

  test('native regular-view geometry renders closed and alternate paths with lighter line weight', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'geometry',
        lineStyleScale: 0.72,
      }));
    });

    const lines = inst.root.findAllByType('RoutePolyline');
    const closedMask = lines.find((line) => line.props.id === 'detour-context-10-mask');
    const closedLine = lines.find((line) => line.props.id === 'detour-context-10');
    const detourLine = lines.find((line) => line.props.id === 'detour-path-10');

    expect(closedMask.props.strokeWidth).toBeLessThan(11);
    expect(closedLine.props.strokeWidth).toBeLessThan(3);
    expect(closedLine.props.outlineWidth).toBeLessThan(1.25);
    expect(detourLine.props.strokeWidth).toBeLessThan(4.5);
    expect(detourLine.props.outlineWidth).toBeLessThan(1.25);
  });

  test('native alternate detour path uses route color with a green outline', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'geometry',
        detourColor: '#F48FB1',
        routeBaseColor: '#F48FB1',
      }));
    });

    const detourLine = inst.root
      .findAllByType('RoutePolyline')
      .find((line) => line.props.id === 'detour-path-10');

    expect(detourLine.props.color).toBe('#F48FB1');
    expect(detourLine.props.outlineColor).toBe('#2E7D32');
  });

  test('untrusted inferred detour paths are hidden while closed-route context remains', () => {
    const props = {
      ...BASE_PROPS,
      likelyDetourPolyline: null,
      segmentStopDetails: [{
        skippedSegmentPolyline: LINE,
        inferredDetourPolyline: LINE,
        likelyDetourPolyline: null,
        canShowDetourPath: false,
        skippedStops: [],
        entryPoint: LINE[0],
        exitPoint: LINE[2],
      }],
      renderMode: 'geometry',
    };

    let nativeInst;
    act(() => {
      nativeInst = create(React.createElement(NativeDetourOverlay, props));
    });
    const nativeLines = nativeInst.root.findAllByType('RoutePolyline');
    expect(nativeLines.map((line) => line.props.id)).toEqual([
      'detour-context-10-mask',
      'detour-context-10',
    ]);

    let webInst;
    act(() => {
      webInst = create(React.createElement(WebDetourOverlay, props));
    });
    const webLines = webInst.root.findAllByType('WebRoutePolyline');
    expect(webLines).toHaveLength(2);
    expect(webLines.some((line) => line.props.color === props.detourColor)).toBe(false);
  });

  test('native markers mode renders open and closed stops above route lines', () => {
    const onStopPress = jest.fn();
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'markers',
        onStopPress,
      }));
    });

    expect(inst.root.findAllByType('RoutePolyline')).toHaveLength(0);
    expect(inst.root.findAllByType('ShapeSource')).toHaveLength(0);
    expect(inst.root.findAllByType('MarkerView')).toHaveLength(5);
    const skippedStopMarkers = inst.root
      .findAllByType('MarkerView')
      .filter((marker) => String(marker.props.id).startsWith('detour-skipped-stop-'));
    expect(skippedStopMarkers).toHaveLength(1);
    expect(inst.root.findAllByType('Text').some((text) => text.children.includes('123'))).toBe(true);
    expect(skippedStopMarkers[0].props.allowOverlap).toBe(true);
    expect(() => skippedStopMarkers[0].findByType('Pressable').props.onPress()).not.toThrow();
    expect(onStopPress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'closed-1' }),
      expect.objectContaining({
        routeId: '10',
        segment: expect.objectContaining({ skippedStops: expect.any(Array) }),
      }),
    );
  });

  test('native closed stop markers show stop codes below line-label zoom', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'markers',
        currentZoom: 15,
      }));
    });

    expect(inst.root.findAllByType('Text').some((text) => text.children.includes('123'))).toBe(true);
  });

  test('native skipped stop press uses the stop route when family stops are merged', () => {
    const onStopPress = jest.fn();
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        routeId: '12A',
        renderMode: 'markers',
        onStopPress,
        segmentStopDetails: [{
          ...BASE_PROPS.segmentStopDetails[0],
          skippedStops: [
            { id: 'closed-12b', routeId: '12B', code: '618', name: 'Closed 12B Stop', latitude: 44.383, longitude: -79.703 },
          ],
        }],
      }));
    });

    const skippedStopMarker = inst.root
      .findAllByType('MarkerView')
      .find((marker) => String(marker.props.id).startsWith('detour-skipped-stop-'));

    act(() => {
      skippedStopMarker.findByType('Pressable').props.onPress();
    });

    expect(onStopPress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'closed-12b', routeId: '12B' }),
      expect.objectContaining({ routeId: '12B' }),
    );
  });

  test('native separates overlapping skipped stops from opposite route directions', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        routeId: '12A',
        renderMode: 'markers',
        segmentStopDetails: [{
          ...BASE_PROPS.segmentStopDetails[0],
          skippedStops: [
            { id: 'closed-12a', routeId: '12A', code: '933', name: 'Closed 12A Stop', latitude: 44.383, longitude: -79.703 },
            { id: 'closed-12b', routeId: '12B', code: '618', name: 'Closed 12B Stop', latitude: 44.383, longitude: -79.703 },
          ],
        }],
      }));
    });

    const skippedStopCoordinates = inst.root
      .findAllByType('MarkerView')
      .filter((marker) => String(marker.props.id).startsWith('detour-skipped-stop-'))
      .map((marker) => marker.props.coordinate);

    expect(skippedStopCoordinates).toHaveLength(2);
    expect(new Set(skippedStopCoordinates.map((coordinate) => coordinate.join(','))).size).toBe(2);
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
    expect(markers).toHaveLength(5);
    expect(markers.map((marker) => marker.props.zIndexOffset)).toEqual([660, 660, 690, 690, 700]);
    expect(markers.some((marker) => String(marker.props.html).includes('123'))).toBe(true);
    expect(markers.some((marker) => String(marker.props.html).includes('Not serviced by this detour'))).toBe(true);
    const skippedStopMarker = markers.find((marker) => marker.props.zIndexOffset === 700);
    expect(typeof skippedStopMarker.props.onPress).toBe('function');
    expect(skippedStopMarker.props.popupHtml).toContain('Not serviced by this detour');
  });

  test('web regular-view geometry renders closed and alternate paths with lighter line weight', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'geometry',
        lineStyleScale: 0.72,
      }));
    });

    const lines = inst.root.findAllByType('WebRoutePolyline');
    const closedMask = lines.find((line) => line.props.color === '#FFFFFF' && line.props.outlineWidth === 0);
    const closedLine = lines.find((line) => line.props.color === BASE_PROPS.skippedColor);
    const detourLine = lines.find((line) => line.props.color === BASE_PROPS.detourColor);

    expect(closedMask.props.strokeWidth).toBeLessThan(11);
    expect(closedLine.props.strokeWidth).toBeLessThan(3);
    expect(closedLine.props.outlineWidth).toBeLessThan(1.25);
    expect(detourLine.props.strokeWidth).toBeLessThan(4.5);
    expect(detourLine.props.outlineWidth).toBeLessThan(1.25);
  });

  test('web alternate detour path uses route color with a green outline', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'geometry',
        detourColor: '#F48FB1',
        routeBaseColor: '#F48FB1',
      }));
    });

    const detourLine = inst.root
      .findAllByType('WebRoutePolyline')
      .find((line) => line.props.color === '#F48FB1');

    expect(detourLine.props.color).toBe('#F48FB1');
    expect(detourLine.props.outlineColor).toBe('#2E7D32');
  });

  test('web closed stop markers show stop codes below line-label zoom', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        renderMode: 'markers',
        currentZoom: 15,
      }));
    });

    const html = inst.root.findAllByType('WebHtmlMarker').map((marker) => marker.props.html).join('\n');
    expect(html).toContain('123');
  });

  test('web skipped stop press uses the stop route when family stops are merged', () => {
    const onStopPress = jest.fn();
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        routeId: '12A',
        renderMode: 'markers',
        onStopPress,
        segmentStopDetails: [{
          ...BASE_PROPS.segmentStopDetails[0],
          skippedStops: [
            { id: 'closed-12b', routeId: '12B', code: '618', name: 'Closed 12B Stop', latitude: 44.383, longitude: -79.703 },
          ],
        }],
      }));
    });

    const skippedStopMarker = inst.root
      .findAllByType('WebHtmlMarker')
      .find((marker) => marker.props.zIndexOffset === 700);

    act(() => {
      skippedStopMarker.props.onPress();
    });

    expect(onStopPress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'closed-12b', routeId: '12B' }),
      expect.objectContaining({ routeId: '12B' }),
    );
  });

  test('web separates overlapping skipped stops from opposite route directions', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        routeId: '12A',
        renderMode: 'markers',
        segmentStopDetails: [{
          ...BASE_PROPS.segmentStopDetails[0],
          skippedStops: [
            { id: 'closed-12a', routeId: '12A', code: '933', name: 'Closed 12A Stop', latitude: 44.383, longitude: -79.703 },
            { id: 'closed-12b', routeId: '12B', code: '618', name: 'Closed 12B Stop', latitude: 44.383, longitude: -79.703 },
          ],
        }],
      }));
    });

    const skippedStopCoordinates = inst.root
      .findAllByType('WebHtmlMarker')
      .filter((marker) => marker.props.zIndexOffset === 700)
      .map((marker) => marker.props.coordinate);

    expect(skippedStopCoordinates).toHaveLength(2);
    expect(new Set(skippedStopCoordinates.map((coordinate) => `${coordinate.latitude},${coordinate.longitude}`)).size).toBe(2);
  });

  test('web callouts do not render detour route or route resumes text labels', () => {
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
    const html = markers.map((marker) => marker.props.html).join('\n');

    expect(html).not.toContain('DETOUR');
    expect(html).not.toContain('RESUMES');
    expect(html).not.toContain('ROUTE</span>');
  });

  test('native detour line labels use a single collision-aware line symbol layer', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        routeLineLabel: '11',
        showCallouts: true,
        showLineLabels: true,
        currentZoom: 15,
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
      symbolPlacement: 'line-center',
      textOffset: [0, 0],
      textAllowOverlap: false,
      textIgnorePlacement: false,
      textColor: ['match', ['get', 'kind'], 'closed', '#991B1B', 'detour', '#92400E', '#374151'],
      textHaloColor: '#FFFBEB',
      textHaloWidth: 2.4,
      textSize: 12,
      textPadding: 6,
    }));
    expect(labelLayer.props.style.symbolSpacing).toBeUndefined();
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
        currentZoom: 15,
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
      symbolPlacement: 'line-center',
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

  test('web labels use the same simplified closed geometry that is rendered', () => {
    const closedLineWithNearDuplicate = [
      { latitude: 44.39047, longitude: -79.6855 },
      { latitude: 44.39048, longitude: -79.68551 },
      { latitude: 44.39267, longitude: -79.68558 },
    ];
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        showCallouts: true,
        showLineLabels: false,
        currentZoom: 16,
        labelDensity: 'medium',
        renderMode: 'all',
        segmentStopDetails: [{
          skippedSegmentPolyline: closedLineWithNearDuplicate,
          inferredDetourPolyline: [],
          skippedStops: [],
        }],
      }));
    });

    const renderedClosedLine = inst.root
      .findAllByType('WebRoutePolyline')
      .find((line) => line.props.dashArray === '3, 4')
      .props.coordinates;
    const routeClosed = inst.root
      .findAllByType('WebLineLabelLayer')
      .flatMap((layer) => layer.props.labels)
      .find((label) => label.label === 'Route closed');

    expect(routeClosed.coordinates).toEqual(renderedClosedLine);
    expect(routeClosed.coordinates).toEqual([
      closedLineWithNearDuplicate[0],
      closedLineWithNearDuplicate[2],
    ]);
  });

  test('native detour labels are hidden below the safe zoom instead of being offset away', () => {
    let inst;
    act(() => {
      inst = create(React.createElement(NativeDetourOverlay, {
        ...BASE_PROPS,
        routeLineLabel: '11',
        showCallouts: true,
        showLineLabels: true,
        currentZoom: 13.25,
        labelDensity: 'medium',
        renderMode: 'callouts',
      }));
    });

    expect(inst.root.findAllByType('ShapeSource')).toHaveLength(0);
  });

  test('web detour labels are hidden when the line is too short for the text', () => {
    const shortClosedLine = [
      { latitude: 44.39047, longitude: -79.6855 },
      { latitude: 44.39055, longitude: -79.6855 },
    ];
    let inst;
    act(() => {
      inst = create(React.createElement(WebDetourOverlay, {
        ...BASE_PROPS,
        showCallouts: true,
        showLineLabels: false,
        currentZoom: 18,
        labelDensity: 'medium',
        renderMode: 'callouts',
        segmentStopDetails: [{
          skippedSegmentPolyline: shortClosedLine,
          inferredDetourPolyline: [],
          skippedStops: [],
        }],
      }));
    });

    expect(inst.root.findByType('WebLineLabelLayer').props.labels).toHaveLength(0);
  });

  test('web full-density callouts omit detour route and route resumes text labels', () => {
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

    expect(html).not.toContain('DETOUR');
    expect(html).not.toContain('ROUTE</span>');
    expect(html).not.toContain('RESUMES');
    expect(html).not.toContain('PATH');
  });
});
