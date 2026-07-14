import {
  CARTOGRAPHIC_ROUTE_PROFILES,
  __TEST_ONLY__,
  getCartographicRouteCoordinates,
} from '../utils/cartographicRouteGeometry';
import { haversineDistance } from '../utils/geometryUtils';
import fs from 'fs';
import path from 'path';

const ORIGIN = { latitude: 44.3894, longitude: -79.6903 };
const METERS_PER_LATITUDE_DEGREE = 111_320;
const METERS_PER_LONGITUDE_DEGREE = 79_700;

const pointAtMeters = (eastMeters, northMeters) => ({
  latitude: ORIGIN.latitude + (northMeters / METERS_PER_LATITUDE_DEGREE),
  longitude: ORIGIN.longitude + (eastMeters / METERS_PER_LONGITUDE_DEGREE),
});

const distance = (a, b) => haversineDistance(
  a.latitude,
  a.longitude,
  b.latitude,
  b.longitude
);

describe('cartographic route geometry', () => {
  test('removes small GTFS zigzags from an otherwise straight corridor', () => {
    const noisy = Array.from({ length: 11 }, (_, index) => (
      pointAtMeters(index * 50, index === 0 || index === 10 ? 0 : (index % 2 === 0 ? 5 : -5))
    ));

    const cleaned = getCartographicRouteCoordinates(noisy, { zoom: 12 });

    expect(cleaned.length).toBeLessThanOrEqual(3);
    expect(cleaned[0]).toBe(noisy[0]);
    expect(cleaned[cleaned.length - 1]).toBe(noisy[noisy.length - 1]);
  });

  test('preserves a meaningful street corner while simplifying its approaches', () => {
    const route = [
      pointAtMeters(0, 0),
      pointAtMeters(35, 2),
      pointAtMeters(70, -2),
      pointAtMeters(100, 0),
      pointAtMeters(102, 35),
      pointAtMeters(98, 70),
      pointAtMeters(100, 110),
    ];

    const cleaned = getCartographicRouteCoordinates(route, { zoom: 12 });
    const closestToCorner = Math.min(...cleaned.map((point) => distance(point, pointAtMeters(100, 0))));

    expect(closestToCorner).toBeLessThan(8);
    expect(cleaned.length).toBeLessThan(route.length);
  });

  test('limits route-length reduction and falls back when cleanup is too aggressive', () => {
    const curved = Array.from({ length: 17 }, (_, index) => {
      const angle = (Math.PI / 2) * (index / 16);
      return pointAtMeters(Math.sin(angle) * 120, (1 - Math.cos(angle)) * 120);
    });

    const cleaned = getCartographicRouteCoordinates(curved, { zoom: 12 });
    const rawLength = __TEST_ONLY__.measurePathLength(curved);
    const cleanedLength = __TEST_ONLY__.measurePathLength(cleaned);

    expect(cleanedLength / rawLength).toBeGreaterThanOrEqual(
      1 - CARTOGRAPHIC_ROUTE_PROFILES.city.maxLengthReductionRatio - 0.001
    );
  });

  test('returns the authoritative geometry unchanged at street-detail zoom', () => {
    const route = [pointAtMeters(0, 0), pointAtMeters(50, 3), pointAtMeters(100, 0)];

    expect(getCartographicRouteCoordinates(route, { zoom: 16 })).toBe(route);
  });

  test('caches display geometry by source-array reference and zoom profile', () => {
    const route = [
      pointAtMeters(0, 0),
      pointAtMeters(40, 4),
      pointAtMeters(80, -4),
      pointAtMeters(120, 0),
    ];

    const first = getCartographicRouteCoordinates(route, { zoom: 12 });
    const second = getCartographicRouteCoordinates(route, { zoom: 12.8 });

    expect(second).toBe(first);
  });

  test('drops invalid and near-duplicate points without throwing', () => {
    const start = pointAtMeters(0, 0);
    const route = [
      start,
      { ...start },
      { latitude: Number.NaN, longitude: -79.69 },
      pointAtMeters(50, 0),
    ];

    const cleaned = getCartographicRouteCoordinates(route, { zoom: 12 });

    expect(cleaned).toHaveLength(2);
    cleaned.forEach((point) => {
      expect(Number.isFinite(point.latitude)).toBe(true);
      expect(Number.isFinite(point.longitude)).toBe(true);
    });
  });

  test('is applied only at the native and web rendering boundary', () => {
    const nativeHome = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.js'), 'utf8');
    const webHome = fs.readFileSync(path.join(__dirname, '../screens/HomeScreen.web.impl.js'), 'utf8');
    const displayedEntities = fs.readFileSync(path.join(__dirname, '../hooks/useDisplayedEntities.js'), 'utf8');
    const vehicleSnapPath = fs.readFileSync(path.join(__dirname, '../utils/vehicleSnapPath.js'), 'utf8');

    expect(nativeHome).toContain('getCartographicRouteCoordinates(coordinates');
    expect(webHome).toContain('getCartographicRouteCoordinates(coordinates');
    expect(displayedEntities).not.toContain('getCartographicRouteCoordinates');
    expect(vehicleSnapPath).not.toContain('getCartographicRouteCoordinates');
  });
});
