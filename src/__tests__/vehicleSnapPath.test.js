const { buildVehicleSnapShapeCandidates, resolveVehicleSnapPath } = require('../utils/vehicleSnapPath');

describe('resolveVehicleSnapPath', () => {
  const routeShapeA = [{ latitude: 44.38, longitude: -79.69 }, { latitude: 44.39, longitude: -79.69 }];
  const routeShapeB = [{ latitude: 44.4, longitude: -79.7 }, { latitude: 44.41, longitude: -79.7 }];

  test('prefers the vehicle trip shape when it is rendered', () => {
    const snapPath = resolveVehicleSnapPath(
      { routeId: '2A', shapeId: 'shape-b' },
      [
        { routeId: '2A', shapeId: 'shape-a', coordinates: routeShapeA },
        { routeId: '2A', shapeId: 'shape-b', coordinates: routeShapeB },
      ]
    );

    expect(snapPath).toBe(routeShapeB);
  });

  test('falls back to a rendered route shape when the exact trip shape is unavailable', () => {
    const snapPath = resolveVehicleSnapPath(
      { routeId: '2A', shapeId: 'missing-shape' },
      [
        { routeId: '2A', shapeId: 'shape-a', coordinates: routeShapeA },
        { routeId: '7A', shapeId: 'shape-b', coordinates: routeShapeB },
      ]
    );

    expect(snapPath).toBe(routeShapeA);
  });

  test('uses trip mapping shape id when the vehicle does not include shape id', () => {
    const snapPath = resolveVehicleSnapPath(
      { routeId: '2A', tripId: 'trip-2A-east' },
      [
        { routeId: '2A', shapeId: 'shape-a', coordinates: routeShapeA },
        { routeId: '2A', shapeId: 'shape-b', coordinates: routeShapeB },
      ],
      {
        'trip-2A-east': { routeId: '2A', shapeId: 'shape-b' },
      }
    );

    expect(snapPath).toBe(routeShapeB);
  });

  test('uses supplemental full trip shape when the exact shape is not currently rendered', () => {
    const snapPath = resolveVehicleSnapPath(
      { routeId: '2A', tripId: 'trip-2A-east' },
      [
        { routeId: '2A', shapeId: 'shape-a:tail:0', coordinates: routeShapeA },
      ],
      {
        'trip-2A-east': { routeId: '2A', shapeId: 'shape-b' },
      },
      [
        { routeId: '2A', shapeId: 'shape-b', coordinates: routeShapeB },
      ]
    );

    expect(snapPath).toBe(routeShapeB);
  });

  test('builds full snap candidates from route shape mapping', () => {
    const candidates = buildVehicleSnapShapeCandidates({
      routeShapeMapping: { '2A': ['shape-a', 'shape-b'] },
      processedShapes: { 'shape-b': routeShapeB },
      shapes: { 'shape-a': routeShapeA, 'shape-b': routeShapeA },
    });

    expect(candidates).toEqual([
      { id: '2A:shape-a', routeId: '2A', shapeId: 'shape-a', coordinates: routeShapeA },
      { id: '2A:shape-b', routeId: '2A', shapeId: 'shape-b', coordinates: routeShapeB },
    ]);
  });
});
