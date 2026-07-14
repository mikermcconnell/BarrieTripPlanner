import { getItineraryNavigationBlock } from '../utils/tripNavigationSafety';

const baseItinerary = {
  legs: [{
    mode: 'BUS',
    startTime: 1000,
    endTime: 2000,
    from: { name: 'Start', stopId: 'A' },
    to: { name: 'End', stopId: 'B' },
  }],
};

describe('trip navigation safety', () => {
  test('blocks navigation when a detour may skip the boarding stop', () => {
    const block = getItineraryNavigationBlock({
      ...baseItinerary,
      detourImpacts: [{
        severity: 'stop_affected',
        impactScope: 'boarding_stop',
        guidance: 'Use the next open stop.',
      }],
    });

    expect(block).toEqual(expect.objectContaining({
      code: 'DETOUR_STOP_UNAVAILABLE',
      message: 'Use the next open stop.',
    }));
  });

  test('keeps navigation available when only intermediate ride stops are skipped', () => {
    expect(getItineraryNavigationBlock({
      ...baseItinerary,
      detourImpacts: [{
        severity: 'stop_affected',
        impactScope: 'ride_stops',
      }],
    })).toBeNull();
  });

  test('blocks closed endpoints, missed trips, and impossible walking transfers', () => {
    expect(getItineraryNavigationBlock({
      ...baseItinerary,
      stopClosureNotices: {
        hasTripImpact: true,
        impactedStops: [{ roles: ['alighting'] }],
      },
    })?.code).toBe('STOP_CLOSED');

    expect(getItineraryNavigationBlock({
      ...baseItinerary,
      hasMissedDeparture: true,
    })?.code).toBe('MISSED_DEPARTURE');

    expect(getItineraryNavigationBlock({
      legs: [
        { mode: 'BUS', startTime: 0, endTime: 10 * 60 * 1000, tripId: 'a' },
        { mode: 'WALK', duration: 5 * 60 },
        { mode: 'BUS', startTime: 13 * 60 * 1000, endTime: 20 * 60 * 1000, tripId: 'b' },
      ],
    })?.code).toBe('IMPOSSIBLE_TRANSFER');
  });

  test('does not invent an impossible transfer when schedule times are missing', () => {
    expect(getItineraryNavigationBlock({
      legs: [
        { mode: 'BUS', startTime: 0, endTime: null, tripId: 'a' },
        { mode: 'WALK', duration: 5 * 60 },
        { mode: 'BUS', startTime: 13 * 60 * 1000, endTime: 20 * 60 * 1000, tripId: 'b' },
      ],
    })).toBeNull();
  });
});
