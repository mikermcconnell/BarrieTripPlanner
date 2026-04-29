const {
  extractShapeSegment,
} = require('../utils/polylineUtils');

describe('extractShapeSegment', () => {
  test('extracts a segment between two points on a shape', () => {
    const shape = [
      { latitude: 44.38, longitude: -79.7 },
      { latitude: 44.381, longitude: -79.699 },
      { latitude: 44.385, longitude: -79.695 },
      { latitude: 44.39, longitude: -79.69 },
    ];

    expect(
      extractShapeSegment(shape, 44.3801, -79.6999, 44.3899, -79.6901)
    ).toEqual(shape);
  });

  test('reverses the segment when the end point appears earlier in the shape', () => {
    const shape = [
      { latitude: 44.38, longitude: -79.7 },
      { latitude: 44.381, longitude: -79.699 },
      { latitude: 44.385, longitude: -79.695 },
      { latitude: 44.39, longitude: -79.69 },
    ];

    expect(
      extractShapeSegment(shape, 44.3899, -79.6901, 44.3801, -79.6999)
    ).toEqual([...shape].reverse());
  });
});
