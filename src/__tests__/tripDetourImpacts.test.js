const {
  annotateItinerariesWithDetours,
  getLegDetourImpact,
} = require('../utils/tripDetourImpacts');

describe('tripDetourImpacts', () => {
  const busLeg = {
    mode: 'BUS',
    route: { id: '10', shortName: '10' },
    from: { stopId: 'S1', stopCode: '1001', name: 'Origin Stop' },
    to: { stopId: 'S3', stopCode: '1003', name: 'Destination Stop' },
    intermediateStops: [
      { stopId: 'S2', stopCode: '1002', name: 'Middle Stop' },
    ],
  };

  const activeDetours = {
    10: { routeId: '10', state: 'active' },
  };

  test('flags a route-level detour when planned stops are not affected', () => {
    const impact = getLegDetourImpact({
      leg: busLeg,
      activeDetours,
      detourStopDetailsByRouteId: {
        10: {
          segmentStopDetails: [{
            skippedStops: [{ stopId: 'S9', stopCode: '1009', name: 'Other Stop' }],
            affectedStops: [{ stopId: 'S8', stopCode: '1008', name: 'Other Area' }],
          }],
        },
      },
    });

    expect(impact).toMatchObject({
      severity: 'route_detour',
      detourRouteId: '10',
      message: 'Route 10 is currently on detour.',
    });
  });

  test('keeps boundary-only stop impacts at route-level severity', () => {
    const impact = getLegDetourImpact({
      leg: busLeg,
      activeDetours,
      detourStopDetailsByRouteId: {
        10: {
          segmentStopDetails: [{
            skippedStops: [],
            affectedStops: [
              { stopId: 'S1', stopCode: '1001', name: 'Origin Stop', detourStopRole: 'boundary' },
              { stopId: 'S3', stopCode: '1003', name: 'Destination Stop', detourStopRole: 'boundary' },
            ],
          }],
        },
      },
    });

    expect(impact.severity).toBe('route_detour');
    expect(impact.impactScope).toBe('route');
    expect(impact.affectedStops).toEqual([]);
    expect(impact.message).toBe('Route 10 is currently on detour.');
  });

  test('escalates when the boarding stop is skipped by the detour', () => {
    const impact = getLegDetourImpact({
      leg: busLeg,
      activeDetours,
      detourStopDetailsByRouteId: {
        10: {
          segmentStopDetails: [{
            skippedStops: [{ stopId: 'S1', stopCode: '1001', name: 'Origin Stop' }],
          }],
        },
      },
    });

    expect(impact.severity).toBe('stop_affected');
    expect(impact.impactScope).toBe('boarding_stop');
    expect(impact.affectedStopRoles).toContain('boarding');
    expect(impact.affectedStopNames).toContain('Origin Stop');
    expect(impact.message).toContain('your boarding stop may be missed');
    expect(impact.guidance).toContain('Board before the detour');
  });

  test('gives specific guidance when the exit stop is skipped by the detour', () => {
    const impact = getLegDetourImpact({
      leg: busLeg,
      activeDetours,
      detourStopDetailsByRouteId: {
        10: {
          segmentStopDetails: [{
            skippedStops: [{ stopId: 'S3', stopCode: '1003', name: 'Destination Stop' }],
          }],
        },
      },
    });

    expect(impact.severity).toBe('stop_affected');
    expect(impact.impactScope).toBe('exit_stop');
    expect(impact.message).toContain('your exit stop may be missed');
    expect(impact.guidance).toContain('Get off after the route rejoins');
  });

  test('escalates when an intermediate stop is skipped', () => {
    const impact = getLegDetourImpact({
      leg: busLeg,
      activeDetours,
      detourStopDetailsByRouteId: {
        10: {
          segmentStopDetails: [{
            skippedStops: [{ stopId: 'S2', stopCode: '1002', name: 'Middle Stop' }],
          }],
        },
      },
    });

    expect(impact.severity).toBe('stop_affected');
    expect(impact.impactScope).toBe('ride_stops');
    expect(impact.affectedStopRoles).toContain('intermediate');
    expect(impact.message).toContain('stops along this ride may be missed');
  });

  test('annotates itinerary legs without mutating originals', () => {
    const itinerary = { id: 'trip-1', legs: [busLeg] };
    const [annotated] = annotateItinerariesWithDetours(
      [itinerary],
      activeDetours,
      {
        10: {
          segmentStopDetails: [{
            skippedStops: [{ stopId: 'S3', stopCode: '1003', name: 'Destination Stop' }],
          }],
        },
      }
    );

    expect(annotated).not.toBe(itinerary);
    expect(annotated.legs[0]).not.toBe(busLeg);
    expect(annotated.hasDetour).toBe(true);
    expect(annotated.hasStopDetourImpact).toBe(true);
    expect(annotated.detourImpacts).toHaveLength(1);
    expect(busLeg.detourImpact).toBeUndefined();
  });

  test('tags alternatives that avoid an active detour when other results are affected', () => {
    const detouredTrip = { id: 'detoured', legs: [busLeg] };
    const clearTrip = {
      id: 'clear',
      labels: ['Fastest'],
      legs: [{
        ...busLeg,
        route: { id: '7', shortName: '7' },
      }],
    };

    const [detoured, clear] = annotateItinerariesWithDetours(
      [detouredTrip, clearTrip],
      activeDetours,
      {
        10: {
          segmentStopDetails: [{
            skippedStops: [{ stopId: 'S1', stopCode: '1001', name: 'Origin Stop' }],
          }],
        },
      }
    );

    expect(detoured.hasDetour).toBe(true);
    expect(clear.hasDetour).toBe(false);
    expect(clear.detourAlternativeStatus).toBe('avoids_active_detour');
    expect(clear.labels).toEqual(['Fastest', 'Avoids Detour']);
  });

  test('base route plans match active branch detours', () => {
    const impact = getLegDetourImpact({
      leg: {
        ...busLeg,
        route: { id: '8', shortName: '8' },
      },
      activeDetours: {
        '8B': { routeId: '8B', state: 'active' },
      },
      detourStopDetailsByRouteId: {
        '8B': { segmentStopDetails: [{ skippedStops: [] }] },
      },
    });

    expect(impact).toMatchObject({
      severity: 'route_detour',
      detourRouteId: '8B',
    });
  });

  test('adds official baseline impact warnings without active detours', () => {
    const [annotated] = annotateItinerariesWithDetours(
      [{ id: 'official-trip', legs: [{
        ...busLeg,
        route: { id: '12B', shortName: '12B' },
        to: { stopId: 'bsgo', stopCode: '833', name: 'Barrie South GO' },
      }] }],
      {},
      {},
      [{
        id: 'baseline-detour-12b-1652',
        type: 'baseline_detour',
        status: 'active',
        title: 'Mapleview Detour and Shuttle',
        message: 'Route 12B no longer directly serves Barrie South GO.',
        affectedRoutes: ['12B'],
        replacementRoutes: ['15'],
        removedStops: [{ id: 'bsgo', code: '833', name: 'Barrie South GO' }],
        sourceUrl: 'https://myridebarrie.ca/News/1652/mapleview-detour-and-shuttle/',
      }]
    );

    expect(annotated.hasOfficialServiceImpact).toBe(true);
    expect(annotated.legs[0].detourImpact).toMatchObject({
      isOfficial: true,
      impactType: 'official_service_impact',
      sourceLabel: 'Planned detour notice',
      severity: 'stop_affected',
      message: 'Planned detour notice: Route 12B no longer directly serves Barrie South GO. Use Route 15 shuttle.',
    });
  });
});
