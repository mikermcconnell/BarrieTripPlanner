const {
  buildTransitStopSequence,
  buildTransitStopProgress,
  getRemainingTransitStops,
  getTransitStopsRemainingCount,
} = require('../utils/transitStopUtils');

describe('transitStopUtils', () => {
  const leg = {
    from: { name: 'Downtown Terminal', lat: 44.1, lon: -79.6, stopId: '100' },
    intermediateStops: [
      { name: 'Stop 1', lat: 44.11, lon: -79.61, stopId: '101' },
      { name: 'Stop 2', lat: 44.12, lon: -79.62, stopId: '102' },
    ],
    to: { name: 'Penetang at St Vincent', lat: 44.13, lon: -79.63, stopId: '583' },
  };

  test('builds the full boarding to alighting stop sequence', () => {
    const sequence = buildTransitStopSequence(leg);

    expect(sequence.map((stop) => stop.type)).toEqual([
      'boarding',
      'intermediate',
      'intermediate',
      'alighting',
    ]);
    expect(sequence[3].name).toBe('Penetang at St Vincent');
  });

  test('returns all remaining stops after boarding, including the final alighting stop', () => {
    const remaining = getRemainingTransitStops(leg, {
      latitude: 44.1,
      longitude: -79.6,
    });

    expect(remaining.map((stop) => stop.name)).toEqual([
      'Stop 1',
      'Stop 2',
      'Penetang at St Vincent',
    ]);
  });

  test('never drops the final alighting stop from the remaining list', () => {
    const remaining = getRemainingTransitStops(leg, {
      latitude: 44.1299,
      longitude: -79.6299,
    });

    expect(remaining).toHaveLength(1);
    expect(remaining[0].type).toBe('alighting');
  });

  test('counts remaining stops using live data when available and falls back to full static count', () => {
    expect(getTransitStopsRemainingCount(leg, 2)).toBe(2);
    expect(getTransitStopsRemainingCount(leg)).toBe(3);
  });

  test('builds stop progress with passed and next-stop state from live remaining count', () => {
    const progress = buildTransitStopProgress(leg, 2);

    expect(progress.boardingStop.name).toBe('Downtown Terminal');
    expect(progress.alightingStop.name).toBe('Penetang at St Vincent');
    expect(progress.totalStopsBetween).toBe(2);
    expect(progress.remainingCount).toBe(2);
    expect(progress.passedCount).toBe(1);
    expect(progress.nextStop.name).toBe('Stop 2');
    expect(progress.stops.map((stop) => ({
      name: stop.name,
      isPassed: stop.isPassed,
      isNext: stop.isNext,
      isAlighting: stop.isAlighting,
    }))).toEqual([
      {
        name: 'Stop 1',
        isPassed: true,
        isNext: false,
        isAlighting: false,
      },
      {
        name: 'Stop 2',
        isPassed: false,
        isNext: true,
        isAlighting: false,
      },
      {
        name: 'Penetang at St Vincent',
        isPassed: false,
        isNext: false,
        isAlighting: true,
      },
    ]);
  });
});
