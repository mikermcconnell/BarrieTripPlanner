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

  test('renders loop-pair shared trunks as neutral segments with route-colored tails', () => {
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
      getRouteColor,
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
