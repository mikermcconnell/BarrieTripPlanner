import { getRepresentativeShapeIds, getRepresentativeShapeIdsByDirection } from '../utils/routeShapeUtils';

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

  test('prefers one representative per direction before filling extras', () => {
    const shapeSource = {
      dir0Long: [
        { latitude: 44.1, longitude: -79.8 },
        { latitude: 44.11, longitude: -79.79 },
        { latitude: 44.12, longitude: -79.78 },
        { latitude: 44.13, longitude: -79.77 },
      ],
      dir0Short: [
        { latitude: 44.1, longitude: -79.8 },
        { latitude: 44.12, longitude: -79.78 },
      ],
      dir1Long: [
        { latitude: 44.2, longitude: -79.7 },
        { latitude: 44.19, longitude: -79.71 },
        { latitude: 44.18, longitude: -79.72 },
      ],
    };

    const shapeDirectionMap = {
      dir0Long: new Set(['0']),
      dir0Short: new Set(['0']),
      dir1Long: new Set(['1']),
    };

    const result = getRepresentativeShapeIdsByDirection(
      ['dir0Long', 'dir0Short', 'dir1Long'],
      shapeSource,
      shapeDirectionMap,
      { maxShapes: 2, precision: 3 }
    );

    expect(result).toHaveLength(2);
    expect(result).toContain('dir0Long');
    expect(result).toContain('dir1Long');
  });

  test('does not add extra variants from the same direction', () => {
    const shapeSource = {
      route7Regular: [
        { latitude: 44.34, longitude: -79.68 },
        { latitude: 44.36, longitude: -79.69 },
        { latitude: 44.38, longitude: -79.7 },
        { latitude: 44.41, longitude: -79.67 },
      ],
      route7ShortTurn: [
        { latitude: 44.34, longitude: -79.68 },
        { latitude: 44.36, longitude: -79.69 },
      ],
      route7RareVariant: [
        { latitude: 44.34, longitude: -79.68 },
        { latitude: 44.35, longitude: -79.71 },
        { latitude: 44.39, longitude: -79.69 },
      ],
    };

    const shapeDirectionMap = {
      route7Regular: new Set(['0']),
      route7ShortTurn: new Set(['0']),
      route7RareVariant: new Set(['0']),
    };

    const result = getRepresentativeShapeIdsByDirection(
      ['route7Regular', 'route7ShortTurn', 'route7RareVariant'],
      shapeSource,
      shapeDirectionMap,
      { maxShapes: 2, precision: 3 }
    );

    expect(result).toEqual(['route7Regular']);
  });
});
