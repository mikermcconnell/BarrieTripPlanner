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

  test('blocks a same-stop transfer with only 30 seconds to change buses', () => {
    expect(getItineraryNavigationBlock({
      legs: [
        { mode: 'BUS', startTime: 0, endTime: 10 * 60 * 1000, tripId: 'a' },
        { mode: 'BUS', startTime: 10.5 * 60 * 1000, endTime: 20 * 60 * 1000, tripId: 'b' },
      ],
    })?.code).toBe('IMPOSSIBLE_TRANSFER');
  });

  test('accepts a same-stop transfer with exactly the minimum 60-second buffer', () => {
    expect(getItineraryNavigationBlock({
      legs: [
        { mode: 'BUS', startTime: 0, endTime: 10 * 60 * 1000, tripId: 'a' },
        { mode: 'BUS', startTime: 11 * 60 * 1000, endTime: 20 * 60 * 1000, tripId: 'b' },
      ],
    })).toBeNull();
  });

  test('requires both transfer walking time and the 60-second interchange buffer', () => {
    expect(getItineraryNavigationBlock({
      legs: [
        { mode: 'BUS', startTime: 0, endTime: 10 * 60 * 1000, tripId: 'a' },
        { mode: 'WALK', duration: 3 * 60 },
        { mode: 'BUS', startTime: 14 * 60 * 1000 - 1000, endTime: 20 * 60 * 1000, tripId: 'b' },
      ],
    })?.code).toBe('IMPOSSIBLE_TRANSFER');

    expect(getItineraryNavigationBlock({
      legs: [
        { mode: 'BUS', startTime: 0, endTime: 10 * 60 * 1000, tripId: 'a' },
        { mode: 'WALK', duration: 3 * 60 },
        { mode: 'BUS', startTime: 14 * 60 * 1000, endTime: 20 * 60 * 1000, tripId: 'b' },
      ],
    })).toBeNull();
  });

  test('does not add an interchange buffer to a verified same-vehicle continuation', () => {
    const sharedStop = { stopId: '725', name: 'Barrie South GO' };
    expect(getItineraryNavigationBlock({
      legs: [
        {
          mode: 'BUS',
          startTime: 0,
          endTime: 10 * 60 * 1000,
          tripId: 'route-8-south',
          blockId: 'block-8',
          directionId: 1,
          route: { shortName: '8A' },
          to: sharedStop,
        },
        {
          mode: 'BUS',
          startTime: 10.5 * 60 * 1000,
          endTime: 20 * 60 * 1000,
          tripId: 'route-8-north',
          blockId: 'block-8',
          directionId: 0,
          route: { shortName: '8B' },
          from: sharedStop,
        },
      ],
    })).toBeNull();
  });

  test('blocks navigation for canceled trips and skipped required stops', () => {
    expect(getItineraryNavigationBlock({
      ...baseItinerary,
      realtimeServiceDisruption: { type: 'trip_cancelled' },
    })).toEqual(expect.objectContaining({ code: 'CANCELLED_TRIP' }));

    expect(getItineraryNavigationBlock({
      ...baseItinerary,
      realtimeServiceDisruption: { type: 'stop_skipped' },
    })).toEqual(expect.objectContaining({ code: 'SKIPPED_STOP' }));
  });
});
