const { buildBaselineDivergence } = require('../baselineDivergence');

function makeShape(points) {
  return points.map(([latitude, longitude], index) => ({
    latitude,
    longitude,
    sequence: index + 1,
  }));
}

function makeGtfs(routeShapes) {
  const shapes = new Map();
  const routeShapeMapping = new Map();

  Object.entries(routeShapes).forEach(([routeId, shapeEntries]) => {
    routeShapeMapping.set(routeId, shapeEntries.map((entry) => entry.shapeId));
    shapeEntries.forEach((entry) => {
      shapes.set(entry.shapeId, makeShape(entry.points));
    });
  });

  return { shapes, routeShapeMapping };
}

describe('baselineDivergence', () => {
  test('does not flag route when only shape IDs changed and geometry is the same', () => {
    const baseline = makeGtfs({
      400: [{ shapeId: 'old-shape', points: [[44.3, -79.7], [44.31, -79.71]] }],
    });
    const live = makeGtfs({
      400: [{ shapeId: 'new-shape', points: [[44.3, -79.7], [44.31, -79.71]] }],
    });

    const result = buildBaselineDivergence({
      baselineShapes: baseline.shapes,
      baselineRouteShapeMapping: baseline.routeShapeMapping,
      liveShapes: live.shapes,
      liveRouteShapeMapping: live.routeShapeMapping,
    });

    expect(result.hasChanges).toBe(false);
    expect(result.changedRouteIds).toEqual([]);
  });

  test('flags route when public GTFS route geometry meaningfully changes', () => {
    const baseline = makeGtfs({
      400: [{ shapeId: 'old-shape', points: [[44.3, -79.7], [44.31, -79.71]] }],
    });
    const live = makeGtfs({
      400: [{ shapeId: 'new-shape', points: [[44.3, -79.7], [44.36, -79.76]] }],
    });

    const result = buildBaselineDivergence({
      baselineShapes: baseline.shapes,
      baselineRouteShapeMapping: baseline.routeShapeMapping,
      liveShapes: live.shapes,
      liveRouteShapeMapping: live.routeShapeMapping,
    });

    expect(result.hasChanges).toBe(true);
    expect(result.changedRouteIds).toEqual(['400']);
    expect(result.added).toEqual([{ routeId: '400', shapes: ['new-shape'] }]);
    expect(result.removed).toEqual([{ routeId: '400', shapes: ['old-shape'] }]);
  });
});
