const {
  haversineDistance,
  pointToSegmentDistance,
  pointToPolylineDistance,
} = require('../geometry');

describe('haversineDistance', () => {
  test('known distance between Barrie Downtown Terminal and a point ~1km away', () => {
    // Barrie Downtown Terminal
    const lat1 = 44.3891;
    const lon1 = -79.6903;
    // Point roughly 1km north (0.009 degrees latitude ~ 1km)
    const lat2 = 44.3981;
    const lon2 = -79.6903;

    const dist = haversineDistance(lat1, lon1, lat2, lon2);
    // ~1001m for 0.009 degrees at this latitude
    expect(dist).toBeGreaterThan(950);
    expect(dist).toBeLessThan(1050);
  });

  test('same point returns 0', () => {
    const dist = haversineDistance(44.3891, -79.6903, 44.3891, -79.6903);
    expect(dist).toBe(0);
  });
});

describe('pointToSegmentDistance', () => {
  test('point directly on segment returns approximately 0', () => {
    const segStart = { latitude: 44.39, longitude: -79.70 };
    const segEnd = { latitude: 44.39, longitude: -79.68 };
    // Midpoint of the segment
    const point = { latitude: 44.39, longitude: -79.69 };

    const dist = pointToSegmentDistance(point, segStart, segEnd);
    expect(dist).toBeLessThan(1); // less than 1 meter
  });

  test('point perpendicular to segment midpoint', () => {
    const segStart = { latitude: 44.39, longitude: -79.70 };
    const segEnd = { latitude: 44.39, longitude: -79.68 };
    // Point ~111m north of segment midpoint (0.001 deg latitude ~ 111m)
    const point = { latitude: 44.391, longitude: -79.69 };

    const dist = pointToSegmentDistance(point, segStart, segEnd);
    // Should be roughly 111m (perpendicular distance)
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(125);
  });

  test('point past segment endpoint snaps to endpoint', () => {
    const segStart = { latitude: 44.39, longitude: -79.70 };
    const segEnd = { latitude: 44.39, longitude: -79.68 };
    // Point well past the eastern endpoint
    const point = { latitude: 44.39, longitude: -79.67 };

    const dist = pointToSegmentDistance(point, segStart, segEnd);
    // Distance from point to segEnd: haversine(44.39, -79.67, 44.39, -79.68)
    const expectedDist = haversineDistance(44.39, -79.67, 44.39, -79.68);
    expect(dist).toBeCloseTo(expectedDist, 0);
  });
});

describe('pointToPolylineDistance', () => {
  test('empty polyline returns Infinity', () => {
    const point = { latitude: 44.39, longitude: -79.69 };
    expect(pointToPolylineDistance(point, [])).toBe(Infinity);
    expect(pointToPolylineDistance(point, null)).toBe(Infinity);
    expect(pointToPolylineDistance(point, undefined)).toBe(Infinity);
  });

  test('multi-segment polyline, point near middle segment', () => {
    const polyline = [
      { latitude: 44.39, longitude: -79.72 },
      { latitude: 44.39, longitude: -79.70 },
      { latitude: 44.39, longitude: -79.68 },
      { latitude: 44.39, longitude: -79.66 },
    ];
    // Point near the middle segment (-79.70 to -79.68), slightly north
    const point = { latitude: 44.3905, longitude: -79.69 };

    const dist = pointToPolylineDistance(point, polyline);
    // ~55m north of the middle segment (0.0005 deg ~ 55m)
    expect(dist).toBeGreaterThan(40);
    expect(dist).toBeLessThan(70);
  });
});
