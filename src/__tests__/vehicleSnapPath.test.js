const { resolveVehicleSnapPath } = require('../utils/vehicleSnapPath');

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
});
