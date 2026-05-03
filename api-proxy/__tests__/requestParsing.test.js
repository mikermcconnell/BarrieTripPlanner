const {
  parseLatLon,
  validateLatitude,
  validateLongitude,
  parseCoordinatePair,
  normalizeQuery,
  parseOptionalTimestamp,
} = require('../lib/requestParsing');

describe('requestParsing helpers', () => {
  test('parseLatLon parses valid numbers and rejects invalid values', () => {
    expect(parseLatLon('44.39', 'lat')).toBeCloseTo(44.39);
    expect(parseLatLon('-.5', 'lat')).toBeCloseTo(-0.5);
    expect(parseLatLon('1e2', 'lat')).toBe(100);
    expect(() => parseLatLon('abc', 'lat')).toThrow(/valid number/);
    expect(() => parseLatLon('44.3abc', 'lat')).toThrow(/valid number/);
    expect(() => parseLatLon('44.3,extra', 'lat')).toThrow(/valid number/);
  });

  test('validateLatitude and validateLongitude reject out-of-range values', () => {
    expect(() => validateLatitude(91, 'lat')).toThrow(/between -90 and 90/);
    expect(() => validateLongitude(-181, 'lon')).toThrow(/between -180 and 180/);
  });

  test('parseCoordinatePair enforces lat,lon format and bounds', () => {
    expect(parseCoordinatePair('44.3,-79.7', 'from')).toEqual({ lat: 44.3, lon: -79.7 });
    expect(() => parseCoordinatePair('44.3', 'from')).toThrow(/lat,lon/);
    expect(() => parseCoordinatePair('95,-79.7', 'from')).toThrow(/between -90 and 90/);
  });

  test('normalizeQuery enforces min and max length', () => {
    expect(normalizeQuery(' maple ')).toBe('maple');
    expect(() => normalizeQuery('a')).toThrow(/min 2 chars/);
    expect(() => normalizeQuery('x'.repeat(121))).toThrow(/too long/);
  });

  test('parseOptionalTimestamp accepts unix ms and ISO strings and rejects bad values', () => {
    expect(parseOptionalTimestamp('1712505600000', 'start')).toBe(1712505600000);
    expect(parseOptionalTimestamp('2026-03-01T12:00:00.000Z', 'start')).toBe(
      Date.parse('2026-03-01T12:00:00.000Z')
    );
    expect(parseOptionalTimestamp('', 'start')).toBeNull();
    expect(() => parseOptionalTimestamp('not-a-date', 'start')).toThrow(/unix timestamp/);
  });
});
