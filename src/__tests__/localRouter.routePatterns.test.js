import { planTripLocal } from '../services/localRouter';

const mockGetActiveServicesForDate = jest.fn(() => new Set(['weekday']));

jest.mock('../services/routingDataService', () => ({
  findNearbyStops: (stops, lat) => {
    if (lat === 0) return [{ stop: stops.O, walkSeconds: 0 }];
    if (lat === 1) return [{ stop: stops.D, walkSeconds: 0 }];
    return [];
  },
}));

jest.mock('../services/calendarService', () => ({
  getActiveServicesForDate: (...args) => mockGetActiveServicesForDate(...args),
  formatGTFSDate: jest.fn(() => '20260508'),
}));

jest.mock('../services/itineraryBuilder', () => ({
  buildItinerary: (result) => ({
    tripIds: result.path.filter((segment) => segment.type === 'TRANSIT').map((segment) => segment.tripId),
    legs: result.path,
    arrivalTime: result.arrivalTime,
    duration: result.arrivalTime,
    transfers: result.path.filter((segment) => segment.type === 'TRANSIT').length - 1,
    walkDistance: 0,
  }),
}));

describe('localRouter route patterns', () => {
  beforeEach(() => {
    mockGetActiveServicesForDate.mockReturnValue(new Set(['weekday']));
  });

  test('does not let an earlier short-turn trip mask a later full-pattern trip', async () => {
    const routingData = {
      stops: {
        O: { id: 'O', lat: 0, lon: 0 },
        M: { id: 'M', lat: 0.5, lon: 0 },
        D: { id: 'D', lat: 1, lon: 0 },
      },
      stopDepartures: {
        O: [
          {
            tripId: 'short-turn',
            routeId: '8B',
            directionId: 0,
            serviceId: 'weekday',
            departureTime: 8 * 3600,
            pickupType: 0,
            headsign: 'Crosstown/Essa to Georgian College',
          },
          {
            tripId: 'full-trip',
            routeId: '8B',
            directionId: 0,
            serviceId: 'weekday',
            departureTime: 8 * 3600 + 300,
            pickupType: 0,
            headsign: 'Crosstown/Essa to Georgian College',
          },
        ],
        M: [
          {
            tripId: 'short-turn',
            routeId: '8B',
            directionId: 0,
            serviceId: 'weekday',
            departureTime: 8 * 3600 + 120,
            pickupType: 0,
            headsign: 'Crosstown/Essa to Georgian College',
          },
          {
            tripId: 'full-trip',
            routeId: '8B',
            directionId: 0,
            serviceId: 'weekday',
            departureTime: 8 * 3600 + 420,
            pickupType: 0,
            headsign: 'Crosstown/Essa to Georgian College',
          },
        ],
      },
      stopTimesIndex: {
        'short-turn_O': { arrivalTime: 8 * 3600, departureTime: 8 * 3600 },
        'short-turn_M': { arrivalTime: 8 * 3600 + 120, departureTime: 8 * 3600 + 120 },
        'full-trip_O': { arrivalTime: 8 * 3600 + 300, departureTime: 8 * 3600 + 300 },
        'full-trip_M': { arrivalTime: 8 * 3600 + 420, departureTime: 8 * 3600 + 420 },
        'full-trip_D': { arrivalTime: 8 * 3600 + 900, departureTime: 8 * 3600 + 900 },
      },
      routeStopSequences: {
        '8B': {
          0: ['O', 'M', 'D'],
          '0:1': ['O', 'M'],
        },
      },
      routePatternTripIds: {
        '8B': {
          0: new Set(['full-trip']),
          '0:1': new Set(['short-turn']),
        },
      },
      stopRoutes: {
        O: new Set(['8B']),
        M: new Set(['8B']),
        D: new Set(['8B']),
      },
      transfers: {},
      serviceCalendar: {},
      tripIndex: {},
      stopIndex: {},
    };

    const result = await planTripLocal({
      fromLat: 0,
      fromLon: 0,
      toLat: 1,
      toLon: 0,
      date: new Date('2026-05-08T00:00:00'),
      time: new Date('2026-05-08T07:59:00'),
      routingData,
    });

    expect(result.itineraries[0].tripIds).toEqual(['full-trip']);
  });
});
