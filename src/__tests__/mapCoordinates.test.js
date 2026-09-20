const {
  isValidMapCoordinate,
  normalizeMapCoordinate,
  sanitizeMapCoordinates,
} = require('../utils/mapCoordinates');

describe('mapCoordinates', () => {
  test('normalizes supported coordinate shapes and numeric strings', () => {
    expect(normalizeMapCoordinate({ lat: '44.3894', lon: '-79.6903' })).toEqual({
      latitude: 44.3894,
      longitude: -79.6903,
    });
    expect(normalizeMapCoordinate({ latitude: 44.4, longitude: -79.68 })).toEqual({
      latitude: 44.4,
      longitude: -79.68,
    });
  });

  test.each([
    null,
    {},
    { latitude: NaN, longitude: -79.69 },
    { latitude: Infinity, longitude: -79.69 },
    { latitude: 91, longitude: -79.69 },
    { latitude: 44.39, longitude: -181 },
    { latitude: '', longitude: -79.69 },
    { latitude: 'not-a-number', longitude: -79.69 },
  ])('rejects invalid coordinates before they reach a map renderer: %p', (coordinate) => {
    expect(isValidMapCoordinate(coordinate)).toBe(false);
    expect(normalizeMapCoordinate(coordinate)).toBeNull();
  });

  test('drops invalid points while preserving valid map coordinates', () => {
    expect(sanitizeMapCoordinates([
      { latitude: 44.38, longitude: -79.7 },
      { latitude: undefined, longitude: -79.69 },
      { lat: '44.39', lon: '-79.68' },
      { latitude: 400, longitude: -79.67 },
    ])).toEqual([
      { latitude: 44.38, longitude: -79.7 },
      { latitude: 44.39, longitude: -79.68 },
    ]);
  });
});
