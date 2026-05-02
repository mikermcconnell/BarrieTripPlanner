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

  test('annotates itineraries without mutating originals', () => {
    const [annotated] = annotateItinerariesWithStopClosures([itinerary], impacts);

    expect(annotated).not.toBe(itinerary);
    expect(annotated.stopClosureNotices.hasTripImpact).toBe(true);
    expect(itinerary.stopClosureNotices).toBeUndefined();
  });
});
