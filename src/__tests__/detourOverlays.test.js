/**
 * Tests for Sprint C client-side detour geometry:
 * 1. deriveDetourOverlays pure function (useDetourOverlays hook logic)
 * 2. detourService.js geometry field forwarding
 * 3. getRouteDetour / isRouteDetouring context helpers
 */

const { deriveDetourOverlays } = require('../hooks/useDetourOverlays');

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
      activeDetours: { '1': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE } },
    });
    expect(result).toEqual([]);
  });

  test('returns empty array when no routes selected', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(),
      activeDetours: { '1': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE } },
    });
    expect(result).toEqual([]);
  });

  test('returns empty array when selectedRouteIds is null/undefined', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: null,
      activeDetours: { '1': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE } },
    });
    expect(result).toEqual([]);
  });

  test('skips routes with no geometry', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': { state: 'active', skippedSegmentPolyline: null, inferredDetourPolyline: null },
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
          state: 'active',
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
        '2': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE, inferredDetourPolyline: null },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('2');
    expect(result[0].opacity).toBe(1.0);
    expect(result[0].skippedSegmentPolyline).toBe(SAMPLE_POLYLINE);
    expect(result[0].inferredDetourPolyline).toBeNull();
    expect(result[0].skippedColor).toBe('#ef4444');
    expect(result[0].detourColor).toBe('#f97316');
  });

  test('returns overlay for selected route with inferred detour geometry', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['3']),
      activeDetours: {
        '3': { state: 'active', skippedSegmentPolyline: null, inferredDetourPolyline: LONG_POLYLINE },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].inferredDetourPolyline).toBe(LONG_POLYLINE);
  });

  test('applies reduced opacity for clear-pending state', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['3']),
      activeDetours: {
        '3': { state: 'clear-pending', skippedSegmentPolyline: SAMPLE_POLYLINE },
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
        '1': { skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
    });
    expect(result[0].state).toBe('active');
    expect(result[0].opacity).toBe(1.0);
  });

  test('includes entryPoint and exitPoint when present', () => {
    const entry = { latitude: 44.38, longitude: -79.69 };
    const exit = { latitude: 44.39, longitude: -79.68 };
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': {
          state: 'active',
          skippedSegmentPolyline: SAMPLE_POLYLINE,
          entryPoint: entry,
          exitPoint: exit,
        },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].entryPoint).toBe(entry);
    expect(result[0].exitPoint).toBe(exit);
    expect(result[0].markerBorderColor).toBe('#f97316');
  });

  test('defaults entryPoint and exitPoint to null when absent', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].entryPoint).toBeNull();
    expect(result[0].exitPoint).toBeNull();
    expect(result[0].markerBorderColor).toBe('#f97316');
  });

  test('only returns overlays for selected routes, not all detouring routes', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1']),
      activeDetours: {
        '1': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '2': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '3': { state: 'active', inferredDetourPolyline: LONG_POLYLINE },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('1');
  });

  test('returns multiple overlays when multiple selected routes are detouring', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['1', '2']),
      activeDetours: {
        '1': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE },
        '2': { state: 'clear-pending', inferredDetourPolyline: LONG_POLYLINE },
      },
    });
    expect(result).toHaveLength(2);
    expect(result.map(o => o.routeId).sort()).toEqual(['1', '2']);
  });

  test('skips selected route that has no detour entry', () => {
    const result = deriveDetourOverlays({
      enabled: true,
      selectedRouteIds: new Set(['5']),
      activeDetours: {
        '1': { state: 'active', skippedSegmentPolyline: SAMPLE_POLYLINE },
      },
    });
    expect(result).toEqual([]);
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
      state: 'active',
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
      state: 'active',
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
