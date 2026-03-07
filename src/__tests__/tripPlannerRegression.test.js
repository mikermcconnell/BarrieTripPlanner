global.IS_REACT_ACT_ENVIRONMENT = true;

let consoleErrorSpy;

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
    const [firstArg] = args;
    if (typeof firstArg === 'string' && firstArg.includes('react-test-renderer is deprecated')) {
      return;
    }
    jest.requireActual('console').error(...args);
  });
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
});

const makeOtpPlanResponse = ({
  startTime = new Date('2026-03-06T10:00:00Z').getTime(),
  endTime = new Date('2026-03-06T10:10:00Z').getTime(),
} = {}) => ({
  plan: {
    from: { name: 'Origin', lat: 44.38, lon: -79.69 },
    to: { name: 'Destination', lat: 44.39, lon: -79.68 },
    itineraries: [
      {
        duration: Math.round((endTime - startTime) / 1000),
        startTime,
        endTime,
        walkTime: 0,
        transitTime: Math.round((endTime - startTime) / 1000),
        waitingTime: 0,
        walkDistance: 0,
        transfers: 0,
        legs: [
          {
            mode: 'BUS',
            startTime,
            endTime,
            duration: Math.round((endTime - startTime) / 1000),
            distance: 1000,
            from: { name: 'Origin Stop', lat: 44.38, lon: -79.69, stopId: 'S1', stopCode: '1001' },
            to: { name: 'Dest Stop', lat: 44.39, lon: -79.68, stopId: 'S2', stopCode: '1002' },
            route: '1',
            routeId: '1',
            routeShortName: '1',
            routeLongName: 'Route 1',
            routeColor: '123456',
            headsign: 'Downtown',
            tripId: 'TRIP-1',
          },
        ],
      },
    ],
  },
});

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function loadTripService({
  analyzeZoneInvolvementMock = jest.fn(() => ({ needsOnDemand: false })),
  buildZoneAwareTripMock = jest.fn(() => ({
    sameZone: false,
    raptorFrom: null,
    raptorTo: null,
    prependLeg: null,
    appendLeg: null,
  })),
  estimateOnDemandDurationMock = jest.fn(() => 900),
  planTripLocalMock = jest.fn(),
  enrichTripPlanWithWalkingMock = jest.fn(),
  retryFetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => makeOtpPlanResponse(),
  })),
} = {}) {
  jest.resetModules();
  process.env.EXPO_PUBLIC_OTP_URL = 'https://otp.example';

  jest.doMock('../utils/logger', () => ({
    __esModule: true,
    default: {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }));
  jest.doMock('../services/locationIQService', () => ({
    geocodeAddress: jest.fn(),
    reverseGeocode: jest.fn(),
  }));
  jest.doMock('../services/localRouter', () => ({
    planTripLocal: planTripLocalMock,
    RoutingError: class RoutingError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
    ROUTING_ERROR_CODES: {
      NO_NEARBY_STOPS: 'NO_NEARBY_STOPS',
      NO_SERVICE: 'NO_SERVICE',
      NO_ROUTE_FOUND: 'NO_ROUTE_FOUND',
      OUTSIDE_SERVICE_AREA: 'OUTSIDE_SERVICE_AREA',
    },
  }));
  jest.doMock('../services/walkingService', () => ({
    enrichTripPlanWithWalking: enrichTripPlanWithWalkingMock,
    normalizeOtpSteps: jest.fn((steps) => steps),
  }));
  jest.doMock('../services/onDemandRouter', () => ({
    analyzeZoneInvolvement: analyzeZoneInvolvementMock,
    buildZoneAwareTrip: buildZoneAwareTripMock,
    estimateOnDemandDuration: estimateOnDemandDurationMock,
  }));
  jest.doMock('../utils/retryFetch', () => ({
    retryFetch: retryFetchMock,
  }));
  jest.doMock('../config/constants', () => {
    const actual = jest.requireActual('../config/constants');
    return {
      ...actual,
      OTP_CONFIG: {
        ...actual.OTP_CONFIG,
        BASE_URL: 'https://otp.example',
        USE_MOCK_IN_DEV: false,
      },
    };
  });

  const tripService = require('../services/tripService');

  return {
    ...tripService,
    retryFetchMock,
  };
}

function loadUseTripPlanner({
  planTripAutoMock = jest.fn(async () => ({ itineraries: [] })),
  autocompleteAddressMock = jest.fn(async () => []),
  reverseGeocodeMock = jest.fn(async () => ({ shortName: 'Current Location' })),
} = {}) {
  jest.resetModules();
  const React = require('react');
  const { create, act } = require('react-test-renderer');

  jest.doMock('../services/tripService', () => ({
    planTripAuto: planTripAutoMock,
    TripPlanningError: class TripPlanningError extends Error {},
  }));
  jest.doMock('../services/locationIQService', () => ({
    autocompleteAddress: autocompleteAddressMock,
    reverseGeocode: reverseGeocodeMock,
    getDistanceFromBarrie: jest.fn(() => 0),
  }));

  const { useTripPlanner } = require('../hooks/useTripPlanner');

  let hookApi = null;
  let renderer = null;

  function Harness() {
    hookApi = useTripPlanner();
    return null;
  }

  act(() => {
    renderer = create(React.createElement(Harness));
  });

  return {
    getHook: () => hookApi,
    act,
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
    planTripAutoMock,
  };
}

describe('trip planner service regressions', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_OTP_URL;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('same-zone on-demand trips respect arrive-by time instead of forcing now', async () => {
    const requestedTime = new Date('2026-03-06T15:30:00Z');
    const requestedTimeMs = requestedTime.getTime();
    const durationSeconds = 900;

    const { planTripAuto } = loadTripService({
      analyzeZoneInvolvementMock: jest.fn(() => ({ needsOnDemand: true })),
      buildZoneAwareTripMock: jest.fn(() => ({
        sameZone: true,
        zone: {
          id: 'south-end',
          name: 'South End',
          color: '#007A5E',
          bookingPhone: '705-555-1234',
        },
      })),
      estimateOnDemandDurationMock: jest.fn(() => durationSeconds),
    });

    const result = await planTripAuto({
      fromLat: 44.35,
      fromLon: -79.7,
      toLat: 44.36,
      toLon: -79.69,
      date: requestedTime,
      time: requestedTime,
      arriveBy: true,
      onDemandZones: { 'south-end': {} },
      stops: [],
    });

    expect(result.itineraries).toHaveLength(1);
    expect(result.itineraries[0].startTime).toBe(requestedTimeMs - durationSeconds * 1000);
    expect(result.itineraries[0].endTime).toBe(requestedTimeMs);
    expect(result.itineraries[0].legs[0].startTime).toBe(requestedTimeMs - durationSeconds * 1000);
    expect(result.itineraries[0].legs[0].endTime).toBe(requestedTimeMs);
    expect(result.routingDiagnostics).toEqual(expect.objectContaining({
      source: 'on_demand_direct',
      onDemandDirect: true,
      zoneAdjusted: true,
    }));
  });

  test('OTP fallback uses zone-adjusted hub-stop coordinates', async () => {
    const retryFetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => makeOtpPlanResponse(),
    }));

    const { planTripAuto } = loadTripService({
      analyzeZoneInvolvementMock: jest.fn(() => ({ needsOnDemand: true })),
      buildZoneAwareTripMock: jest.fn(() => ({
        sameZone: false,
        raptorFrom: { lat: 44.401, lon: -79.701 },
        raptorTo: { lat: 44.409, lon: -79.681 },
        prependLeg: null,
        appendLeg: null,
      })),
      retryFetchMock,
    });

    await planTripAuto({
      fromLat: 44.35,
      fromLon: -79.72,
      toLat: 44.43,
      toLon: -79.65,
      date: new Date('2026-03-06T10:00:00Z'),
      time: new Date('2026-03-06T10:00:00Z'),
      onDemandZones: { north: {}, south: {} },
      stops: [],
    });

    const url = retryFetchMock.mock.calls[0][0];

    expect(url).toContain('fromPlace=44.401%2C-79.701');
    expect(url).toContain('toPlace=44.409%2C-79.681');
    expect(retryFetchMock).toHaveBeenCalledTimes(1);
  });

  test('local router fallback to OTP records explicit routing diagnostics', async () => {
    const { planTripAuto } = loadTripService({
      planTripLocalMock: jest.fn(async () => {
        throw new Error('local router unavailable');
      }),
    });

    const result = await planTripAuto({
      fromLat: 44.38,
      fromLon: -79.69,
      toLat: 44.39,
      toLon: -79.68,
      date: new Date('2026-03-06T10:00:00Z'),
      time: new Date('2026-03-06T10:00:00Z'),
      routingData: { routesByStop: new Map() },
      onDemandZones: {},
      stops: [],
    });

    expect(result.routingDiagnostics).toEqual(expect.objectContaining({
      source: 'otp',
      fallbackFrom: 'local_router',
      fallbackReason: 'LOCAL_ROUTER_ERROR',
      localRouterError: expect.objectContaining({
        message: 'local router unavailable',
      }),
    }));
  });
});

describe('useTripPlanner regressions', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('editing a selected location clears stale coordinates and results', async () => {
    const itinerary = {
      id: 'itinerary-1',
      duration: 600,
      startTime: 1000,
      endTime: 1600,
      walkDistance: 0,
      walkTime: 0,
      transitTime: 600,
      waitingTime: 0,
      transfers: 0,
      legs: [],
    };
    const { getHook, act, unmount } = loadUseTripPlanner({
      planTripAutoMock: jest.fn(async () => ({ itineraries: [itinerary] })),
    });

    await act(async () => {
      getHook().setFrom({ lat: 44.38, lon: -79.69 }, 'Origin');
      await flushMicrotasks();
    });

    await act(async () => {
      getHook().setTo({ lat: 44.39, lon: -79.68 }, 'Destination');
      await flushMicrotasks();
    });

    expect(getHook().state.from).toEqual({ lat: 44.38, lon: -79.69 });
    expect(getHook().state.itineraries).toHaveLength(1);
    expect(getHook().state.hasSearched).toBe(true);

    act(() => {
      getHook().setFromText('Edited origin');
    });

    expect(getHook().state.fromText).toBe('Edited origin');
    expect(getHook().state.from).toBeNull();
    expect(getHook().state.itineraries).toEqual([]);
    expect(getHook().state.hasSearched).toBe(false);

    unmount();
  });

  test('swap recomputes results using swapped endpoints', async () => {
    const planTripAutoMock = jest.fn(async () => ({ itineraries: [] }));
    const { getHook, act, unmount } = loadUseTripPlanner({ planTripAutoMock });

    await act(async () => {
      getHook().setFrom({ lat: 44.38, lon: -79.69 }, 'Origin');
      await flushMicrotasks();
    });

    await act(async () => {
      getHook().setTo({ lat: 44.39, lon: -79.68 }, 'Destination');
      await flushMicrotasks();
    });

    planTripAutoMock.mockClear();

    await act(async () => {
      getHook().swap();
      await flushMicrotasks();
    });

    expect(planTripAutoMock).toHaveBeenCalledTimes(1);
    expect(planTripAutoMock).toHaveBeenCalledWith(expect.objectContaining({
      fromLat: 44.39,
      fromLon: -79.68,
      toLat: 44.38,
      toLon: -79.69,
    }));

    unmount();
  });

  test('current-location search can target an explicit destination before state catches up', async () => {
    const planTripAutoMock = jest.fn(async () => ({ itineraries: [] }));
    const { getHook, act, unmount } = loadUseTripPlanner({ planTripAutoMock });

    await act(async () => {
      await getHook().useCurrentLocation(
        async () => ({ lat: 44.381, lon: -79.691 }),
        { searchTo: { lat: 44.401, lon: -79.681 } }
      );
      await flushMicrotasks();
    });

    expect(planTripAutoMock).toHaveBeenCalledWith(expect.objectContaining({
      fromLat: 44.381,
      fromLon: -79.691,
      toLat: 44.401,
      toLon: -79.681,
    }));

    unmount();
  });

  test('switching away from now pre-populates a selected time for explicit searches', () => {
    const { getHook, act, unmount } = loadUseTripPlanner();

    act(() => {
      getHook().setTimeMode('departAt');
    });

    expect(getHook().state.timeMode).toBe('departAt');
    expect(getHook().state.selectedTime).toBeInstanceOf(Date);

    unmount();
  });
});

describe('html escaping helpers', () => {
  test('escapeHtml neutralizes markup-significant characters', () => {
    const { escapeHtml } = require('../utils/htmlUtils');

    expect(escapeHtml(`<script>alert("x")</script> & 'quoted'`))
      .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;');
  });
});
