const {
  SAVED_PLACE_LABELS,
  buildSavedPlacePayload,
  buildSavedTripPayload,
  getSavedLocationPoint,
  getSavedPlaceDisplayName,
  getSavedTripDisplayName,
  getSavedPlaceTargetField,
  normalizeSavedLocation,
} = require('../utils/savedTransitUtils');

describe('savedTransitUtils', () => {
  test('provides rider-friendly saved place labels', () => {
    expect(SAVED_PLACE_LABELS.home.label).toBe('Home');
    expect(SAVED_PLACE_LABELS.work.icon).toBe('Work');
    expect(SAVED_PLACE_LABELS.custom.label).toBe('Custom');
  });

  test('normalizes locations from mixed coordinate shapes', () => {
    expect(normalizeSavedLocation({ name: 'Library', latitude: '44.389', longitude: '-79.69' })).toEqual({
      name: 'Library',
      addressText: 'Library',
      lat: 44.389,
      lon: -79.69,
    });

    expect(normalizeSavedLocation({ shortName: 'Mall', lat: 44.4, lon: -79.7 })).toEqual({
      name: 'Mall',
      addressText: 'Mall',
      lat: 44.4,
      lon: -79.7,
    });
  });

  test('returns null for invalid saved locations', () => {
    expect(normalizeSavedLocation(null)).toBeNull();
    expect(normalizeSavedLocation({ name: 'Bad', lat: null, lon: -79.7 })).toBeNull();
    expect(normalizeSavedLocation({ name: 'Bad', lat: 'nope', lon: -79.7 })).toBeNull();
  });

  test('builds a saved place payload with default label metadata', () => {
    const payload = buildSavedPlacePayload({
      labelType: 'home',
      location: { name: '123 Maple Ave', lat: 44.38, lon: -79.69 },
    });

    expect(payload).toMatchObject({
      id: 'home',
      name: 'Home',
      labelType: 'home',
      icon: 'Home',
      addressText: '123 Maple Ave',
      lat: 44.38,
      lon: -79.69,
      isPinned: true,
    });
  });

  test('builds named custom saved places without overwriting their address text', () => {
    const payload = buildSavedPlacePayload({
      labelType: 'grocery',
      name: 'No Frills',
      location: { name: 'No Frills, Blake St', lat: 44.39, lon: -79.68 },
    });

    expect(payload).toMatchObject({
      id: 'grocery',
      name: 'No Frills',
      labelType: 'grocery',
      icon: 'Grocery',
      addressText: 'No Frills, Blake St',
    });
  });

  test('builds a saved trip payload without storing the full itinerary', () => {
    const payload = buildSavedTripPayload({
      from: { name: 'Home', lat: 44.38, lon: -79.69 },
      to: { name: 'Work', lat: 44.4, lon: -79.7 },
      itinerary: { duration: 1800, transfers: 1, walkDistance: 350, legs: [{ mode: 'BUS' }] },
    });

    expect(payload.name).toBe('Home to Work');
    expect(payload.from).toEqual({ name: 'Home', addressText: 'Home', lat: 44.38, lon: -79.69 });
    expect(payload.to).toEqual({ name: 'Work', addressText: 'Work', lat: 44.4, lon: -79.7 });
    expect(payload.summary).toEqual({ duration: 1800, transfers: 1, walkDistance: 350 });
    expect(payload.itinerary).toBeUndefined();
  });

  test('returns display names and point objects', () => {
    const place = { name: 'Home', addressText: '123 Maple Ave', lat: 44.38, lon: -79.69 };
    const trip = { from: { name: 'Home' }, to: { name: 'Work' } };

    expect(getSavedPlaceDisplayName(place)).toBe('Home');
    expect(getSavedTripDisplayName(trip)).toBe('Home to Work');
    expect(getSavedLocationPoint(place)).toEqual({ lat: 44.38, lon: -79.69 });
  });

  test('chooses destination for the first saved place and origin when destination already exists', () => {
    expect(getSavedPlaceTargetField({ from: null, to: null })).toBe('to');
    expect(getSavedPlaceTargetField({ from: null, to: { lat: 44.4, lon: -79.7 } })).toBe('from');
    expect(getSavedPlaceTargetField({ from: { lat: 44.38, lon: -79.69 }, to: { lat: 44.4, lon: -79.7 } })).toBe('from');
  });
});
