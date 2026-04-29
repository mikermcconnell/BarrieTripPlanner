import { getRouteDisplayShapes, getDisplayGeometryMetadata } from '../utils/routeDisplayGeometry';

describe('routeDisplayGeometry', () => {
  test('falls back to GTFS shapes when generated geometry is unavailable', () => {
    const gtfsShapes = {
      shapeA: [
        { latitude: 44.1, longitude: -79.1 },
        { latitude: 44.2, longitude: -79.2 },
      ],
    };

    expect(getRouteDisplayShapes(gtfsShapes)).toEqual(gtfsShapes);
  });

  test('exposes metadata for diagnostics', () => {
    expect(getDisplayGeometryMetadata()).toEqual(expect.objectContaining({
      generatedShapeCount: expect.any(Number),
      manualOverrideCount: expect.any(Number),
    }));
  });
});
