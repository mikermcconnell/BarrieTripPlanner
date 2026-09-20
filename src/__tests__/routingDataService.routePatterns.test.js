jest.mock('../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

import {
  buildRoutingData,
  buildRoutingDataAsync,
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

describe('cooperative routing data build', () => {
  test('yields between build phases and preserves the synchronous routing package', async () => {
    const gtfsData = {
      stops: [
        { id: 'A', latitude: 44.38, longitude: -79.70 },
        { id: 'B', latitude: 44.39, longitude: -79.69 },
      ],
      trips: [{
        tripId: 'trip-1',
        routeId: '1',
        serviceId: 'weekday',
        directionId: 0,
      }],
      stopTimes: [
        { tripId: 'trip-1', stopId: 'A', stopSequence: 1, arrivalTime: 28800, departureTime: 28800 },
        { tripId: 'trip-1', stopId: 'B', stopSequence: 2, arrivalTime: 29400, departureTime: 29400 },
      ],
      calendar: [{
        serviceId: 'weekday',
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
        startDate: '20260101',
        endDate: '20261231',
      }],
      calendarDates: [],
    };
    const stages = [];
    const yieldControl = jest.fn(async () => {});

    const cooperative = await buildRoutingDataAsync(gtfsData, {
      onProgress: (stage) => stages.push(stage),
      yieldControl,
    });
    const synchronous = buildRoutingData(gtfsData);

    expect(stages).toEqual([
      'Indexing scheduled departures',
      'Linking route patterns',
      'Preparing nearby transfers',
      'Finalizing the trip planner',
    ]);
    expect(yieldControl).toHaveBeenCalledTimes(5);
    expect(cooperative.stopDepartures).toEqual(synchronous.stopDepartures);
    expect(cooperative.routeStopSequences).toEqual(synchronous.routeStopSequences);
    expect(cooperative.stopTimesIndex).toEqual(synchronous.stopTimesIndex);
    expect(cooperative.routePatternTripIds['1'][0]).toEqual(
      synchronous.routePatternTripIds['1'][0]
    );
  });
});
