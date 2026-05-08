const {
  getPolylineDistanceMidpoint,
} = require('../utils/detourLabelAnchors');

describe('detourLabelAnchors', () => {
  test('returns the actual midpoint for a two-point line', () => {
    const midpoint = getPolylineDistanceMidpoint([
      { latitude: 44.39047, longitude: -79.6855 },
      { latitude: 44.39267, longitude: -79.68558 },
    ]);

    expect(midpoint.latitude).toBeCloseTo(44.39157, 5);
    expect(midpoint.longitude).toBeCloseTo(-79.68554, 5);
  });

  test('uses distance along the line rather than the middle array item', () => {
    const midpoint = getPolylineDistanceMidpoint([
      { latitude: 44.39043, longitude: -79.69007 },
      { latitude: 44.39262, longitude: -79.68792 },
      { latitude: 44.39267, longitude: -79.68558 },
    ]);

    expect(midpoint.latitude).not.toBeCloseTo(44.39262, 5);
    expect(midpoint.longitude).not.toBeCloseTo(-79.68792, 5);
    expect(midpoint.longitude).toBeGreaterThan(-79.69007);
    expect(midpoint.longitude).toBeLessThan(-79.68558);
  });
});
