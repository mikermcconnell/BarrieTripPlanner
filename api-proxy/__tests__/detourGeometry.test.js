const {
  findClosestShapePoint,
  findAnchors,
  extractSkippedSegment,
  douglasPeucker,
  scoreConfidence,
  buildGeometry,
  MIN_EVIDENCE_FOR_GEOMETRY,
} = require('../detourGeometry');

// Reuse the same test shape as detourDetector.test.js: straight line east along 44.39 lat
const testPolyline = [
  { latitude: 44.39, longitude: -79.70 },
  { latitude: 44.39, longitude: -79.69 },
  { latitude: 44.39, longitude: -79.68 },
  { latitude: 44.39, longitude: -79.67 },
  { latitude: 44.39, longitude: -79.66 },
];

const shapes = new Map();
shapes.set('shape-1', testPolyline);

const routeShapeMapping = new Map();
routeShapeMapping.set('route-1', ['shape-1']);

function makeEvidencePoint(overrides = {}) {
  return {
    latitude: 44.395,
    longitude: -79.695,
    timestampMs: Date.now(),
    vehicleId: 'bus-1',
    ...overrides,
  };
}

describe('findClosestShapePoint', () => {
  test('returns null for empty polyline', () => {
    expect(findClosestShapePoint({ latitude: 44.39, longitude: -79.69 }, [])).toBeNull();
    expect(findClosestShapePoint({ latitude: 44.39, longitude: -79.69 }, null)).toBeNull();
  });

  test('single-point polyline returns that point', () => {
    const result = findClosestShapePoint(
      { latitude: 44.39, longitude: -79.69 },
      [{ latitude: 44.39, longitude: -79.70 }]
    );
    expect(result).not.toBeNull();
    expect(result.index).toBe(0);
    expect(result.distanceMeters).toBeGreaterThan(0);
  });

  test('point on the polyline has near-zero distance', () => {
    const result = findClosestShapePoint(
      { latitude: 44.39, longitude: -79.69 },
      testPolyline
    );
    expect(result.distanceMeters).toBeLessThan(1);
  });

  test('off-route point returns correct nearest segment', () => {
    // Point north of the line at longitude -79.685 (between segments 1 and 2)
    const result = findClosestShapePoint(
      { latitude: 44.395, longitude: -79.685 },
      testPolyline
    );
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.distanceMeters).toBeGreaterThan(400); // ~555m north
    expect(result.projectedPoint).toBeDefined();
    expect(result.projectedPoint.latitude).toBeCloseTo(44.39, 3);
  });
});

describe('findAnchors', () => {
  test('returns null for empty evidence', () => {
    expect(findAnchors([], shapes, ['shape-1'])).toBeNull();
    expect(findAnchors(null, shapes, ['shape-1'])).toBeNull();
  });

  test('returns null for empty shapeIds', () => {
    const points = [makeEvidencePoint()];
    expect(findAnchors(points, shapes, [])).toBeNull();
    expect(findAnchors(points, shapes, null)).toBeNull();
  });

  test('finds entry and exit anchors for evidence spanning the route', () => {
    const points = [
      makeEvidencePoint({ longitude: -79.695, timestampMs: 1000 }),
      makeEvidencePoint({ longitude: -79.685, timestampMs: 2000 }),
      makeEvidencePoint({ longitude: -79.675, timestampMs: 3000 }),
    ];
    const result = findAnchors(points, shapes, ['shape-1']);
    expect(result).not.toBeNull();
    expect(result.shapeId).toBe('shape-1');
    expect(result.entryIndex).toBeLessThanOrEqual(result.exitIndex);
  });

  test('picks the shape with lowest combined distance from multiple shapes', () => {
    const shapes2 = new Map(shapes);
    // Add a second shape far from evidence
    shapes2.set('shape-far', [
      { latitude: 44.50, longitude: -79.70 },
      { latitude: 44.50, longitude: -79.60 },
    ]);

    const points = [
      makeEvidencePoint({ longitude: -79.695 }),
      makeEvidencePoint({ longitude: -79.675 }),
    ];
    const result = findAnchors(points, shapes2, ['shape-1', 'shape-far']);
    expect(result.shapeId).toBe('shape-1');
  });
});

describe('extractSkippedSegment', () => {
  test('returns empty for empty polyline', () => {
    expect(extractSkippedSegment([], 0, 2)).toEqual([]);
    expect(extractSkippedSegment(null, 0, 2)).toEqual([]);
  });

  test('extracts correct slice between indices', () => {
    const result = extractSkippedSegment(testPolyline, 1, 3);
    expect(result.length).toBe(3); // indices 1, 2, 3 (inclusive)
    expect(result[0].longitude).toBeCloseTo(-79.69);
    expect(result[result.length - 1].longitude).toBeCloseTo(-79.67);
  });

  test('clamps to polyline bounds', () => {
    const result = extractSkippedSegment(testPolyline, 0, 100);
    expect(result.length).toBe(testPolyline.length);
  });
});

describe('douglasPeucker', () => {
  test('returns empty array for null input', () => {
    expect(douglasPeucker(null, 25)).toEqual([]);
  });

  test('preserves start and end for 2 points', () => {
    const points = [
      { latitude: 44.39, longitude: -79.70 },
      { latitude: 44.39, longitude: -79.60 },
    ];
    const result = douglasPeucker(points, 25);
    expect(result).toHaveLength(2);
  });

  test('collapses collinear points', () => {
    const collinear = [
      { latitude: 44.39, longitude: -79.70 },
      { latitude: 44.39, longitude: -79.69 },
      { latitude: 44.39, longitude: -79.68 },
      { latitude: 44.39, longitude: -79.67 },
    ];
    const result = douglasPeucker(collinear, 25);
    expect(result.length).toBeLessThan(collinear.length);
    expect(result[0]).toEqual(collinear[0]);
    expect(result[result.length - 1]).toEqual(collinear[collinear.length - 1]);
  });

  test('preserves corners/turns', () => {
    const withCorner = [
      { latitude: 44.39, longitude: -79.70 },
      { latitude: 44.39, longitude: -79.68 },
      { latitude: 44.40, longitude: -79.68 }, // sharp turn north
      { latitude: 44.40, longitude: -79.66 },
    ];
    const result = douglasPeucker(withCorner, 25);
    // The corner point should be preserved (it's far from the straight line)
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

describe('scoreConfidence', () => {
  const NOW = Date.now();

  test('returns low for empty/sparse evidence', () => {
    expect(scoreConfidence([], NOW - 60000, NOW)).toBe('low');
    expect(scoreConfidence(null, NOW - 60000, NOW)).toBe('low');
  });

  test('returns low for short-lived detour with few points', () => {
    const points = Array.from({ length: 3 }, (_, i) =>
      makeEvidencePoint({ vehicleId: 'bus-1', timestampMs: NOW - 30000 + i * 1000 })
    );
    expect(scoreConfidence(points, NOW - 60000, NOW)).toBe('low');
  });

  test('returns medium for moderate evidence', () => {
    const points = Array.from({ length: 6 }, (_, i) =>
      makeEvidencePoint({ vehicleId: 'bus-1', timestampMs: NOW - 150000 + i * 30000 })
    );
    expect(scoreConfidence(points, NOW - 150000, NOW)).toBe('medium');
  });

  test('returns high for sustained multi-vehicle evidence', () => {
    const points = [];
    for (let i = 0; i < 12; i++) {
      points.push(makeEvidencePoint({
        vehicleId: i % 2 === 0 ? 'bus-1' : 'bus-2',
        timestampMs: NOW - 360000 + i * 30000,
      }));
    }
    expect(scoreConfidence(points, NOW - 360000, NOW)).toBe('high');
  });
});

describe('buildGeometry', () => {
  const NOW = Date.now();
  const DETECTED_AT = NOW - 10 * 60 * 1000;

  test('returns empty geometry when evidence is below minimum', () => {
    const evidence = {
      points: [makeEvidencePoint(), makeEvidencePoint()], // only 2, need 3
    };
    const result = buildGeometry('route-1', evidence, shapes, routeShapeMapping, NOW, DETECTED_AT);
    expect(result.skippedSegmentPolyline).toBeNull();
    expect(result.inferredDetourPolyline).toBeNull();
    expect(result.confidence).toBe('low');
    expect(result.evidencePointCount).toBe(0);
  });

  test('returns empty geometry when no evidence window', () => {
    const result = buildGeometry('route-1', undefined, shapes, routeShapeMapping, NOW, DETECTED_AT);
    expect(result.skippedSegmentPolyline).toBeNull();
    expect(result.confidence).toBe('low');
  });

  test('returns valid geometry with sufficient evidence', () => {
    const points = [];
    for (let i = 0; i < 10; i++) {
      points.push(makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.695 + i * 0.002, // moving east, parallel to route but north
        timestampMs: DETECTED_AT + i * 30000,
        vehicleId: i % 2 === 0 ? 'bus-1' : 'bus-2',
      }));
    }
    const evidence = { points };
    const result = buildGeometry('route-1', evidence, shapes, routeShapeMapping, NOW, DETECTED_AT);

    expect(result.skippedSegmentPolyline).not.toBeNull();
    expect(result.skippedSegmentPolyline.length).toBeGreaterThanOrEqual(2);
    expect(result.inferredDetourPolyline).not.toBeNull();
    expect(result.inferredDetourPolyline.length).toBeGreaterThanOrEqual(2);
    expect(result.entryPoint).not.toBeNull();
    expect(result.exitPoint).not.toBeNull();
    expect(result.evidencePointCount).toBe(10);
    expect(result.lastEvidenceAt).toBeDefined();
    expect(['low', 'medium', 'high']).toContain(result.confidence);
  });

  test('returns empty geometry for unknown route', () => {
    const points = Array.from({ length: 5 }, (_, i) =>
      makeEvidencePoint({ timestampMs: NOW - 150000 + i * 30000 })
    );
    const evidence = { points };
    const result = buildGeometry('unknown-route', evidence, shapes, routeShapeMapping, NOW, DETECTED_AT);
    expect(result.skippedSegmentPolyline).toBeNull();
  });

  test('entry/exit points have lat/lon fields', () => {
    const points = Array.from({ length: 5 }, (_, i) =>
      makeEvidencePoint({
        longitude: -79.695 + i * 0.003,
        timestampMs: DETECTED_AT + i * 30000,
      })
    );
    const evidence = { points };
    const result = buildGeometry('route-1', evidence, shapes, routeShapeMapping, NOW, DETECTED_AT);

    if (result.entryPoint) {
      expect(result.entryPoint).toHaveProperty('latitude');
      expect(result.entryPoint).toHaveProperty('longitude');
    }
    if (result.exitPoint) {
      expect(result.exitPoint).toHaveProperty('latitude');
      expect(result.exitPoint).toHaveProperty('longitude');
    }
  });
});

describe('spatial anchor computation', () => {
  it('uses spatial min/max shape indices, not temporal first/last points', () => {
    // Shape segments: 0->1 (-79.70 to -79.69), 1->2 (-79.69 to -79.68),
    //                 2->3 (-79.68 to -79.67), 3->4 (-79.67 to -79.66)
    // Evidence: temporally first point is near shape segment 2 (lon -79.675),
    // temporally last point is near shape segment 0 (lon -79.695).
    // Old code would use temporal first/last, giving entry=seg2, exit=seg0 (swapped).
    // New code should use spatial min/max: entry=seg0, exit=seg2.
    const points = [
      { latitude: 44.395, longitude: -79.675, timestampMs: 1000, vehicleId: 'b1' },
      { latitude: 44.395, longitude: -79.685, timestampMs: 2000, vehicleId: 'b1' },
      { latitude: 44.395, longitude: -79.695, timestampMs: 3000, vehicleId: 'b1' },
    ];
    const result = findAnchors(points, shapes, ['shape-1']);
    expect(result).not.toBeNull();
    // entryIndex should always be <= exitIndex regardless of temporal order
    expect(result.entryIndex).toBeLessThanOrEqual(result.exitIndex);
    // Spatial: -79.695 projects to segment 0, -79.675 projects to segment 2
    // So min index should be 0, max index should be 2
    expect(result.entryIndex).toBe(0);  // segment nearest -79.695
    expect(result.exitIndex).toBe(2);   // segment nearest -79.675
    // swapped should always be false with the new spatial approach
    expect(result.swapped).toBe(false);
  });
});

describe('extractSkippedSegment bounds', () => {
  it('does not include extra point beyond exitIndex', () => {
    const poly = [
      { latitude: 44.39, longitude: -79.700 },
      { latitude: 44.39, longitude: -79.698 },
      { latitude: 44.39, longitude: -79.696 },
      { latitude: 44.39, longitude: -79.694 },
      { latitude: 44.39, longitude: -79.692 },
    ];
    // Extract indices 1 through 3 (inclusive) -> should be 3 points
    const segment = extractSkippedSegment(poly, 1, 3);
    expect(segment).toHaveLength(3);
    expect(segment[0].longitude).toBeCloseTo(-79.698, 3);
    expect(segment[2].longitude).toBeCloseTo(-79.694, 3);
  });
});

describe('longitude-scaled projection', () => {
  it('findClosestShapePoint projects correctly on diagonal segments', () => {
    // Diagonal segment: SW to NE
    const diagonal = [
      { latitude: 44.380, longitude: -79.710 },
      { latitude: 44.400, longitude: -79.680 },
    ];
    // Point is very close to the midpoint of the segment
    const point = { latitude: 44.390, longitude: -79.695 };
    const result = findClosestShapePoint(point, diagonal);
    // The projected point should be very close (within 5m)
    expect(result.distanceMeters).toBeLessThan(5);
  });
});
