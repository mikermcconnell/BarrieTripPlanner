const {
  buildWalkingLandmarkMarkers,
  formatNavigationLocationLabel,
} = require('../utils/navigationMapMarkers');

describe('navigationMapMarkers', () => {
  test('formats stop labels with stop codes when available', () => {
    expect(
      formatNavigationLocationLabel({ name: 'Downtown Terminal', stopCode: '1020' }, 'Fallback')
    ).toBe('Downtown Terminal (#1020)');
    expect(formatNavigationLocationLabel({ name: '440 TIFFIN ST' }, 'Fallback')).toBe('440 TIFFIN ST');
    expect(formatNavigationLocationLabel(null, 'Fallback')).toBe('Fallback');
  });

  test('builds searched start and boarding stop markers for the first walking leg', () => {
    const itinerary = {
      legs: [
        {
          mode: 'WALK',
          from: { name: '440 TIFFIN ST', lat: 44.3801, lon: -79.7021 },
          to: { name: 'Tiffin at Ferndale', lat: 44.381, lon: -79.703 },
        },
        {
          mode: 'BUS',
          from: { name: 'Ferndale at Tiffin', stopCode: '837', lat: 44.3814, lon: -79.7042 },
          to: { name: 'Downtown Terminal', stopCode: '1020', lat: 44.39, lon: -79.69 },
        },
      ],
    };

    expect(
      buildWalkingLandmarkMarkers({
        itinerary,
        currentLeg: itinerary.legs[0],
        currentLegIndex: 0,
        nextTransitLeg: itinerary.legs[1],
      })
    ).toEqual([
      {
        id: 'walk-search-origin',
        latitude: 44.3801,
        longitude: -79.7021,
        type: 'walk-start',
        title: '440 TIFFIN ST',
        caption: 'Started here',
      },
      {
        id: 'walk-target-stop-0',
        latitude: 44.3814,
        longitude: -79.7042,
        type: 'walk-target-stop',
        title: 'Ferndale at Tiffin (#837)',
        caption: 'Board here',
      },
    ]);
  });

  test('falls back to the current leg start for later walking legs', () => {
    const itinerary = {
      legs: [
        {
          mode: 'WALK',
          from: { name: '440 TIFFIN ST', lat: 44.3801, lon: -79.7021 },
          to: { name: 'Ferndale at Tiffin', stopCode: '837', lat: 44.3814, lon: -79.7042 },
        },
        {
          mode: 'BUS',
          from: { name: 'Ferndale at Tiffin', stopCode: '837', lat: 44.3814, lon: -79.7042 },
          to: { name: 'Downtown Terminal', stopCode: '1020', lat: 44.39, lon: -79.69 },
        },
        {
          mode: 'WALK',
          from: { name: 'Downtown Terminal', stopCode: '1020', lat: 44.39, lon: -79.69 },
          to: { name: '24 Maple Ave', lat: 44.3912, lon: -79.6881 },
        },
      ],
    };

    expect(
      buildWalkingLandmarkMarkers({
        itinerary,
        currentLeg: itinerary.legs[2],
        currentLegIndex: 2,
        nextTransitLeg: null,
      })
    ).toEqual([
      {
        id: 'walk-start-2',
        latitude: 44.39,
        longitude: -79.69,
        type: 'walk-start',
        title: 'Downtown Terminal (#1020)',
        caption: 'Walk starts',
      },
      {
        id: 'walk-target-destination-2',
        latitude: 44.3912,
        longitude: -79.6881,
        type: 'walk-target-destination',
        title: '24 Maple Ave',
        caption: 'Destination',
      },
    ]);
  });
});
