/**
 * Tests for geometry utility functions used in detour detection
 */

const {
  haversineDistance,
  pointToSegmentDistance,
  pointToPolylineDistance,
  pathsOverlap,
  simplifyPath,
  calculatePathCentroid,
} = require('../utils/geometryUtils');

describe('geometryUtils', () => {
  describe('haversineDistance', () => {
    test('returns 0 for same point', () => {
      const dist = haversineDistance(44.3894, -79.6903, 44.3894, -79.6903);
      expect(dist).toBe(0);
    });

    test('calculates distance between two known points', () => {
      // Downtown Barrie to Barrie South (approximately 5km)
      const dist = haversineDistance(44.3894, -79.6903, 44.3500, -79.6903);
      expect(dist).toBeGreaterThan(4000); // At least 4km
      expect(dist).toBeLessThan(5000); // Less than 5km
    });

    test('returns small distance for nearby points', () => {
      // Two points about 50m apart
      const dist = haversineDistance(44.3894, -79.6903, 44.3898, -79.6903);
      expect(dist).toBeGreaterThan(40);
      expect(dist).toBeLessThan(60);
    });
  });

  describe('pointToSegmentDistance', () => {
    test('returns distance to closest point on segment', () => {
      const point = { latitude: 44.39, longitude: -79.69 };
      const segStart = { latitude: 44.38, longitude: -79.69 };
      const segEnd = { latitude: 44.40, longitude: -79.69 };

      const dist = pointToSegmentDistance(point, segStart, segEnd);
      // Point is on the line, so distance should be ~0
      expect(dist).toBeLessThan(10);
    });

    test('returns distance to endpoint when projection is outside segment', () => {
      const point = { latitude: 44.35, longitude: -79.69 };
      const segStart = { latitude: 44.38, longitude: -79.69 };
      const segEnd = { latitude: 44.40, longitude: -79.69 };

      const dist = pointToSegmentDistance(point, segStart, segEnd);
      // Point is south of segment, distance to segStart
      expect(dist).toBeGreaterThan(3000); // ~3km south
    });

    test('returns distance to segment when point is perpendicular', () => {
      const point = { latitude: 44.39, longitude: -79.68 }; // East of segment
      const segStart = { latitude: 44.38, longitude: -79.69 };
      const segEnd = { latitude: 44.40, longitude: -79.69 };

      const dist = pointToSegmentDistance(point, segStart, segEnd);
      // ~750m east
      expect(dist).toBeGreaterThan(500);
      expect(dist).toBeLessThan(1000);
    });
  });

  describe('pointToPolylineDistance', () => {
    test('returns Infinity for empty polyline', () => {
      const point = { latitude: 44.39, longitude: -79.69 };
      expect(pointToPolylineDistance(point, [])).toBe(Infinity);
      expect(pointToPolylineDistance(point, null)).toBe(Infinity);
    });

    test('returns distance to single point polyline', () => {
      const point = { latitude: 44.39, longitude: -79.69 };
      const polyline = [{ latitude: 44.38, longitude: -79.69 }];

      const dist = pointToPolylineDistance(point, polyline);
      expect(dist).toBeGreaterThan(1000); // ~1.1km
      expect(dist).toBeLessThan(1500);
    });

    test('returns minimum distance to multi-segment polyline', () => {
      const point = { latitude: 44.39, longitude: -79.69 };
      const polyline = [
        { latitude: 44.38, longitude: -79.70 },
        { latitude: 44.38, longitude: -79.68 },
        { latitude: 44.40, longitude: -79.68 },
      ];

      const dist = pointToPolylineDistance(point, polyline);
      // Point should be closest to the middle segment
      expect(dist).toBeLessThan(1500);
    });

    test('returns ~0 for point on polyline', () => {
      const point = { latitude: 44.39, longitude: -79.69 };
      const polyline = [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.40, longitude: -79.69 },
      ];

      const dist = pointToPolylineDistance(point, polyline);
      expect(dist).toBeLessThan(10); // Essentially 0
    });
  });

  describe('pathsOverlap', () => {
    test('returns false for empty paths', () => {
      expect(pathsOverlap([], [])).toBe(false);
      expect(pathsOverlap(null, null)).toBe(false);
      expect(pathsOverlap([{ latitude: 44.39, longitude: -79.69 }], [])).toBe(false);
    });

    test('returns true for identical paths', () => {
      const path = [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.40, longitude: -79.69 },
      ];

      expect(pathsOverlap(path, path, 50, 0.7)).toBe(true);
    });

    test('returns true for nearly identical paths', () => {
      const path1 = [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.40, longitude: -79.69 },
      ];
      const path2 = [
        { latitude: 44.3801, longitude: -79.6901 },
        { latitude: 44.3901, longitude: -79.6901 },
        { latitude: 44.4001, longitude: -79.6901 },
      ];

      // Small offset, should still overlap within 50m corridor
      expect(pathsOverlap(path1, path2, 100, 0.7)).toBe(true);
    });

    test('returns false for completely different paths', () => {
      const path1 = [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.69 },
      ];
      const path2 = [
        { latitude: 44.50, longitude: -79.80 }, // Far away
        { latitude: 44.51, longitude: -79.80 },
      ];

      expect(pathsOverlap(path1, path2, 50, 0.7)).toBe(false);
    });

    test('returns false when only partially overlapping below threshold', () => {
      const path1 = [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.40, longitude: -79.69 },
        { latitude: 44.41, longitude: -79.69 },
      ];
      const path2 = [
        { latitude: 44.38, longitude: -79.69 }, // Same start
        { latitude: 44.39, longitude: -79.69 },
        { latitude: 44.40, longitude: -79.80 }, // Diverges here
        { latitude: 44.41, longitude: -79.80 },
      ];

      // Only 50% overlap, threshold is 70%
      expect(pathsOverlap(path1, path2, 50, 0.7)).toBe(false);
    });
  });

  describe('simplifyPath', () => {
    test('returns original for paths with 2 or fewer points', () => {
      const path1 = [{ latitude: 44.38, longitude: -79.69 }];
      const path2 = [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.69 },
      ];

      expect(simplifyPath(path1)).toEqual(path1);
      expect(simplifyPath(path2)).toEqual(path2);
      expect(simplifyPath(null)).toBeNull();
    });

    test('removes points too close together', () => {
      // Points very close together (< 20m)
      const path = [
        { latitude: 44.3800, longitude: -79.69 },
        { latitude: 44.38005, longitude: -79.69 }, // ~5m away
        { latitude: 44.3801, longitude: -79.69 }, // ~5m away
        { latitude: 44.39, longitude: -79.69 }, // ~1km away
      ];

      const simplified = simplifyPath(path, 20);
      // Should keep first, skip middle close points, keep last
      expect(simplified.length).toBeLessThan(path.length);
      expect(simplified[0]).toEqual(path[0]);
      expect(simplified[simplified.length - 1]).toEqual(path[path.length - 1]);
    });

    test('always includes first and last points', () => {
      const path = [
        { latitude: 44.38, longitude: -79.69 },
        { latitude: 44.3805, longitude: -79.69 },
        { latitude: 44.381, longitude: -79.69 },
        { latitude: 44.39, longitude: -79.69 },
      ];

      const simplified = simplifyPath(path, 100);
      expect(simplified[0]).toEqual(path[0]);
      expect(simplified[simplified.length - 1]).toEqual(path[path.length - 1]);
    });
  });

  describe('calculatePathCentroid', () => {
    test('returns null for empty path', () => {
      expect(calculatePathCentroid([])).toBeNull();
      expect(calculatePathCentroid(null)).toBeNull();
    });

    test('returns the point for single-point path', () => {
      const path = [{ latitude: 44.39, longitude: -79.69 }];
      const centroid = calculatePathCentroid(path);
      expect(centroid.latitude).toBe(44.39);
      expect(centroid.longitude).toBe(-79.69);
    });

    test('returns average for multi-point path', () => {
      const path = [
        { latitude: 44.38, longitude: -79.70 },
        { latitude: 44.40, longitude: -79.68 },
      ];

      const centroid = calculatePathCentroid(path);
      expect(centroid.latitude).toBe(44.39);
      expect(centroid.longitude).toBe(-79.69);
    });
  });
});
