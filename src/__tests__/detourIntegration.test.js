/**
 * Sprint D: Client pipeline integration tests.
 *
 * Block 1: Firestore document shape → detourService mapping → context state
 *           → useDetourOverlays derivation. Pure functions, no React rendering.
 *
 * Block 2: DetourOverlay component rendering with realistic overlay data.
 *           Uses react-test-renderer with act() for React 19 compatibility.
 */

// React 19 requires this for act() to work in test environments
global.IS_REACT_ACT_ENVIRONMENT = true;

// ─── Mock component references (defined before jest.mock for hoisting) ──────

const React = require('react');

// Store references to mock components so findAllByType works
const MockRoutePolyline = (props) => React.createElement('div', { 'data-mock': 'RoutePolyline' });
const MockWebRoutePolyline = (props) => React.createElement('div', { 'data-mock': 'WebRoutePolyline' });
const MockWebHtmlMarker = (props) => React.createElement('div', { 'data-mock': 'WebHtmlMarker' });
const MockWebLineLabelLayer = (props) => React.createElement('div', { 'data-mock': 'WebLineLabelLayer' });

// ─── Mocks needed before any require ────────────────────────────────────────

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (s) => s },
  Platform: { OS: 'ios' },
}));

jest.mock('@maplibre/maplibre-react-native', () => ({
  MarkerView: 'MarkerView',
  PointAnnotation: 'PointAnnotation',
  ShapeSource: 'ShapeSource',
  SymbolLayer: 'SymbolLayer',
}));

jest.mock('../components/RoutePolyline', () => MockRoutePolyline);

jest.mock('../components/WebMapView', () => ({
  __esModule: true,
  default: 'WebMapView',
  WebRoutePolyline: MockWebRoutePolyline,
  WebHtmlMarker: MockWebHtmlMarker,
  WebLineLabelLayer: MockWebLineLabelLayer,
}));

// ─── Shared test data ────────────────────────────────────────────────────────

const SAMPLE_POLYLINE = [
  { latitude: 44.38, longitude: -79.69 },
  { latitude: 44.39, longitude: -79.68 },
];

const LONG_POLYLINE = [
  { latitude: 44.38, longitude: -79.69 },
  { latitude: 44.385, longitude: -79.685 },
  { latitude: 44.39, longitude: -79.68 },
];

function makeTimestamp(isoString) {
  const date = new Date(isoString);
  return { toDate: () => date };
}

/**
 * Replicate the exact field-mapping logic from detourService.js
 * subscribeToActiveDetours snapshot handler.
 */
function mapFirestoreDoc(docId, data) {
  return {
    routeId: docId,
    shapeId: data.shapeId ?? null,
    detectedAt: data.detectedAt?.toDate?.()?.toISOString() ?? null,
    lastSeenAt: data.lastSeenAt?.toDate?.()?.toISOString() ?? null,
    vehicleCount: data.vehicleCount ?? 0,
    state: data.state ?? 'active',
    skippedSegmentPolyline: data.skippedSegmentPolyline ?? null,
    inferredDetourPolyline: data.inferredDetourPolyline ?? null,
    likelyDetourPolyline: data.likelyDetourPolyline ?? null,
    likelyDetourRoadNames: data.likelyDetourRoadNames ?? [],
    roadMatchSource: data.roadMatchSource ?? null,
    entryPoint: data.entryPoint ?? null,
    exitPoint: data.exitPoint ?? null,
    confidence: data.confidence ?? null,
    evidencePointCount: data.evidencePointCount ?? null,
    lastEvidenceAt: data.lastEvidenceAt ?? null,
  };
}

const { deriveDetourOverlays } = require('../hooks/useDetourOverlays');

// ─── 1. Data flow chain ─────────────────────────────────────────────────────

describe('Firestore → detourService → context → overlay derivation chain', () => {
  test('Stage 1: Firestore doc with all geometry fields maps to complete detour object', () => {
    const firestoreData = {
      detectedAt: makeTimestamp('2025-01-15T10:00:00Z'),
      shapeId: 'shape-8a-eastbound',
      lastSeenAt: makeTimestamp('2025-01-15T10:05:00Z'),
      vehicleCount: 2,
      state: 'active',
      skippedSegmentPolyline: SAMPLE_POLYLINE,
      inferredDetourPolyline: LONG_POLYLINE,
      likelyDetourPolyline: LONG_POLYLINE,
      roadMatchSource: 'osrm-route',
      entryPoint: { latitude: 44.38, longitude: -79.69 },
      exitPoint: { latitude: 44.39, longitude: -79.68 },
      confidence: 'high',
      evidencePointCount: 12,
      lastEvidenceAt: 1705312200000,
    };

    const mapped = mapFirestoreDoc('8A', firestoreData);

    expect(mapped.routeId).toBe('8A');
    expect(mapped.shapeId).toBe('shape-8a-eastbound');
    expect(mapped.state).toBe('active');
    expect(mapped.detectedAt).toBe('2025-01-15T10:00:00.000Z');
    expect(mapped.vehicleCount).toBe(2);
    expect(mapped.skippedSegmentPolyline).toBe(SAMPLE_POLYLINE);
    expect(mapped.inferredDetourPolyline).toBe(LONG_POLYLINE);
    expect(mapped.likelyDetourPolyline).toBe(LONG_POLYLINE);
    expect(mapped.roadMatchSource).toBe('osrm-route');
    expect(mapped.confidence).toBe('high');
    expect(mapped.evidencePointCount).toBe(12);
    expect(mapped.entryPoint).toEqual({ latitude: 44.38, longitude: -79.69 });
    expect(mapped.exitPoint).toEqual({ latitude: 44.39, longitude: -79.68 });
  });

  test('Stage 2: mapped detour populates context state with working helpers', () => {
    const detourMap = {
      '8A': mapFirestoreDoc('8A', {
        detectedAt: makeTimestamp('2025-01-15T10:00:00Z'),
        state: 'active',
        vehicleCount: 1,
        skippedSegmentPolyline: SAMPLE_POLYLINE,
        confidence: 'low',
        evidencePointCount: 3,
        lastEvidenceAt: 1705312000000,
      }),
    };

    const isRouteDetouring = (id) => Boolean(detourMap[id]);
    const getRouteDetour = (id) => detourMap[id] ?? null;

    expect(isRouteDetouring('8A')).toBe(true);
    expect(isRouteDetouring('3')).toBe(false);
    expect(getRouteDetour('8A')).not.toBeNull();
    expect(getRouteDetour('8A').skippedSegmentPolyline).toBe(SAMPLE_POLYLINE);
    expect(getRouteDetour('3')).toBeNull();
  });

  test('Stage 3: activeDetours flows through deriveDetourOverlays for selected route', () => {
    const activeDetours = {
      '8A': mapFirestoreDoc('8A', {
        state: 'active',
        skippedSegmentPolyline: SAMPLE_POLYLINE,
        inferredDetourPolyline: LONG_POLYLINE,
        likelyDetourPolyline: LONG_POLYLINE,
        roadMatchSource: 'osrm-route',
        vehicleCount: 2,
        confidence: 'high',
      }),
    };

    const overlays = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['8A']),
      activeDetours,
      routeColorByRouteId: {
        '8A': '#F48FB1',
      },
    });

    expect(overlays).toHaveLength(1);
    expect(overlays[0].routeId).toBe('8A');
    // If the closed-route and detour paths overlap, the rider UI should keep
    // the detour path but avoid drawing a contradictory closed section.
    expect(overlays[0].skippedSegmentPolyline).toBeNull();
    expect(overlays[0].likelyDetourPolyline).toBe(LONG_POLYLINE);
    expect(overlays[0].opacity).toBe(0.95);
    expect(overlays[0].skippedColor).toBe('#DE350B');
    expect(overlays[0].detourColor).toBe('#F48FB1');
    expect(overlays[0].showCallouts).toBe(true);
    expect(overlays[0].showStopMarkers).toBe(true);
  });

  test('Stage 4: clear-pending propagates reduced opacity through full chain', () => {
    const activeDetours = {
      '3': mapFirestoreDoc('3', {
        state: 'clear-pending',
        skippedSegmentPolyline: SAMPLE_POLYLINE,
        vehicleCount: 1,
        confidence: 'high',
      }),
    };

    const overlays = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['3']),
      activeDetours,
    });

    expect(overlays[0].state).toBe('clear-pending');
    expect(overlays[0].opacity).toBe(0.45);
  });

  test('pre-geometry document (no polylines) produces no overlay', () => {
    const activeDetours = {
      '5': mapFirestoreDoc('5', { state: 'active', confidence: 'high', vehicleCount: 1 }),
    };

    const overlays = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['5']),
      activeDetours,
    });

    expect(overlays).toHaveLength(0);
  });

  test('unselected detouring route produces no overlay', () => {
    const activeDetours = {
      '8A': mapFirestoreDoc('8A', {
        state: 'active',
        confidence: 'high',
        skippedSegmentPolyline: SAMPLE_POLYLINE,
      }),
    };

    const overlays = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['3']),
      activeDetours,
    });

    expect(overlays).toHaveLength(0);
  });

  test('feature flag disabled suppresses all overlays', () => {
    const activeDetours = {
      '8A': mapFirestoreDoc('8A', {
        state: 'active',
        confidence: 'high',
        skippedSegmentPolyline: SAMPLE_POLYLINE,
      }),
    };

    const overlays = deriveDetourOverlays({
      enabled: false,
      selectedRouteIds: new Set(['8A']),
      activeDetours,
    });

    expect(overlays).toHaveLength(0);
  });

  test('multi-route: two detouring, both selected', () => {
    const activeDetours = {
      '8A': mapFirestoreDoc('8A', { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE }),
      '3': mapFirestoreDoc('3', { state: 'clear-pending', confidence: 'high', likelyDetourPolyline: LONG_POLYLINE }),
    };

    const overlays = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['8A', '3']),
      activeDetours,
    });

    expect(overlays).toHaveLength(2);
    const ids = overlays.map((o) => o.routeId).sort();
    expect(ids).toEqual(['3', '8A']);
    expect(overlays.find((o) => o.routeId === '3').opacity).toBe(0.45);
    expect(overlays.find((o) => o.routeId === '8A').opacity).toBe(0.95);
  });
});

// ─── 2. Component rendering ─────────────────────────────────────────────────

const { create, act } = require('react-test-renderer');

const DetourOverlayNative = require('../components/DetourOverlay').default;
const DetourOverlayWeb = require('../components/DetourOverlay.web').default;

function renderComponent(Component, props) {
  let inst;
  act(() => {
    inst = create(React.createElement(Component, props));
  });
  return inst;
}

describe('DetourOverlay component rendering', () => {
  const OVERLAY_ACTIVE = {
    routeId: '8A',
    skippedSegmentPolyline: SAMPLE_POLYLINE,
    inferredDetourPolyline: LONG_POLYLINE,
    entryPoint: { latitude: 44.381, longitude: -79.691 },
    exitPoint: { latitude: 44.391, longitude: -79.679 },
    routeStops: [
      { id: 's1', latitude: 44.38, longitude: -79.69 },
      { id: 's2', latitude: 44.39, longitude: -79.68 },
    ],
    skippedStops: [{ id: 's2', code: '2002', latitude: 44.39, longitude: -79.68 }],
    entryStop: { id: 's1', latitude: 44.38, longitude: -79.69 },
    exitStop: { id: 's2', latitude: 44.39, longitude: -79.68 },
    opacity: 0.95,
    skippedColor: '#DE350B',
    detourColor: '#F48FB1',
    routeBaseColor: '#F48FB1',
    routeStopFillColor: '#FFFFFF',
    routeStopStrokeColor: '#111827',
    state: 'active',
    showCallouts: true,
    showStopMarkers: true,
    currentZoom: 15,
  };

  const OVERLAY_CLEAR_PENDING = {
    ...OVERLAY_ACTIVE,
    state: 'clear-pending',
    opacity: 0.45,
  };

  describe('native DetourOverlay', () => {
    test('renders context plus primary RoutePolyline elements when both polylines are present', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      expect(polylines).toHaveLength(3);
      expect(polylines[0].props.id).toBe('detour-context-8A-mask');
      expect(polylines[0].props.color).toBe('#FFFFFF');
    });

    test('detour path uses the route color, white halo, and updated width', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      const path = polylines.find((p) => p.props.id === 'detour-path-8A');
      expect(path).toBeDefined();
      expect(path.props.color).toBe('#F48FB1');
      expect(path.props.lineDashPattern).toBeUndefined();
      expect(path.props.strokeWidth).toBe(4.5);
      expect(path.props.outlineWidth).toBe(1.25);
      expect(path.props.outlineColor).toBe('#FF991F');
      expect(path.props.showArrows).toBe(true);
    });

    test('native detour and skipped lines open details when tapped', () => {
      const onPress = jest.fn();
      const inst = renderComponent(DetourOverlayNative, { ...OVERLAY_ACTIVE, onPress });
      const polylines = inst.root.findAllByType(MockRoutePolyline);

      expect(polylines.find((p) => p.props.id === 'detour-path-8A').props.onPress).toBe(onPress);
      expect(polylines.find((p) => p.props.id === 'detour-context-8A-mask').props.onPress).toBe(onPress);
      expect(polylines.find((p) => p.props.id === 'detour-context-8A').props.onPress).toBe(onPress);
    });

    test('closed route mask hides the regular route color under skipped segments', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      const mask = polylines.find((p) => p.props.id === 'detour-context-8A-mask');
      expect(mask).toBeDefined();
      expect(mask.props.color).toBe('#FFFFFF');
      expect(mask.props.strokeWidth).toBe(11);
      expect(mask.props.outlineWidth).toBe(0);
      expect(mask.props.lineDashPattern).toBeUndefined();
    });

    test('skipped route context is thinner, dashed, and muted', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      const path = polylines.find((p) => p.props.id === 'detour-context-8A');
      expect(path).toBeDefined();
      expect(path.props.color).toBe('#DE350B');
      expect(path.props.lineDashPattern).toEqual([3, 4]);
      expect(path.props.strokeWidth).toBe(3);
    });

    test('clear-pending opacity keeps the main line stronger than the skipped-route context', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_CLEAR_PENDING);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      expect(polylines.find((p) => p.props.id === 'detour-path-8A').props.opacity).toBe(0.45);
      expect(polylines.find((p) => p.props.id === 'detour-context-8A').props.opacity).toBe(0.36000000000000004);
    });

    test('renders only skipped segment when inferredDetourPolyline is null', () => {
      const inst = renderComponent(DetourOverlayNative, {
        ...OVERLAY_ACTIVE,
        inferredDetourPolyline: null,
      });
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      expect(polylines).toHaveLength(2);
      expect(polylines[0].props.id).toBe('detour-context-8A-mask');
      expect(polylines[1].props.id).toBe('detour-context-8A');
    });

    test('renders one path per segment for multi-segment detours', () => {
      const inst = renderComponent(DetourOverlayNative, {
        ...OVERLAY_ACTIVE,
        segmentStopDetails: [
          {
            skippedSegmentPolyline: SAMPLE_POLYLINE,
            inferredDetourPolyline: LONG_POLYLINE,
            skippedStops: [],
            entryStop: null,
            exitStop: null,
          },
          {
            skippedSegmentPolyline: LONG_POLYLINE,
            inferredDetourPolyline: SAMPLE_POLYLINE,
            skippedStops: [],
            entryStop: null,
            exitStop: null,
          },
        ],
        showStopMarkers: false,
      });
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      expect(polylines).toHaveLength(6);
      expect(polylines[0].props.id).toBe('detour-context-8A-0-mask');
      expect(polylines[1].props.id).toBe('detour-context-8A-0');
      expect(polylines[2].props.id).toBe('detour-path-8A-0');
      expect(polylines[3].props.id).toBe('detour-context-8A-1-mask');
      expect(polylines[4].props.id).toBe('detour-context-8A-1');
      expect(polylines[5].props.id).toBe('detour-path-8A-1');
    });

    test('renders no polylines when both are null', () => {
      const inst = renderComponent(DetourOverlayNative, {
        ...OVERLAY_ACTIVE,
        skippedSegmentPolyline: null,
        inferredDetourPolyline: null,
      });
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      expect(polylines).toHaveLength(0);
    });

    test('renders route and skipped stop markers without entry/exit text labels', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const annotations = inst.root.findAllByType('PointAnnotation');
      const markerViews = inst.root.findAllByType('MarkerView');
      const skippedMarker = markerViews.find((a) => a.props.id === 'detour-skipped-stop-8A-s2-0');
      expect(annotations).toHaveLength(0);
      expect(markerViews.length).toBeGreaterThanOrEqual(8);
      expect(markerViews.find((a) => a.props.id === 'detour-route-stop-8A-s1-0')).toBeDefined();
      expect(markerViews.find((a) => a.props.id === 'detour-route-stop-8A-s2-1')).toBeDefined();
      expect(skippedMarker).toBeDefined();
      expect(skippedMarker.props.anchor.y).toBeGreaterThan(0.7);
      expect(inst.root.findAllByType('Text').map((node) => node.props.children)).toContain('2002');
      expect(markerViews.some((a) => String(a.props.id).startsWith('detour-closed-stop-8A'))).toBe(true);
      expect(markerViews.find((a) => a.props.id === 'detour-entry-point-8A')).toBeUndefined();
      expect(markerViews.find((a) => a.props.id === 'detour-exit-point-8A')).toBeUndefined();
    });

    test('can show only closed stop markers when regular stop markers are hidden', () => {
      const inst = renderComponent(DetourOverlayNative, {
        ...OVERLAY_ACTIVE,
        showStopMarkers: false,
        showClosedStopMarkers: true,
      });
      const markerViews = inst.root.findAllByType('MarkerView');

      expect(markerViews.find((a) => String(a.props.id).startsWith('detour-route-stop-8A'))).toBeUndefined();
      expect(markerViews.find((a) => a.props.id === 'detour-skipped-stop-8A-s2-0')).toBeDefined();
    });

    test('entry/exit text callouts are not rendered', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const annotations = inst.root.findAllByType('MarkerView');
      expect(annotations.find((a) => a.props.id === 'detour-entry-point-8A')).toBeUndefined();
      expect(annotations.find((a) => a.props.id === 'detour-exit-point-8A')).toBeUndefined();
    });

    test('adds twice as many prominent direction arrows to the detour path', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const markerViews = inst.root.findAllByType('MarkerView');
      const arrows = markerViews.filter((marker) =>
        String(marker.props.id).startsWith('detour-direction-arrow-8A')
      );

      expect(arrows).toHaveLength(4);
    });

    test('keeps closure markers but hides entry/exit callouts when stop markers are hidden', () => {
      const inst = renderComponent(DetourOverlayNative, {
        ...OVERLAY_ACTIVE,
        showStopMarkers: false,
      });
      const annotations = inst.root.findAllByType('PointAnnotation');
      const markerViews = inst.root.findAllByType('MarkerView');
      expect(annotations).toHaveLength(0);
      expect(markerViews).toHaveLength(6);
      expect(markerViews.some((a) => String(a.props.id).startsWith('detour-closed-stop-8A'))).toBe(true);
      expect(markerViews.find((a) => a.props.id === 'detour-entry-point-8A')).toBeUndefined();
      expect(markerViews.find((a) => a.props.id === 'detour-exit-point-8A')).toBeUndefined();
    });
  });

  describe('web DetourOverlay', () => {
    test('renders context plus primary WebRoutePolyline elements when both polylines are present', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      expect(polylines).toHaveLength(3);
    });

    test('detour path uses the route color with an orange outline on web', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      const path = polylines.find((p) => p.props.color === '#F48FB1');
      expect(path).toBeDefined();
      expect(path.props.dashArray).toBeUndefined();
      expect(path.props.outlineColor).toBe('#FF991F');
      expect(path.props.showArrows).toBe(true);
    });

    test('web skipped route context is thinner, dashed, and muted', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      const path = polylines.find((p) => p.props.color === '#DE350B');
      expect(path).toBeDefined();
      expect(path.props.dashArray).toBe('3, 4');
      expect(path.props.strokeWidth).toBe(3);
    });

    test('all web overlays have interactive=false', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      polylines.forEach((p) => {
        expect(p.props.interactive).toBe(false);
      });
    });

    test('web detour and skipped lines are interactive when tap handler exists', () => {
      const onPress = jest.fn();
      const inst = renderComponent(DetourOverlayWeb, { ...OVERLAY_ACTIVE, onPress });
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);

      polylines.forEach((p) => {
        expect(p.props.interactive).toBe(true);
        expect(p.props.onPress).toBe(onPress);
      });
    });

    test('clear-pending opacity keeps the main line stronger than the skipped-route context on web', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_CLEAR_PENDING);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      expect(polylines.find((p) => p.props.color === '#F48FB1').props.opacity).toBe(0.45);
      expect(polylines.find((p) => p.props.color === '#DE350B').props.opacity).toBe(0.36000000000000004);
    });

    test('detour path has the stronger halo width on web', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      const path = polylines.find((p) => p.props.color === '#F48FB1');
      expect(path.props.outlineWidth).toBe(1.25);
      expect(path.props.strokeWidth).toBe(4.5);
    });

    test('renders one web path per segment for multi-segment detours', () => {
      const inst = renderComponent(DetourOverlayWeb, {
        ...OVERLAY_ACTIVE,
        segmentStopDetails: [
          {
            skippedSegmentPolyline: SAMPLE_POLYLINE,
            inferredDetourPolyline: LONG_POLYLINE,
            skippedStops: [],
            entryStop: null,
            exitStop: null,
          },
          {
            skippedSegmentPolyline: LONG_POLYLINE,
            inferredDetourPolyline: SAMPLE_POLYLINE,
            skippedStops: [],
            entryStop: null,
            exitStop: null,
          },
        ],
        showStopMarkers: false,
      });
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      expect(polylines).toHaveLength(6);
    });

    test('renders HTML markers for route and skipped stops without entry/exit text labels', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const markers = inst.root.findAllByType(MockWebHtmlMarker);
      const labelLayers = inst.root.findAllByType(MockWebLineLabelLayer);
      expect(markers).toHaveLength(8);
      expect(labelLayers).toHaveLength(1);
      expect(labelLayers[0].props.labels.map((label) => label.label)).toEqual([
        'Route closed',
      ]);
      const coords = markers.map((m) => m.props.coordinate);
      expect(coords).toContainEqual({ latitude: 44.38, longitude: -79.69 });
      expect(coords).toContainEqual({ latitude: 44.39, longitude: -79.68 });
      expect(markers.filter((m) => m.props.html.includes('background:#DE350B')).length).toBeGreaterThanOrEqual(2);
      const skippedMarker = markers.find((m) => m.props.accessibilityLabel?.includes('not serviced'));
      expect(skippedMarker.props.html).toContain('2002');
      expect(skippedMarker.props.html).toContain('border-radius:50%');
      expect(skippedMarker.props.html).not.toContain('min-width:30px');
      const html = markers.map((m) => m.props.html).join('\n');
      expect(html).not.toContain('DETOUR');
      expect(html).not.toContain('RESUMES');
      expect(html).not.toContain('ROUTE</span>');
    });

    test('web can show only closed stop markers when regular stop markers are hidden', () => {
      const inst = renderComponent(DetourOverlayWeb, {
        ...OVERLAY_ACTIVE,
        showStopMarkers: false,
        showClosedStopMarkers: true,
      });
      const markers = inst.root.findAllByType(MockWebHtmlMarker);

      expect(markers.find((m) => m.props.zIndexOffset === 660)).toBeUndefined();
      expect(markers.find((m) => m.props.zIndexOffset === 700)).toBeDefined();
    });

    test('web labels sit above stop and closed-stop markers', () => {
      const inst = renderComponent(DetourOverlayWeb, {
        ...OVERLAY_ACTIVE,
        showLineLabels: true,
      });
      const markers = inst.root.findAllByType(MockWebHtmlMarker);
      const stopIndexes = markers
        .filter((m) => m.props.zIndexOffset === 660 || m.props.zIndexOffset === 700)
        .map((m) => m.props.zIndexOffset);

      expect(inst.root.findAllByType(MockWebLineLabelLayer)).toHaveLength(1);
      expect(markers.every((m) => !m.props.html.includes('RESUMES'))).toBe(true);
      expect(markers.every((m) => !m.props.html.includes('DETOUR'))).toBe(true);
      expect(Math.max(...stopIndexes)).toBeGreaterThan(0);
    });

    test('adds twice as many prominent web direction arrows to the detour path', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const markers = inst.root.findAllByType(MockWebHtmlMarker);
      const arrows = markers.filter((m) => m.props.zIndexOffset === 1180);

      expect(arrows).toHaveLength(4);
      arrows.forEach((arrow) => {
        expect(arrow.props.html).toContain('rotate(');
      });
    });

    test('keeps closure markers but hides entry/exit callouts when stop markers are hidden', () => {
      const inst = renderComponent(DetourOverlayWeb, {
        ...OVERLAY_ACTIVE,
        showStopMarkers: false,
      });
      const markers = inst.root.findAllByType(MockWebHtmlMarker);
      const labelLayers = inst.root.findAllByType(MockWebLineLabelLayer);
      expect(markers).toHaveLength(6);
      expect(labelLayers).toHaveLength(1);
      expect(labelLayers[0].props.labels.map((label) => label.label)).toEqual([
        'Route closed',
      ]);
      expect(markers.filter((m) => m.props.html.includes('background:#DE350B')).length).toBeGreaterThanOrEqual(2);
      expect(markers.some((m) => m.props.html.includes('DETOUR'))).toBe(false);
      expect(markers.some((m) => m.props.html.includes('RESUMES'))).toBe(false);
      expect(markers.some((m) => m.props.html.includes('ROUTE</span>'))).toBe(false);
    });
  });
});
