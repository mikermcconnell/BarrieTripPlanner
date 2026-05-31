import {
  annotateStopsWithClosures,
  deriveMappableStopClosureStops,
  mergeStopClosuresForDetourMap,
} from '../utils/stopClosureMapUtils';

describe('stopClosureMapUtils', () => {
  const stops = [
    {
      id: 'stop-932',
      code: '932',
      name: 'Stop 932',
      latitude: 44.389,
      longitude: -79.69,
    },
    {
      id: '187',
      code: '187',
      name: 'Collier at Clapperton',
      latitude: 44.3898,
      longitude: -79.6892,
    },
  ];

  const activeImpact = {
    id: 'impact-932',
    type: 'stop_closure',
    status: 'active',
    stopId: '932',
    stopCode: '932',
    sourceTitle: 'Route 12 detour notice',
    endsAt: Date.parse('2026-05-20T23:59:59-04:00'),
  };

  test('derives active MyRide stop closures from GTFS stops for map display', () => {
    const result = deriveMappableStopClosureStops({
      impacts: [activeImpact],
      stops,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'stop-932',
      code: '932',
      name: 'Stop 932',
      latitude: 44.389,
      longitude: -79.69,
      isClosed: true,
      isNewsClosure: true,
      closureImpact: activeImpact,
    });
  });

  test('skips unresolved closures that have no map coordinates', () => {
    const result = deriveMappableStopClosureStops({
      impacts: [
        {
          type: 'stop_closure',
          status: 'active',
          stopId: '981',
          stopCode: '981',
        },
      ],
      stops,
    });

    expect(result).toEqual([]);
  });

  test('uses impact coordinates when GTFS stop lookup is unavailable', () => {
    const impact = {
      type: 'stop_closure',
      status: 'active',
      stopId: 'temporary-1',
      stopCode: 'T1',
      stopName: 'Temporary stop',
      latitude: '44.4',
      longitude: '-79.7',
    };

    const result = deriveMappableStopClosureStops({ impacts: [impact], stops });

    expect(result[0]).toMatchObject({
      id: 'temporary-1',
      code: 'T1',
      name: 'Temporary stop',
      latitude: 44.4,
      longitude: -79.7,
      isClosed: true,
    });
  });

  test('annotates normal displayed stops by stop code', () => {
    const result = annotateStopsWithClosures(
      [{ id: 'different-id', code: '932', name: 'Stop 932' }],
      [activeImpact]
    );

    expect(result[0]).toMatchObject({
      id: 'different-id',
      code: '932',
      isClosed: true,
      closureImpact: activeImpact,
    });
  });

  test('does not mark route-scoped stop impacts as globally closed', () => {
    const routeScopedImpact = {
      ...activeImpact,
      affectedRoutes: ['11'],
    };

    const result = annotateStopsWithClosures(
      [{ id: 'different-id', code: '932', name: 'Stop 932' }],
      [routeScopedImpact]
    );

    expect(result[0].isClosed).toBeUndefined();
    expect(result[0].closureImpact).toBeUndefined();
  });

  test('keeps route-scoped closure markers from carrying global closure impact data', () => {
    const routeScopedImpact = {
      ...activeImpact,
      affectedRoutes: ['11'],
    };

    const closures = deriveMappableStopClosureStops({
      impacts: [routeScopedImpact],
      stops,
    });
    const result = mergeStopClosuresForDetourMap({
      displayedStops: [],
      closureStops: closures,
      includeClosures: true,
    });

    expect(result[0]).toMatchObject({
      isRouteScopedClosure: true,
      routeScopedClosureImpact: routeScopedImpact,
      isNewsClosure: true,
    });
    expect(result[0].isClosed).toBeUndefined();
    expect(result[0].closureImpact).toBeUndefined();
  });

  test('adds upcoming closure context without marking the stop closed', () => {
    const upcomingImpact = {
      ...activeImpact,
      status: 'upcoming',
      startsAt: Date.parse('2026-05-20T07:00:00-04:00'),
    };

    const result = annotateStopsWithClosures(
      [{ id: 'different-id', code: '932', name: 'Stop 932' }],
      [upcomingImpact]
    );

    expect(result[0]).toMatchObject({
      id: 'different-id',
      code: '932',
      upcomingClosureImpact: upcomingImpact,
    });
    expect(result[0].isClosed).toBeUndefined();
    expect(result[0].closureImpact).toBeUndefined();
  });

  test('adds closure stops to detour map without duplicating displayed stops', () => {
    const displayed = [{ ...stops[0], isClosed: true, closureImpact: activeImpact }];
    const closures = deriveMappableStopClosureStops({
      impacts: [
        activeImpact,
        {
          type: 'stop_closure',
          status: 'active',
          stopId: '187',
          stopCode: '187',
        },
      ],
      stops,
    });

    const result = mergeStopClosuresForDetourMap({
      displayedStops: displayed,
      closureStops: closures,
      includeClosures: true,
    });

    expect(result.map((stop) => stop.code).sort()).toEqual(['187', '932']);
  });
});
