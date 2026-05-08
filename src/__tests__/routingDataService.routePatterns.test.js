jest.mock('../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

import {
  buildRouteStopSequenceData,
  buildRouteStopSequences,
} from '../services/routingDataService';

describe('buildRouteStopSequences route patterns', () => {
  test('uses the canonical pattern per route and direction instead of the first short-turn trip', () => {
    const trips = [
      {
        tripId: '8b-short-south-to-allandale',
        routeId: '8B',
        directionId: 0,
      },
      {
        tripId: '8b-full-south-to-georgian-1',
        routeId: '8B',
        directionId: 0,
      },
      {
        tripId: '8b-full-south-to-georgian-2',
        routeId: '8B',
        directionId: 0,
      },
      {
        tripId: '8b-southbound',
        routeId: '8B',
        directionId: 1,
      },
    ];

    const stopTimes = [
      { tripId: '8b-short-south-to-allandale', stopId: 'barrie-south', stopSequence: 1 },
      { tripId: '8b-short-south-to-allandale', stopId: 'allandale', stopSequence: 2 },

      { tripId: '8b-full-south-to-georgian-1', stopId: 'barrie-south', stopSequence: 1 },
      { tripId: '8b-full-south-to-georgian-1', stopId: 'allandale', stopSequence: 2 },
      { tripId: '8b-full-south-to-georgian-1', stopId: 'georgian', stopSequence: 3 },

      { tripId: '8b-full-south-to-georgian-2', stopId: 'barrie-south', stopSequence: 1 },
      { tripId: '8b-full-south-to-georgian-2', stopId: 'allandale', stopSequence: 2 },
      { tripId: '8b-full-south-to-georgian-2', stopId: 'georgian', stopSequence: 3 },

      { tripId: '8b-southbound', stopId: 'georgian', stopSequence: 1 },
      { tripId: '8b-southbound', stopId: 'allandale', stopSequence: 2 },
      { tripId: '8b-southbound', stopId: 'barrie-south', stopSequence: 3 },
    ];

    const result = buildRouteStopSequences(stopTimes, trips);

    expect(result['8B'][0]).toEqual(['barrie-south', 'allandale', 'georgian']);
    expect(result['8B'][1]).toEqual(['georgian', 'allandale', 'barrie-south']);
  });

  test('keeps trip eligibility scoped to each route pattern', () => {
    const trips = [
      {
        tripId: '8b-short-south-to-allandale',
        routeId: '8B',
        directionId: 0,
      },
      {
        tripId: '8b-full-south-to-georgian',
        routeId: '8B',
        directionId: 0,
      },
    ];

    const stopTimes = [
      { tripId: '8b-short-south-to-allandale', stopId: 'barrie-south', stopSequence: 1 },
      { tripId: '8b-short-south-to-allandale', stopId: 'allandale', stopSequence: 2 },

      { tripId: '8b-full-south-to-georgian', stopId: 'barrie-south', stopSequence: 1 },
      { tripId: '8b-full-south-to-georgian', stopId: 'allandale', stopSequence: 2 },
      { tripId: '8b-full-south-to-georgian', stopId: 'georgian', stopSequence: 3 },
    ];

    const { routePatternTripIds } = buildRouteStopSequenceData(stopTimes, trips);

    expect(Array.from(routePatternTripIds['8B'][0])).toEqual([
      '8b-full-south-to-georgian',
    ]);
    expect(Array.from(routePatternTripIds['8B']['0:1'])).toEqual([
      '8b-short-south-to-allandale',
    ]);
  });
});
