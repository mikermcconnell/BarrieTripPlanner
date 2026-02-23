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
}));

jest.mock('leaflet', () => ({
  Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } },
}));

const MockCircleMarker = (props) => React.createElement('div', { 'data-mock': 'CircleMarker' });

jest.mock('react-leaflet', () => ({
  MapContainer: 'MapContainer',
  TileLayer: 'TileLayer',
  Polyline: 'Polyline',
  Marker: 'Marker',
  Popup: 'Popup',
  CircleMarker: MockCircleMarker,
  useMap: jest.fn(),
  useMapEvents: jest.fn(),
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
    expect(overlays[0].opacity).toBe(1.0);
    expect(overlays[0].skippedColor).toBe('#ef4444');
    expect(overlays[0].detourColor).toBe('#f97316');
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
    expect(overlays.find((o) => o.routeId === '8A').opacity).toBe(1.0);
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
    entryPoint: { latitude: 44.38, longitude: -79.69 },
    exitPoint: { latitude: 44.39, longitude: -79.68 },
    opacity: 1.0,
    skippedColor: '#ef4444',
    detourColor: '#f97316',
    markerBorderColor: '#f97316',
    state: 'active',
  };

  const OVERLAY_CLEAR_PENDING = {
    ...OVERLAY_ACTIVE,
    state: 'clear-pending',
    opacity: 0.45,
  };

  describe('native DetourOverlay', () => {
    test('renders two RoutePolyline elements when both polylines present', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      expect(polylines).toHaveLength(2);
    });

    test('skipped segment has correct id, color, and dashPattern', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      const skipped = polylines.find((p) => p.props.id === 'detour-skipped-8A');
      expect(skipped).toBeDefined();
      expect(skipped.props.color).toBe('#ef4444');
      expect(skipped.props.lineDashPattern).toEqual([8, 6]);
      expect(skipped.props.strokeWidth).toBe(5);
    });

    test('detour path has correct id, color, and no dashPattern', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      const path = polylines.find((p) => p.props.id === 'detour-path-8A');
      expect(path).toBeDefined();
      expect(path.props.color).toBe('#f97316');
      expect(path.props.lineDashPattern).toBeUndefined();
    });

    test('clear-pending opacity forwarded to both polylines', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_CLEAR_PENDING);
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      polylines.forEach((p) => {
        expect(p.props.opacity).toBe(0.45);
      });
    });

    test('renders only skipped segment when inferredDetourPolyline is null', () => {
      const inst = renderComponent(DetourOverlayNative, {
        ...OVERLAY_ACTIVE,
        inferredDetourPolyline: null,
      });
      const polylines = inst.root.findAllByType(MockRoutePolyline);
      expect(polylines).toHaveLength(1);
      expect(polylines[0].props.id).toBe('detour-skipped-8A');
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

    test('renders PointAnnotation markers for entry/exit', () => {
      const inst = renderComponent(DetourOverlayNative, OVERLAY_ACTIVE);
      const annotations = inst.root.findAllByType('PointAnnotation');
      expect(annotations).toHaveLength(2);
      const entry = annotations.find((a) => a.props.id === 'detour-entry-8A');
      const exit = annotations.find((a) => a.props.id === 'detour-exit-8A');
      expect(entry).toBeDefined();
      expect(exit).toBeDefined();
      expect(entry.props.coordinate).toEqual([-79.69, 44.38]);
      expect(exit.props.coordinate).toEqual([-79.68, 44.39]);
    });

    test('no markers when entryPoint/exitPoint are null', () => {
      const inst = renderComponent(DetourOverlayNative, {
        ...OVERLAY_ACTIVE,
        entryPoint: null,
        exitPoint: null,
      });
      const annotations = inst.root.findAllByType('PointAnnotation');
      expect(annotations).toHaveLength(0);
    });
  });

  describe('web DetourOverlay', () => {
    test('renders two WebRoutePolyline elements when both polylines present', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      expect(polylines).toHaveLength(2);
    });

    test('skipped segment uses dashArray (web-specific CSS string)', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      const skipped = polylines.find((p) => p.props.dashArray === '10, 8');
      expect(skipped).toBeDefined();
      expect(skipped.props.color).toBe('#ef4444');
    });

    test('all web overlays have interactive=false', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      polylines.forEach((p) => {
        expect(p.props.interactive).toBe(false);
      });
    });

    test('clear-pending opacity forwarded on web', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_CLEAR_PENDING);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      polylines.forEach((p) => {
        expect(p.props.opacity).toBe(0.45);
      });
    });

    test('skipped segment has outlineWidth=0 (web-specific)', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const polylines = inst.root.findAllByType(MockWebRoutePolyline);
      const skipped = polylines.find((p) => p.props.dashArray === '10, 8');
      expect(skipped.props.outlineWidth).toBe(0);
    });

    test('renders CircleMarker for entry/exit', () => {
      const inst = renderComponent(DetourOverlayWeb, OVERLAY_ACTIVE);
      const markers = inst.root.findAllByType(MockCircleMarker);
      expect(markers).toHaveLength(2);
      const centers = markers.map((m) => m.props.center);
      expect(centers).toContainEqual([44.38, -79.69]);
      expect(centers).toContainEqual([44.39, -79.68]);
      markers.forEach((m) => {
        expect(m.props.radius).toBe(7);
        expect(m.props.interactive).toBe(false);
        expect(m.props.pathOptions.fillColor).toBe('#ffffff');
        expect(m.props.pathOptions.color).toBe('#f97316');
        expect(m.props.pathOptions.weight).toBe(3);
      });
    });

    test('no markers when entryPoint/exitPoint are null', () => {
      const inst = renderComponent(DetourOverlayWeb, {
        ...OVERLAY_ACTIVE,
        entryPoint: null,
        exitPoint: null,
      });
      const markers = inst.root.findAllByType(MockCircleMarker);
      expect(markers).toHaveLength(0);
    });
  });
});
