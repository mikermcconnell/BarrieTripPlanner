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
    expect(impact.affectedStopRoles).toContain('boarding');
    expect(impact.affectedStopNames).toContain('Origin Stop');
    expect(impact.message).toContain('boarding or exit stop may be affected');
  });

  test('escalates when an intermediate stop is affected', () => {
    const impact = getLegDetourImpact({
      leg: busLeg,
      activeDetours,
      detourStopDetailsByRouteId: {
        10: {
          segmentStopDetails: [{
            affectedStops: [{ stopId: 'S2', stopCode: '1002', name: 'Middle Stop' }],
          }],
        },
      },
    });

    expect(impact.severity).toBe('stop_affected');
    expect(impact.affectedStopRoles).toContain('intermediate');
    expect(impact.message).toContain('stops along this ride may be affected');
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
});
