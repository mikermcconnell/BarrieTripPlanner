const { createDetourV2Detector } = require('../detourV2/detector');

const shapes = new Map();
shapes.set('shape-1', [
  { latitude: 44.39, longitude: -79.700 },
  { latitude: 44.39, longitude: -79.698 },
  { latitude: 44.39, longitude: -79.696 },
  { latitude: 44.39, longitude: -79.694 },
  { latitude: 44.39, longitude: -79.692 },
  { latitude: 44.39, longitude: -79.690 },
  { latitude: 44.39, longitude: -79.688 },
  { latitude: 44.39, longitude: -79.686 },
  { latitude: 44.39, longitude: -79.684 },
  { latitude: 44.39, longitude: -79.682 },
  { latitude: 44.39, longitude: -79.680 },
]);

const routeShapeMapping = new Map([
  ['8A', ['shape-1']],
  ['8B', ['shape-1']],
]);

const route12EntryPoint = { latitude: 44.33658333333333, longitude: -79.66955555555555 };
const route12ExitPoint = { latitude: 44.33325, longitude: -79.67405555555556 };
const route12Shapes = new Map(shapes);
route12Shapes.set('shape-12', [
  { latitude: 44.3406, longitude: -79.6631 },
  route12EntryPoint,
  { latitude: 44.3351, longitude: -79.6716 },
  route12ExitPoint,
  { latitude: 44.3320, longitude: -79.6786 },
]);
const route12ShapeMapping = new Map(routeShapeMapping);
route12ShapeMapping.set('12A', ['shape-12']);
route12ShapeMapping.set('12B', ['shape-12']);

function vehicle(overrides = {}) {
  return {
    id: 'bus-1',
    routeId: '8A',
    tripId: 'trip-1',
    coordinate: { latitude: 44.395, longitude: -79.690 },
    timestampMs: Date.parse('2026-05-31T10:00:00Z'),
    ...overrides,
  };
}

describe('Auto Detour V2 detector', () => {
  test('publishes only after two same-route signatures and three matching pings', () => {
    const detector = createDetourV2Detector();

    expect(detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
    ], shapes, routeShapeMapping)).toEqual({});

    expect(detector.processVehicles([
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
    ], shapes, routeShapeMapping)).toEqual({});

    const result = detector.processVehicles([
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    expect(Object.keys(result)).toEqual(['8A']);
    expect(result['8A']).toEqual(expect.objectContaining({
      routeId: '8A',
      detourVersion: 'v2',
      confidence: 'medium',
      vehicleCount: 2,
      uniqueVehicleCount: 2,
      riderVisible: true,
      canShowDetourPath: true,
    }));
    expect(result['8A'].geometry).toEqual(expect.objectContaining({
      shapeId: 'shape-1',
      confidence: 'medium',
      canShowDetourPath: true,
      skippedSegmentPolyline: expect.any(Array),
      inferredDetourPolyline: expect.any(Array),
      entryPoint: expect.any(Object),
      exitPoint: expect.any(Object),
      lastEvidenceAt: 3000,
    }));
    expect(result['8A'].geometry.inferredDetourPolyline).toHaveLength(3);
  });

  test('uses one coherent recent corridor instead of stitching old repeated detour evidence', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({
        id: 'bus-old',
        tripId: 'trip-old',
        coordinate: { latitude: 44.395, longitude: -79.700 },
        timestampMs: 1000,
      }),
    ], shapes, routeShapeMapping);

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-1',
        tripId: 'trip-current-1',
        coordinate: { latitude: 44.395, longitude: -79.684 },
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-2',
        tripId: 'trip-current-2',
        coordinate: { latitude: 44.395, longitude: -79.682 },
        timestampMs: 3000,
      }),
      vehicle({
        id: 'bus-2',
        tripId: 'trip-current-2',
        coordinate: { latitude: 44.395, longitude: -79.680 },
        timestampMs: 4000,
      }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      riderVisible: true,
      canShowDetourPath: true,
    }));
    expect(result['8A'].geometry.inferredDetourPolyline).toHaveLength(3);
    expect(result['8A'].geometry.inferredDetourPolyline[0].longitude).toBeCloseTo(-79.684, 3);
    expect(result['8A'].geometry.inferredDetourPolyline[2].longitude).toBeCloseTo(-79.680, 3);
    expect(result['8A'].geometry.entryPoint.longitude).toBeGreaterThan(-79.686);
    expect(result['8A'].detourZone.startProgressMeters).toBeGreaterThan(1000);
  });

  test('clamps 12A and 12B geometry to the known Saunders-Welham corridor', () => {
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-old',
        routeId: '12B',
        tripId: 'trip-old',
        coordinate: { latitude: 44.3416, longitude: -79.6631 },
        timestampMs: 1000,
      }),
      vehicle({
        id: 'bus-1',
        routeId: '12B',
        tripId: 'trip-current-1',
        coordinate: { latitude: 44.3342, longitude: -79.6741 },
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-2',
        routeId: '12B',
        tripId: 'trip-current-2',
        coordinate: { latitude: 44.3364, longitude: -79.6716 },
        timestampMs: 3000,
      }),
      vehicle({
        id: 'bus-2',
        routeId: '12B',
        tripId: 'trip-current-2',
        coordinate: { latitude: 44.3376, longitude: -79.6696 },
        timestampMs: 4000,
      }),
      vehicle({
        id: 'bus-extra',
        routeId: '12B',
        tripId: 'trip-extra',
        coordinate: { latitude: 44.3330, longitude: -79.6786 },
        timestampMs: 5000,
      }),
    ], route12Shapes, route12ShapeMapping);

    const geometry = result['12B'].geometry;
    expect(result['12B']).toEqual(expect.objectContaining({
      riderVisible: true,
      canShowDetourPath: true,
    }));
    expect(geometry.entryPoint).toEqual({
      latitude: route12ExitPoint.latitude,
      longitude: route12ExitPoint.longitude,
    });
    expect(geometry.exitPoint).toEqual({
      latitude: route12EntryPoint.latitude,
      longitude: route12EntryPoint.longitude,
    });
    expect(geometry.gpsSupersedesPreviousPath).toBe(true);
    expect(geometry.segments[0].gpsSupersedesPreviousPath).toBe(true);
    expect(geometry.inferredDetourPolyline).toHaveLength(3);
    expect(geometry.inferredDetourPolyline[0]).toEqual({
      latitude: route12ExitPoint.latitude,
      longitude: route12ExitPoint.longitude,
    });
    expect(geometry.inferredDetourPolyline[2]).toEqual({
      latitude: route12EntryPoint.latitude,
      longitude: route12EntryPoint.longitude,
    });
  });

  test('does not count duplicate vehicle snapshots as new evidence', () => {
    const detector = createDetourV2Detector();
    const duplicate = vehicle({
      id: 'bus-1',
      tripId: 'trip-1',
      coordinate: { latitude: 44.395, longitude: -79.690 },
      timestampMs: 1000,
    });

    detector.processVehicles([duplicate], shapes, routeShapeMapping);
    detector.processVehicles([duplicate], shapes, routeShapeMapping);
    detector.processVehicles([
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
    ], shapes, routeShapeMapping);

    expect(detector.getState().candidateEvidence['8A']).toEqual(expect.objectContaining({
      pointCount: 2,
      uniqueSignatureCount: 2,
    }));
    expect(detector.getState().detours).toEqual({});
  });

  test('keeps one vehicle backend-only and not rider-visible', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
    ], shapes, routeShapeMapping);
    detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
    ], shapes, routeShapeMapping);
    const result = detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    expect(result).toEqual({});
    expect(detector.getState().candidateEvidence['8A']).toEqual(expect.objectContaining({
      pointCount: 3,
      uniqueSignatureCount: 1,
    }));
  });

  test('does not mix sibling route evidence', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-1', routeId: '8A', tripId: '8a-trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', routeId: '8B', tripId: '8b-trip-1', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-3', routeId: '8B', tripId: '8b-trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    expect(detector.getState().detours).toEqual({});
    expect(detector.getState().candidateEvidence['8A'].pointCount).toBe(1);
    expect(detector.getState().candidateEvidence['8B'].pointCount).toBe(2);
  });

  test('blocks detection when route baseline geometry is unsafe', () => {
    const detector = createDetourV2Detector();
    const unsafeShapes = new Map([['bad-shape', [{ latitude: 44.39, longitude: -79.70 }]]]);
    const unsafeMapping = new Map([['8A', ['bad-shape']]]);

    const result = detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', timestampMs: 3000 }),
    ], unsafeShapes, unsafeMapping);

    expect(result).toEqual({});
    expect(detector.getState().candidateEvidence).toEqual({});
  });

  test('keeps confirmed geometryless output hidden from riders', () => {
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      routeId: '8A',
      riderVisible: false,
      riderVisibilityReason: 'insufficient-geometry',
      canShowDetourPath: false,
    }));
    expect(result['8A'].geometry).toEqual(expect.objectContaining({
      skippedSegmentPolyline: null,
      inferredDetourPolyline: null,
      canShowDetourPath: false,
    }));
  });

  test('enriches confirmed V2 geometry with route-scoped stop impacts', () => {
    const detector = createDetourV2Detector();
    const stopImpactData = {
      routeStopSequencesMapping: {
        '8A': {
          'shape-1': ['before', 'inside', 'after'],
        },
      },
      stopsById: new Map([
        ['before', { id: 'before', code: '100', latitude: 44.39, longitude: -79.698 }],
        ['inside', { id: 'inside', code: '101', latitude: 44.39, longitude: -79.690 }],
        ['after', { id: 'after', code: '102', latitude: 44.39, longitude: -79.682 }],
      ]),
    };

    const result = detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping, null, stopImpactData);

    expect(result['8A'].geometry).toEqual(expect.objectContaining({
      affectedStopIds: ['before', 'inside', 'after'],
      skippedStopIds: ['inside'],
      entryStopId: 'before',
      exitStopId: 'after',
    }));
    expect(result['8A'].geometry.segments[0]).toEqual(expect.objectContaining({
      affectedStopIds: ['before', 'inside', 'after'],
      skippedStopIds: ['inside'],
      entryStopId: 'before',
      exitStopId: 'after',
    }));
  });

  test('upgrades a confirmed hidden detour when later evidence produces safe geometry', () => {
    const detector = createDetourV2Detector();

    let result = detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      riderVisible: false,
      canShowDetourPath: false,
    }));

    result = detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 5000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      riderVisible: true,
      canShowDetourPath: true,
      riderVisibilityReason: 'v2-confirmed',
    }));
    expect(result['8A'].geometry).toEqual(expect.objectContaining({
      canShowDetourPath: true,
      inferredDetourPolyline: expect.any(Array),
      skippedSegmentPolyline: expect.any(Array),
    }));
  });

  test('requires affected-span traversal before clearing', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
    ], shapes, routeShapeMapping);
    detector.processVehicles([
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
    ], shapes, routeShapeMapping);
    detector.processVehicles([
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    let result = detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.690 }, timestampMs: 4000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A'].state).toBe('active');

    result = detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.698 }, timestampMs: 5000 }),
    ], shapes, routeShapeMapping);
    result = detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.682 }, timestampMs: 6000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
      riderVisible: true,
    }));

    result = detector.processVehicles([], shapes, routeShapeMapping);
    expect(result).toEqual({});
    expect(detector.getState().detours).toEqual({});
  });

  test('does not clear from one bus rolling into a different loop-route trip', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-before-rollover', coordinate: { latitude: 44.39, longitude: -79.698 }, timestampMs: 4000 }),
    ], shapes, routeShapeMapping);
    const result = detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-after-rollover', coordinate: { latitude: 44.39, longitude: -79.682 }, timestampMs: 5000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({ state: 'active' }));
    expect(result['8A']).not.toHaveProperty('clearReason');
  });
});
