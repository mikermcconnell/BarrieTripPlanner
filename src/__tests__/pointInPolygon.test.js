import { pointInPolygon, pointInRing } from '../utils/geometryUtils';

// Simple square polygon: corners at (44.38, -79.70) to (44.40, -79.68)
// GeoJSON coordinates: [lng, lat]
const squareRing = [
  [-79.70, 44.38],
  [-79.68, 44.38],
  [-79.68, 44.40],
  [-79.70, 44.40],
  [-79.70, 44.38], // closed ring
];

const squarePolygon = [squareRing];

// Polygon with a hole (donut shape)
const outerRing = [
  [-79.72, 44.37],
  [-79.66, 44.37],
  [-79.66, 44.41],
  [-79.72, 44.41],
  [-79.72, 44.37],
];

const holeRing = [
  [-79.70, 44.38],
  [-79.68, 44.38],
  [-79.68, 44.40],
  [-79.70, 44.40],
  [-79.70, 44.38],
];

const donutPolygon = [outerRing, holeRing];

describe('pointInRing', () => {
  it('returns true for point inside ring', () => {
    expect(pointInRing(44.39, -79.69, squareRing)).toBe(true);
  });

  it('returns false for point outside ring', () => {
    expect(pointInRing(44.50, -79.69, squareRing)).toBe(false);
  });

  it('returns false for point far outside', () => {
    expect(pointInRing(45.0, -80.0, squareRing)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  it('returns true for point inside simple polygon', () => {
    expect(pointInPolygon(44.39, -79.69, squarePolygon)).toBe(true);
  });

  it('returns false for point outside simple polygon', () => {
    expect(pointInPolygon(44.50, -79.69, squarePolygon)).toBe(false);
  });

  it('returns false for point in the hole of a donut polygon', () => {
    // Point is inside the outer ring but also inside the hole
    expect(pointInPolygon(44.39, -79.69, donutPolygon)).toBe(false);
  });

  it('returns true for point in the outer ring but not the hole', () => {
    // Point between outer ring and hole
    expect(pointInPolygon(44.375, -79.71, donutPolygon)).toBe(true);
  });

  it('handles GeoJSON [lng, lat] coordinate order correctly', () => {
    // Verify we didn't swap lat/lon
    // Point at (lat=44.39, lon=-79.69) is in the square
    expect(pointInPolygon(44.39, -79.69, squarePolygon)).toBe(true);
    // Swapped coordinates should be outside
    expect(pointInPolygon(-79.69, 44.39, squarePolygon)).toBe(false);
  });

  it('returns false for null/empty coordinates', () => {
    expect(pointInPolygon(44.39, -79.69, null)).toBe(false);
    expect(pointInPolygon(44.39, -79.69, [])).toBe(false);
  });
});
