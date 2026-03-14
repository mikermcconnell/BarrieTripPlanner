import {
  buildNativeHomeAllRoutesShapes,
  __TEST_ONLY__,
} from '../utils/homeRouteLineVisuals';

const makePath = (points) =>
  points.map(([latitude, longitude]) => ({ latitude, longitude }));

describe('buildNativeHomeAllRoutesShapes', () => {
  const getRouteColor = (routeId) => ({
    '2A': '#cc0000',
    '2B': '#cc0000',
    '8A': '#0057b8',
    '8B': '#0057b8',
    '10': '#00897b',
    '11': '#ff7043',
    '100': '#910005',
    '101': '#2464A2',
    '3': '#6d4c41',
  }[routeId] || '#455a64');

  test('collapses explicit branch families into one family corridor in all-routes mode', () => {
    const shapes = {
      '2a-shape': makePath([
        [44.38, -79.69],
        [44.385, -79.688],
        [44.39, -79.686],
        [44.395, -79.684],
      ]),
      '2b-shape': makePath([
        [44.38, -79.69],
        [44.384, -79.689],
        [44.388, -79.687],
        [44.392, -79.685],
      ]),
      '3-shape': makePath([
        [44.4, -79.71],
        [44.405, -79.705],
        [44.41, -79.7],
      ]),
    };

    const result = buildNativeHomeAllRoutesShapes({
      routeShapeMapping: {
        '2A': ['2a-shape'],
        '2B': ['2b-shape'],
        '3': ['3-shape'],
      },
      processedShapes: shapes,
      shapes,
      shapeDirectionMap: {},
      getRouteColor,
    });

    const familyShapes = result.filter((shape) => shape.visualType === 'family');
    expect(familyShapes).toHaveLength(1);
    expect(familyShapes[0].routeId).toBe('2');
    expect(familyShapes[0].sourceRouteIds).toEqual(['2A', '2B']);

    const routeThree = result.find((shape) => shape.routeId === '3');
    expect(routeThree).toBeDefined();
  });

  test('preserves both Route 8 directions per branch in all-routes mode', () => {
    const shapes = {
      '8a-north': makePath([
        [44.38, -79.69],
        [44.385, -79.688],
        [44.39, -79.686],
        [44.395, -79.684],
      ]),
      '8a-south': makePath([
        [44.395, -79.684],
        [44.39, -79.686],
        [44.385, -79.688],
        [44.38, -79.69],
      ]),
      '8b-north': makePath([
        [44.38, -79.69],
        [44.384, -79.684],
        [44.388, -79.678],
        [44.392, -79.672],
      ]),
      '8b-south': makePath([
        [44.392, -79.672],
        [44.388, -79.678],
        [44.384, -79.684],
        [44.38, -79.69],
      ]),
    };

    const result = buildNativeHomeAllRoutesShapes({
      routeShapeMapping: {
        '8A': ['8a-north', '8a-south'],
        '8B': ['8b-north', '8b-south'],
      },
      processedShapes: shapes,
      shapes,
      shapeDirectionMap: {
        '8a-north': new Set(['0']),
        '8a-south': new Set(['1']),
        '8b-north': new Set(['0']),
        '8b-south': new Set(['1']),
      },
      getRouteColor,
    });

    const route8Shapes = result.filter((shape) => shape.visualType === 'family' && ['8A', '8B'].includes(shape.routeId));

    expect(route8Shapes).toHaveLength(4);
    expect(route8Shapes.map((shape) => shape.shapeId).sort()).toEqual([
      '8a-north',
      '8a-south',
      '8b-north',
      '8b-south',
    ]);
  });

  test('keeps differently colored loop pairs as fully separate route lines', () => {
    const sharedTrunk = [
      [44.38, -79.69],
      [44.385, -79.688],
      [44.39, -79.686],
      [44.395, -79.684],
    ];

    const shapes = {
      '10-shape': makePath([
        ...sharedTrunk,
        [44.399, -79.681],
        [44.403, -79.679],
      ]),
      '11-shape': makePath([
        ...sharedTrunk,
        [44.398, -79.688],
        [44.402, -79.691],
      ]),
    };

    const result = buildNativeHomeAllRoutesShapes({
      routeShapeMapping: {
        '100': ['10-shape'],
        '101': ['11-shape'],
      },
      processedShapes: shapes,
      shapes,
      shapeDirectionMap: {},
      getRouteColor,
    });

    const sharedSegments = result.filter((shape) => shape.visualType === 'shared_trunk');
    const route100 = result.filter((shape) => shape.routeId === '100' && shape.visualType === 'route');
    const route101 = result.filter((shape) => shape.routeId === '101' && shape.visualType === 'route');

    expect(sharedSegments).toHaveLength(0);
    expect(route100).toHaveLength(1);
    expect(route101).toHaveLength(1);
    expect(route100[0].color).toBe('#910005');
    expect(route101[0].color).toBe('#2464A2');
  });

  test('still supports shared trunks for same-colored loop pairs', () => {
    const sharedTrunk = [
      [44.38, -79.69],
      [44.385, -79.688],
      [44.39, -79.686],
      [44.395, -79.684],
    ];

    const shapes = {
      '10-shape': makePath([
        ...sharedTrunk,
        [44.399, -79.681],
        [44.403, -79.679],
      ]),
      '11-shape': makePath([
        ...sharedTrunk,
        [44.398, -79.688],
        [44.402, -79.691],
      ]),
    };

    const result = buildNativeHomeAllRoutesShapes({
      routeShapeMapping: {
        '10': ['10-shape'],
        '11': ['11-shape'],
      },
      processedShapes: shapes,
      shapes,
      shapeDirectionMap: {},
      getRouteColor: () => '#00897b',
    });

    const sharedSegments = result.filter((shape) => shape.visualType === 'shared_trunk');
    const route10Tails = result.filter((shape) => shape.routeId === '10' && shape.visualType === 'route_tail');
    const route11Tails = result.filter((shape) => shape.routeId === '11' && shape.visualType === 'route_tail');

    expect(sharedSegments.length).toBeGreaterThan(0);
    expect(sharedSegments[0].color).toBe(__TEST_ONLY__.SHARED_TRUNK_COLOR);
    expect(route10Tails.length).toBeGreaterThan(0);
    expect(route11Tails.length).toBeGreaterThan(0);
  });

  test('falls back to normal route rendering when loop routes do not materially overlap', () => {
    const shapes = {
      '10-shape': makePath([
        [44.38, -79.69],
        [44.385, -79.688],
        [44.39, -79.686],
      ]),
      '11-shape': makePath([
        [44.4, -79.71],
        [44.405, -79.707],
        [44.41, -79.704],
      ]),
    };

    const result = buildNativeHomeAllRoutesShapes({
      routeShapeMapping: {
        '10': ['10-shape'],
        '11': ['11-shape'],
      },
      processedShapes: shapes,
      shapes,
      shapeDirectionMap: {},
      getRouteColor,
    });

    expect(result.some((shape) => shape.visualType === 'shared_trunk')).toBe(false);
    expect(result.some((shape) => shape.routeId === '10' && shape.visualType === 'route')).toBe(true);
    expect(result.some((shape) => shape.routeId === '11' && shape.visualType === 'route')).toBe(true);
  });
});
