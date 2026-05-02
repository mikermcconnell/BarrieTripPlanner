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
    expect(viewModel.onBoardPeekAheadText).toBe('After this bus: 6 min walk');
    expect(viewModel.totalRemainingDistance).toBe(4500);
  });

  test('uses compact peek-ahead text for a transit leg followed by a final walk', () => {
    const finalWalkItinerary = {
      legs: [
        {
          mode: 'BUS',
          route: { shortName: '8A' },
          from: { name: 'Downtown Terminal', stopCode: '1020' },
          to: { name: 'Georgian Mall' },
          distance: 4200,
        },
        {
          mode: 'WALK',
          from: { name: 'Georgian Mall' },
          to: { name: '24 Maple Ave' },
          duration: 180,
          distance: 260,
        },
      ],
    };

    const viewModel = buildNavigationTripViewModel({
      itinerary: finalWalkItinerary,
      currentLegIndex: 0,
      currentLeg: finalWalkItinerary.legs[0],
      distanceToDestination: 900,
    });

    expect(viewModel.transitPeekAheadText).toBe('Next: Walk 3 min to 24 Maple Ave');
    expect(viewModel.onBoardPeekAheadText).toBe('After this bus: 3 min walk');
  });

  test('treats a final walk after transit as the last walking leg', () => {
    const finalWalkItinerary = {
      legs: [
        {
          mode: 'BUS',
          route: { shortName: '8A' },
          from: { name: 'Downtown Terminal', stopCode: '1020' },
          to: { name: 'Georgian Mall' },
          distance: 4200,
        },
        {
          mode: 'WALK',
          from: { name: 'Georgian Mall' },
          to: { name: '24 Maple Ave' },
          duration: 240,
          distance: 320,
        },
      ],
    };

    const viewModel = buildNavigationTripViewModel({
      itinerary: finalWalkItinerary,
      currentLegIndex: 1,
      currentLeg: finalWalkItinerary.legs[1],
      distanceToDestination: 200,
    });

    expect(viewModel.isWalkingLeg).toBe(true);
    expect(viewModel.nextTransitLeg).toBeNull();
    expect(viewModel.isLastWalkingLeg).toBe(true);
    expect(viewModel.nextLegPreviewText).toBeNull();
    expect(viewModel.finalDestination).toBe('24 Maple Ave');
  });
});
