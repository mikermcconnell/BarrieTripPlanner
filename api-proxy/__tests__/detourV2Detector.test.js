const { createDetourV2Detector } = require('../detourV2/detector');
const { projectOntoPolyline } = require('../detour/projection');
const { pointToPolylineDistance } = require('../geometry');

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
const route12DetectorConfig = {
  detourCorridors: {
    '12A': {
      entryPoint: route12EntryPoint,
      exitPoint: route12ExitPoint,
      label: 'Saunders-Welham',
    },
    '12B': {
      entryPoint: route12ExitPoint,
      exitPoint: route12EntryPoint,
      label: 'Saunders-Welham',
    },
  },
};

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

function route12CandidatePoint({
  id,
  tripId,
  coordinate,
  timestampMs,
}) {
  const projection = projectOntoPolyline(coordinate, route12Shapes.get('shape-12'));
  return {
    vehicleId: id,
    signature: tripId,
    coordinate,
    progressMeters: projection.progressMeters,
    projectedPoint: projection.projectedPoint,
    distanceMeters: projection.distanceMeters,
    timestampMs,
  };
}

function detoursForRoute(result, routeId) {
  return Object.values(result || {}).filter((detour) => detour.routeId === routeId);
}

function detourForRoute(result, routeId) {
  return detoursForRoute(result, routeId)[0] || null;
}

describe('Auto Detour V2 detector', () => {

  function buildRoute400SparseFixture() {
    const shapeId = 'route-400-shape';
    const shape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.698 },
      { latitude: 44.390, longitude: -79.696 },
      { latitude: 44.390, longitude: -79.694 },
      { latitude: 44.390, longitude: -79.692 },
    ];
    return {
      shapes: new Map([[shapeId, shape]]),
      mapping: new Map([['400', [shapeId]]]),
      offRouteAt: (longitude) => ({ latitude: 44.391, longitude }),
    };
  }

  test('hides sparse multi-day Route 400 detour when no current vehicle confirms it', () => {
    const fixture = buildRoute400SparseFixture();
    const detector = createDetourV2Detector();
    const oldMs = Date.parse('2026-06-05T12:00:00Z');
    const freshMs = Date.parse('2026-06-09T16:00:00Z');

    detector.processVehicles([
      vehicle({ id: 'route-400-old', routeId: '400', tripId: 'route-400-old-trip', coordinate: fixture.offRouteAt(-79.698), timestampMs: oldMs }),
      vehicle({ id: 'route-400-old', routeId: '400', tripId: 'route-400-old-trip', coordinate: fixture.offRouteAt(-79.697), timestampMs: oldMs + 60_000 }),
    ], fixture.shapes, fixture.mapping);

    const confirmed = detector.processVehicles([
      vehicle({ id: 'route-400-fresh', routeId: '400', tripId: 'route-400-fresh-trip', coordinate: fixture.offRouteAt(-79.696), timestampMs: freshMs }),
      vehicle({ id: 'route-400-fresh', routeId: '400', tripId: 'route-400-fresh-trip', coordinate: fixture.offRouteAt(-79.695), timestampMs: freshMs + 60_000 }),
      vehicle({ id: 'route-400-fresh', routeId: '400', tripId: 'route-400-fresh-trip', coordinate: fixture.offRouteAt(-79.694), timestampMs: freshMs + 120_000 }),
    ], fixture.shapes, fixture.mapping);
    expect(detourForRoute(confirmed, '400')).toEqual(expect.objectContaining({
      riderVisible: true,
      currentVehicleCount: 1,
    }));

    const noCurrentVehicle = detector.processVehicles([], fixture.shapes, fixture.mapping);
    const detour = detourForRoute(noCurrentVehicle, '400');

    expect(detour).toEqual(expect.objectContaining({
      state: 'active',
      riderVisible: false,
      riderVisibilityReason: 'stale-sparse-evidence',
      staleForReview: true,
      currentVehicleCount: 0,
      canShowDetourPath: false,
    }));
    expect(detour.geometry.canShowDetourPath).toBe(true);
  });

  test('keeps same-day Route 400 detour visible after current vehicle leaves the snapshot', () => {
    const fixture = buildRoute400SparseFixture();
    const detector = createDetourV2Detector();
    const firstMs = Date.parse('2026-06-09T12:00:00Z');
    const secondMs = Date.parse('2026-06-09T16:00:00Z');

    detector.processVehicles([
      vehicle({ id: 'route-400-same-day-a', routeId: '400', tripId: 'route-400-same-day-a-trip', coordinate: fixture.offRouteAt(-79.698), timestampMs: firstMs }),
      vehicle({ id: 'route-400-same-day-a', routeId: '400', tripId: 'route-400-same-day-a-trip', coordinate: fixture.offRouteAt(-79.697), timestampMs: firstMs + 60_000 }),
    ], fixture.shapes, fixture.mapping);
    detector.processVehicles([
      vehicle({ id: 'route-400-same-day-b', routeId: '400', tripId: 'route-400-same-day-b-trip', coordinate: fixture.offRouteAt(-79.696), timestampMs: secondMs }),
      vehicle({ id: 'route-400-same-day-b', routeId: '400', tripId: 'route-400-same-day-b-trip', coordinate: fixture.offRouteAt(-79.695), timestampMs: secondMs + 60_000 }),
      vehicle({ id: 'route-400-same-day-b', routeId: '400', tripId: 'route-400-same-day-b-trip', coordinate: fixture.offRouteAt(-79.694), timestampMs: secondMs + 120_000 }),
    ], fixture.shapes, fixture.mapping);

    const noCurrentVehicle = detector.processVehicles([], fixture.shapes, fixture.mapping);

    expect(detourForRoute(noCurrentVehicle, '400')).toEqual(expect.objectContaining({
      riderVisible: true,
      riderVisibilityReason: 'v2-confirmed',
      currentVehicleCount: 0,
      canShowDetourPath: true,
    }));
  });

  test('fast-clears tiny start-of-route detours from multi-vehicle normal samples through the source span', () => {
    const shapeId = 'tiny-start-shape';
    const shape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.697 },
      { latitude: 44.390, longitude: -79.694 },
      { latitude: 44.390, longitude: -79.691 },
      { latitude: 44.390, longitude: -79.688 },
    ];
    const testShapes = new Map([[shapeId, shape]]);
    const testMapping = new Map([['8A', [shapeId]]]);
    const progress = (index) => projectOntoPolyline(shape[index], shape).progressMeters;
    const clearWindow = {
      startProgressMeters: 0,
      endProgressMeters: 1000,
      sourceStartProgressMeters: progress(0),
      sourceEndProgressMeters: progress(1),
      minCoverageRatio: 0.95,
      shapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '8A:tiny-start-shape:0-100': {
          eventId: '8A:tiny-start-shape:0-100',
          routeId: '8A',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          eventWindow: {
            routeId: '8A',
            shapeId,
            coreStartProgressMeters: progress(0),
            coreEndProgressMeters: progress(1),
            frozen: true,
          },
          detourZone: {
            startProgressMeters: progress(0),
            endProgressMeters: progress(1),
            shapeId,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId,
            segments: [{
              state: 'active',
              shapeId,
              startProgressMeters: progress(0),
              endProgressMeters: progress(1),
              detourZone: {
                startProgressMeters: progress(0),
                endProgressMeters: progress(1),
                shapeId,
              },
              clearWindow,
            }],
          },
        },
      },
    });

    const firstTick = detector.processVehicles([
      vehicle({ id: 'bus-clear-a', routeId: '8A', tripId: 'trip-clear-a', coordinate: shape[0], timestampMs: 2000 }),
      vehicle({ id: 'bus-clear-b', routeId: '8A', tripId: 'trip-clear-b', coordinate: shape[1], timestampMs: 3000 }),
    ], testShapes, testMapping);

    expect(firstTick['8A:tiny-start-shape:0-100']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));

    const secondTick = detector.processVehicles([], testShapes, testMapping);
    expect(Object.keys(secondTick)).toEqual([]);
  });

  test('fast-clears tiny detours from restored clear tracks even without a new vehicle sample', () => {
    const shapeId = 'tiny-restored-shape';
    const clearWindow = {
      startProgressMeters: 0,
      endProgressMeters: 1000,
      sourceStartProgressMeters: 20,
      sourceEndProgressMeters: 170,
      minCoverageRatio: 0.95,
      shapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '8A:tiny-restored-shape:0-100': {
          eventId: '8A:tiny-restored-shape:0-100',
          routeId: '8A',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          eventWindow: {
            routeId: '8A',
            shapeId,
            coreStartProgressMeters: 20,
            coreEndProgressMeters: 170,
            frozen: true,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId,
            segments: [{ state: 'active', shapeId, clearWindow }],
          },
        },
      },
      clearTracksByEvent: {
        '8A:tiny-restored-shape:0-100': {
          'trip-clear-a': [{
            progressMeters: 95,
            timestampMs: 2000,
            shapeId,
            vehicleId: 'bus-clear-a',
          }],
          'trip-clear-b': [{
            progressMeters: 165,
            timestampMs: 3000,
            shapeId,
            vehicleId: 'bus-clear-b',
          }],
        },
      },
    });

    const firstTick = detector.processVehicles([], new Map([[shapeId, []]]), new Map([['8A', [shapeId]]]));

    expect(firstTick['8A:tiny-restored-shape:0-100']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));

    const secondTick = detector.processVehicles([], new Map([[shapeId, []]]), new Map([['8A', [shapeId]]]));
    expect(Object.keys(secondTick)).toEqual([]);
  });

  test('clears same-route detours when normal service uses an overlapping equivalent shape', () => {
    const activeShapeId = '8b-active-clear-shape';
    const equivalentShapeId = '8b-equivalent-trip-shape';
    const activeShape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.696 },
      { latitude: 44.390, longitude: -79.692 },
      { latitude: 44.390, longitude: -79.688 },
      { latitude: 44.390, longitude: -79.684 },
    ];
    const equivalentShape = [
      { latitude: 44.390, longitude: -79.696 },
      { latitude: 44.390, longitude: -79.692 },
      { latitude: 44.390, longitude: -79.688 },
    ];
    const testShapes = new Map([
      [activeShapeId, activeShape],
      [equivalentShapeId, equivalentShape],
    ]);
    const testMapping = new Map([['8B', [activeShapeId, equivalentShapeId]]]);
    const activeProgress = (index) => projectOntoPolyline(activeShape[index], activeShape).progressMeters;
    const sourceStartProgress = activeProgress(1) + 100;
    const sourceEndProgress = activeProgress(3) - 100;
    const clearWindow = {
      startProgressMeters: activeProgress(1),
      endProgressMeters: activeProgress(3),
      sourceStartProgressMeters: sourceStartProgress,
      sourceEndProgressMeters: sourceEndProgress,
      minCoverageRatio: 0.75,
      shapeId: activeShapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '8B:8b-active-clear-shape:700-1500': {
          eventId: '8B:8b-active-clear-shape:700-1500',
          routeId: '8B',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          eventWindow: {
            routeId: '8B',
            shapeId: activeShapeId,
            coreStartProgressMeters: sourceStartProgress,
            coreEndProgressMeters: sourceEndProgress,
            frozen: true,
          },
          detourZone: {
            startProgressMeters: sourceStartProgress,
            endProgressMeters: sourceEndProgress,
            shapeId: activeShapeId,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId: activeShapeId,
            segments: [{
              state: 'active',
              shapeId: activeShapeId,
              startProgressMeters: sourceStartProgress,
              endProgressMeters: sourceEndProgress,
              detourZone: {
                startProgressMeters: sourceStartProgress,
                endProgressMeters: sourceEndProgress,
                shapeId: activeShapeId,
              },
              clearWindow,
            }],
          },
        },
      },
    });

    const firstTick = detector.processVehicles([
      vehicle({
        id: 'bus-normal-equivalent',
        routeId: '8B',
        tripId: 'trip-normal-equivalent',
        tripShapeId: equivalentShapeId,
        coordinate: activeShape[1],
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-normal-equivalent',
        routeId: '8B',
        tripId: 'trip-normal-equivalent',
        tripShapeId: equivalentShapeId,
        coordinate: activeShape[2],
        timestampMs: 3000,
      }),
      vehicle({
        id: 'bus-normal-equivalent',
        routeId: '8B',
        tripId: 'trip-normal-equivalent',
        tripShapeId: equivalentShapeId,
        coordinate: activeShape[3],
        timestampMs: 4000,
      }),
    ], testShapes, testMapping);

    expect(firstTick['8B:8b-active-clear-shape:700-1500']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));
  });

  test('fast-clears hidden tiny start-route detours from downstream normal service after GPS drift', () => {
    const shapeId = 'tiny-start-drift-shape';
    const shape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.697 },
      { latitude: 44.390, longitude: -79.694 },
      { latitude: 44.390, longitude: -79.691 },
      { latitude: 44.390, longitude: -79.688 },
      { latitude: 44.390, longitude: -79.685 },
    ];
    const testShapes = new Map([[shapeId, shape]]);
    const testMapping = new Map([['12A', [shapeId]]]);
    const progress = (index) => projectOntoPolyline(shape[index], shape).progressMeters;
    const clearWindow = {
      startProgressMeters: 0,
      endProgressMeters: 1000,
      sourceStartProgressMeters: 25,
      sourceEndProgressMeters: 125,
      minCoverageRatio: 0.95,
      shapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '12A:tiny-start-drift-shape:0-200': {
          eventId: '12A:tiny-start-drift-shape:0-200',
          routeId: '12A',
          state: 'active',
          riderVisible: false,
          riderVisibilityReason: 'insufficient-geometry',
          staleForReview: true,
          canShowDetourPath: false,
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 3,
          uniqueVehicleCount: 3,
          currentVehicleCount: 0,
          eventWindow: {
            routeId: '12A',
            shapeId,
            coreStartProgressMeters: 25,
            coreEndProgressMeters: 125,
            clearStartProgressMeters: 0,
            clearEndProgressMeters: 525,
            frozen: true,
          },
          detourZone: {
            startProgressMeters: 25,
            endProgressMeters: 125,
            shapeId,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId,
            canShowDetourPath: false,
            segments: [{
              state: 'active',
              shapeId,
              startProgressMeters: 25,
              endProgressMeters: 125,
              detourZone: {
                startProgressMeters: 25,
                endProgressMeters: 125,
                shapeId,
              },
              clearWindow,
            }],
          },
        },
      },
    });

    const firstTick = detector.processVehicles([
      vehicle({
        id: 'bus-normal-after-drift',
        routeId: '12A',
        tripId: 'trip-normal-after-drift',
        coordinate: shape[2],
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-normal-after-drift',
        routeId: '12A',
        tripId: 'trip-normal-after-drift',
        coordinate: shape[4],
        timestampMs: 3000,
      }),
    ], testShapes, testMapping);

    expect(firstTick['12A:tiny-start-drift-shape:0-200']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));

    const secondTick = detector.processVehicles([], testShapes, testMapping);
    expect(Object.keys(secondTick)).toEqual([]);
  });

  test('keeps clear evidence when a same-window off-route point is only marginally over threshold', () => {
    const shapeId = 'marginal-clear-shape';
    const shape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.697 },
      { latitude: 44.390, longitude: -79.694 },
      { latitude: 44.390, longitude: -79.691 },
    ];
    const testShapes = new Map([[shapeId, shape]]);
    const testMapping = new Map([['8A', [shapeId]]]);
    const clearWindow = {
      startProgressMeters: 0,
      endProgressMeters: 1000,
      sourceStartProgressMeters: 0,
      sourceEndProgressMeters: 170,
      minCoverageRatio: 0.95,
      shapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '8A:marginal-clear-shape:0-100': {
          eventId: '8A:marginal-clear-shape:0-100',
          routeId: '8A',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId,
            segments: [{ state: 'active', shapeId, clearWindow }],
          },
        },
      },
      clearTracksByEvent: {
        '8A:marginal-clear-shape:0-100': {
          'trip-clear': [{
            progressMeters: 100,
            timestampMs: 2000,
            shapeId,
            vehicleId: 'bus-clear',
          }],
        },
      },
    });

    detector.processVehicles([
      vehicle({
        id: 'bus-noisy',
        routeId: '8A',
        tripId: 'trip-noisy',
        coordinate: { latitude: 44.39042, longitude: -79.6988 },
        timestampMs: 3000,
      }),
    ], testShapes, testMapping);

    const tracks = detector.serializeDetectorRuntimeState().clearTracksByEvent['8A:marginal-clear-shape:0-100'];
    expect(tracks['trip-clear']).toHaveLength(1);
  });

  test('does not activate tiny start-of-route hidden detours from only marginal off-route evidence', () => {
    const shapeId = 'marginal-start-shape';
    const shape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.699 },
      { latitude: 44.390, longitude: -79.698 },
      { latitude: 44.390, longitude: -79.697 },
    ];
    const testShapes = new Map([[shapeId, shape]]);
    const testMapping = new Map([['12A', [shapeId]]]);
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-marginal-a',
        routeId: '12A',
        tripId: 'trip-marginal-a',
        coordinate: { latitude: 44.39038, longitude: -79.700 },
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-marginal-a',
        routeId: '12A',
        tripId: 'trip-marginal-a',
        coordinate: { latitude: 44.39038, longitude: -79.6995 },
        timestampMs: 3000,
      }),
      vehicle({
        id: 'bus-marginal-b',
        routeId: '12A',
        tripId: 'trip-marginal-b',
        coordinate: { latitude: 44.39038, longitude: -79.699 },
        timestampMs: 4000,
      }),
    ], testShapes, testMapping);

    expect(detoursForRoute(result, '12A')).toEqual([]);
    expect(Object.keys(detector.serializeDetectorRuntimeState().eventCandidates)).toEqual([
      '12A:marginal-start-shape:0-100',
    ]);
  });

  test('keeps short no-skipped-stop GPS detours rider-visible when geometry is safe', () => {
    const shapeId = 'short-no-impact-shape';
    const shape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.699 },
      { latitude: 44.390, longitude: -79.698 },
      { latitude: 44.390, longitude: -79.697 },
    ];
    const testShapes = new Map([[shapeId, shape]]);
    const testMapping = new Map([['8A', [shapeId]]]);
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-short-a',
        routeId: '8A',
        tripId: 'trip-short-a',
        coordinate: { latitude: 44.391, longitude: -79.700 },
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-short-a',
        routeId: '8A',
        tripId: 'trip-short-a',
        coordinate: { latitude: 44.391, longitude: -79.6992 },
        timestampMs: 3000,
      }),
      vehicle({
        id: 'bus-short-b',
        routeId: '8A',
        tripId: 'trip-short-b',
        coordinate: { latitude: 44.391, longitude: -79.6985 },
        timestampMs: 4000,
      }),
    ], testShapes, testMapping);

    const detour = detourForRoute(result, '8A');
    const segment = detour.geometry.segments[0];

    expect(segment.canShowDetourPath).toBe(true);
    expect(segment.endProgressMeters - segment.startProgressMeters).toBeLessThan(200);
    expect(detour).toEqual(expect.objectContaining({
      riderVisible: true,
    }));
    expect(detour.riderVisibilityReason).not.toBe('short-no-rider-impact');
  });

  test('removes already-active tiny hidden detours that only have marginal start-of-route evidence', () => {
    const shapeId = 'marginal-restored-start-shape';
    const shape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.699 },
      { latitude: 44.390, longitude: -79.698 },
      { latitude: 44.390, longitude: -79.697 },
    ];
    const testShapes = new Map([[shapeId, shape]]);
    const testMapping = new Map([['12A', [shapeId]]]);
    const marginalPoints = [
      {
        vehicleId: 'bus-marginal-a',
        signature: 'trip-marginal-a',
        coordinate: { latitude: 44.39038, longitude: -79.700 },
        progressMeters: 0,
        distanceMeters: 42,
        shapeId,
        timestampMs: 2000,
      },
      {
        vehicleId: 'bus-marginal-a',
        signature: 'trip-marginal-a',
        coordinate: { latitude: 44.39038, longitude: -79.6995 },
        progressMeters: 40,
        distanceMeters: 43,
        shapeId,
        timestampMs: 3000,
      },
      {
        vehicleId: 'bus-marginal-b',
        signature: 'trip-marginal-b',
        coordinate: { latitude: 44.39038, longitude: -79.699 },
        progressMeters: 80,
        distanceMeters: 41,
        shapeId,
        timestampMs: 4000,
      },
    ];
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '12A:marginal-restored-start-shape:0-100': {
          eventId: '12A:marginal-restored-start-shape:0-100',
          routeId: '12A',
          state: 'active',
          riderVisible: false,
          riderVisibilityReason: 'insufficient-geometry',
          detectedAt: 2000,
          lastSeenAt: 4000,
          latestGpsEvidenceAt: 4000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          eventWindow: {
            routeId: '12A',
            shapeId,
            coreStartProgressMeters: 0,
            coreEndProgressMeters: 100,
            confirmStartProgressMeters: 0,
            confirmEndProgressMeters: 350,
            clearStartProgressMeters: 0,
            clearEndProgressMeters: 500,
          },
          clearWindow: {
            shapeId,
            startProgressMeters: 0,
            endProgressMeters: 300,
            sourceStartProgressMeters: 0,
            sourceEndProgressMeters: 100,
          },
          geometry: {
            shapeId,
            canShowDetourPath: false,
            segments: [{ state: 'active', shapeId }],
          },
        },
      },
      eventCandidates: {
        '12A:marginal-restored-start-shape:0-100': {
          eventId: '12A:marginal-restored-start-shape:0-100',
          routeId: '12A',
          shapeId,
          points: marginalPoints,
          eventWindow: {
            routeId: '12A',
            shapeId,
            coreStartProgressMeters: 0,
            coreEndProgressMeters: 100,
            confirmStartProgressMeters: 0,
            confirmEndProgressMeters: 350,
            clearStartProgressMeters: 0,
            clearEndProgressMeters: 500,
          },
        },
      },
    });

    const result = detector.processVehicles([], testShapes, testMapping);

    expect(detoursForRoute(result, '12A')).toEqual([]);
    expect(detector.serializeDetectorRuntimeState().activeEvents).toEqual({});
  });

  test('repairs restored event windows that are pinned to zero but have a later geometry window', () => {
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '8A:shape-1:0-100': {
          eventId: '8A:shape-1:0-100',
          routeId: '8A',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          eventWindow: {
            routeId: '8A',
            shapeId: 'old-shape',
            coreStartProgressMeters: 0,
            coreEndProgressMeters: 0,
            confirmStartProgressMeters: 0,
            confirmEndProgressMeters: 0,
            clearStartProgressMeters: 0,
            clearEndProgressMeters: 0,
            frozen: false,
          },
          detourZone: {
            shapeId: 'shape-1',
            startProgressMeters: 21800,
            endProgressMeters: 21900,
          },
          clearWindow: {
            shapeId: 'shape-1',
            sourceStartProgressMeters: 21800,
            sourceEndProgressMeters: 21900,
            startProgressMeters: 21400,
            endProgressMeters: 22300,
          },
          geometry: {
            shapeId: 'shape-1',
            segments: [{
              shapeId: 'shape-1',
              detourZone: {
                shapeId: 'shape-1',
                startProgressMeters: 21800,
                endProgressMeters: 21900,
              },
            }],
          },
        },
      },
    });

    const eventWindow = detector.serializeDetectorRuntimeState().activeEvents['8A:shape-1:0-100'].eventWindow;
    expect(eventWindow.shapeId).toBe('shape-1');
    expect(eventWindow.coreStartProgressMeters).toBeGreaterThan(21000);
  });

  test('drops superseded legacy route-keyed detours when event-window snapshots exist', () => {
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '8A': {
          eventId: '8A',
          routeId: '8A',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          eventWindow: null,
        },
        '8A:shape-1:0-100': {
          eventId: '8A:shape-1:0-100',
          routeId: '8A',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          eventWindow: {
            routeId: '8A',
            shapeId: 'shape-1',
            coreStartProgressMeters: 0,
            coreEndProgressMeters: 100,
          },
        },
      },
    });

    const state = detector.getState();
    expect(Object.keys(state.detours)).toEqual(['8A:shape-1:0-100']);
    expect(state.detours['8A']).toEqual(state.detours['8A:shape-1:0-100']);
  });

  test('drops route-keyed restored detours even after their event window is repaired', () => {
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeEvents: {
        '8A': {
          eventId: '8A',
          routeId: '8A',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          eventWindow: {
            routeId: '8A',
            shapeId: 'shape-1',
            coreStartProgressMeters: 10,
            coreEndProgressMeters: 90,
          },
        },
        '8A:shape-1:0-100': {
          eventId: '8A:shape-1:0-100',
          routeId: '8A',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          eventWindow: {
            routeId: '8A',
            shapeId: 'shape-1',
            coreStartProgressMeters: 0,
            coreEndProgressMeters: 100,
          },
        },
      },
    });

    expect(Object.keys(detector.serializeDetectorRuntimeState().activeEvents)).toEqual(['8A:shape-1:0-100']);
  });

  test('skips legacy Firestore snapshots when event-window snapshots exist for the same route', () => {
    const detector = createDetourV2Detector();
    const count = detector.hydrateActiveDetourSnapshots({
      '8A': {
        eventId: '8A',
        routeId: '8A',
        state: 'active',
        detectedAt: 1000,
        lastSeenAt: 1000,
        eventWindow: null,
      },
      '8A:shape-1:0-100': {
        eventId: '8A:shape-1:0-100',
        routeId: '8A',
        state: 'active',
        detectedAt: 1000,
        lastSeenAt: 1000,
        eventWindow: {
          routeId: '8A',
          shapeId: 'shape-1',
          coreStartProgressMeters: 0,
          coreEndProgressMeters: 100,
        },
      },
    });

    expect(count).toBe(1);
    expect(Object.keys(detector.getState().detours)).toEqual(['8A:shape-1:0-100']);
  });

  test('keeps far-apart same-route evidence as separate event candidates', () => {
    const longShapes = new Map([['long-shape', [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]]]);
    const longMapping = new Map([['10', ['long-shape']]]);
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-a1', routeId: '10', tripId: 'trip-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-b1', routeId: '10', tripId: 'trip-b1', coordinate: { latitude: 44.395, longitude: -79.708 }, timestampMs: 2000 }),
    ], longShapes, longMapping);

    expect(Object.keys(detector.serializeDetectorRuntimeState().eventCandidates || {})).toHaveLength(2);
  });

  test('publishes separate active events for two confirmed same-route detours', () => {
    const longShapes = new Map([['long-shape', [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]]]);
    const longMapping = new Map([['10', ['long-shape']]]);
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({ id: 'bus-a1', routeId: '10', tripId: 'trip-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.756 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.754 }, timestampMs: 3000 }),
      vehicle({ id: 'bus-b1', routeId: '10', tripId: 'trip-b1', coordinate: { latitude: 44.395, longitude: -79.708 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.706 }, timestampMs: 5000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.704 }, timestampMs: 6000 }),
    ], longShapes, longMapping);

    const events = detoursForRoute(result, '10');
    expect(events).toHaveLength(2);
    expect(events[0].eventId).toEqual(expect.any(String));
    expect(events[1].eventId).toEqual(expect.any(String));
    expect(events[0].eventId).not.toBe(events[1].eventId);
  });

  test('does not expand a short event with a downstream point from a different trip', () => {
    const shortDetourShapes = new Map([['short-shape', [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.698 },
      { latitude: 44.390, longitude: -79.696 },
      { latitude: 44.390, longitude: -79.694 },
      { latitude: 44.390, longitude: -79.692 },
      { latitude: 44.390, longitude: -79.690 },
    ]]]);
    const shortDetourMapping = new Map([['12B', ['short-shape']]]);
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-short-1',
        routeId: '12B',
        tripId: 'trip-short-1',
        coordinate: { latitude: 44.395, longitude: -79.698 },
        timestampMs: 1000,
      }),
      vehicle({
        id: 'bus-short-2',
        routeId: '12B',
        tripId: 'trip-short-2',
        coordinate: { latitude: 44.395, longitude: -79.697 },
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-short-2',
        routeId: '12B',
        tripId: 'trip-short-2',
        coordinate: { latitude: 44.395, longitude: -79.696 },
        timestampMs: 3000,
      }),
      vehicle({
        id: 'bus-downstream',
        routeId: '12B',
        tripId: 'trip-downstream',
        coordinate: { latitude: 44.395, longitude: -79.690 },
        timestampMs: 4000,
      }),
    ], shortDetourShapes, shortDetourMapping);

    const publicEvents = detoursForRoute(result, '12B');
    expect(publicEvents).toHaveLength(1);
    expect(publicEvents[0].detourZone.endProgressMeters - publicEvents[0].detourZone.startProgressMeters)
      .toBeLessThan(350);
    expect(Object.keys(detector.serializeDetectorRuntimeState().eventCandidates || {})).toHaveLength(2);
  });

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

    expect(Object.keys(result)).toHaveLength(1);
    expect(Object.keys(result)[0]).toEqual(expect.stringContaining('8A:shape-1:'));
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

  test('uses 40m as the default off-route distance threshold', () => {
    const detector = createDetourV2Detector();
    const offsetCoordinate = (longitude) => ({
      latitude: 44.3905,
      longitude,
    });

    expect(detector.processVehicles([
      vehicle({
        id: 'bus-1',
        tripId: 'trip-1',
        coordinate: offsetCoordinate(-79.698),
        timestampMs: 1000,
      }),
    ], shapes, routeShapeMapping)).toEqual({});

    expect(detector.processVehicles([
      vehicle({
        id: 'bus-1',
        tripId: 'trip-1',
        coordinate: offsetCoordinate(-79.696),
        timestampMs: 2000,
      }),
    ], shapes, routeShapeMapping)).toEqual({});

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-2',
        tripId: 'trip-2',
        coordinate: offsetCoordinate(-79.694),
        timestampMs: 3000,
      }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      routeId: '8A',
      vehicleCount: 2,
      uniqueVehicleCount: 2,
    }));
  });

  test('does not publish parallel-road drift that stays inside the 40m threshold', () => {
    const detector = createDetourV2Detector();
    const offsetCoordinate = (longitude) => ({
      latitude: 44.39035,
      longitude,
    });

    expect(pointToPolylineDistance(offsetCoordinate(-79.696), shapes.get('shape-1'))).toBeLessThanOrEqual(40);

    let result = detector.processVehicles([
      vehicle({
        id: 'bus-1',
        tripId: 'trip-1',
        coordinate: offsetCoordinate(-79.698),
        timestampMs: 1000,
      }),
    ], shapes, routeShapeMapping);
    expect(result).toEqual({});

    result = detector.processVehicles([
      vehicle({
        id: 'bus-2',
        tripId: 'trip-2',
        coordinate: offsetCoordinate(-79.696),
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-2',
        tripId: 'trip-2',
        coordinate: offsetCoordinate(-79.694),
        timestampMs: 3000,
      }),
    ], shapes, routeShapeMapping);

    expect(result).toEqual({});
    expect(detector.getState().candidateEvidence).toEqual({});
  });

  test('keeps jumpy sparse GPS paths hidden from riders', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({
        id: 'bus-1',
        tripId: 'trip-1',
        coordinate: { latitude: 44.395, longitude: -79.698 },
        timestampMs: 1000,
      }),
    ], shapes, routeShapeMapping);
    detector.processVehicles([
      vehicle({
        id: 'bus-2',
        tripId: 'trip-2',
        coordinate: { latitude: 44.450, longitude: -79.690 },
        timestampMs: 2000,
      }),
    ], shapes, routeShapeMapping);
    const result = detector.processVehicles([
      vehicle({
        id: 'bus-2',
        tripId: 'trip-2',
        coordinate: { latitude: 44.395, longitude: -79.682 },
        timestampMs: 3000,
      }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      riderVisible: false,
      canShowDetourPath: false,
      riderVisibilityReason: 'insufficient-geometry',
    }));
    expect(result['8A'].geometry).toEqual(expect.objectContaining({
      skippedSegmentPolyline: null,
      inferredDetourPolyline: null,
      likelyDetourPolyline: null,
      geometryTrustBlockedReason: 'jumpy-inferred-path',
    }));
    expect(result['8A'].geometry.inferredDetourPathStats.maxGapMeters).toBeGreaterThan(1200);
  });

  test('does not merge split start and end route evidence into one full-route detour', () => {
    const longShapes = new Map();
    longShapes.set('loop-shape', [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.690 },
      { latitude: 44.390, longitude: -79.680 },
      { latitude: 44.390, longitude: -79.670 },
      { latitude: 44.390, longitude: -79.660 },
      { latitude: 44.390, longitude: -79.650 },
    ]);
    const longMapping = new Map([['100', ['loop-shape']]]);
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({
        id: 'bus-start-1',
        routeId: '100',
        tripId: 'trip-start-1',
        coordinate: { latitude: 44.395, longitude: -79.699 },
        timestampMs: 1000,
      }),
    ], longShapes, longMapping);
    detector.processVehicles([
      vehicle({
        id: 'bus-start-2',
        routeId: '100',
        tripId: 'trip-start-2',
        coordinate: { latitude: 44.395, longitude: -79.698 },
        timestampMs: 2000,
      }),
    ], longShapes, longMapping);

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-end-1',
        routeId: '100',
        tripId: 'trip-end-1',
        coordinate: { latitude: 44.395, longitude: -79.651 },
        timestampMs: 3000,
      }),
    ], longShapes, longMapping);

    expect(result).toEqual({});
    expect(Object.keys(detector.serializeDetectorRuntimeState().eventCandidates || {})).toHaveLength(2);
    expect(detector.getState().candidateEvidence['100']).toEqual(expect.objectContaining({
      pointCount: 3,
      uniqueSignatureCount: 3,
    }));
  });

  test('keeps one sparse long detour as one monitored span but hides the unreliable path', () => {
    const longShapes = new Map();
    longShapes.set('long-shape', [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]);
    const longMapping = new Map([['100', ['long-shape']]]);
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-bridge',
        routeId: '100',
        tripId: 'trip-bridge',
        coordinate: { latitude: 44.396, longitude: -79.758 },
        timestampMs: 1000,
      }),
      vehicle({
        id: 'bus-bridge',
        routeId: '100',
        tripId: 'trip-bridge',
        coordinate: { latitude: 44.396, longitude: -79.712 },
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-second',
        routeId: '100',
        tripId: 'trip-second',
        coordinate: { latitude: 44.396, longitude: -79.735 },
        timestampMs: 3000,
      }),
    ], longShapes, longMapping);

    expect(result).toEqual({});
    expect(Object.keys(detector.serializeDetectorRuntimeState().eventCandidates || {})).toHaveLength(3);
    expect(detector.getState().candidateEvidence['100']).toEqual(expect.objectContaining({
      pointCount: 3,
      uniqueSignatureCount: 2,
    }));
  });

  test('does not use a reversed sparse trace to create an over-broad detour span', () => {
    const longShapes = new Map();
    longShapes.set('long-shape', [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]);
    const longMapping = new Map([['100', ['long-shape']]]);
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-reversing',
        routeId: '100',
        tripId: 'trip-reversing',
        coordinate: { latitude: 44.396, longitude: -79.712 },
        timestampMs: 1000,
      }),
      vehicle({
        id: 'bus-reversing',
        routeId: '100',
        tripId: 'trip-reversing',
        coordinate: { latitude: 44.396, longitude: -79.758 },
        timestampMs: 2000,
      }),
      vehicle({
        id: 'bus-second',
        routeId: '100',
        tripId: 'trip-second',
        coordinate: { latitude: 44.396, longitude: -79.756 },
        timestampMs: 3000,
      }),
    ], longShapes, longMapping);

    expect(result).toEqual({});
    expect(Object.keys(detector.serializeDetectorRuntimeState().eventCandidates || {})).toHaveLength(2);
    expect(detector.getState().candidateEvidence['100']).toEqual(expect.objectContaining({
      pointCount: 3,
      uniqueSignatureCount: 2,
    }));
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

  test('clamps any route with a configured corridor', () => {
    const corridorEntryPoint = { latitude: 44.39, longitude: -79.684 };
    const corridorExitPoint = { latitude: 44.39, longitude: -79.680 };
    const detector = createDetourV2Detector({
      detourCorridors: {
        '8A': {
          entryPoint: corridorEntryPoint,
          exitPoint: corridorExitPoint,
          label: 'generic-test-corridor',
        },
      },
    });

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

    const geometry = result['8A'].geometry;
    expect(geometry.entryPoint).toEqual(corridorEntryPoint);
    expect(geometry.exitPoint).toEqual(corridorExitPoint);
    expect(geometry.configuredCorridorLabel).toBe('generic-test-corridor');
    expect(geometry.gpsSupersedesPreviousPath).toBe(true);
    expect(geometry.inferredDetourPolyline[0]).toEqual(corridorEntryPoint);
    expect(geometry.inferredDetourPolyline[2]).toEqual(corridorExitPoint);
  });

  test('clamps 12A and 12B geometry from route corridor config', () => {
    const detector = createDetourV2Detector(route12DetectorConfig);

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
        id: 'bus-outlier',
        routeId: '12B',
        tripId: 'trip-outlier',
        coordinate: { latitude: 44.326088, longitude: -79.670364 },
        timestampMs: 4500,
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
    expect(geometry.configuredCorridorLabel).toBe('Saunders-Welham');
    expect(geometry.inferredDetourPolyline.some((point) => (
      pointToPolylineDistance(point, [route12ExitPoint, route12EntryPoint]) > 600
    ))).toBe(false);
    expect(geometry.inferredDetourPolyline.length).toBeGreaterThanOrEqual(3);
    expect(geometry.inferredDetourPolyline[0]).toEqual({
      latitude: route12ExitPoint.latitude,
      longitude: route12ExitPoint.longitude,
    });
    expect(geometry.inferredDetourPolyline[geometry.inferredDetourPolyline.length - 1]).toEqual({
      latitude: route12EntryPoint.latitude,
      longitude: route12EntryPoint.longitude,
    });
  });

  test('rebuilds hydrated active geometry from V2 candidate evidence without a new ping', () => {
    const detector = createDetourV2Detector(route12DetectorConfig);
    const stalePath = [
      { latitude: 44.3320, longitude: -79.6786 },
      { latitude: 44.3406, longitude: -79.6631 },
    ];

    detector.hydrateRuntimeState({
      candidates: [{
        routeId: '12B',
        shapeId: 'shape-12',
        points: [
          route12CandidatePoint({
            id: 'bus-1',
            tripId: 'trip-current-1',
            coordinate: { latitude: 44.3342, longitude: -79.6741 },
            timestampMs: 2000,
          }),
          route12CandidatePoint({
            id: 'bus-2',
            tripId: 'trip-current-2',
            coordinate: { latitude: 44.3364, longitude: -79.6716 },
            timestampMs: 3000,
          }),
          route12CandidatePoint({
            id: 'bus-2',
            tripId: 'trip-current-2',
            coordinate: { latitude: 44.3376, longitude: -79.6696 },
            timestampMs: 4000,
          }),
        ],
      }],
      activeDetours: {
        '12B': {
          routeId: '12B',
          detourVersion: 'v2',
          detectedAt: 1000,
          lastSeenAt: 5000,
          triggerVehicleId: 'bus-old',
          vehiclesOffRoute: ['bus-old'],
          matchedVehicleIds: ['bus-old'],
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          currentVehicleCount: 1,
          state: 'active',
          confidence: 'high',
          riderVisible: true,
          canShowDetourPath: true,
          geometry: {
            shapeId: 'shape-12',
            skippedSegmentPolyline: stalePath,
            inferredDetourPolyline: stalePath,
            canShowDetourPath: true,
            entryPoint: stalePath[0],
            exitPoint: stalePath[1],
            confidence: 'high',
            segments: [{
              shapeId: 'shape-12',
              skippedSegmentPolyline: stalePath,
              inferredDetourPolyline: stalePath,
              canShowDetourPath: true,
              entryPoint: stalePath[0],
              exitPoint: stalePath[1],
              confidence: 'high',
            }],
          },
          detourZone: {
            startProgressMeters: 0,
            endProgressMeters: 1500,
            shapeId: 'shape-12',
          },
        },
      },
      seenSamples: [],
    });

    const result = detector.processVehicles([], route12Shapes, route12ShapeMapping);
    const geometry = result['12B'].geometry;

    expect(geometry.entryPoint).toEqual(route12ExitPoint);
    expect(geometry.exitPoint).toEqual(route12EntryPoint);
    expect(geometry.inferredDetourPolyline[0]).toEqual(route12ExitPoint);
    expect(geometry.inferredDetourPolyline[2]).toEqual(route12EntryPoint);
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

  test('uses trip shape id to avoid hiding off-route evidence behind a nearby route variant', () => {
    const variantShapes = new Map([
      ['main-shape', [
        { latitude: 44.390, longitude: -79.700 },
        { latitude: 44.390, longitude: -79.690 },
        { latitude: 44.390, longitude: -79.680 },
      ]],
      ['nearby-variant-shape', [
        { latitude: 44.395, longitude: -79.700 },
        { latitude: 44.395, longitude: -79.690 },
        { latitude: 44.395, longitude: -79.680 },
      ]],
    ]);
    const variantMapping = new Map([['8A', ['main-shape', 'nearby-variant-shape']]]);

    const nearestShapeDetector = createDetourV2Detector();
    let result = nearestShapeDetector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.696 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.694 }, timestampMs: 3000 }),
    ], variantShapes, variantMapping);

    expect(result).toEqual({});
    expect(nearestShapeDetector.getState().candidateEvidence).toEqual({});

    const tripShapeDetector = createDetourV2Detector();
    result = tripShapeDetector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', tripShapeId: 'main-shape', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', tripShapeId: 'main-shape', coordinate: { latitude: 44.395, longitude: -79.696 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', tripShapeId: 'main-shape', coordinate: { latitude: 44.395, longitude: -79.694 }, timestampMs: 3000 }),
    ], variantShapes, variantMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      routeId: '8A',
      riderVisible: true,
      canShowDetourPath: true,
    }));
    expect(result['8A'].geometry.shapeId).toBe('main-shape');
  });

  test('publishes independent progress clusters as separate same-route segments', () => {
    const longShapes = new Map([['long-shape', [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]]]);
    const longMapping = new Map([['10', ['long-shape']]]);
    const detector = createDetourV2Detector();

    const result = detector.processVehicles([
      vehicle({ id: 'bus-a1', routeId: '10', tripId: 'trip-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.756 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.754 }, timestampMs: 3000 }),
      vehicle({ id: 'bus-b1', routeId: '10', tripId: 'trip-b1', coordinate: { latitude: 44.395, longitude: -79.708 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.706 }, timestampMs: 5000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.704 }, timestampMs: 6000 }),
    ], longShapes, longMapping);

    const events = detoursForRoute(result, '10')
      .sort((a, b) => a.detourZone.startProgressMeters - b.detourZone.startProgressMeters);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(expect.objectContaining({ riderVisible: true, canShowDetourPath: true }));
    expect(events[1]).toEqual(expect.objectContaining({ riderVisible: true, canShowDetourPath: true }));
    expect(events[0].geometry.segments).toHaveLength(1);
    expect(events[1].geometry.segments).toHaveLength(1);
    expect(events[0].geometry.segments[0].startProgressMeters).toBeLessThan(500);
    expect(events[1].geometry.segments[0].startProgressMeters).toBeGreaterThan(4000);
    expect(events[0].eventId).not.toBe(events[1].eventId);
  });

  test('clears only the event window covered by normal travel on a same-route multi-event route', () => {
    const longShapes = new Map([['long-shape', [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]]]);
    const longMapping = new Map([['10', ['long-shape']]]);
    const detector = createDetourV2Detector();

    let result = detector.processVehicles([
      vehicle({ id: 'bus-a1', routeId: '10', tripId: 'trip-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.756 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.754 }, timestampMs: 3000 }),
      vehicle({ id: 'bus-b1', routeId: '10', tripId: 'trip-b1', coordinate: { latitude: 44.395, longitude: -79.708 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.706 }, timestampMs: 5000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.704 }, timestampMs: 6000 }),
    ], longShapes, longMapping);

    expect(detoursForRoute(result, '10')).toHaveLength(2);

    result = detector.processVehicles([
      vehicle({ id: 'bus-partial', routeId: '10', tripId: 'trip-partial', coordinate: { latitude: 44.390, longitude: -79.760 }, timestampMs: 7000 }),
      vehicle({ id: 'bus-partial', routeId: '10', tripId: 'trip-partial', coordinate: { latitude: 44.390, longitude: -79.756 }, timestampMs: 7400 }),
      vehicle({ id: 'bus-partial', routeId: '10', tripId: 'trip-partial', coordinate: { latitude: 44.390, longitude: -79.754 }, timestampMs: 7700 }),
      vehicle({ id: 'bus-partial', routeId: '10', tripId: 'trip-partial', coordinate: { latitude: 44.390, longitude: -79.748 }, timestampMs: 8000 }),
    ], longShapes, longMapping);

    let events = detoursForRoute(result, '10');
    expect(events).toHaveLength(2);
    expect(events.filter((event) => event.state === 'clear-pending')).toHaveLength(1);
    expect(events.filter((event) => event.state === 'active')).toHaveLength(1);

    result = detector.processVehicles([], longShapes, longMapping);
    events = detoursForRoute(result, '10');
    expect(events).toHaveLength(1);
    expect(events[0].detourZone.startProgressMeters).toBeGreaterThan(4000);

    detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: { latitude: 44.390, longitude: -79.712 }, timestampMs: 9000 }),
    ], longShapes, longMapping);
    result = detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: { latitude: 44.390, longitude: -79.708 }, timestampMs: 9400 }),
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: { latitude: 44.390, longitude: -79.706 }, timestampMs: 9700 }),
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: { latitude: 44.390, longitude: -79.704 }, timestampMs: 9900 }),
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: { latitude: 44.390, longitude: -79.700 }, timestampMs: 10000 }),
    ], longShapes, longMapping);

    expect(detoursForRoute(result, '10')).toHaveLength(1);
    expect(detoursForRoute(result, '10')[0]).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));

    result = detector.processVehicles([], longShapes, longMapping);
    expect(result).toEqual({});
  });

  test('does not clear when on-route samples jump from before to after the skipped core segment', () => {
    const clearShapeId = 'clear-shape';
    const clearShape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.696 },
      { latitude: 44.390, longitude: -79.694 },
      { latitude: 44.390, longitude: -79.692 },
      { latitude: 44.390, longitude: -79.690 },
      { latitude: 44.390, longitude: -79.686 },
    ];
    const clearShapes = new Map([[clearShapeId, clearShape]]);
    const clearMapping = new Map([['12B', [clearShapeId]]]);
    const progress = (index) => projectOntoPolyline(clearShape[index], clearShape).progressMeters;
    const clearWindow = {
      startProgressMeters: progress(0),
      endProgressMeters: progress(5),
      sourceStartProgressMeters: progress(2),
      sourceEndProgressMeters: progress(3),
      minCoverageRatio: 0.95,
      shapeId: clearShapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeDetours: {
        '12B': {
          routeId: '12B',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          detourZone: {
            startProgressMeters: progress(2),
            endProgressMeters: progress(3),
            shapeId: clearShapeId,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId: clearShapeId,
            segments: [{
              state: 'active',
              clearWindow,
              detourZone: {
                startProgressMeters: progress(2),
                endProgressMeters: progress(3),
                shapeId: clearShapeId,
              },
            }],
          },
        },
      },
    });

    const result = detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '12B', tripId: 'trip-clear', coordinate: clearShape[0], timestampMs: 2000 }),
      vehicle({ id: 'bus-clear', routeId: '12B', tripId: 'trip-clear', coordinate: clearShape[1], timestampMs: 3000 }),
      vehicle({ id: 'bus-clear', routeId: '12B', tripId: 'trip-clear', coordinate: clearShape[4], timestampMs: 4000 }),
      vehicle({ id: 'bus-clear', routeId: '12B', tripId: 'trip-clear', coordinate: clearShape[5], timestampMs: 5000 }),
    ], clearShapes, clearMapping);

    expect(result['12B']).toEqual(expect.objectContaining({ state: 'active' }));
    expect(result['12B']).not.toHaveProperty('clearReason');
  });

  test('does not clear when sparse samples leave a large progress gap across the clear window', () => {
    const clearShapeId = 'clear-shape';
    const clearShape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.696 },
      { latitude: 44.390, longitude: -79.694 },
      { latitude: 44.390, longitude: -79.692 },
      { latitude: 44.390, longitude: -79.690 },
      { latitude: 44.390, longitude: -79.680 },
    ];
    const clearShapes = new Map([[clearShapeId, clearShape]]);
    const clearMapping = new Map([['12B', [clearShapeId]]]);
    const progress = (index) => projectOntoPolyline(clearShape[index], clearShape).progressMeters;
    const clearWindow = {
      startProgressMeters: progress(0),
      endProgressMeters: progress(5),
      sourceStartProgressMeters: progress(2),
      sourceEndProgressMeters: progress(3),
      minCoverageRatio: 0.95,
      shapeId: clearShapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeDetours: {
        '12B': {
          routeId: '12B',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          detourZone: {
            startProgressMeters: progress(2),
            endProgressMeters: progress(3),
            shapeId: clearShapeId,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId: clearShapeId,
            segments: [{
              state: 'active',
              clearWindow,
              detourZone: {
                startProgressMeters: progress(2),
                endProgressMeters: progress(3),
                shapeId: clearShapeId,
              },
            }],
          },
        },
      },
    });

    const result = detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '12B', tripId: 'trip-clear', coordinate: clearShape[0], timestampMs: 2000 }),
      vehicle({ id: 'bus-clear', routeId: '12B', tripId: 'trip-clear', coordinate: clearShape[2], timestampMs: 3000 }),
      vehicle({ id: 'bus-clear', routeId: '12B', tripId: 'trip-clear', coordinate: clearShape[5], timestampMs: 4000 }),
    ], clearShapes, clearMapping);

    expect(result['12B']).toEqual(expect.objectContaining({ state: 'active' }));
    expect(result['12B']).not.toHaveProperty('clearReason');
  });

  test('clears when on-route samples cover the clear window including the skipped core segment', () => {
    const clearShapeId = 'clear-shape';
    const clearShape = [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.696 },
      { latitude: 44.390, longitude: -79.694 },
      { latitude: 44.390, longitude: -79.692 },
      { latitude: 44.390, longitude: -79.690 },
      { latitude: 44.390, longitude: -79.686 },
    ];
    const clearShapes = new Map([[clearShapeId, clearShape]]);
    const clearMapping = new Map([['12B', [clearShapeId]]]);
    const progress = (index) => projectOntoPolyline(clearShape[index], clearShape).progressMeters;
    const clearWindow = {
      startProgressMeters: progress(0),
      endProgressMeters: progress(5),
      sourceStartProgressMeters: progress(2),
      sourceEndProgressMeters: progress(3),
      minCoverageRatio: 0.95,
      shapeId: clearShapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeDetours: {
        '12B': {
          routeId: '12B',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          detourZone: {
            startProgressMeters: progress(2),
            endProgressMeters: progress(3),
            shapeId: clearShapeId,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId: clearShapeId,
            segments: [{
              state: 'active',
              clearWindow,
              detourZone: {
                startProgressMeters: progress(2),
                endProgressMeters: progress(3),
                shapeId: clearShapeId,
              },
            }],
          },
        },
      },
    });

    const result = detector.processVehicles(clearShape.map((coordinate, index) => (
      vehicle({
        id: 'bus-clear',
        routeId: '12B',
        tripId: 'trip-clear',
        coordinate,
        timestampMs: 2000 + index * 1000,
      })
    )), clearShapes, clearMapping);

    expect(result['12B']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));

    expect(detector.processVehicles([], clearShapes, clearMapping)).toEqual({});
  });

  test('does not re-publish a cleared event until new off-route evidence returns', () => {
    const longShapes = new Map([['long-shape', [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]]]);
    const longMapping = new Map([['10', ['long-shape']]]);
    const detector = createDetourV2Detector();

    let result = detector.processVehicles([
      vehicle({ id: 'bus-a1', routeId: '10', tripId: 'trip-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.756 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.754 }, timestampMs: 3000 }),
      vehicle({ id: 'bus-b1', routeId: '10', tripId: 'trip-b1', coordinate: { latitude: 44.395, longitude: -79.708 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.706 }, timestampMs: 5000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.704 }, timestampMs: 6000 }),
    ], longShapes, longMapping);

    expect(detoursForRoute(result, '10')).toHaveLength(2);

    result = detector.processVehicles([
      vehicle({ id: 'bus-clear-first', routeId: '10', tripId: 'trip-clear-first', coordinate: { latitude: 44.390, longitude: -79.760 }, timestampMs: 7000 }),
      vehicle({ id: 'bus-clear-first', routeId: '10', tripId: 'trip-clear-first', coordinate: { latitude: 44.390, longitude: -79.756 }, timestampMs: 7400 }),
      vehicle({ id: 'bus-clear-first', routeId: '10', tripId: 'trip-clear-first', coordinate: { latitude: 44.390, longitude: -79.754 }, timestampMs: 7700 }),
      vehicle({ id: 'bus-clear-first', routeId: '10', tripId: 'trip-clear-first', coordinate: { latitude: 44.390, longitude: -79.748 }, timestampMs: 8000 }),
    ], longShapes, longMapping);

    expect(detoursForRoute(result, '10')).toHaveLength(2);

    result = detector.processVehicles([], longShapes, longMapping);
    expect(detoursForRoute(result, '10')).toHaveLength(1);
    expect(detoursForRoute(result, '10')[0].detourZone.startProgressMeters).toBeGreaterThan(4000);

    result = detector.processVehicles([
      vehicle({ id: 'bus-new-a1', routeId: '10', tripId: 'trip-new-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 9000 }),
      vehicle({ id: 'bus-new-a2', routeId: '10', tripId: 'trip-new-a2', coordinate: { latitude: 44.395, longitude: -79.756 }, timestampMs: 10000 }),
      vehicle({ id: 'bus-new-a2', routeId: '10', tripId: 'trip-new-a2', coordinate: { latitude: 44.395, longitude: -79.754 }, timestampMs: 11000 }),
    ], longShapes, longMapping);

    const events = detoursForRoute(result, '10')
      .sort((a, b) => a.detourZone.startProgressMeters - b.detourZone.startProgressMeters);
    expect(events).toHaveLength(2);
    expect(events[0].detourZone.startProgressMeters).toBeLessThan(500);
    expect(events[1].detourZone.startProgressMeters).toBeGreaterThan(4000);
  });

  test('ignores out-of-order old GPS points as clear proof', () => {
    const detector = createDetourV2Detector();

    let result = detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.696 }, timestampMs: 3000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.694 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.692 }, timestampMs: 5000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({ state: 'active' }));

    result = detector.processVehicles([
      vehicle({ id: 'bus-old-clear', tripId: 'trip-old-clear', coordinate: { latitude: 44.39, longitude: -79.700 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-old-clear', tripId: 'trip-old-clear', coordinate: { latitude: 44.39, longitude: -79.680 }, timestampMs: 2000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({ state: 'active' }));
    expect(result['8A']).not.toHaveProperty('clearReason');
  });

  test('restores event-scoped clearing after runtime hydration', () => {
    const longShapes = new Map([['long-shape', [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]]]);
    const longMapping = new Map([['10', ['long-shape']]]);
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-a1', routeId: '10', tripId: 'trip-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.756 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.754 }, timestampMs: 3000 }),
      vehicle({ id: 'bus-b1', routeId: '10', tripId: 'trip-b1', coordinate: { latitude: 44.395, longitude: -79.708 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.706 }, timestampMs: 5000 }),
      vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.704 }, timestampMs: 6000 }),
    ], longShapes, longMapping);

    const partial = detector.processVehicles([
      vehicle({ id: 'bus-clear-first', routeId: '10', tripId: 'trip-clear-first', coordinate: { latitude: 44.390, longitude: -79.760 }, timestampMs: 7000 }),
      vehicle({ id: 'bus-clear-first', routeId: '10', tripId: 'trip-clear-first', coordinate: { latitude: 44.390, longitude: -79.756 }, timestampMs: 7400 }),
      vehicle({ id: 'bus-clear-first', routeId: '10', tripId: 'trip-clear-first', coordinate: { latitude: 44.390, longitude: -79.754 }, timestampMs: 7700 }),
      vehicle({ id: 'bus-clear-first', routeId: '10', tripId: 'trip-clear-first', coordinate: { latitude: 44.390, longitude: -79.748 }, timestampMs: 8000 }),
    ], longShapes, longMapping);

    expect(detoursForRoute(partial, '10')).toHaveLength(2);

    const restored = createDetourV2Detector();
    restored.hydrateRuntimeState(detector.serializeDetectorRuntimeState());
    const result = restored.processVehicles([], longShapes, longMapping);

    const events = detoursForRoute(result, '10');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ state: 'active' }));
    expect(events[0].detourZone.startProgressMeters).toBeGreaterThan(4000);
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

  test('clips route-end clear windows and requires normal travel through the clipped window', () => {
    const detector = createDetourV2Detector();
    const shapeLength = projectOntoPolyline(
      { latitude: 44.39, longitude: -79.680 },
      shapes.get('shape-1')
    ).progressMeters;

    let result = detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.684 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.680 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A'].clearWindow).toEqual(expect.objectContaining({
      endProgressMeters: expect.any(Number),
      minCoverageRatio: 0.75,
    }));
    expect(result['8A'].clearWindow.endProgressMeters).toBeCloseTo(shapeLength, 1);
    expect(
      result['8A'].clearWindow.endProgressMeters - result['8A'].clearWindow.startProgressMeters
    ).toBeCloseTo(1000, 1);

    result = detector.processVehicles([
      vehicle({ id: 'bus-partial', tripId: 'trip-partial', coordinate: { latitude: 44.39, longitude: -79.688 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-partial', tripId: 'trip-partial', coordinate: { latitude: 44.39, longitude: -79.680 }, timestampMs: 5000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({ state: 'active' }));
    expect(result['8A']).not.toHaveProperty('clearReason');

    detector.processVehicles([
      vehicle({ id: 'bus-clear', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.692 }, timestampMs: 6000 }),
    ], shapes, routeShapeMapping);
    result = detector.processVehicles([
      vehicle({ id: 'bus-clear', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.680 }, timestampMs: 7000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));
  });

  test('uses the full affected span as the clear window when a detour is longer than 1km', () => {
    const longShapes = new Map([['long-clear-shape', [
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ]]]);
    const longMapping = new Map([['11', ['long-clear-shape']]]);
    const detector = createDetourV2Detector();

    let result = detector.processVehicles([
      vehicle({ id: 'bus-1', routeId: '11', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.736 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', routeId: '11', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.724 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', routeId: '11', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.712 }, timestampMs: 3000 }),
    ], longShapes, longMapping);

    const detourSpan = result['11'].detourZone.endProgressMeters -
      result['11'].detourZone.startProgressMeters;
    const clearWindowSpan = result['11'].clearWindow.endProgressMeters -
      result['11'].clearWindow.startProgressMeters;

    expect(detourSpan).toBeGreaterThan(1000);
    expect(clearWindowSpan).toBeCloseTo(detourSpan, 1);
    expect(result['11'].clearWindow.startProgressMeters)
      .toBeCloseTo(result['11'].detourZone.startProgressMeters, 1);
    expect(result['11'].clearWindow.endProgressMeters)
      .toBeCloseTo(result['11'].detourZone.endProgressMeters, 1);

    result = detector.processVehicles([
      vehicle({ id: 'bus-partial', routeId: '11', tripId: 'trip-partial', coordinate: { latitude: 44.39, longitude: -79.736 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-partial', routeId: '11', tripId: 'trip-partial', coordinate: { latitude: 44.39, longitude: -79.724 }, timestampMs: 5000 }),
    ], longShapes, longMapping);

    expect(result['11']).toEqual(expect.objectContaining({ state: 'active' }));
    expect(result['11']).not.toHaveProperty('clearReason');

    detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '11', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.736 }, timestampMs: 6000 }),
      vehicle({ id: 'bus-clear', routeId: '11', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.732 }, timestampMs: 6200 }),
      vehicle({ id: 'bus-clear', routeId: '11', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.728 }, timestampMs: 6400 }),
    ], longShapes, longMapping);
    result = detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '11', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.724 }, timestampMs: 6600 }),
      vehicle({ id: 'bus-clear', routeId: '11', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.720 }, timestampMs: 6800 }),
      vehicle({ id: 'bus-clear', routeId: '11', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.716 }, timestampMs: 6900 }),
      vehicle({ id: 'bus-clear', routeId: '11', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.712 }, timestampMs: 7000 }),
    ], longShapes, longMapping);

    expect(result['11']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));
  });

  test('uses the full route as clear window when the route is shorter than 1km', () => {
    const shortShapes = new Map([['short-shape', [
      { latitude: 44.390, longitude: -79.700 },
      { latitude: 44.390, longitude: -79.695 },
      { latitude: 44.390, longitude: -79.690 },
    ]]]);
    const shortMapping = new Map([['9', ['short-shape']]]);
    const detector = createDetourV2Detector();
    const shapeLength = projectOntoPolyline(
      { latitude: 44.390, longitude: -79.690 },
      shortShapes.get('short-shape')
    ).progressMeters;

    let result = detector.processVehicles([
      vehicle({ id: 'bus-1', routeId: '9', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.699 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', routeId: '9', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.696 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', routeId: '9', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.693 }, timestampMs: 3000 }),
    ], shortShapes, shortMapping);

    expect(shapeLength).toBeLessThan(1000);
    expect(result['9'].clearWindow.startProgressMeters).toBeCloseTo(0, 1);
    expect(result['9'].clearWindow.endProgressMeters).toBeCloseTo(shapeLength, 1);

    detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '9', tripId: 'trip-clear', coordinate: { latitude: 44.390, longitude: -79.700 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-clear', routeId: '9', tripId: 'trip-clear', coordinate: { latitude: 44.390, longitude: -79.695 }, timestampMs: 4500 }),
    ], shortShapes, shortMapping);
    result = detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '9', tripId: 'trip-clear', coordinate: { latitude: 44.390, longitude: -79.690 }, timestampMs: 5000 }),
    ], shortShapes, shortMapping);

    expect(result['9']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));
  });

  test('does not clear when a detouring bus only rejoins after the off-route section', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.695 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.694 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.693 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    let result = detector.processVehicles([
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.39, longitude: -79.688 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.39, longitude: -79.686 }, timestampMs: 5000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({ state: 'active' }));
    expect(result['8A']).not.toHaveProperty('clearReason');

    result = detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.700 }, timestampMs: 6000 }),
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.694 }, timestampMs: 6500 }),
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.688 }, timestampMs: 7000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));
  });

  test('persists clear-track GPS evidence across scheduled runtime hydration', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    let result = detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.698 }, timestampMs: 4000 }),
    ], shapes, routeShapeMapping);
    expect(result['8A']).toEqual(expect.objectContaining({ state: 'active' }));

    const snapshot = detector.serializeDetectorRuntimeState();
    expect(snapshot.activeDetours['8A'].clearWindow).toEqual(expect.objectContaining({
      startProgressMeters: expect.any(Number),
      endProgressMeters: expect.any(Number),
      minCoverageRatio: 0.75,
    }));
    expect(snapshot.clearTracks['8A']['trip-3']).toHaveLength(1);

    const restored = createDetourV2Detector();
    restored.hydrateRuntimeState(snapshot);

    result = restored.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.690 }, timestampMs: 4500 }),
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.682 }, timestampMs: 5000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));
  });


  test('far-away same-route noise does not reset an event clear track', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.696 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.694 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    detector.processVehicles([
      vehicle({ id: 'bus-clear', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.700 }, timestampMs: 4000 }),
    ], shapes, routeShapeMapping);

    detector.processVehicles([
      vehicle({ id: 'bus-noise', tripId: 'trip-noise', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 4500 }),
    ], shapes, routeShapeMapping);

    const state = detector.serializeDetectorRuntimeState();
    expect(Object.keys(state.clearTracksByEvent || {})).toHaveLength(1);
  });

  test('does not reset clear evidence when same-route off-route noise is outside the detour window', () => {
    const clearShapeId = 'long-clear-shape';
    const clearShape = [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.758 },
      { latitude: 44.390, longitude: -79.756 },
      { latitude: 44.390, longitude: -79.754 },
      { latitude: 44.390, longitude: -79.752 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ];
    const clearShapes = new Map([[clearShapeId, clearShape]]);
    const clearMapping = new Map([['10', [clearShapeId]]]);
    const progress = (index) => projectOntoPolyline(clearShape[index], clearShape).progressMeters;
    const clearWindow = {
      startProgressMeters: progress(0),
      endProgressMeters: progress(5),
      sourceStartProgressMeters: progress(2),
      sourceEndProgressMeters: progress(3),
      minCoverageRatio: 0.95,
      shapeId: clearShapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeDetours: {
        '10': {
          routeId: '10',
          state: 'active',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          detourZone: {
            startProgressMeters: progress(2),
            endProgressMeters: progress(3),
            shapeId: clearShapeId,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId: clearShapeId,
            segments: [{
              state: 'active',
              clearWindow,
              detourZone: {
                startProgressMeters: progress(2),
                endProgressMeters: progress(3),
                shapeId: clearShapeId,
              },
            }],
          },
        },
      },
    });

    let result = detector.processVehicles([
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: clearShape[0], timestampMs: 2000 }),
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: clearShape[1], timestampMs: 2200 }),
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: clearShape[2], timestampMs: 2400 }),
    ], clearShapes, clearMapping);

    expect(result['10']).toEqual(expect.objectContaining({ state: 'active' }));

    result = detector.processVehicles([
      vehicle({
        id: 'bus-far-noise',
        routeId: '10',
        tripId: 'trip-far-noise',
        coordinate: { latitude: 44.395, longitude: -79.710 },
        timestampMs: 2600,
      }),
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: clearShape[3], timestampMs: 3000 }),
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: clearShape[4], timestampMs: 3200 }),
      vehicle({ id: 'bus-clear', routeId: '10', tripId: 'trip-clear', coordinate: clearShape[5], timestampMs: 3400 }),
    ], clearShapes, clearMapping);

    expect(result['10']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));
  });

  test('deletes clear-pending detours when same-route off-route noise is outside the detour window', () => {
    const clearShapeId = 'long-clear-shape';
    const clearShape = [
      { latitude: 44.390, longitude: -79.760 },
      { latitude: 44.390, longitude: -79.758 },
      { latitude: 44.390, longitude: -79.756 },
      { latitude: 44.390, longitude: -79.754 },
      { latitude: 44.390, longitude: -79.752 },
      { latitude: 44.390, longitude: -79.750 },
      { latitude: 44.390, longitude: -79.740 },
      { latitude: 44.390, longitude: -79.730 },
      { latitude: 44.390, longitude: -79.720 },
      { latitude: 44.390, longitude: -79.710 },
      { latitude: 44.390, longitude: -79.700 },
    ];
    const clearShapes = new Map([[clearShapeId, clearShape]]);
    const clearMapping = new Map([['10', [clearShapeId]]]);
    const progress = (index) => projectOntoPolyline(clearShape[index], clearShape).progressMeters;
    const clearWindow = {
      startProgressMeters: progress(0),
      endProgressMeters: progress(5),
      sourceStartProgressMeters: progress(2),
      sourceEndProgressMeters: progress(3),
      minCoverageRatio: 0.95,
      shapeId: clearShapeId,
    };
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      activeDetours: {
        '10': {
          routeId: '10',
          state: 'clear-pending',
          clearReason: 'normal-route-observed',
          clearPendingTick: 0,
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          detourZone: {
            startProgressMeters: progress(2),
            endProgressMeters: progress(3),
            shapeId: clearShapeId,
          },
          clearWindow,
          clearWindows: [clearWindow],
          geometry: {
            shapeId: clearShapeId,
            segments: [{
              state: 'active',
              clearWindow,
              detourZone: {
                startProgressMeters: progress(2),
                endProgressMeters: progress(3),
                shapeId: clearShapeId,
              },
            }],
          },
        },
      },
    });

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-far-noise',
        routeId: '10',
        tripId: 'trip-far-noise',
        coordinate: { latitude: 44.395, longitude: -79.710 },
        timestampMs: 2000,
      }),
    ], clearShapes, clearMapping);

    expect(result).toEqual({});
    expect(detector.getState().detours).toEqual({});
  });

  test('collectively clears from two unique buses covering the affected span', () => {
    const detector = createDetourV2Detector();

    detector.processVehicles([
      vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.690 }, timestampMs: 2000 }),
      vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 3000 }),
    ], shapes, routeShapeMapping);

    let result = detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.698 }, timestampMs: 4000 }),
      vehicle({ id: 'bus-4', tripId: 'trip-4', coordinate: { latitude: 44.39, longitude: -79.682 }, timestampMs: 5000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({ state: 'active' }));

    result = detector.processVehicles([
      vehicle({ id: 'bus-3', tripId: 'trip-3', coordinate: { latitude: 44.39, longitude: -79.690 }, timestampMs: 6000 }),
      vehicle({ id: 'bus-4', tripId: 'trip-4', coordinate: { latitude: 44.39, longitude: -79.690 }, timestampMs: 7000 }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'normal-route-observed',
    }));
  });

  test('clears obsolete-shape detours after 45 minutes when all live route vehicles are back on route', () => {
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      candidates: [],
      activeDetours: {
        '8A': {
          routeId: '8A',
          detourVersion: 'v2',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          triggerVehicleId: 'bus-old',
          vehiclesOffRoute: ['bus-old'],
          matchedVehicleIds: ['bus-old', 'bus-older'],
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          currentVehicleCount: 2,
          state: 'active',
          confidence: 'high',
          riderVisible: true,
          canShowDetourPath: true,
          geometry: {
            shapeId: 'obsolete-shape',
            canShowDetourPath: true,
            confidence: 'high',
          },
          detourZone: {
            startProgressMeters: 100,
            endProgressMeters: 200,
            shapeId: 'obsolete-shape',
          },
        },
      },
      seenSamples: [],
    });

    expect(detector.getState().detours['8A'].currentVehicleCount).toBe(0);

    let result = detector.processVehicles([
      vehicle({
        id: 'bus-current-1',
        tripId: 'trip-current-1',
        coordinate: { latitude: 44.39, longitude: -79.700 },
        timestampMs: 46 * 60 * 1000,
      }),
      vehicle({
        id: 'bus-current-2',
        tripId: 'trip-current-2',
        coordinate: { latitude: 44.39, longitude: -79.682 },
        timestampMs: 46 * 60 * 1000 + 1000,
      }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      state: 'clear-pending',
      clearReason: 'obsolete-shape-normal-route-observed',
      currentVehicleCount: 0,
    }));

    result = detector.processVehicles([], shapes, routeShapeMapping);
    expect(result).toEqual({});
    expect(detector.getState().detours).toEqual({});
  });

  test('does not clear obsolete-shape detours before the 45 minute stale-evidence window', () => {
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      candidates: [],
      activeDetours: {
        '8A': {
          routeId: '8A',
          detourVersion: 'v2',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          currentVehicleCount: 0,
          state: 'active',
          confidence: 'high',
          riderVisible: true,
          canShowDetourPath: true,
          geometry: {
            shapeId: 'obsolete-shape',
            canShowDetourPath: true,
            confidence: 'high',
          },
          detourZone: {
            startProgressMeters: 100,
            endProgressMeters: 200,
            shapeId: 'obsolete-shape',
          },
        },
      },
      seenSamples: [],
    });

    const result = detector.processVehicles([
      vehicle({
        id: 'bus-current-1',
        tripId: 'trip-current-1',
        coordinate: { latitude: 44.39, longitude: -79.700 },
        timestampMs: 30 * 60 * 1000,
      }),
    ], shapes, routeShapeMapping);

    expect(result['8A']).toEqual(expect.objectContaining({
      state: 'active',
    }));
    expect(result['8A']).not.toHaveProperty('clearReason');
  });

  test('deletes restored clear-pending detours on the next scheduled tick', () => {
    const detector = createDetourV2Detector();
    detector.hydrateRuntimeState({
      candidates: [],
      activeDetours: {
        '8A': {
          routeId: '8A',
          detourVersion: 'v2',
          detectedAt: 1000,
          lastSeenAt: 1000,
          latestGpsEvidenceAt: 1000,
          lastEvidenceAt: 1000,
          vehicleCount: 2,
          uniqueVehicleCount: 2,
          currentVehicleCount: 0,
          state: 'clear-pending',
          clearReason: 'obsolete-shape-normal-route-observed',
          clearPendingTick: 12,
          confidence: 'high',
          riderVisible: true,
          canShowDetourPath: true,
          geometry: {
            shapeId: 'obsolete-shape',
            canShowDetourPath: true,
            confidence: 'high',
          },
          detourZone: {
            startProgressMeters: 100,
            endProgressMeters: 200,
            shapeId: 'obsolete-shape',
          },
        },
      },
      seenSamples: [],
    });

    expect(detector.processVehicles([], shapes, routeShapeMapping)).toEqual({});
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

