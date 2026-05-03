const { buildWalkPaceStatus } = require('../utils/walkPaceStatus');

describe('buildWalkPaceStatus', () => {
  const nowMs = new Date('2026-05-01T12:00:00Z').getTime();

  test('shows on-pace buffer against the scheduled bus departure', () => {
    const status = buildWalkPaceStatus({
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: nowMs + 7 * 60 * 1000,
      },
      nowMs,
    });

    expect(status).toMatchObject({
      level: 'hurry',
      headline: '3 min buffer',
      detail: 'Bus departs in 7 min · 4 min walk',
      bufferLabel: '3 min buffer',
    });
  });

  test('marks five minutes or more of walking buffer as green', () => {
    const status = buildWalkPaceStatus({
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: nowMs + 9 * 60 * 1000,
      },
      nowMs,
    });

    expect(status).toMatchObject({
      level: 'plenty',
      headline: '5 min buffer',
      detail: 'Bus departs in 9 min · 4 min walk',
      bufferLabel: '5 min buffer',
    });
  });

  test('marks under two minutes of walking buffer as red', () => {
    const status = buildWalkPaceStatus({
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: nowMs + 5 * 60 * 1000,
      },
      nowMs,
    });

    expect(status).toMatchObject({
      level: 'behind',
      headline: '1 min buffer',
      detail: 'Bus departs in 5 min · 4 min walk',
      bufferLabel: '1 min buffer',
    });
  });

  test('uses live bus arrival when available and warns when the rider is behind', () => {
    const status = buildWalkPaceStatus({
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: nowMs + 10 * 60 * 1000,
      },
      nextTransitProximity: {
        estimatedArrival: new Date(nowMs + 2 * 60 * 1000),
        isTracking: true,
      },
      nowMs,
    });

    expect(status).toMatchObject({
      level: 'behind',
      headline: '2 min behind',
      detail: 'Bus arrives in 2 min · 4 min walk',
      bufferLabel: '2 min behind',
    });
  });

  test('treats an arrived live bus as needing immediate action', () => {
    const status = buildWalkPaceStatus({
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
      },
      nextTransitLeg: {
        mode: 'BUS',
        startTime: nowMs + 10 * 60 * 1000,
      },
      nextTransitProximity: {
        hasArrived: true,
        isTracking: true,
      },
      nowMs,
    });

    expect(status).toMatchObject({
      level: 'behind',
      headline: '4 min behind',
      detail: 'Bus is here · 4 min walk',
      bufferLabel: '4 min behind',
    });
  });

  test('does not say bus is here when proximity is arrived but scheduled departure is still far away', () => {
    const status = buildWalkPaceStatus({
      currentLeg: {
        mode: 'WALK',
        duration: 4 * 60,
        distance: 400,
      },
      distanceToDestination: 0,
      nextTransitLeg: {
        mode: 'BUS',
        startTime: nowMs + 13 * 60 * 1000,
      },
      nextTransitProximity: {
        hasArrived: true,
        isTracking: true,
        matchQuality: 'route_nearest',
      },
      nowMs,
    });

    expect(status).toMatchObject({
      level: 'plenty',
      headline: '13 min buffer',
      detail: 'Bus departs in 13 min · 1 min walk',
      bufferLabel: '13 min buffer',
    });
  });

  test('scales remaining walk time from distance to the stop', () => {
    const status = buildWalkPaceStatus({
      currentLeg: {
        mode: 'WALK',
        duration: 10 * 60,
        distance: 1000,
      },
      distanceToDestination: 300,
      nextTransitLeg: {
        mode: 'BUS',
        startTime: nowMs + 8 * 60 * 1000,
      },
      nowMs,
    });

    expect(status).toMatchObject({
      level: 'plenty',
      headline: '5 min buffer',
      detail: 'Bus departs in 8 min · 3 min walk',
      bufferLabel: '5 min buffer',
    });
  });

  test('returns null when there is no next bus to catch', () => {
    expect(buildWalkPaceStatus({
      currentLeg: { mode: 'WALK', duration: 4 * 60 },
      nextTransitLeg: null,
      nowMs,
    })).toBeNull();
  });
});
