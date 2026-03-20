const {
  findClosestShapePoint,
  findAnchors,
  extractSkippedSegment,
  extractSkippedSegmentByProgress,
  douglasPeucker,
  selectRepresentativeDetourPath,
  scoreConfidence,
  buildGeometry,
  reconcileRouteFamilyGeometries,
  MIN_EVIDENCE_FOR_GEOMETRY,
  MIN_LINEAR_SEGMENT_LENGTH_METERS,
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

describe('extractSkippedSegmentByProgress', () => {
  test('interpolates endpoints for coarse same-segment spans', () => {
    const coarsePolyline = [
      { latitude: 44.39, longitude: -79.70 },
      { latitude: 44.39, longitude: -79.686 },
    ];
    const segment = extractSkippedSegmentByProgress(
      coarsePolyline,
      150,
      150 + MIN_LINEAR_SEGMENT_LENGTH_METERS + 100
    );

    expect(segment).toHaveLength(2);
    expect(segment[0].longitude).toBeGreaterThan(-79.70);
    expect(segment[1].longitude).toBeGreaterThan(segment[0].longitude);
    expect(segment[1].longitude).toBeLessThan(-79.686);
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

describe('selectRepresentativeDetourPath', () => {
  test('prefers the overlapping majority path over a noisy alternate branch', () => {
    const cluster = [
      { latitude: 44.3950, longitude: -79.6990, timestampMs: 1_000, vehicleId: 'bus-1', progressMeters: 100 },
      { latitude: 44.3968, longitude: -79.6930, timestampMs: 2_000, vehicleId: 'bus-1', progressMeters: 220 },
      { latitude: 44.3967, longitude: -79.6870, timestampMs: 3_000, vehicleId: 'bus-1', progressMeters: 340 },
      { latitude: 44.3951, longitude: -79.6810, timestampMs: 4_000, vehicleId: 'bus-1', progressMeters: 460 },

      { latitude: 44.3951, longitude: -79.6988, timestampMs: 1_500, vehicleId: 'bus-2', progressMeters: 105 },
      { latitude: 44.3969, longitude: -79.6928, timestampMs: 2_500, vehicleId: 'bus-2', progressMeters: 225 },
      { latitude: 44.3968, longitude: -79.6868, timestampMs: 3_500, vehicleId: 'bus-2', progressMeters: 345 },
      { latitude: 44.3952, longitude: -79.6808, timestampMs: 4_500, vehicleId: 'bus-2', progressMeters: 465 },

      { latitude: 44.3950, longitude: -79.6990, timestampMs: 1_250, vehicleId: 'bus-3', progressMeters: 100 },
      { latitude: 44.3986, longitude: -79.6940, timestampMs: 2_250, vehicleId: 'bus-3', progressMeters: 220 },
      { latitude: 44.3930, longitude: -79.6890, timestampMs: 3_250, vehicleId: 'bus-3', progressMeters: 340 },
      { latitude: 44.3978, longitude: -79.6840, timestampMs: 4_250, vehicleId: 'bus-3', progressMeters: 460 },
    ];

    const result = selectRepresentativeDetourPath(cluster);

    expect(result).not.toBeNull();
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...result.map((point) => point.latitude))).toBeGreaterThan(44.3945);
    expect(Math.max(...result.map((point) => point.latitude))).toBeLessThan(44.3975);
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
  const coarsePolyline = [
    { latitude: 44.39, longitude: -79.70 },
    { latitude: 44.39, longitude: -79.686 },
  ];
  const coarseShapes = new Map([['shape-coarse', coarsePolyline]]);
  const coarseRouteMapping = new Map([['route-coarse', ['shape-coarse']]]);

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

  test('uses entry and exit boundary candidates when available', () => {
    const points = [
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.695,
        timestampMs: DETECTED_AT + 60_000,
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.685,
        timestampMs: DETECTED_AT + 90_000,
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.675,
        timestampMs: DETECTED_AT + 120_000,
      }),
    ];
    const result = buildGeometry(
      'route-1',
      {
        points,
        entryCandidates: [
          {
            latitude: 44.39,
            longitude: -79.699,
            timestampMs: DETECTED_AT + 30_000,
            vehicleId: 'bus-1',
          },
        ],
        exitCandidates: [
          {
            latitude: 44.39,
            longitude: -79.671,
            timestampMs: DETECTED_AT + 150_000,
            vehicleId: 'bus-1',
          },
        ],
      },
      shapes,
      routeShapeMapping,
      NOW,
      DETECTED_AT
    );

    expect(result.entryPoint).not.toBeNull();
    expect(result.exitPoint).not.toBeNull();
    expect(result.entryPoint.longitude).toBeCloseTo(-79.699, 3);
    expect(result.exitPoint.longitude).toBeCloseTo(-79.671, 3);
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

  test('uses the latest known exit candidate even when newer off-route evidence exists', () => {
    const entryCandidate = {
      latitude: 44.39,
      longitude: -79.6994,
      timestampMs: DETECTED_AT + 30_000,
      vehicleId: 'bus-1',
    };
    const exitCandidate = {
      latitude: 44.39,
      longitude: -79.6988,
      timestampMs: DETECTED_AT + 90_000,
      vehicleId: 'bus-1',
    };
    const points = [
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6994,
        timestampMs: DETECTED_AT + 60_000,
        vehicleId: 'bus-1',
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6992,
        timestampMs: DETECTED_AT + 120_000,
        vehicleId: 'bus-2',
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6990,
        timestampMs: DETECTED_AT + 180_000,
        vehicleId: 'bus-3',
      }),
    ];

    const result = buildGeometry(
      'route-1',
      {
        points,
        entryCandidates: [entryCandidate],
        exitCandidates: [exitCandidate],
      },
      shapes,
      routeShapeMapping,
      NOW,
      DETECTED_AT
    );

    expect(result.entryPoint).not.toBeNull();
    expect(result.exitPoint).not.toBeNull();
    expect(result.exitPoint.longitude).toBeCloseTo(-79.6988, 4);
    expect(result.inferredDetourPolyline).not.toBeNull();
    expect(result.inferredDetourPolyline[0].longitude).toBeCloseTo(-79.6994, 4);
    expect(result.inferredDetourPolyline[result.inferredDetourPolyline.length - 1].longitude).toBeCloseTo(-79.6988, 4);
  });

  test('captures same-segment detours when projected span exceeds the publish threshold', () => {
    const points = Array.from({ length: 6 }, (_, i) =>
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.699 + i * 0.0018,
        timestampMs: DETECTED_AT + i * 30000,
        vehicleId: i % 2 === 0 ? 'bus-1' : 'bus-2',
      })
    );
    const result = buildGeometry(
      'route-coarse',
      { points },
      coarseShapes,
      coarseRouteMapping,
      NOW,
      DETECTED_AT
    );

    expect(result.skippedSegmentPolyline).not.toBeNull();
    expect(result.skippedSegmentPolyline).toHaveLength(2);
    expect(result.entryPoint).not.toBeNull();
    expect(result.exitPoint).not.toBeNull();
    expect(result.entryPoint.longitude).toBeLessThan(result.exitPoint.longitude);
  });

  test('does not publish skipped segment when same-segment span stays below the publish threshold', () => {
    const points = Array.from({ length: 5 }, (_, i) =>
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.699 + i * 0.00015,
        timestampMs: DETECTED_AT + i * 30000,
      })
    );
    const result = buildGeometry(
      'route-coarse',
      { points },
      coarseShapes,
      coarseRouteMapping,
      NOW,
      DETECTED_AT
    );

    expect(result.skippedSegmentPolyline).toBeNull();
    expect(result.entryPoint).not.toBeNull();
    expect(result.exitPoint).not.toBeNull();
    expect(result.inferredDetourPolyline).not.toBeNull();
  });

  test('collapses weak split clusters back into one corridor when the merged span is stronger', () => {
    const points = [
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6994,
        timestampMs: DETECTED_AT + 0,
        vehicleId: 'bus-1',
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6992,
        timestampMs: DETECTED_AT + 30_000,
        vehicleId: 'bus-1',
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6990,
        timestampMs: DETECTED_AT + 60_000,
        vehicleId: 'bus-2',
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6610,
        timestampMs: DETECTED_AT + 90_000,
        vehicleId: 'bus-1',
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6608,
        timestampMs: DETECTED_AT + 120_000,
        vehicleId: 'bus-2',
      }),
      makeEvidencePoint({
        latitude: 44.395,
        longitude: -79.6606,
        timestampMs: DETECTED_AT + 150_000,
        vehicleId: 'bus-2',
      }),
    ];

    const result = buildGeometry(
      'route-1',
      { points },
      shapes,
      routeShapeMapping,
      NOW,
      DETECTED_AT
    );

    expect(result.segments).toHaveLength(1);
    expect(result.skippedSegmentPolyline).not.toBeNull();
    expect(result.entryPoint).not.toBeNull();
    expect(result.exitPoint).not.toBeNull();
    expect(result.entryPoint.longitude).toBeLessThan(result.exitPoint.longitude);
    expect(result.inferredDetourPolyline).not.toBeNull();
    expect(result.inferredDetourPolyline[0].latitude).toBeCloseTo(44.39, 3);
    expect(result.inferredDetourPolyline[result.inferredDetourPolyline.length - 1].latitude).toBeCloseTo(44.39, 3);
    expect(
      result.inferredDetourPolyline.some((point) => point.latitude > 44.3945 && point.latitude < 44.3975)
    ).toBe(true);
  });

  test('prefers observed trip shape ids over closer sibling shapes', () => {
    const hintedShapes = new Map([
      ['shape-main', [
        { latitude: 44.39, longitude: -79.70 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.68 },
        { latitude: 44.39, longitude: -79.67 },
      ]],
      ['shape-branch', [
        { latitude: 44.3909, longitude: -79.70 },
        { latitude: 44.3909, longitude: -79.69 },
        { latitude: 44.3909, longitude: -79.68 },
        { latitude: 44.3909, longitude: -79.67 },
      ]],
    ]);
    const hintedRouteMapping = new Map([
      ['route-hinted', ['shape-main', 'shape-branch']],
    ]);
    const points = Array.from({ length: 6 }, (_, i) =>
      makeEvidencePoint({
        latitude: 44.3902,
        longitude: -79.699 + i * 0.005,
        timestampMs: DETECTED_AT + i * 30_000,
        vehicleId: i % 2 === 0 ? 'bus-1' : 'bus-2',
        tripShapeId: 'shape-branch',
      })
    );

    const result = buildGeometry(
      'route-hinted',
      { points },
      hintedShapes,
      hintedRouteMapping,
      NOW,
      DETECTED_AT
    );

    expect(result.shapeId).toBe('shape-branch');
    expect(result.entryPoint).not.toBeNull();
    expect(result.exitPoint).not.toBeNull();
    expect(result.entryPoint.latitude).toBeCloseTo(44.3909, 3);
    expect(result.exitPoint.latitude).toBeCloseTo(44.3909, 3);
  });

  test('falls back to closest shape when evidence has no matching trip shape id', () => {
    const hintedShapes = new Map([
      ['shape-main', [
        { latitude: 44.39, longitude: -79.70 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.68 },
        { latitude: 44.39, longitude: -79.67 },
      ]],
      ['shape-branch', [
        { latitude: 44.3909, longitude: -79.70 },
        { latitude: 44.3909, longitude: -79.69 },
        { latitude: 44.3909, longitude: -79.68 },
        { latitude: 44.3909, longitude: -79.67 },
      ]],
    ]);
    const hintedRouteMapping = new Map([
      ['route-hinted', ['shape-main', 'shape-branch']],
    ]);
    const points = Array.from({ length: 6 }, (_, i) =>
      makeEvidencePoint({
        latitude: 44.3902,
        longitude: -79.699 + i * 0.005,
        timestampMs: DETECTED_AT + i * 30_000,
        vehicleId: i % 2 === 0 ? 'bus-1' : 'bus-2',
        tripShapeId: 'shape-missing',
      })
    );

    const result = buildGeometry(
      'route-hinted',
      { points },
      hintedShapes,
      hintedRouteMapping,
      NOW,
      DETECTED_AT
    );

    expect(result.shapeId).toBe('shape-main');
    expect(result.entryPoint).not.toBeNull();
    expect(result.exitPoint).not.toBeNull();
    expect(result.entryPoint.latitude).toBeCloseTo(44.39, 3);
    expect(result.exitPoint.latitude).toBeCloseTo(44.39, 3);
  });

  test('builds one clean reroute path from overlapping multi-vehicle evidence', () => {
    const points = [
      makeEvidencePoint({
        latitude: 44.3950,
        longitude: -79.6990,
        timestampMs: DETECTED_AT + 30_000,
        vehicleId: 'bus-1',
      }),
      makeEvidencePoint({
        latitude: 44.3968,
        longitude: -79.6930,
        timestampMs: DETECTED_AT + 60_000,
        vehicleId: 'bus-1',
      }),
      makeEvidencePoint({
        latitude: 44.3967,
        longitude: -79.6870,
        timestampMs: DETECTED_AT + 90_000,
        vehicleId: 'bus-1',
      }),
      makeEvidencePoint({
        latitude: 44.3951,
        longitude: -79.6810,
        timestampMs: DETECTED_AT + 120_000,
        vehicleId: 'bus-1',
      }),

      makeEvidencePoint({
        latitude: 44.3951,
        longitude: -79.6988,
        timestampMs: DETECTED_AT + 45_000,
        vehicleId: 'bus-2',
      }),
      makeEvidencePoint({
        latitude: 44.3969,
        longitude: -79.6928,
        timestampMs: DETECTED_AT + 75_000,
        vehicleId: 'bus-2',
      }),
      makeEvidencePoint({
        latitude: 44.3968,
        longitude: -79.6868,
        timestampMs: DETECTED_AT + 105_000,
        vehicleId: 'bus-2',
      }),
      makeEvidencePoint({
        latitude: 44.3952,
        longitude: -79.6808,
        timestampMs: DETECTED_AT + 135_000,
        vehicleId: 'bus-2',
      }),

      makeEvidencePoint({
        latitude: 44.3950,
        longitude: -79.6990,
        timestampMs: DETECTED_AT + 50_000,
        vehicleId: 'bus-3',
      }),
      makeEvidencePoint({
        latitude: 44.3986,
        longitude: -79.6940,
        timestampMs: DETECTED_AT + 80_000,
        vehicleId: 'bus-3',
      }),
      makeEvidencePoint({
        latitude: 44.3930,
        longitude: -79.6890,
        timestampMs: DETECTED_AT + 110_000,
        vehicleId: 'bus-3',
      }),
      makeEvidencePoint({
        latitude: 44.3978,
        longitude: -79.6840,
        timestampMs: DETECTED_AT + 140_000,
        vehicleId: 'bus-3',
      }),
    ];

    const result = buildGeometry('route-1', { points }, shapes, routeShapeMapping, NOW, DETECTED_AT);

    expect(result.inferredDetourPolyline).not.toBeNull();
    expect(result.inferredDetourPolyline.length).toBeGreaterThanOrEqual(3);
    expect(result.inferredDetourPolyline[0].latitude).toBeCloseTo(44.39, 3);
    expect(result.inferredDetourPolyline[result.inferredDetourPolyline.length - 1].latitude).toBeCloseTo(44.39, 3);
    expect(result.inferredDetourPolyline.some((point) => point.latitude > 44.3945)).toBe(true);
  });
});

describe('route family geometry handoff', () => {
  test('creates a sibling branch detour when only one branch is active', () => {
    const familyShapes = new Map([
      ['shape-8b', [
        { latitude: 44.39, longitude: -79.70 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.68 },
        { latitude: 44.39, longitude: -79.67 },
        { latitude: 44.39, longitude: -79.66 },
      ]],
      ['shape-8a', [
        { latitude: 44.39, longitude: -79.66 },
        { latitude: 44.39, longitude: -79.67 },
        { latitude: 44.39, longitude: -79.68 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.70 },
      ]],
    ]);
    const familyRouteMapping = new Map([
      ['8A', ['shape-8a']],
      ['8B', ['shape-8b']],
    ]);
    const detours = {
      '8B': {
        routeId: '8B',
        detectedAt: new Date('2026-03-13T20:00:00Z'),
        lastSeenAt: new Date('2026-03-13T20:05:00Z'),
        state: 'active',
        vehicleCount: 2,
        geometry: {
          confidence: 'medium',
          evidencePointCount: 6,
          lastEvidenceAt: 10_000,
          segments: [
            {
              shapeId: 'shape-8b',
              skippedSegmentPolyline: [
                { latitude: 44.39, longitude: -79.698 },
                { latitude: 44.39, longitude: -79.694 },
              ],
              inferredDetourPolyline: [
                { latitude: 44.392, longitude: -79.698 },
                { latitude: 44.392, longitude: -79.694 },
              ],
              entryPoint: { latitude: 44.39, longitude: -79.698 },
              exitPoint: { latitude: 44.39, longitude: -79.694 },
              confidence: 'medium',
              evidencePointCount: 6,
              lastEvidenceAt: 10_000,
              entryIndex: 0,
              exitIndex: 1,
              spanMeters: 350,
            },
          ],
          skippedSegmentPolyline: [
            { latitude: 44.39, longitude: -79.698 },
            { latitude: 44.39, longitude: -79.694 },
          ],
          inferredDetourPolyline: [
            { latitude: 44.392, longitude: -79.698 },
            { latitude: 44.392, longitude: -79.694 },
          ],
          entryPoint: { latitude: 44.39, longitude: -79.698 },
          exitPoint: { latitude: 44.39, longitude: -79.694 },
        },
      },
    };

    reconcileRouteFamilyGeometries(detours, familyShapes, familyRouteMapping);

    expect(detours['8A']).toBeDefined();
    expect(detours['8A'].handoffSourceRouteId).toBe('8B');
    expect(detours['8A'].geometry.segments).toHaveLength(1);
    expect(detours['8A'].geometry.entryPoint.longitude).toBeCloseTo(-79.694, 3);
    expect(detours['8A'].geometry.exitPoint.longitude).toBeCloseTo(-79.698, 3);
  });

  test('projects sibling branch detour segments onto the opposite-direction shape', () => {
    const familyShapes = new Map([
      ['shape-8b', [
        { latitude: 44.39, longitude: -79.70 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.68 },
        { latitude: 44.39, longitude: -79.67 },
        { latitude: 44.39, longitude: -79.66 },
      ]],
      ['shape-8a', [
        { latitude: 44.39, longitude: -79.66 },
        { latitude: 44.39, longitude: -79.67 },
        { latitude: 44.39, longitude: -79.68 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.70 },
      ]],
    ]);
    const familyRouteMapping = new Map([
      ['8A', ['shape-8a']],
      ['8B', ['shape-8b']],
    ]);
    const detours = {
      '8B': {
        vehicleCount: 4,
        geometry: {
          confidence: 'high',
          evidencePointCount: 10,
          lastEvidenceAt: 10_000,
          segments: [
            {
              shapeId: 'shape-8b',
              skippedSegmentPolyline: [
                { latitude: 44.39, longitude: -79.698 },
                { latitude: 44.39, longitude: -79.694 },
              ],
              inferredDetourPolyline: [
                { latitude: 44.392, longitude: -79.698 },
                { latitude: 44.392, longitude: -79.694 },
              ],
              entryPoint: { latitude: 44.39, longitude: -79.698 },
              exitPoint: { latitude: 44.39, longitude: -79.694 },
              confidence: 'high',
              evidencePointCount: 6,
              lastEvidenceAt: 9_000,
              entryIndex: 0,
              exitIndex: 1,
              spanMeters: 350,
            },
            {
              shapeId: 'shape-8b',
              skippedSegmentPolyline: [
                { latitude: 44.39, longitude: -79.688 },
                { latitude: 44.39, longitude: -79.684 },
              ],
              inferredDetourPolyline: [
                { latitude: 44.392, longitude: -79.688 },
                { latitude: 44.392, longitude: -79.684 },
              ],
              entryPoint: { latitude: 44.39, longitude: -79.688 },
              exitPoint: { latitude: 44.39, longitude: -79.684 },
              confidence: 'medium',
              evidencePointCount: 4,
              lastEvidenceAt: 10_000,
              entryIndex: 1,
              exitIndex: 2,
              spanMeters: 350,
            },
          ],
          skippedSegmentPolyline: [
            { latitude: 44.39, longitude: -79.698 },
            { latitude: 44.39, longitude: -79.694 },
          ],
          inferredDetourPolyline: [
            { latitude: 44.392, longitude: -79.698 },
            { latitude: 44.392, longitude: -79.694 },
          ],
          entryPoint: { latitude: 44.39, longitude: -79.698 },
          exitPoint: { latitude: 44.39, longitude: -79.694 },
        },
      },
      '8A': {
        vehicleCount: 2,
        geometry: {
          confidence: 'medium',
          evidencePointCount: 5,
          lastEvidenceAt: 8_000,
          segments: [
            {
              shapeId: 'shape-8a',
              skippedSegmentPolyline: [
                { latitude: 44.40, longitude: -79.650 },
                { latitude: 44.40, longitude: -79.648 },
              ],
              inferredDetourPolyline: [
                { latitude: 44.401, longitude: -79.650 },
                { latitude: 44.401, longitude: -79.648 },
              ],
              entryPoint: { latitude: 44.40, longitude: -79.650 },
              exitPoint: { latitude: 44.40, longitude: -79.648 },
              confidence: 'low',
              evidencePointCount: 3,
              lastEvidenceAt: 8_000,
              entryIndex: 0,
              exitIndex: 1,
              spanMeters: 200,
            },
          ],
          skippedSegmentPolyline: [
            { latitude: 44.40, longitude: -79.650 },
            { latitude: 44.40, longitude: -79.648 },
          ],
          inferredDetourPolyline: [
            { latitude: 44.401, longitude: -79.650 },
            { latitude: 44.401, longitude: -79.648 },
          ],
          entryPoint: { latitude: 44.40, longitude: -79.650 },
          exitPoint: { latitude: 44.40, longitude: -79.648 },
        },
      },
    };

    reconcileRouteFamilyGeometries(detours, familyShapes, familyRouteMapping);

    expect(detours['8A'].geometry.segments).toHaveLength(2);
    expect(detours['8A'].geometry.shapeId).toBe('shape-8a');
    expect(detours['8A'].geometry.entryPoint.longitude).toBeGreaterThan(detours['8A'].geometry.exitPoint.longitude);
    expect(detours['8A'].geometry.segments[0].entryPoint.longitude).toBeCloseTo(-79.694, 3);
    expect(detours['8A'].geometry.segments[0].exitPoint.longitude).toBeCloseTo(-79.698, 3);
    expect(detours['8A'].geometry.segments[1].entryPoint.longitude).toBeCloseTo(-79.684, 3);
    expect(detours['8A'].geometry.segments[1].exitPoint.longitude).toBeCloseTo(-79.688, 3);
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
