import {
  buildDetourStopNotice,
  findStopClosureImpact,
  findUpcomingStopClosureImpact,
} from '../utils/stopNoticeUtils';

describe('stopNoticeUtils', () => {
  const impact = {
    type: 'stop_closure',
    status: 'active',
    stopId: '932',
    stopCode: '932',
    sourceTitle: 'Route 12 detour notice',
    sourceUrl: 'https://www.myridebarrie.ca/News/1/route-12-detour/',
    message: 'Stop 932 is closed for this detour.',
    endsAt: Date.parse('2026-05-20T23:59:59-04:00'),
  };

  test('matches active MyRide stop closure impacts by stop id', () => {
    expect(findStopClosureImpact({ id: '932' }, [impact])).toBe(impact);
  });

  test('matches active MyRide stop closure impacts by stop code', () => {
    expect(findStopClosureImpact({ id: 'different', code: '932' }, [impact])).toBe(impact);
  });

  test('matches upcoming stop closure impacts without marking the stop closed', () => {
    const upcoming = {
      ...impact,
      status: 'upcoming',
      startsAt: Date.parse('2026-05-20T07:00:00-04:00'),
    };

    expect(findStopClosureImpact({ code: '932' }, [upcoming])).toBeNull();
    expect(findUpcomingStopClosureImpact({ code: '932' }, [upcoming])).toBe(upcoming);
  });

  test('adds detour notice and linked MyRide closure source to a skipped-stop marker', () => {
    const result = buildDetourStopNotice({
      stop: { id: '932', code: '932', name: 'Stop 932' },
      routeId: '12',
      detour: { state: 'active', confidence: 'high' },
      transitNewsImpacts: [impact],
    });

    expect(result.isClosed).toBe(true);
    expect(result.closureImpact.sourceUrl).toBe(impact.sourceUrl);
    expect(result.detourNotice).toMatchObject({
      routeId: '12',
      title: 'Stop 932 is not served by Route 12',
      status: 'Active',
      confidence: 'high',
      sourceUrl: impact.sourceUrl,
      endsAt: impact.endsAt,
    });
  });

  test('keeps detour skipped stops route-scoped when another route still serves the stop', () => {
    const result = buildDetourStopNotice({
      stop: {
        id: '192',
        code: '192',
        name: 'Stop 192',
        affectedRouteIds: ['11'],
        servedRouteIds: ['8'],
        impactScope: 'partial',
      },
      routeId: '11',
      detour: { state: 'active', confidence: 'high' },
      transitNewsImpacts: [],
    });

    expect(result.isClosed).toBeUndefined();
    expect(result.isDetourAffected).toBe(true);
    expect(result.detourNotice).toMatchObject({
      routeId: '11',
      affectedRouteIds: ['11'],
      servedRouteIds: ['8'],
      impactScope: 'partial',
      title: 'Stop 192 is not served by Route 11',
      message: 'Use another Route 11 stop before the detour or after the route rejoins. Stop 192 may still be served by Route 8.',
    });
  });

  test('does not apply route-scoped closure news to unrelated routes', () => {
    const routeScopedImpact = {
      ...impact,
      stopId: '192',
      stopCode: '192',
      affectedRoutes: ['11'],
    };

    const result = buildDetourStopNotice({
      stop: { id: '192', code: '192', name: 'Stop 192' },
      routeId: '8',
      detour: { state: 'active', confidence: 'high' },
      transitNewsImpacts: [routeScopedImpact],
    });

    expect(result.closureImpact).toBeUndefined();
    expect(result.isClosed).toBeUndefined();
  });

  test('uses matching route-scoped closure news as detour context without globally closing the stop', () => {
    const routeScopedImpact = {
      ...impact,
      stopId: '192',
      stopCode: '192',
      affectedRoutes: ['11'],
    };

    const result = buildDetourStopNotice({
      stop: {
        id: '192',
        code: '192',
        name: 'Stop 192',
        affectedRouteIds: ['11'],
        servedRouteIds: ['8'],
      },
      routeId: '11',
      detour: { state: 'active', confidence: 'high' },
      transitNewsImpacts: [routeScopedImpact],
    });

    expect(result.isClosed).toBeUndefined();
    expect(result.closureImpact).toBeUndefined();
    expect(result.routeScopedClosureImpact).toBe(routeScopedImpact);
    expect(result.detourNotice).toMatchObject({
      sourceUrl: impact.sourceUrl,
      endsAt: impact.endsAt,
      servedRouteIds: ['8'],
      title: 'Stop 192 is not served by Route 11',
    });
  });
});
