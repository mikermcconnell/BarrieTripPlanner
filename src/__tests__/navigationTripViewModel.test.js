const { buildNavigationTripViewModel } = require('../utils/navigationTripViewModel');

describe('navigationTripViewModel', () => {
  const itinerary = {
    legs: [
      {
        mode: 'WALK',
        to: { name: 'Downtown Terminal' },
        distance: 250,
      },
      {
        mode: 'BUS',
        route: { shortName: '8A' },
        from: { name: 'Downtown Terminal', stopCode: '1020' },
        to: { name: 'Georgian Mall' },
        startTime: Date.UTC(2026, 2, 7, 13, 15),
        distance: 4200,
      },
      {
        mode: 'WALK',
        from: { name: 'Georgian Mall' },
        to: { name: 'Bayfield St' },
        duration: 360,
        distance: 450,
      },
      {
        mode: 'BUS',
        route: { shortName: '1' },
        from: { name: 'Bayfield St', stopCode: '2045' },
        to: { name: 'Royal Victoria' },
        distance: 3100,
      },
    ],
  };

  test('builds preview text and totals for a walking leg that leads to transit', () => {
    const viewModel = buildNavigationTripViewModel({
      itinerary,
      currentLegIndex: 0,
      currentLeg: itinerary.legs[0],
      distanceToDestination: 180,
    });

    expect(viewModel.isWalkingLeg).toBe(true);
    expect(viewModel.isTransitLeg).toBe(false);
    expect(viewModel.nextTransitLeg).toBe(itinerary.legs[1]);
    expect(viewModel.isLastWalkingLeg).toBe(false);
    expect(viewModel.nextLegPreviewText).toContain('Then board Route 8A');
    expect(viewModel.nextLegPreviewText).toContain('Downtown Terminal (#1020)');
    expect(viewModel.finalDestination).toBe('Royal Victoria');
    expect(viewModel.totalRemainingDistance).toBe(7930);
  });

  test('builds peek-ahead text for a transit leg followed by a transfer walk', () => {
    const viewModel = buildNavigationTripViewModel({
      itinerary,
      currentLegIndex: 1,
      currentLeg: itinerary.legs[1],
      distanceToDestination: 950,
    });

    expect(viewModel.currentTransitLeg).toBe(itinerary.legs[1]);
    expect(viewModel.isTransitLeg).toBe(true);
    expect(viewModel.transitPeekAheadText).toContain('Next: Walk 6 min');
    expect(viewModel.transitPeekAheadText).toContain('Bayfield St (#2045)');
    expect(viewModel.transitPeekAheadText).toContain('for Route 1');
    expect(viewModel.totalRemainingDistance).toBe(4500);
  });
});
