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

// ─── Mocks needed before any require ────────────────────────────────────────

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s) => s },
  Platform: { OS: 'ios' },
}));

jest.mock('@maplibre/maplibre-react-native', () => ({
  PointAnnotation: 'PointAnnotation',
}));

jest.mock('../components/RoutePolyline', () => MockRoutePolyline);

jest.mock('../components/WebMapView', () => ({
  __esModule: true,
  default: 'WebMapView',
  WebRoutePolyline: MockWebRoutePolyline,
  WebHtmlMarker: MockWebHtmlMarker,
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
        vehicleCount: 2,
      }),
    };

    const overlays = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['8A']),
      activeDetours,
    });

    expect(overlays).toHaveLength(1);
    expect(overlays[0].routeId).toBe('8A');
    expect(overlays[0].skippedSegmentPolyline).toBe(SAMPLE_POLYLINE);
    expect(overlays[0].inferredDetourPolyline).toBe(LONG_POLYLINE);
    expect(overlays[0].opacity).toBe(0.95);
    expect(overlays[0].skippedColor).toBe('#DE350B');
    expect(overlays[0].detourColor).toBe('#2E7D32');
    expect(overlays[0].showCallouts).toBe(true);
    expect(overlays[0].showStopMarkers).toBe(true);
  });

  test('Stage 4: clear-pending propagates reduced opacity through full chain', () => {
    const activeDetours = {
      '3': mapFirestoreDoc('3', {
        state: 'clear-pending',
        skippedSegmentPolyline: SAMPLE_POLYLINE,
        vehicleCount: 1,
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
      '5': mapFirestoreDoc('5', { state: 'active', vehicleCount: 1 }),
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
      '8A': mapFirestoreDoc('8A', { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE }),
      '3': mapFirestoreDoc('3', { state: 'clear-pending', inferredDetourPolyline: LONG_POLYLINE }),
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
    skippedStops: [{ id: 's2', latitude: 44.39, longitude: -79.68 }],
    entryStop: { id: 's1', latitude: 44.38, longitude: -79.69 },
    exitStop: { id: 's2', latitude: 44.39, longitude: -79.68 },
    opacity: 0.95,
    skippedColor: '#DE350B',
    detourColor: '#2E7D32',
    routeBaseColor: '#111827',
    routeStopFillColor: '#ffffff',
    routeStopStrokeColor: '#111827',
    state: 'active',
    showCallouts: true,
    showStopMarkers: true,
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
      expect(polylines).toHaveLength(2);
    });

    test('detour path has the premium color, white halo, and updated width', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      const path = polylines.find((p) => p.props.id === 'detour-path-8A');
      expect(path).toBeDefined();
      expect(path.props.color).toBe('#2E7D32');
      expect(path.props.lineDashPattern).toBeUndefined();
      expect(path.props.strokeWidth).toBe(4.5);
      expect(path.props.outlineWidth).toBe(2.5);
      expect(path.props.outlineColor).toBe('#FFFFFF');
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
      expect(polylines).toHaveLength(1);
      expect(polylines[0].props.id).toBe('detour-path-8A');
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
      expect(polylines).toHaveLength(4);
      expect(polylines[0].props.id).toBe('detour-context-8A-0');
      expect(polylines[1].props.id).toBe('detour-path-8A-0');
      expect(polylines[2].props.id).toBe('detour-context-8A-1');
      expect(polylines[3].props.id).toBe('detour-path-8A-1');
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

    test('renders route, entry/exit, and skipped stop markers', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const annotations = inst.root.findAllByType('PointAnnotation');
      expect(annotations).toHaveLength(6);
      expect(annotations.find((a) => a.props.id === 'detour-route-stop-8A-s1')).toBeDefined();
      expect(annotations.find((a) => a.props.id === 'detour-route-stop-8A-s2')).toBeDefined();
      expect(annotations.find((a) => a.props.id === 'detour-closed-point-8A')).toBeDefined();
      expect(annotations.find((a) => a.props.id === 'detour-entry-point-8A')).toBeDefined();
      expect(annotations.find((a) => a.props.id === 'detour-exit-point-8A')).toBeDefined();
      expect(annotations.find((a) => a.props.id === 'detour-skipped-stop-8A-s2')).toBeDefined();
    });

    test('still shows entry/exit callouts when stop markers are hidden', () => {
      const inst = renderComponent(DetourOverlayNative, {
        ...OVERLAY_ACTIVE,
        showStopMarkers: false,
      });
      const annotations = inst.root.findAllByType('PointAnnotation');
      expect(annotations).toHaveLength(3);
      expect(annotations.find((a) => a.props.id === 'detour-closed-point-8A')).toBeDefined();
      expect(annotations.find((a) => a.props.id === 'detour-entry-point-8A')).toBeDefined();
      expect(annotations.find((a) => a.props.id === 'detour-exit-point-8A')).toBeDefined();
    });
  });

  describe('web DetourOverlay', () => {
    test('renders context plus primary WebRoutePolyline elements when both polylines are present', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      expect(polylines).toHaveLength(2);
    });

    test('detour path uses the premium color with a white halo on web', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      const path = polylines.find((p) => p.props.color === '#2E7D32');
      expect(path).toBeDefined();
      expect(path.props.dashArray).toBeUndefined();
      expect(path.props.outlineColor).toBe('#FFFFFF');
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

    test('clear-pending opacity keeps the main line stronger than the skipped-route context on web', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_CLEAR_PENDING);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      expect(polylines.find((p) => p.props.color === '#2E7D32').props.opacity).toBe(0.45);
      expect(polylines.find((p) => p.props.color === '#DE350B').props.opacity).toBe(0.36000000000000004);
    });

    test('detour path has the stronger halo width on web', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      const path = polylines.find((p) => p.props.color === '#2E7D32');
      expect(path.props.outlineWidth).toBe(2.5);
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
      expect(polylines).toHaveLength(4);
    });

    test('renders HTML markers for route, entry/exit, and skipped stops', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const markers = inst.root.findAllByType(MockWebHtmlMarker);
      expect(markers).toHaveLength(6);
      const coords = markers.map((m) => m.props.coordinate);
      expect(coords).toContainEqual({ latitude: 44.38, longitude: -79.69 });
      expect(coords).toContainEqual({ latitude: 44.39, longitude: -79.68 });
      expect(coords).toContainEqual({ latitude: 44.381, longitude: -79.691 });
      expect(coords).toContainEqual({ latitude: 44.391, longitude: -79.679 });
      expect(markers.some((m) => m.props.html.includes('ROUTE CLOSED'))).toBe(true);
      const entry = markers.find((m) => m.props.html.includes('OPEN') && m.props.html.includes('DETOUR'));
      const exit = markers.find((m) => m.props.html.includes('ROUTE') && m.props.html.includes('RESUMES'));
      expect(entry.props.html).toContain('BUS DETOUR');
      expect(entry.props.html).toContain('OPEN');
      expect(exit.props.html).toContain('ROUTE');
      expect(exit.props.html).toContain('RESUMES');
    });

    test('still shows entry/exit callouts when stop markers are hidden', () => {
      const inst = renderComponent(DetourOverlayWeb, {
        ...OVERLAY_ACTIVE,
        showStopMarkers: false,
      });
      const markers = inst.root.findAllByType(MockWebHtmlMarker);
      expect(markers).toHaveLength(3);
      expect(markers.some((m) => m.props.html.includes('ROUTE CLOSED'))).toBe(true);
      expect(markers.some((m) => m.props.html.includes('BUS DETOUR') && m.props.html.includes('OPEN'))).toBe(true);
      expect(markers.some((m) => m.props.html.includes('ROUTE') && m.props.html.includes('RESUMES'))).toBe(true);
    });
  });
});
