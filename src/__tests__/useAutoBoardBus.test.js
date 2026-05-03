const { shouldAutoBoardBus } = require('../hooks/useAutoBoardBus');

describe('useAutoBoardBus helpers', () => {
  test('allows auto-boarding only for an active transit leg with high-confidence evidence', () => {
    expect(shouldAutoBoardBus({
      currentTransitLeg: { mode: 'BUS' },
      transitStatus: 'waiting',
      busProximity: { autoBoardReady: true },
    })).toBe(true);

    expect(shouldAutoBoardBus({
      currentTransitLeg: { mode: 'TRANSIT' },
      transitStatus: 'boarding',
      busProximity: { autoBoardReady: true },
    })).toBe(true);
  });

  test('blocks auto-boarding when the rider is not clearly on the bus', () => {
    expect(shouldAutoBoardBus({
      currentTransitLeg: { mode: 'BUS' },
      transitStatus: 'waiting',
      busProximity: { autoBoardReady: false },
    })).toBe(false);

    expect(shouldAutoBoardBus({
      currentTransitLeg: { mode: 'WALK' },
      transitStatus: 'waiting',
      busProximity: { autoBoardReady: true },
    })).toBe(false);

    expect(shouldAutoBoardBus({
      currentTransitLeg: { mode: 'BUS' },
      transitStatus: 'on_board',
      busProximity: { autoBoardReady: true },
    })).toBe(false);
  });
});
