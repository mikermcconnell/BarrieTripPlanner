import { getRepresentativeShapeIds } from '../utils/routeShapeUtils';

describe('routeShapeUtils', () => {
  test('returns longest shape when maxShapes=1', () => {
    const shapeSource = {
      a: [
        { latitude: 44.1, longitude: -79.7 },
        { latitude: 44.2, longitude: -79.8 },
      ],
      b: [
        { latitude: 44.1, longitude: -79.7 },
        { latitude: 44.15, longitude: -79.75 },
        { latitude: 44.2, longitude: -79.8 },
      ],
    };

    const result = getRepresentativeShapeIds(['a', 'b'], shapeSource, { maxShapes: 1, precision: 3 });
    expect(result).toEqual(['b']);
  });

  test('keeps both branch variants when they diverge mid-route', () => {
    const commonStart = { latitude: 44.38, longitude: -79.69 };
    const commonEnd = { latitude: 44.40, longitude: -79.68 };

    const shapeSource = {
      branchA: [
        commonStart,
        { latitude: 44.39, longitude: -79.70 },
        commonEnd,
      ],
      branchB: [
        commonStart,
        { latitude: 44.39, longitude: -79.66 },
        commonEnd,
      ],
    };

    const result = getRepresentativeShapeIds(['branchA', 'branchB'], shapeSource, { maxShapes: 2, precision: 3 });
    expect(result).toHaveLength(2);
    expect(result).toContain('branchA');
    expect(result).toContain('branchB');
  });

  test('collapses reverse-direction duplicates to one representative', () => {
    const shapeSource = {
      forward: [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.67 },
        { latitude: 44.41, longitude: -79.66 },
      ],
      reverse: [
        { latitude: 44.41, longitude: -79.66 },
        { latitude: 44.39, longitude: -79.67 },
        { latitude: 44.38, longitude: -79.69 },
      ],
    };

    const result = getRepresentativeShapeIds(['forward', 'reverse'], shapeSource, { maxShapes: 2, precision: 3 });
    expect(result).toHaveLength(1);
    expect(['forward', 'reverse']).toContain(result[0]);
  });
});

