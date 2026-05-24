const {
  buildActiveStopClosureIndex,
  annotateItinerariesWithStopClosures,
  getItineraryStopClosureNotices,
} = require('../utils/stopClosureTripWarnings');

describe('stopClosureTripWarnings', () => {
  const impacts = [
    {
      id: 'closure-509',
      type: 'stop_closure',
      status: 'active',
      stopId: '509',
      stopCode: '509',
      stopName: 'Mapleview at Lily',
      affectedRoutes: ['12B'],
      message: 'Mapleview at Lily is reported closed.',
      sourceTitle: 'Stop 509 Closure - Route 12B',
    },
    {
      id: 'closure-966',
      type: 'stop_closure',
      status: 'active',
      stopId: '966',
      stopCode: '966',
      stopName: 'Dean Avenue',
      affectedRoutes: ['8B'],
    },
    {
      id: 'closure-old',
      type: 'stop_closure',
      status: 'expired',
      stopId: '123',
      stopCode: '123',
      affectedRoutes: ['12B'],
    },
    {
      id: 'closure-future',
      type: 'stop_closure',
      status: 'upcoming',
      stopId: '400',
      stopCode: '400',
      stopName: 'Future stop',
      affectedRoutes: ['12B'],
      startsAt: Date.parse('2026-05-20T07:00:00-04:00'),
      endsAt: Date.parse('2026-05-24T23:59:59-04:00'),
    },
  ];

  const itinerary = {
    id: 'trip-1',
    legs: [
      {
        mode: 'WALK',
        to: { stopId: '509', stopCode: '509', name: 'Mapleview at Lily' },
      },
      {
        mode: 'BUS',
        route: { shortName: '12B', id: '12B' },
        from: { stopId: '509', stopCode: '509', name: 'Mapleview at Lily' },
        to: { stopId: '777', stopCode: '777', name: 'Open stop' },
      },
    ],
  };

  test('indexes only active stop closure impacts', () => {
    const index = buildActiveStopClosureIndex(impacts);

    expect(index.byStopId.get('509')).toMatchObject({ id: 'closure-509' });
    expect(index.byStopCode.get('509')).toMatchObject({ id: 'closure-509' });
    expect(index.byRoute.get('12B')).toHaveLength(1);
    expect(index.byStopId.has('123')).toBe(false);
  });

  test('flags an itinerary that boards from a closed stop', () => {
    const notices = getItineraryStopClosureNotices(itinerary, impacts);

    expect(notices.impactedStops).toHaveLength(1);
    expect(notices.impactedStops[0]).toMatchObject({
      stopCode: '509',
      stopName: 'Mapleview at Lily',
      roles: ['boarding'],
    });
    expect(notices.hasTripImpact).toBe(true);
  });

  test('adds a minor route notice when a route has a closure but this trip does not use the closed stop', () => {
    const notices = getItineraryStopClosureNotices({
      id: 'trip-2',
      legs: [{
        mode: 'BUS',
        route: { shortName: '12B', id: '12B' },
        from: { stopId: '400', stopCode: '400' },
        to: { stopId: '401', stopCode: '401' },
      }],
    }, impacts);

    expect(notices.impactedStops).toHaveLength(0);
    expect(notices.routeNotices).toHaveLength(1);
    expect(notices.hasTripImpact).toBe(false);
  });

  test('keeps upcoming route notices separate from active closures', () => {
    const notices = getItineraryStopClosureNotices({
      id: 'trip-2',
      startTime: Date.parse('2026-05-15T12:00:00-04:00'),
      legs: [{
        mode: 'BUS',
        route: { shortName: '12B', id: '12B' },
        from: { stopId: '700', stopCode: '700' },
        to: { stopId: '701', stopCode: '701' },
      }],
    }, [impacts[3]]);

    expect(notices.routeNotices).toHaveLength(0);
    expect(notices.upcomingRouteNotices).toHaveLength(1);
    expect(notices.hasTripImpact).toBe(false);
    expect(notices.hasUpcomingImpact).toBe(true);
  });

  test('upgrades an upcoming stop closure when the planned trip is during its effective window', () => {
    const notices = getItineraryStopClosureNotices({
      id: 'future-trip',
      startTime: Date.parse('2026-05-20T08:00:00-04:00'),
      legs: [{
        mode: 'BUS',
        route: { shortName: '12B', id: '12B' },
        from: { stopId: '400', stopCode: '400', name: 'Future stop' },
        to: { stopId: '777', stopCode: '777', name: 'Open stop' },
      }],
    }, [impacts[3]]);

    expect(notices.impactedStops).toHaveLength(1);
    expect(notices.upcomingImpactedStops).toHaveLength(0);
    expect(notices.impactedStops[0]).toMatchObject({
      id: 'closure-future',
      timingStatus: 'applies_to_trip',
      roles: ['boarding'],
    });
  });

  test('annotates itineraries without mutating originals', () => {
    const [annotated] = annotateItinerariesWithStopClosures([itinerary], impacts);

    expect(annotated).not.toBe(itinerary);
    expect(annotated.stopClosureNotices.hasTripImpact).toBe(true);
    expect(itinerary.stopClosureNotices).toBeUndefined();
  });
});
