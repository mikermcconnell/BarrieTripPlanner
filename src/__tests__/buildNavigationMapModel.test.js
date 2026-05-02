const { buildNavigationMapModel } = require('../features/navigation/model/buildNavigationMapModel');

describe('buildNavigationMapModel', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('suppresses base markers during walking legs and builds walking landmark markers', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'));

    const itinerary = {
      legs: [
        {
          mode: 'WALK',
          from: { name: 'Origin', lat: 44.3801, lon: -79.7021 },
          to: { name: 'Boarding stop', lat: 44.381, lon: -79.703 },
        },
        {
          mode: 'BUS',
          from: { name: 'Grizzlies Way at Duckworth', stopCode: '245', lat: 44.3814, lon: -79.7042 },
          to: { name: 'Downtown Terminal', stopCode: '1020', lat: 44.39, lon: -79.69 },
        },
      ],
    };

    const model = buildNavigationMapModel({
      itinerary,
      currentLeg: itinerary.legs[0],
      currentLegIndex: 0,
      isWalkingLeg: true,
      nextTransitLeg: itinerary.legs[1],
      nextTransitProximity: {
        estimatedArrival: new Date('2026-03-20T12:04:00Z'),
        hasArrived: false,
      },
    });

    expect(model.mapMarkers).toEqual([]);
    expect(model.busStopMarker).toBeNull();
    expect(model.walkingLandmarkMarkers).toEqual([
      expect.objectContaining({
        type: 'walk-start',
        caption: 'Started here',
      }),
      expect.objectContaining({
        type: 'walk-target-stop',
        title: 'Grizzlies Way at Duckworth (#245)',
        detail: 'Bus in 4 min',
      }),
    ]);
  });

  test('labels the final walk after a bus as get off then walk here', () => {
    const itinerary = {
      legs: [
        {
          mode: 'BUS',
          from: { name: 'Bayfield Mall', stopCode: '100', lat: 44.4, lon: -79.7 },
          to: { name: 'Downtown Terminal', stopCode: '102', lat: 44.41, lon: -79.69 },
        },
        {
          mode: 'WALK',
          from: { name: 'Downtown Terminal', stopCode: '102', lat: 44.41, lon: -79.69 },
          to: { name: '24 Maple Ave', lat: 44.412, lon: -79.688 },
        },
      ],
    };

    const model = buildNavigationMapModel({
      itinerary,
      currentLeg: itinerary.legs[1],
      currentLegIndex: 1,
      isWalkingLeg: true,
      nextTransitLeg: null,
    });

    expect(model.mapMarkers).toEqual([]);
    expect(model.walkingLandmarkMarkers).toEqual([
      expect.objectContaining({
        type: 'walk-start',
        title: 'Downtown Terminal (#102)',
        caption: 'Get off here',
      }),
      expect.objectContaining({
        type: 'walk-target-destination',
        title: '24 Maple Ave',
        caption: 'Walk here',
      }),
    ]);
  });

  test('builds all onboard transit stop markers for an active transit leg', () => {
    const itinerary = {
      legs: [
        {
          mode: 'BUS',
          from: { name: 'Bayfield Mall', stopCode: '100', lat: 44.4, lon: -79.7, stopId: 'STOP-100' },
          intermediateStops: [
            { name: 'Cundles', stopCode: '101', lat: 44.405, lon: -79.695, stopId: 'STOP-101' },
            { name: 'Wellington', stopCode: '102', lat: 44.407, lon: -79.693, stopId: 'STOP-102' },
          ],
          to: { name: 'Downtown Terminal', stopCode: '103', lat: 44.41, lon: -79.69, stopId: 'STOP-103' },
        },
      ],
    };

    const model = buildNavigationMapModel({
      itinerary,
      currentLeg: itinerary.legs[0],
      currentLegIndex: 0,
      isWalkingLeg: false,
      currentTransitLeg: itinerary.legs[0],
      transitStatus: 'on_board',
      isUserOnBoard: true,
      liveStopsRemaining: 2,
    });

    expect(model.mapMarkers).toEqual([
      expect.objectContaining({ type: 'origin', title: 'Start' }),
      expect.objectContaining({ type: 'destination', title: 'End' }),
    ]);
    expect(model.busStopMarker).toBeNull();
    expect(model.transitStopMarkers).toEqual([
      expect.objectContaining({
        type: 'transit-intermediate-stop',
        title: 'Cundles (#101)',
        showLabel: false,
      }),
      expect.objectContaining({
        type: 'transit-next-stop',
        title: 'Wellington (#102)',
        caption: 'Next stop',
        showLabel: true,
      }),
      expect.objectContaining({
        type: 'transit-alight-stop',
        title: 'Downtown Terminal (#103)',
        caption: 'Your stop',
        showLabel: true,
      }),
    ]);
  });
});
