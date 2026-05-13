/**
 * Tests for Sprint C client-side detour geometry:
 * 1. deriveDetourOverlays pure function (useDetourOverlays hook logic)
 * 2. detourService.js geometry field forwarding
 * 3. getRouteDetour / isRouteDetouring context helpers
 */

const { deriveDetourOverlays, getDetourOverlayRouteIds } = require('../hooks/useDetourOverlays');

const SAMPLE_POLYLINE = [
  { latitude: 44.38, longitude: -79.69 },
  { latitude: 44.39, longitude: -79.68 },
];

const LONG_POLYLINE = [
  { latitude: 44.38, longitude: -79.69 },
  { latitude: 44.385, longitude: -79.685 },
  { latitude: 44.39, longitude: -79.68 },
];

// ────────────────────────────────────────────────────
// 1. deriveDetourOverlays
// ────────────────────────────────────────────────────
describe('deriveDetourOverlays', () => {
  test('returns empty array when disabled', () => {
    const result = deriveDetourOverlays({
      enabled: false,
      selectedRouteIds: new Set(['1']),
      activeDetours: { '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE } },
    });
    expect(result).toEqual([]);
  });

  test('returns all active detours when no routes selected (empty Set)', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(),
      activeDetours: { '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('1');
  });

  test('returns all active detours when selectedRouteIds is null', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: null,
      activeDetours: { '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('1');
  });

  test('shows closed stop markers for every overlay in the general detour view without showing all route stops', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(),
      showAllClosedStopMarkers: true,
      activeDetours: {
        '12A': { state: 'active', confidence: 'medium', vehicleCount: 2, skippedSegmentPolyline: SAMPLE_POLYLINE },
        '8A': { state: 'active', confidence: 'high', skippedSegmentPolyline: LONG_POLYLINE },
      },
      detourStopDetailsByRouteId: {
        '12A': {
          routeStops: [{ id: '12-open', latitude: 44.38, longitude: -79.69 }],
          segmentStopDetails: [{
            skippedSegmentPolyline: SAMPLE_POLYLINE,
            skippedStops: [{ id: '12-closed', code: '1201', latitude: 44.39, longitude: -79.68 }],
          }],
        },
        '8A': {
          routeStops: [{ id: '8-open', latitude: 44.381, longitude: -79.691 }],
          segmentStopDetails: [{
            skippedSegmentPolyline: LONG_POLYLINE,
            skippedStops: [{ id: '8-closed', code: '8001', latitude: 44.385, longitude: -79.685 }],
          }],
        },
      },
    });

    expect(result).toHaveLength(2);
    expect(result.every((overlay) => overlay.showClosedStopMarkers)).toBe(true);
    expect(result.every((overlay) => overlay.showStopMarkers)).toBe(false);
  });

  test('does not render low-confidence detours', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(),
      activeDetours: {
        '8A': {
          state: 'active', confidence: 'high',
          confidence: 'low',
          skippedSegmentPolyline: SAMPLE_POLYLINE,
        },
      },
    });

    expect(result).toEqual([]);
  });

  test('renders low-confidence inferred geometry in validation mode', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['100']),
      showLowConfidenceGeometry: true,
      activeDetours: {
        '100': {
          routeId: '100',
          state: 'active',
          confidence: 'low',
          vehicleCount: 1,
          canShowDetourPath: false,
          entryPoint: LONG_POLYLINE[0],
          exitPoint: LONG_POLYLINE[LONG_POLYLINE.length - 1],
          skippedSegmentPolyline: null,
          inferredDetourPolyline: LONG_POLYLINE,
          likelyDetourPolyline: null,
          segments: [{
            canShowDetourPath: false,
            entryPoint: LONG_POLYLINE[0],
            exitPoint: LONG_POLYLINE[LONG_POLYLINE.length - 1],
            skippedSegmentPolyline: null,
            inferredDetourPolyline: LONG_POLYLINE,
            likelyDetourPolyline: null,
          }],
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('100');
    expect(result[0].inferredDetourPolyline).toBe(LONG_POLYLINE);
    expect(result[0].segmentStopDetails[0].inferredDetourPolyline).toBe(LONG_POLYLINE);
  });

  test('does not render low-confidence preview geometry when endpoints do not match entry and exit anchors', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['100']),
      showLowConfidenceGeometry: true,
      activeDetours: {
        '100': {
          routeId: '100',
          state: 'active',
          confidence: 'low',
          vehicleCount: 1,
          canShowDetourPath: false,
          entryPoint: LONG_POLYLINE[0],
          exitPoint: {
            latitude: LONG_POLYLINE[0].latitude + 0.001,
            longitude: LONG_POLYLINE[0].longitude + 0.001,
          },
          skippedSegmentPolyline: null,
          inferredDetourPolyline: LONG_POLYLINE,
          likelyDetourPolyline: null,
          segments: [{
            canShowDetourPath: false,
            entryPoint: LONG_POLYLINE[0],
            exitPoint: {
              latitude: LONG_POLYLINE[0].latitude + 0.001,
              longitude: LONG_POLYLINE[0].longitude + 0.001,
            },
            skippedSegmentPolyline: null,
            inferredDetourPolyline: LONG_POLYLINE,
            likelyDetourPolyline: null,
          }],
        },
      },
    });

    expect(result).toEqual([]);
  });

  test('renders medium and high confidence detours', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(),
      activeDetours: {
        '8A': {
          state: 'active', confidence: 'high',
          confidence: 'medium',
          vehicleCount: 2,
          skippedSegmentPolyline: SAMPLE_POLYLINE,
        },
        '8B': {
          state: 'active', confidence: 'high',
          confidence: 'high',
          skippedSegmentPolyline: SAMPLE_POLYLINE,
        },
      },
    });

    expect(result.map((overlay) => overlay.routeId).sort()).toEqual(['8A', '8B']);
  });

  test('skips routes with no geometry', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: null, inferredDetourPolyline: null },
      },
    });
    expect(result).toEqual([]);
  });

  test('skips routes with only a single-point polyline', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': {
          state: 'active', confidence: 'high',
          skippedSegmentPolyline: [{ latitude: 44.38, longitude: -79.69 }],
          inferredDetourPolyline: null,
        },
      },
    });
    expect(result).toEqual([]);
  });

  test('returns overlay for selected route with skipped segment geometry', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['2']),
      activeDetours: {
        '2': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE, inferredDetourPolyline: null },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('2');
    expect(result[0].opacity).toBe(0.95);
    expect(result[0].skippedSegmentPolyline).toBe(SAMPLE_POLYLINE);
    expect(result[0].inferredDetourPolyline).toBeNull();
    expect(result[0].skippedColor).toBe('#DE350B');
    expect(result[0].detourColor).toBe('#0C8CE5');
    expect(result[0].routeBaseColor).toBe('#0C8CE5');
    expect(result[0].routeStopFillColor).toBe('#ffffff');
    expect(result[0].routeStopStrokeColor).toBe('#111827');
    expect(result[0].showCallouts).toBe(true);
    expect(result[0].showStopMarkers).toBe(true);
  });

  test('does not draw raw inferred detour geometry without a road-matched likely path or closed segment', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['3']),
      activeDetours: {
        '3': { state: 'active', confidence: 'high', skippedSegmentPolyline: null, inferredDetourPolyline: LONG_POLYLINE },
      },
    });
    expect(result).toHaveLength(0);
  });

  test('does not draw raw inferred detour geometry as the rider detour path', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['5']),
      showLowConfidenceGeometry: true,
      activeDetours: {
        '5': {
          state: 'active',
          confidence: 'high',
          vehicleCount: 2,
          canShowDetourPath: true,
          skippedSegmentPolyline: SAMPLE_POLYLINE,
          inferredDetourPolyline: LONG_POLYLINE,
          likelyDetourPolyline: null,
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('5');
    expect(result[0].inferredDetourPolyline).toBeNull();
    expect(result[0].likelyDetourPolyline).toBeNull();
    expect(result[0].skippedSegmentPolyline).toBe(SAMPLE_POLYLINE);
  });

  test('uses likely detour geometry ahead of raw inferred geometry', () => {
    const likelyPolyline = [
      { latitude: 44.381, longitude: -79.691 },
      { latitude: 44.386, longitude: -79.686 },
      { latitude: 44.391, longitude: -79.681 },
    ];
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['10']),
      activeDetours: {
        '10': {
          state: 'active', confidence: 'high',
          skippedSegmentPolyline: SAMPLE_POLYLINE,
          inferredDetourPolyline: LONG_POLYLINE,
          likelyDetourPolyline: likelyPolyline,
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].inferredDetourPolyline).toBe(likelyPolyline);
    expect(result[0].likelyDetourPolyline).toBe(likelyPolyline);
  });

  test('applies reduced opacity for clear-pending state', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['3']),
      activeDetours: {
        '3': { state: 'clear-pending', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].opacity).toBe(0.45);
    expect(result[0].state).toBe('clear-pending');
  });

  test('defaults state to active when missing', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': { confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
    });
    expect(result[0].state).toBe('active');
    expect(result[0].opacity).toBe(0.95);
  });

  test('includes entryPoint and exitPoint when present', () => {
    const entry = { latitude: 44.38, longitude: -79.69 };
    const exit = { latitude: 44.39, longitude: -79.68 };
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': {
          state: 'active', confidence: 'high',
          skippedSegmentPolyline: SAMPLE_POLYLINE,
          entryPoint: entry,
          exitPoint: exit,
        },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].entryPoint).toBe(entry);
    expect(result[0].exitPoint).toBe(exit);
    expect(result[0].routeBaseColor).toBe('#0C8CE5');
  });

  test('defaults entryPoint and exitPoint to null when absent', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].entryPoint).toBeNull();
    expect(result[0].exitPoint).toBeNull();
    expect(result[0].routeBaseColor).toBe('#0C8CE5');
  });

  test('uses the route color for the rerouted corridor and route context', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['2']),
      activeDetours: {
        '2': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE, inferredDetourPolyline: LONG_POLYLINE },
      },
      routeColorByRouteId: {
        '2': '#F48FB1',
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].detourColor).toBe('#F48FB1');
    expect(result[0].routeBaseColor).toBe('#F48FB1');
  });

  test('only returns overlays for selected routes, not all detouring routes', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '2': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '3': { state: 'active', confidence: 'high', likelyDetourPolyline: LONG_POLYLINE },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('1');
  });

  test('shows active variant detours when a base route is selected in regular route mode', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['8']),
      activeDetours: {
        '8A': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '8B': { state: 'active', confidence: 'high', skippedSegmentPolyline: LONG_POLYLINE },
        '10': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
    });

    expect(result.map((overlay) => overlay.routeId).sort()).toEqual(['8A', '8B']);
  });

  test('uses one shared route-family line label for active branch detours', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['8']),
      activeDetours: {
        '8A': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '8B': { state: 'active', confidence: 'high', skippedSegmentPolyline: LONG_POLYLINE },
      },
    });

    const labels = result.map((overlay) => ({
      routeId: overlay.routeId,
      label: overlay.routeLineLabel,
      show: overlay.showLineLabels,
    })).sort((a, b) => a.routeId.localeCompare(b.routeId));

    expect(labels).toEqual([
      { routeId: '8A', label: '8A/8B', show: true },
      { routeId: '8B', label: '8A/8B', show: true },
    ]);
  });

  test('uses one forward arrow set per branch when a route-family detour has distinct direction paths', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['12']),
      activeDetours: {
        '12A': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: SAMPLE_POLYLINE },
        '12B': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: LONG_POLYLINE },
      },
    });

    const arrowModes = result.map((overlay) => ({
      routeId: overlay.routeId,
      directionArrowMode: overlay.directionArrowMode,
    })).sort((a, b) => a.routeId.localeCompare(b.routeId));

    expect(arrowModes).toEqual([
      { routeId: '12A', directionArrowMode: 'forward' },
      { routeId: '12B', directionArrowMode: 'forward' },
    ]);
  });

  test('collapses shared branch detour paths to one bidirectional overlay', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['12']),
      activeDetours: {
        '12A': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: SAMPLE_POLYLINE },
        '12B': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: SAMPLE_POLYLINE },
      },
    });

    const arrowModes = result.map((overlay) => ({
      routeId: overlay.routeId,
      directionArrowMode: overlay.directionArrowMode,
    })).sort((a, b) => a.routeId.localeCompare(b.routeId));

    expect(arrowModes).toEqual([
      { routeId: '12A', directionArrowMode: 'both' },
    ]);
  });

  test('assigns separate detour lanes for distinct family paths', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['12']),
      activeDetours: {
        '12A': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: SAMPLE_POLYLINE },
        '12B': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: LONG_POLYLINE },
      },
    });

    const offsets = result
      .map((overlay) => ({
        routeId: overlay.routeId,
        detourLaneOffsetMeters: overlay.detourLaneOffsetMeters,
        detourArrowPositionOffsetRatio: overlay.detourArrowPositionOffsetRatio,
      }))
      .sort((a, b) => a.routeId.localeCompare(b.routeId));

    expect(offsets).toEqual([
      { routeId: '12A', detourLaneOffsetMeters: -9, detourArrowPositionOffsetRatio: -0.0225 },
      { routeId: '12B', detourLaneOffsetMeters: 9, detourArrowPositionOffsetRatio: 0.0225 },
    ]);
  });

  test('keeps opposite-direction family detour lanes visually separated', () => {
    const westboundPath = [
      { latitude: 44.33425, longitude: -79.66897 },
      { latitude: 44.33922, longitude: -79.67001 },
      { latitude: 44.33651, longitude: -79.6785 },
      { latitude: 44.33229, longitude: -79.6773 },
    ];
    const eastboundPath = [
      { latitude: 44.33289, longitude: -79.67783 },
      { latitude: 44.33651, longitude: -79.6785 },
      { latitude: 44.33937, longitude: -79.66986 },
      { latitude: 44.3341, longitude: -79.66898 },
    ];
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['12']),
      activeDetours: {
        '12A': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: westboundPath },
        '12B': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: eastboundPath },
      },
    });

    const offsets = Object.fromEntries(result.map((overlay) => [
      overlay.routeId,
      overlay.detourLaneOffsetMeters,
    ]));

    expect(offsets['12A']).toBe(-9);
    expect(offsets['12B']).toBe(-9);
  });

  test('uses forward arrows for a single-route detour', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['12A']),
      activeDetours: {
        '12A': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: SAMPLE_POLYLINE },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].directionArrowMode).toBe('forward');
  });

  test('uses one forward arrow set when a route family has only one detoured branch', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['12']),
      activeDetours: {
        '12A': { state: 'active', confidence: 'medium', vehicleCount: 2, likelyDetourPolyline: SAMPLE_POLYLINE },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('12A');
    expect(result[0].directionArrowMode).toBe('forward');
  });

  test('returns multiple overlays when multiple selected routes are detouring', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1', '2']),
      activeDetours: {
        '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '2': { state: 'clear-pending', confidence: 'high', likelyDetourPolyline: LONG_POLYLINE },
      },
    });
    expect(result).toHaveLength(2);
    expect(result.map(o => o.routeId).sort()).toEqual(['1', '2']);
    expect(result.every((overlay) => overlay.showCallouts === false)).toBe(true);
    expect(result.every((overlay) => overlay.showStopMarkers === false)).toBe(true);
  });

  test('only shows callouts for the focused detour route', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      focusedRouteId: '2',
      selectedRouteIds: new Set(['1', '2']),
      activeDetours: {
        '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '2': { state: 'active', confidence: 'high', likelyDetourPolyline: LONG_POLYLINE },
      },
    });

    expect(result).toHaveLength(2);
    expect(result.find((overlay) => overlay.routeId === '2').showCallouts).toBe(true);
    expect(result.find((overlay) => overlay.routeId === '2').showStopMarkers).toBe(true);
    expect(result.find((overlay) => overlay.routeId === '1').showCallouts).toBe(false);
    expect(result.find((overlay) => overlay.routeId === '1').showStopMarkers).toBe(false);
    expect(result.find((overlay) => overlay.routeId === '1').opacity).toBe(0.24);
  });

  test('attaches detour stop details when provided', () => {
    const routeStops = [
      { id: 's1', latitude: 44.38, longitude: -79.69 },
      { id: 's2', latitude: 44.39, longitude: -79.68 },
    ];
    const skippedStops = [{ id: 's2', latitude: 44.39, longitude: -79.68 }];

    const result = deriveDetourOverlays({
      enabled: true,
      focusedRouteId: '8A',
      selectedRouteIds: new Set(['8A']),
      activeDetours: {
        '8A': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
      detourStopDetailsByRouteId: {
        '8A': {
          routeStops,
          skippedStops,
          entryStop: routeStops[0],
          exitStop: routeStops[1],
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].routeStops).toEqual(routeStops);
    expect(result[0].skippedStops).toEqual(skippedStops);
    expect(result[0].entryStop).toEqual(routeStops[0]);
    expect(result[0].exitStop).toEqual(routeStops[1]);
    expect(result[0].showStopMarkers).toBe(true);
  });

  test('keeps road-matched segment geometry after stop details are attached', () => {
    const rawInferredPolyline = [
      { latitude: 44.380, longitude: -79.690 },
      { latitude: 44.384, longitude: -79.686 },
      { latitude: 44.390, longitude: -79.680 },
    ];
    const roadMatchedPolyline = [
      { latitude: 44.380, longitude: -79.690 },
      { latitude: 44.380, longitude: -79.684 },
      { latitude: 44.390, longitude: -79.684 },
      { latitude: 44.390, longitude: -79.680 },
    ];

    const result = deriveDetourOverlays({
      enabled: true,
      focusedRouteId: '10',
      selectedRouteIds: new Set(['10']),
      activeDetours: {
        '10': {
          state: 'active', confidence: 'high',
          segments: [{
            shapeId: 'shape-10',
            skippedSegmentPolyline: SAMPLE_POLYLINE,
            inferredDetourPolyline: rawInferredPolyline,
            likelyDetourPolyline: roadMatchedPolyline,
            entryPoint: SAMPLE_POLYLINE[0],
            exitPoint: SAMPLE_POLYLINE[1],
          }],
        },
      },
      detourStopDetailsByRouteId: {
        '10': {
          routeStops: [],
          segmentStopDetails: [{
            shapeId: 'shape-10',
            skippedSegmentPolyline: SAMPLE_POLYLINE,
            inferredDetourPolyline: rawInferredPolyline,
            likelyDetourPolyline: roadMatchedPolyline,
            entryPoint: SAMPLE_POLYLINE[0],
            exitPoint: SAMPLE_POLYLINE[1],
            skippedStops: [],
          }],
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].segmentStopDetails[0].inferredDetourPolyline).toBe(roadMatchedPolyline);
    expect(result[0].segmentStopDetails[0].likelyDetourPolyline).toBe(roadMatchedPolyline);
  });

  test('preserves multiple geometry segments even before stop details are available', () => {
    const firstDetourPolyline = [
      { latitude: 44.38, longitude: -79.69 },
      { latitude: 44.38, longitude: -79.685 },
      { latitude: 44.39, longitude: -79.68 },
    ];

    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['8A']),
      activeDetours: {
        '8A': {
          state: 'active', confidence: 'high',
          segments: [
            {
              shapeId: 'shape-8a-1',
              skippedSegmentPolyline: SAMPLE_POLYLINE,
              inferredDetourPolyline: firstDetourPolyline,
              likelyDetourPolyline: firstDetourPolyline,
              entryPoint: SAMPLE_POLYLINE[0],
              exitPoint: SAMPLE_POLYLINE[1],
            },
            {
              shapeId: 'shape-8a-2',
              skippedSegmentPolyline: LONG_POLYLINE,
              inferredDetourPolyline: SAMPLE_POLYLINE,
              entryPoint: LONG_POLYLINE[0],
              exitPoint: LONG_POLYLINE[2],
            },
          ],
        },
      },
      detourStopDetailsByRouteId: {},
    });

    expect(result).toHaveLength(1);
    expect(result[0].segmentStopDetails).toHaveLength(2);
    expect(result[0].segmentStopDetails[0].shapeId).toBe('shape-8a-1');
    expect(result[0].segmentStopDetails[1].shapeId).toBe('shape-8a-2');
    expect(result[0].segmentStopDetails[0].inferredDetourPolyline).toBe(firstDetourPolyline);
    expect(result[0].segmentStopDetails[0].likelyDetourPolyline).toBe(firstDetourPolyline);
    expect(result[0].segmentStopDetails[1].skippedSegmentPolyline).toBe(LONG_POLYLINE);
    expect(result[0].segmentStopDetails[1].inferredDetourPolyline).toBeNull();
  });

  test('collapses noisy backend sub-segments when a clean top-level road-matched path exists', () => {
    const roadMatchedPolyline = [
      { latitude: 44.407, longitude: -79.685 },
      { latitude: 44.412, longitude: -79.700 },
      { latitude: 44.408, longitude: -79.712 },
    ];

    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['8A']),
      activeDetours: {
        '8A': {
          state: 'active', confidence: 'high',
          skippedSegmentPolyline: LONG_POLYLINE,
          likelyDetourPolyline: roadMatchedPolyline,
          entryPoint: LONG_POLYLINE[0],
          exitPoint: LONG_POLYLINE[2],
          segments: [
            {
              shapeId: 'shape-8a-weak-1',
              skippedSegmentPolyline: SAMPLE_POLYLINE,
              inferredDetourPolyline: SAMPLE_POLYLINE,
            },
            {
              shapeId: 'shape-8a-weak-2',
              skippedSegmentPolyline: LONG_POLYLINE,
              inferredDetourPolyline: SAMPLE_POLYLINE,
            },
          ],
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].segmentStopDetails).toHaveLength(1);
    expect(result[0].segmentStopDetails[0].skippedSegmentPolyline).toBe(LONG_POLYLINE);
    expect(result[0].segmentStopDetails[0].likelyDetourPolyline).toBe(roadMatchedPolyline);
  });

  test('trims shared route approach before drawing closed and detour paths', () => {
    const skippedSegmentPolyline = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.695 },
      { latitude: 44.390, longitude: -79.690 },
      { latitude: 44.390, longitude: -79.685 },
    ];
    const likelyDetourPolyline = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.695 },
      { latitude: 44.395, longitude: -79.691 },
      { latitude: 44.395, longitude: -79.685 },
    ];

    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['12A']),
      activeDetours: {
        '12A': {
          state: 'active',
          confidence: 'medium',
          vehicleCount: 2,
          skippedSegmentPolyline,
          likelyDetourPolyline,
          canShowDetourPath: true,
          segments: [{
            shapeId: 'shape-12a',
            skippedSegmentPolyline,
            likelyDetourPolyline,
            inferredDetourPolyline: likelyDetourPolyline,
            canShowDetourPath: true,
          }],
        },
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].inferredDetourPolyline[0].longitude).toBeCloseTo(-79.695, 3);
    expect(result[0].likelyDetourPolyline[0].longitude).toBeCloseTo(-79.695, 3);
    expect(result[0].skippedSegmentPolyline).not.toBeNull();
    expect(result[0].skippedSegmentPolyline[0].longitude).toBeCloseTo(-79.695, 3);
    expect(result[0].segmentStopDetails[0].skippedSegmentPolyline).not.toBeNull();
    expect(result[0].segmentStopDetails[0].skippedSegmentPolyline[0].longitude).toBeCloseTo(-79.695, 3);
  });

  test('skips selected route that has no detour entry', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['5']),
      activeDetours: {
        '1': { state: 'active', confidence: 'high', skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
    });
    expect(result).toEqual([]);
  });
});

describe('getDetourOverlayRouteIds', () => {
  test('only exposes routes with renderable detour overlays for map highlighting', () => {
    const result = getDetourOverlayRouteIds([
      { routeId: '12A', routeLineLabel: '12A/12B' },
      { routeId: '8A', routeLineLabel: '8A' },
    ]);

    expect(Array.from(result).sort()).toEqual(['12A', '12B', '8A']);
    expect(result.has('100')).toBe(false);
  });
});

// ────────────────────────────────────────────────────
// 2. detourService field forwarding
// ────────────────────────────────────────────────────
describe('detourService geometry field forwarding', () => {
  test('maps all geometry fields from Firestore data', () => {
    // Simulate the field mapping logic from detourService.js
    const data = {
      detectedAt: { toDate: () => new Date('2025-01-15T10:00:00Z') },
      lastSeenAt: { toDate: () => new Date('2025-01-15T10:05:00Z') },
      vehicleCount: 2,
      state: 'active', confidence: 'high',
      skippedSegmentPolyline: SAMPLE_POLYLINE,
      inferredDetourPolyline: LONG_POLYLINE,
      entryPoint: { latitude: 44.38, longitude: -79.69 },
      exitPoint: { latitude: 44.39, longitude: -79.68 },
      confidence: 'high',
      evidencePointCount: 12,
      lastEvidenceAt: 1705312200000,
    };

    // Replicate the exact mapping from detourService.js
    const mapped = {
      routeId: '8A',
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

    expect(mapped.state).toBe('active');
    expect(mapped.skippedSegmentPolyline).toBe(SAMPLE_POLYLINE);
    expect(mapped.inferredDetourPolyline).toBe(LONG_POLYLINE);
    expect(mapped.entryPoint).toEqual({ latitude: 44.38, longitude: -79.69 });
    expect(mapped.exitPoint).toEqual({ latitude: 44.39, longitude: -79.68 });
    expect(mapped.confidence).toBe('high');
    expect(mapped.evidencePointCount).toBe(12);
    expect(mapped.lastEvidenceAt).toBe(1705312200000);
    expect(mapped.detectedAt).toBe('2025-01-15T10:00:00.000Z');
    expect(mapped.vehicleCount).toBe(2);
  });

  test('defaults all geometry fields when absent in Firestore data', () => {
    const data = {
      detectedAt: null,
      lastSeenAt: null,
      vehicleCount: 1,
      // No geometry fields at all (pre-Sprint-B document)
    };

    const mapped = {
      routeId: '3',
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

    expect(mapped.state).toBe('active');
    expect(mapped.skippedSegmentPolyline).toBeNull();
    expect(mapped.inferredDetourPolyline).toBeNull();
    expect(mapped.entryPoint).toBeNull();
    expect(mapped.exitPoint).toBeNull();
    expect(mapped.confidence).toBeNull();
    expect(mapped.evidencePointCount).toBeNull();
    expect(mapped.lastEvidenceAt).toBeNull();
  });
});

// ────────────────────────────────────────────────────
// 3. getRouteDetour / isRouteDetouring behavior
// ────────────────────────────────────────────────────
describe('context helpers: getRouteDetour / isRouteDetouring', () => {
  // Test the pure logic — these replicate the useCallback bodies from TransitContext
  const activeDetours = {
    '8A': {
      routeId: '8A',
      state: 'active', confidence: 'high',
      skippedSegmentPolyline: SAMPLE_POLYLINE,
      vehicleCount: 2,
    },
    '3': {
      routeId: '3',
      state: 'clear-pending',
      inferredDetourPolyline: LONG_POLYLINE,
      vehicleCount: 1,
    },
  };

  const isRouteDetouring = (routeId) => Boolean(activeDetours[routeId]);
  const getRouteDetour = (routeId) => activeDetours[routeId] ?? null;

  test('isRouteDetouring returns true for active detour', () => {
    expect(isRouteDetouring('8A')).toBe(true);
  });

  test('isRouteDetouring returns true for clear-pending detour', () => {
    expect(isRouteDetouring('3')).toBe(true);
  });

  test('isRouteDetouring returns false for non-detouring route', () => {
    expect(isRouteDetouring('5')).toBe(false);
  });

  test('getRouteDetour returns full object for active detour', () => {
    const detour = getRouteDetour('8A');
    expect(detour).not.toBeNull();
    expect(detour.routeId).toBe('8A');
    expect(detour.state).toBe('active');
    expect(detour.skippedSegmentPolyline).toBe(SAMPLE_POLYLINE);
  });

  test('getRouteDetour returns full object for clear-pending detour', () => {
    const detour = getRouteDetour('3');
    expect(detour.state).toBe('clear-pending');
    expect(detour.inferredDetourPolyline).toBe(LONG_POLYLINE);
  });

  test('getRouteDetour returns null for non-detouring route', () => {
    expect(getRouteDetour('5')).toBeNull();
  });

  test('both helpers derive from the same activeDetours state', () => {
    // If isRouteDetouring says true, getRouteDetour must return non-null, and vice versa
    const routeIds = ['8A', '3', '5', '1', '100'];
    routeIds.forEach((id) => {
      const detouring = isRouteDetouring(id);
      const detour = getRouteDetour(id);
      if (detouring) {
        expect(detour).not.toBeNull();
      } else {
        expect(detour).toBeNull();
      }
    });
  });
});

// ────────────────────────────────────────────────────
// 4. all-routes view (no selection = show everything)
// ────────────────────────────────────────────────────
describe('all-routes view', () => {
  it('returns overlays for all active detours when no routes are selected', () => {
    const result = deriveDetourOverlays({
      selectedRouteIds: new Set(),
      activeDetours: {
        '8A': {
          state: 'active', confidence: 'high',
          skippedSegmentPolyline: [
            { latitude: 44.39, longitude: -79.70 },
            { latitude: 44.39, longitude: -79.69 },
          ],
          inferredDetourPolyline: [
            { latitude: 44.395, longitude: -79.70 },
            { latitude: 44.395, longitude: -79.69 },
          ],
          entryPoint: { latitude: 44.39, longitude: -79.70 },
          exitPoint: { latitude: 44.39, longitude: -79.69 },
        },
      },
      enabled: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('8A');
  });

  it('returns overlays for multiple detours when no routes selected', () => {
    const makeDetour = () => ({
      state: 'active', confidence: 'high',
      skippedSegmentPolyline: [
        { latitude: 44.39, longitude: -79.70 },
        { latitude: 44.39, longitude: -79.69 },
      ],
      inferredDetourPolyline: null,
      entryPoint: null,
      exitPoint: null,
    });
    const result = deriveDetourOverlays({
      selectedRouteIds: new Set(),
      activeDetours: { '8A': makeDetour(), '8B': makeDetour(), '2A': makeDetour() },
      enabled: true,
    });
    expect(result).toHaveLength(3);
  });
});
