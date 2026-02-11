const {
  DEFAULT_SELECTED_LOCATION_LABEL,
  buildSelectedStopParams,
  buildSelectedRouteParams,
  buildSelectedAddressParams,
  normalizeSelectedRouteId,
  getSelectedAddressFromParams,
} = require('../utils/mapSelection');

describe('mapSelection utilities', () => {
  test('buildSelectedStopParams returns stop id payload', () => {
    expect(buildSelectedStopParams({ id: '1234' })).toEqual({ selectedStopId: '1234' });
  });

  test('buildSelectedRouteParams returns route id payload', () => {
    expect(buildSelectedRouteParams({ id: '2A' })).toEqual({ selectedRouteId: '2A' });
  });

  test('buildSelectedAddressParams prioritizes shortName', () => {
    const params = buildSelectedAddressParams({
      lat: 44.389,
      lon: -79.69,
      shortName: 'Barrie Transit Terminal',
      displayName: 'Barrie Transit Terminal, Barrie, Ontario',
    });

    expect(params).toEqual({
      selectedCoordinate: { latitude: 44.389, longitude: -79.69 },
      selectedAddressLabel: 'Barrie Transit Terminal',
    });
  });

  test('buildSelectedAddressParams falls back to default label', () => {
    const params = buildSelectedAddressParams({ lat: 44.4, lon: -79.7 });

    expect(params.selectedAddressLabel).toBe(DEFAULT_SELECTED_LOCATION_LABEL);
  });

  test('normalizeSelectedRouteId returns string id for route params', () => {
    expect(normalizeSelectedRouteId({ selectedRouteId: 2 })).toBe('2');
    expect(normalizeSelectedRouteId({ selectedRouteId: '8A' })).toBe('8A');
  });

  test('normalizeSelectedRouteId returns null for empty route params', () => {
    expect(normalizeSelectedRouteId({ selectedRouteId: '' })).toBeNull();
    expect(normalizeSelectedRouteId({ selectedRouteId: undefined })).toBeNull();
    expect(normalizeSelectedRouteId(null)).toBeNull();
  });

  test('getSelectedAddressFromParams returns normalized coordinate and label', () => {
    const result = getSelectedAddressFromParams({
      selectedCoordinate: { latitude: 44.39, longitude: -79.68 },
      selectedAddressLabel: 'Downtown',
    });

    expect(result).toEqual({
      coordinate: { latitude: 44.39, longitude: -79.68 },
      label: 'Downtown',
    });
  });

  test('getSelectedAddressFromParams returns null for invalid coordinates', () => {
    expect(
      getSelectedAddressFromParams({
        selectedCoordinate: { latitude: '44.39', longitude: -79.68 },
      })
    ).toBeNull();

    expect(getSelectedAddressFromParams({})).toBeNull();
  });
});
