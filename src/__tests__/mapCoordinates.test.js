const {
  computeSafeMapBounds,
  isValidMapCoordinate,
  normalizeMapCoordinate,
  sanitizeMapCoordinates,
} = require('../utils/mapCoordinates');
const {
  isTripMapPreviewFeatureEnabled,
  sanitizeTripPreviewVisualization,
} = require('../utils/tripPreviewMapSafety');

describe('native map coordinate safety', () => {
  test('keeps the Android trip preview off unless it is explicitly enabled', () => {
    expect(isTripMapPreviewFeatureEnabled('android', undefined)).toBe(false);
    expect(isTripMapPreviewFeatureEnabled('android', 'false')).toBe(false);
    expect(isTripMapPreviewFeatureEnabled('android', 'true')).toBe(true);
    expect(isTripMapPreviewFeatureEnabled('web', undefined)).toBe(true);
  });

  test.each([
    null,
    {},
    { latitude: undefined, longitude: -79.7 },
    { latitude: '', longitude: -79.7 },
    { latitude: true, longitude: -79.7 },
    { latitude: NaN, longitude: -79.7 },
    { latitude: Infinity, longitude: -79.7 },
    { latitude: 91, longitude: -79.7 },
    { latitude: 44.4, longitude: -181 },
  ])('rejects an unsafe coordinate: %p', (coordinate) => {
    expect(isValidMapCoordinate(coordinate)).toBe(false);
  });

  test('normalizes supported coordinate field names and numeric strings', () => {
    expect(normalizeMapCoordinate({ lat: '44.4', lon: '-79.7' })).toEqual({
      latitude: 44.4,
      longitude: -79.7,
    });
  });

  test('handles no points, one point, and zero-span bounds safely', () => {
    expect(computeSafeMapBounds([])).toBeNull();
    const onePoint = computeSafeMapBounds([{ latitude: 44.4, longitude: -79.7 }]);
    expect(onePoint.center).toEqual({ latitude: 44.4, longitude: -79.7 });
    expect(onePoint.ne[0]).toBeGreaterThan(onePoint.sw[0]);
    expect(onePoint.ne[1]).toBeGreaterThan(onePoint.sw[1]);
  });

  test('removes invalid preview lines, markers, and vehicles at the rendering boundary', () => {
    const result = sanitizeTripPreviewVisualization({
      tripRouteCoordinates: [
        { id: 'valid', coordinates: [{ lat: 44.4, lon: -79.7 }, { lat: 44.41, lon: -79.69 }] },
        { id: 'one-point', coordinates: [{ lat: 44.4, lon: -79.7 }] },
        { id: 'invalid', coordinates: [{ lat: NaN, lon: -79.7 }] },
      ],
      tripMarkers: [
        { id: 'safe', coordinate: { latitude: 44.4, longitude: -79.7 } },
        { id: 'unsafe', coordinate: { latitude: Infinity, longitude: -79.7 } },
      ],
      tripVehicles: [
        { id: 'bus', coordinate: { latitude: 44.4, longitude: -79.7 } },
        { id: 'bad-bus', coordinate: { latitude: 44.4, longitude: 999 } },
      ],
    });

    expect(result.tripRouteCoordinates.map((line) => line.id)).toEqual(['valid']);
    expect(result.tripMarkers.map((marker) => marker.id)).toEqual(['safe']);
    expect(result.tripVehicles.map((vehicle) => vehicle.id)).toEqual(['bus']);
    expect(sanitizeMapCoordinates([{ latitude: NaN, longitude: 1 }])).toEqual([]);
  });
});
