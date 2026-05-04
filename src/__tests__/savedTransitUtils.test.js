const {
  SAVED_PLACE_LABELS,
  getSavedPlaceIconName,
  getSavedPlacePickerOptions,
  buildSavedPlacePayload,
  buildSavedTripPayload,
  getSavedLocationPoint,
  getSavedPlaceDisplayName,
  getSavedTripDisplayName,
  getSavedPlaceTargetField,
  findMatchingSavedPlaces,
  getSavedPlaceMapMarkers,
  getRankedSavedPlaces,
  getRankedSavedTrips,
  getRecurringTripSuggestion,
  clusterSavedPlaceMapMarkers,
  normalizeSavedLocation,
} = require('../utils/savedTransitUtils');

describe('savedTransitUtils', () => {
  test('provides rider-friendly saved place labels', () => {
    expect(SAVED_PLACE_LABELS.home.label).toBe('Home');
    expect(SAVED_PLACE_LABELS.work.icon).toBe('Work');
    expect(SAVED_PLACE_LABELS.custom.label).toBe('Custom');
  });

  test('lists every saved place label in one picker without a More step', () => {
    const options = getSavedPlacePickerOptions();

    expect(options.map((option) => option.label)).toEqual([
      'Home',
      'Work',
      'School',
      'Groceries',
      'Gym',
      'Doctor',
      'Save location',
    ]);
    expect(options.some((option) => option.label === 'More')).toBe(false);
  });

  test('resolves semantic icons for saved places even when older records have no icon', () => {
    expect(getSavedPlaceIconName({ name: 'Home' })).toBe('Home');
    expect(getSavedPlaceIconName({ labelType: 'work' })).toBe('Work');
    expect(getSavedPlaceIconName({ name: 'Groceries' })).toBe('Grocery');
    expect(getSavedPlaceIconName({ name: 'Custom spot' })).toBe('MapPin');
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

  test('finds saved places by friendly name before address search results', () => {
    const results = findMatchingSavedPlaces('work', [
      { id: 'work', name: '70 Collier St', labelType: 'work', addressText: '70 Collier St', lat: 44.389, lon: -79.69 },
      { id: 'home', name: 'Home', addressText: '10 Maple Ave', lat: 44.38, lon: -79.7 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'saved-work',
      source: 'saved_place',
      shortName: 'Work',
      displayName: 'Saved place · 70 Collier St',
      lat: 44.389,
      lon: -79.69,
    });
  });

  test('finds saved places by every saved-place type and common rider aliases', () => {
    const savedPlaces = [
      { id: 'home', name: '11 Home St', labelType: 'home', addressText: '11 Home St', lat: 44.38, lon: -79.69 },
      { id: 'work', name: '70 Collier St', labelType: 'work', addressText: '70 Collier St', lat: 44.389, lon: -79.69 },
      { id: 'school', name: 'Georgian College', labelType: 'school', addressText: '1 Georgian Dr', lat: 44.41, lon: -79.67 },
      { id: 'grocery', name: 'No Frills', labelType: 'grocery', addressText: 'Blake St', lat: 44.39, lon: -79.68 },
      { id: 'gym', name: 'YMCA', labelType: 'gym', addressText: 'Grove St', lat: 44.4, lon: -79.7 },
      { id: 'doctor', name: 'Family clinic', labelType: 'doctor', addressText: 'Bayfield St', lat: 44.41, lon: -79.71 },
    ];

    expect(findMatchingSavedPlaces('house', savedPlaces)[0].shortName).toBe('Home');
    expect(findMatchingSavedPlaces('office', savedPlaces)[0].shortName).toBe('Work');
    expect(findMatchingSavedPlaces('college', savedPlaces)[0].shortName).toBe('Georgian College');
    expect(findMatchingSavedPlaces('grocery', savedPlaces)[0].shortName).toBe('No Frills');
    expect(findMatchingSavedPlaces('fitness', savedPlaces)[0].shortName).toBe('YMCA');
    expect(findMatchingSavedPlaces('medical', savedPlaces)[0].shortName).toBe('Family clinic');
  });

  test('builds map markers for every valid saved place using its saved icon', () => {
    const markers = getSavedPlaceMapMarkers([
      { id: 'home', name: '11 Home St', labelType: 'home', addressText: '11 Home St', lat: 44.38, lon: -79.69 },
      { id: 'gym', name: 'YMCA', labelType: 'gym', addressText: 'Grove St', lat: 44.4, lon: -79.7 },
      { id: 'bad', name: 'Bad', lat: null, lon: -79.7 },
    ]);

    expect(markers).toEqual([
      expect.objectContaining({
        id: 'saved-place-home',
        name: 'Home',
        icon: 'Home',
        coordinate: { latitude: 44.38, longitude: -79.69 },
      }),
      expect.objectContaining({
        id: 'saved-place-gym',
        name: 'YMCA',
        icon: 'Gym',
        coordinate: { latitude: 44.4, longitude: -79.7 },
      }),
    ]);
  });

  test('ranks saved places by pinned status, time-of-day relevance, and recent use', () => {
    const ranked = getRankedSavedPlaces([
      { id: 'gym', name: 'Gym', labelType: 'gym', lat: 44.4, lon: -79.7, lastUsedAt: '2026-05-01T12:00:00Z' },
      { id: 'work', name: 'Work', labelType: 'work', lat: 44.39, lon: -79.69, lastUsedAt: '2026-04-01T12:00:00Z' },
      { id: 'home', name: 'Home', labelType: 'home', lat: 44.38, lon: -79.68, lastUsedAt: '2026-04-01T12:00:00Z' },
    ], { now: new Date('2026-05-04T08:00:00-04:00') });

    expect(ranked.map((place) => place.id)).toEqual(['work', 'home', 'gym']);
  });

  test('ranks saved routes with pinned and frequently used routes first', () => {
    const ranked = getRankedSavedTrips([
      { id: 'errand', name: 'Errand', useCount: 7, lastUsedAt: '2026-05-01T12:00:00Z' },
      { id: 'commute', name: 'Morning commute', isPinned: true, useCount: 1, lastUsedAt: '2026-04-01T12:00:00Z' },
      { id: 'library', name: 'Library', useCount: 1, lastUsedAt: '2026-05-02T12:00:00Z' },
    ]);

    expect(ranked.map((trip) => trip.id)).toEqual(['commute', 'errand', 'library']);
  });

  test('suggests saving a route when the same recent trip appears repeatedly and is not already saved', () => {
    const suggestion = getRecurringTripSuggestion({
      recentTrips: [
        { fromText: 'Home', toText: 'Work', from: { lat: 44.38, lon: -79.69 }, to: { lat: 44.39, lon: -79.68 } },
        { fromText: 'Home', toText: 'Work', from: { lat: 44.38, lon: -79.69 }, to: { lat: 44.39, lon: -79.68 } },
        { fromText: 'Gym', toText: 'Home', from: { lat: 44.4, lon: -79.7 }, to: { lat: 44.38, lon: -79.69 } },
      ],
      savedTrips: [],
    });

    expect(suggestion).toMatchObject({
      name: 'Home to Work',
      count: 2,
      fromText: 'Home',
      toText: 'Work',
    });
  });

  test('does not suggest saving a recurring route that is already saved', () => {
    const suggestion = getRecurringTripSuggestion({
      recentTrips: [
        { fromText: 'Home', toText: 'Work', from: { lat: 44.38, lon: -79.69 }, to: { lat: 44.39, lon: -79.68 } },
        { fromText: 'Home', toText: 'Work', from: { lat: 44.38, lon: -79.69 }, to: { lat: 44.39, lon: -79.68 } },
      ],
      savedTrips: [
        { id: 'home-work', from: { lat: 44.38, lon: -79.69 }, to: { lat: 44.39, lon: -79.68 } },
      ],
    });

    expect(suggestion).toBeNull();
  });

  test('clusters nearby saved-place map markers so dense maps stay usable', () => {
    const markers = clusterSavedPlaceMapMarkers([
      { id: 'home', name: 'Home', coordinate: { latitude: 44.38001, longitude: -79.69001 } },
      { id: 'work', name: 'Work', coordinate: { latitude: 44.38002, longitude: -79.69002 } },
      { id: 'gym', name: 'Gym', coordinate: { latitude: 44.42, longitude: -79.72 } },
    ]);

    expect(markers).toEqual([
      expect.objectContaining({
        id: expect.stringContaining('saved-place-cluster'),
        isCluster: true,
        count: 2,
        name: '2 saved places',
      }),
      expect.objectContaining({ id: 'gym', name: 'Gym', isCluster: false }),
    ]);
  });

  test('chooses destination for the first saved place and origin when destination already exists', () => {
    expect(getSavedPlaceTargetField({ from: null, to: null })).toBe('to');
    expect(getSavedPlaceTargetField({ from: null, to: { lat: 44.4, lon: -79.7 } })).toBe('from');
    expect(getSavedPlaceTargetField({ from: { lat: 44.38, lon: -79.69 }, to: { lat: 44.4, lon: -79.7 } })).toBe('from');
  });
});
