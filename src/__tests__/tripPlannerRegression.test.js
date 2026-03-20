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
const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

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
  otpBaseUrl = 'https://otp.example',
  retryFetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => makeOtpPlanResponse(),
  })),
} = {}) {
  jest.resetModules();
  process.env.EXPO_PUBLIC_OTP_URL = otpBaseUrl;
  const RoutingErrorMock = class RoutingError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  };

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
    RoutingError: RoutingErrorMock,
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
        BASE_URL: otpBaseUrl,
        USE_MOCK_IN_DEV: false,
      },
    };
  });

  const tripService = require('../services/tripService');

  return {
    ...tripService,
    RoutingErrorMock,
    retryFetchMock,
  };
}

function loadUseTripPlanner({
  planTripAutoMock = jest.fn(async () => ({ itineraries: [] })),
  autocompleteAddressMock = jest.fn(async () => []),
  reverseGeocodeMock = jest.fn(async () => ({ shortName: 'Current Location' })),
  hookOptions = {},
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
    hookApi = useTripPlanner(hookOptions);
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

function loadTripSearchHeaderWeb(componentProps = {}) {
  jest.resetModules();
  const React = require('react');
  const { create, act } = require('react-test-renderer');

  jest.doMock('react-native', () => ({
    View: 'View',
    Text: 'Text',
    TextInput: 'TextInput',
    TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (styles) => styles },
  }));
  jest.doMock('../services/locationIQService', () => ({
    getDistanceFromBarrie: jest.fn(() => 1.2),
  }));

  const TripSearchHeaderWeb = require('../components/TripSearchHeader.web').default;
  const defaultProps = {
    fromText: '',
    toText: '',
    onFromChange: jest.fn(),
    onToChange: jest.fn(),
    onFromSelect: jest.fn(),
    onToSelect: jest.fn(),
    fromSuggestions: [],
    toSuggestions: [],
    showFromSuggestions: false,
    showToSuggestions: false,
    onSwap: jest.fn(),
    onClose: jest.fn(),
    onUseCurrentLocation: jest.fn(),
    onTimeModeChange: jest.fn(),
    onSelectedTimeChange: jest.fn(),
    onSearch: jest.fn(),
  };

  let renderer = null;
  act(() => {
    renderer = create(React.createElement(TripSearchHeaderWeb, {
      ...defaultProps,
      ...componentProps,
    }));
  });

  return {
    root: renderer.root,
    act,
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

function loadTripBottomSheetWeb(componentProps = {}) {
  jest.resetModules();
  const React = require('react');
  const { create, act } = require('react-test-renderer');

  jest.doMock('react-native', () => ({
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    ScrollView: 'ScrollView',
    ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (styles) => styles },
  }));
  jest.doMock('../components/TripResultCard', () => 'TripResultCard');
  jest.doMock('../components/TripErrorDisplay', () => 'TripErrorDisplay');
  jest.doMock('../components/FareCard', () => 'FareCard');
  jest.doMock('../components/Icon', () => 'Icon');

  const TripBottomSheetWeb = require('../components/TripBottomSheet.web').default;
  const defaultProps = {
    itineraries: [],
    selectedIndex: 0,
    onSelectItinerary: jest.fn(),
    onViewDetails: jest.fn(),
    onStartNavigation: jest.fn(),
    isLoading: false,
    error: null,
    hasSearched: false,
    onRetry: jest.fn(),
  };

  let renderer = null;
  act(() => {
    renderer = create(React.createElement(TripBottomSheetWeb, {
      ...defaultProps,
      ...componentProps,
    }));
  });

  return {
    root: renderer.root,
    act,
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

const getHeightStyleValue = (styleProp) => {
  const styleArray = Array.isArray(styleProp) ? styleProp : [styleProp];
  const heightEntry = styleArray.find((style) => style && Object.prototype.hasOwnProperty.call(style, 'height'));
  return heightEntry?.height;
};

describe('trip planner service regressions', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_OTP_URL;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('same-zone on-demand trips respect arrive-by time instead of forcing now', async () => {
    const requestedTime = new Date(2026, 2, 6, 15, 30, 0);
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

  test('preserves local-router no-route errors when OTP fallback is unavailable', async () => {
    let RoutingErrorMockRef;
    const planTripLocalMock = jest.fn(async () => {
      throw new RoutingErrorMockRef('NO_ROUTE_FOUND', 'No transit routes found for this trip');
    });
    const {
      planTripAuto,
      TRIP_ERROR_CODES,
      RoutingErrorMock,
    } = loadTripService({
      otpBaseUrl: '',
      planTripLocalMock,
    });
    RoutingErrorMockRef = RoutingErrorMock;

    await expect(
      planTripAuto({
        fromLat: 44.38,
        fromLon: -79.69,
        toLat: 44.39,
        toLon: -79.68,
        date: new Date('2026-03-06T10:00:00Z'),
        time: new Date('2026-03-06T10:00:00Z'),
        routingData: { routesByStop: new Map() },
        onDemandZones: {},
        stops: [],
      })
    ).rejects.toMatchObject({
      code: TRIP_ERROR_CODES.NO_ROUTES_FOUND,
      message: 'No transit routes found for this trip',
    });
  });

  test('mixed zone trips preserve original endpoints and arrive-by timing', async () => {
    const requestedTime = new Date('2026-03-06T15:30:00Z');
    const prependDurationSeconds = 600;
    const appendDurationSeconds = 900;
    const otpStartTime = new Date('2026-03-06T15:00:00Z').getTime();
    const otpEndTime = new Date('2026-03-06T15:15:00Z').getTime();
    const retryFetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => makeOtpPlanResponse({
        startTime: otpStartTime,
        endTime: otpEndTime,
      }),
    }));

    const { planTripAuto } = loadTripService({
      analyzeZoneInvolvementMock: jest.fn(() => ({ needsOnDemand: true })),
      buildZoneAwareTripMock: jest.fn(() => ({
        sameZone: false,
        raptorFrom: { lat: 44.401, lon: -79.701 },
        raptorTo: { lat: 44.409, lon: -79.681 },
        prependLeg: {
          zone: {
            id: 'south',
            name: 'South End',
            color: '#007A5E',
            bookingPhone: '705-555-1111',
          },
          hubStop: { latitude: 44.401, longitude: -79.701, name: 'South Hub' },
        },
        appendLeg: {
          zone: {
            id: 'north',
            name: 'North End',
            color: '#004B91',
            bookingPhone: '705-555-2222',
          },
          hubStop: { latitude: 44.409, longitude: -79.681, name: 'North Hub' },
        },
      })),
      estimateOnDemandDurationMock: jest.fn((fromLat, _fromLon, toLat) => (
        fromLat < 44.4 || toLat < 44.405 ? prependDurationSeconds : appendDurationSeconds
      )),
      retryFetchMock,
    });

    const result = await planTripAuto({
      fromLat: 44.35,
      fromLon: -79.72,
      toLat: 44.43,
      toLon: -79.65,
      date: requestedTime,
      time: requestedTime,
      arriveBy: true,
      onDemandZones: { south: {}, north: {} },
      stops: [],
    });

    const url = retryFetchMock.mock.calls[0][0];
    const expectedOtpTime = new Date(requestedTime.getTime() - appendDurationSeconds * 1000);
    const expectedOtpTimeParam = `time=${String(expectedOtpTime.getHours()).padStart(2, '0')}%3A${String(expectedOtpTime.getMinutes()).padStart(2, '0')}`;
    expect(url).toContain(expectedOtpTimeParam);
    expect(result.itineraries[0].startTime).toBe(otpStartTime - prependDurationSeconds * 1000);
    expect(result.itineraries[0].endTime).toBe(requestedTime.getTime());
    expect(result.itineraries[0].legs[0].from).toEqual(expect.objectContaining({
      lat: 44.35,
      lon: -79.72,
    }));
    expect(result.itineraries[0].legs[result.itineraries[0].legs.length - 1].to).toEqual(expect.objectContaining({
      lat: 44.43,
      lon: -79.65,
    }));
  });

  test('cache distinguishes requested schedule semantics', async () => {
    const retryFetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => makeOtpPlanResponse(),
    }));
    const { planTripAuto } = loadTripService({ retryFetchMock });

    await planTripAuto({
      fromLat: 44.38,
      fromLon: -79.69,
      toLat: 44.39,
      toLon: -79.68,
      date: new Date('2026-03-06T10:00:00Z'),
      time: new Date('2026-03-06T10:00:00Z'),
      arriveBy: false,
      onDemandZones: {},
      stops: [],
    });

    await planTripAuto({
      fromLat: 44.38,
      fromLon: -79.69,
      toLat: 44.39,
      toLon: -79.68,
      date: new Date('2026-03-06T18:00:00Z'),
      time: new Date('2026-03-06T18:00:00Z'),
      arriveBy: true,
      onDemandZones: {},
      stops: [],
    });

    expect(retryFetchMock).toHaveBeenCalledTimes(2);
  });

  test('zone-adjusted trips do not pollute cache for later plain searches', async () => {
    const retryFetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => makeOtpPlanResponse(),
    }));
    const analyzeZoneInvolvementMock = jest
      .fn()
      .mockReturnValueOnce({ needsOnDemand: true })
      .mockReturnValue({ needsOnDemand: false });
    const buildZoneAwareTripMock = jest.fn(() => ({
      sameZone: false,
      raptorFrom: { lat: 44.401, lon: -79.701 },
      raptorTo: { lat: 44.409, lon: -79.681 },
      prependLeg: {
        zone: { id: 'south', name: 'South End', color: '#007A5E', bookingPhone: '705-555-1111' },
        hubStop: { latitude: 44.401, longitude: -79.701, name: 'South Hub' },
      },
      appendLeg: null,
    }));
    const { planTripAuto } = loadTripService({
      analyzeZoneInvolvementMock,
      buildZoneAwareTripMock,
      retryFetchMock,
    });

    await planTripAuto({
      fromLat: 44.35,
      fromLon: -79.72,
      toLat: 44.43,
      toLon: -79.65,
      date: new Date('2026-03-06T10:00:00Z'),
      time: new Date('2026-03-06T10:00:00Z'),
      onDemandZones: { south: {} },
      stops: [],
    });

    await planTripAuto({
      fromLat: 44.401,
      fromLon: -79.701,
      toLat: 44.43,
      toLon: -79.65,
      date: new Date('2026-03-06T10:00:00Z'),
      time: new Date('2026-03-06T10:00:00Z'),
      onDemandZones: {},
      stops: [],
    });

    expect(retryFetchMock).toHaveBeenCalledTimes(2);
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

  test('stale trip results are ignored after reset', async () => {
    const deferred = createDeferred();
    const { getHook, act, unmount } = loadUseTripPlanner({
      planTripAutoMock: jest.fn(() => deferred.promise),
    });

    await act(async () => {
      getHook().searchTrips(
        { lat: 44.38, lon: -79.69 },
        { lat: 44.39, lon: -79.68 }
      );
      getHook().reset();
      deferred.resolve({
        itineraries: [{
          id: 'stale-trip',
          duration: 600,
          startTime: 1000,
          endTime: 1600,
          walkDistance: 0,
          walkTime: 0,
          transitTime: 600,
          waitingTime: 0,
          transfers: 0,
          legs: [],
        }],
      });
      await flushMicrotasks();
    });

    expect(getHook().state.itineraries).toEqual([]);
    expect(getHook().state.hasSearched).toBe(false);

    unmount();
  });

  test('validation respects on-demand zones before blocking outside-area trips', async () => {
    const planTripAutoMock = jest.fn(async () => ({
      itineraries: [{
        id: 'zone-trip',
        duration: 900,
        startTime: 1000,
        endTime: 1900,
        walkDistance: 0,
        walkTime: 0,
        transitTime: 900,
        waitingTime: 0,
        transfers: 0,
        legs: [],
      }],
    }));
    const { getHook, act, unmount } = loadUseTripPlanner({
      planTripAutoMock,
      hookOptions: {
        onDemandZones: {
          tod: {
            geometry: {
              coordinates: [[
                [-79.76, 44.54],
                [-79.76, 44.58],
                [-79.68, 44.58],
                [-79.68, 44.54],
              ],
              ],
            },
          },
        },
      },
    });

    await act(async () => {
      await getHook().searchTrips(
        { lat: 44.55, lon: -79.75 },
        { lat: 44.57, lon: -79.69 }
      );
      await flushMicrotasks();
    });

    expect(planTripAutoMock).toHaveBeenCalledTimes(1);
    expect(getHook().state.error).toBeNull();

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

describe('web trip planner regressions', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('web search header supports keyboard selection for origin suggestions', () => {
    const onFromSelect = jest.fn();
    const { root, act, unmount } = loadTripSearchHeaderWeb({
      fromSuggestions: [
        { shortName: 'Origin A', lat: 44.38, lon: -79.69 },
        { shortName: 'Origin B', lat: 44.39, lon: -79.68 },
      ],
      showFromSuggestions: true,
      onFromSelect,
    });

    const fromInput = root.find((node) => node.props['aria-label'] === 'Starting location');

    act(() => {
      fromInput.props.onFocus();
    });
    act(() => {
      fromInput.props.onKeyDown({ key: 'ArrowDown', preventDefault: jest.fn() });
    });
    act(() => {
      fromInput.props.onKeyDown({ key: 'ArrowDown', preventDefault: jest.fn() });
    });
    act(() => {
      fromInput.props.onKeyDown({ key: 'Enter', preventDefault: jest.fn() });
    });

    expect(onFromSelect).toHaveBeenCalledWith(expect.objectContaining({ shortName: 'Origin B' }));

    unmount();
  });

  test('web trip bottom sheet matches native expanded height and esc collapses locally', () => {
    const { root, act, unmount } = loadTripBottomSheetWeb();
    const container = root.find((node) => typeof node.props.onKeyDown === 'function');
    const handle = root.find((node) => node.props.accessibilityLabel?.includes('Trip results panel'));

    expect(getHeightStyleValue(container.props.style)).toBe('38%');

    act(() => {
      handle.props.onPress();
    });
    expect(getHeightStyleValue(container.props.style)).toBe('85%');

    act(() => {
      container.props.onKeyDown({ key: 'Escape' });
    });
    expect(getHeightStyleValue(container.props.style)).toBe('10%');

    unmount();
  });
});
