describe('navigationRecalculationService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('recalculates from current position and returns an enriched itinerary', async () => {
    jest.resetModules();

    const planTripAutoMock = jest.fn(async () => ({
      itineraries: [
        {
          id: 'reroute-1',
          legs: [
            {
              mode: 'WALK',
              from: { lat: 44.38, lon: -79.69 },
              to: { lat: 44.4, lon: -79.67 },
            },
          ],
        },
      ],
      routingDiagnostics: { source: 'otp' },
    }));
    const enrichItineraryWithWalkingMock = jest.fn(async (itinerary) => ({
      ...itinerary,
      walkDistance: 320,
    }));

    jest.doMock('../services/tripService', () => ({
      planTripAuto: planTripAutoMock,
      TRIP_ERROR_CODES: {
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        NO_ROUTES_FOUND: 'NO_ROUTES_FOUND',
      },
      TripPlanningError: class TripPlanningError extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
        }
      },
    }));
    jest.doMock('../services/walkingService', () => ({
      enrichItineraryWithWalking: enrichItineraryWithWalkingMock,
    }));
    jest.doMock('../utils/logger', () => ({
      __esModule: true,
      default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        log: jest.fn(),
        debug: jest.fn(),
      },
    }));

    const { recalculateNavigationItinerary } = require('../services/navigationRecalculationService');

    const result = await recalculateNavigationItinerary({
      userLocation: { latitude: 44.381, longitude: -79.691 },
      destination: { lat: 44.41, lon: -79.67 },
      ensureRoutingData: jest.fn(async () => ({ mocked: true })),
      onDemandZones: {},
      stops: [],
    });

    expect(planTripAutoMock).toHaveBeenCalledWith(expect.objectContaining({
      fromLat: 44.381,
      fromLon: -79.691,
      toLat: 44.41,
      toLon: -79.67,
      enrichWalking: false,
      routingData: { mocked: true },
    }));
    expect(enrichItineraryWithWalkingMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'reroute-1',
    }));
    expect(result.itinerary).toEqual(expect.objectContaining({
      id: 'reroute-1',
      walkDistance: 320,
      rerouteMetadata: expect.objectContaining({
        fromLat: 44.381,
        fromLon: -79.691,
      }),
    }));
    expect(result.routingDiagnostics).toEqual({ source: 'otp' });
  });
});
