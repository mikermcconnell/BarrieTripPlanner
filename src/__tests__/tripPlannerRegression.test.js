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
  itineraries = null,
} = {}) => ({
  plan: {
    from: { name: 'Origin', lat: 44.38, lon: -79.69 },
    to: { name: 'Destination', lat: 44.39, lon: -79.68 },
    itineraries: itineraries || [
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
  enrichTripPlanWithWalkingMock = jest.fn(async (tripPlan) => tripPlan),
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
    TRIP_ERROR_CODES: {
      OTP_UNAVAILABLE: 'OTP_UNAVAILABLE',
      NETWORK_ERROR: 'NETWORK_ERROR',
      NO_ROUTES_FOUND: 'NO_ROUTES_FOUND',
      NO_NEARBY_STOPS: 'NO_NEARBY_STOPS',
      OUTSIDE_SERVICE_AREA: 'OUTSIDE_SERVICE_AREA',
      TIMEOUT: 'TIMEOUT',
      NO_DATA: 'NO_DATA',
      NO_SERVICE: 'NO_SERVICE',
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      ZONE_NO_SERVICE: 'ZONE_NO_SERVICE',
      ZONE_NO_HUB_STOPS: 'ZONE_NO_HUB_STOPS',
    },
    TripPlanningError: class TripPlanningError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'TripPlanningError';
      }
    },
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

function loadTripSearchHeaderNative(componentProps = {}) {
  jest.resetModules();
  const React = require('react');
  const { create, act } = require('react-test-renderer');

  jest.doMock('react-native', () => ({
    View: 'View',
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator',
    Animated: {},
    StyleSheet: { create: (styles) => styles },
  }));
  jest.doMock('../components/Icon', () => 'Icon');
  jest.doMock('../components/TimePicker', () => 'TimePicker');
  jest.doMock('../components/AddressAutocomplete', () => (props) => (
    React.createElement('AddressAutocomplete', {
      value: props.value,
      placeholder: props.placeholder,
      accessibilityLabel: props.accessibilityLabel,
      savedPlaces: props.savedPlaces,
    }, props.rightIcon || null)
  ));

  const TripSearchHeader = require('../components/TripSearchHeader').default;
  const defaultProps = {
    fromText: '',
    toText: '',
    onFromChange: jest.fn(),
    onToChange: jest.fn(),
    onFromSelect: jest.fn(),
    onToSelect: jest.fn(),
    onSwap: jest.fn(),
    onClose: jest.fn(),
    onUseCurrentLocation: jest.fn(),
    onTimeModeChange: jest.fn(),
    onSelectedTimeChange: jest.fn(),
    onSearch: jest.fn(),
  };

  let renderer = null;
  act(() => {
    renderer = create(React.createElement(TripSearchHeader, {
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

  test('OTP fallback still enriches walking geometry when requested', async () => {
    const otpResult = makeOtpPlanResponse({
      itineraries: [
        {
          duration: 600,
          startTime: new Date('2026-03-06T10:00:00Z').getTime(),
          endTime: new Date('2026-03-06T10:10:00Z').getTime(),
          walkTime: 300,
          transitTime: 300,
          waitingTime: 0,
          walkDistance: 350,
          transfers: 0,
          legs: [
            {
              mode: 'WALK',
              startTime: new Date('2026-03-06T10:00:00Z').getTime(),
              endTime: new Date('2026-03-06T10:05:00Z').getTime(),
              duration: 300,
              distance: 350,
              from: { name: 'Origin', lat: 44.38, lon: -79.69 },
              to: { name: 'Stop', lat: 44.382, lon: -79.688 },
              legGeometry: null,
              steps: [],
            },
          ],
        },
      ],
    });
    const enrichedResult = {
      itineraries: [
        {
          id: 'enriched',
          legs: [
            {
              mode: 'WALK',
              legGeometry: { points: 'encoded-street-walk' },
              walkingSource: 'locationiq',
            },
          ],
        },
      ],
    };
    const enrichTripPlanWithWalkingMock = jest.fn(async () => enrichedResult);
    const { planTripAuto } = loadTripService({
      planTripLocalMock: jest.fn(async () => {
        throw new Error('local router unavailable');
      }),
      retryFetchMock: jest.fn(async () => ({
        ok: true,
        json: async () => otpResult,
      })),
      enrichTripPlanWithWalkingMock,
    });

    const result = await planTripAuto({
      fromLat: 44.38,
      fromLon: -79.69,
      toLat: 44.39,
      toLon: -79.68,
      date: new Date('2026-03-06T10:00:00Z'),
      time: new Date('2026-03-06T10:00:00Z'),
      enrichWalking: true,
      routingData: { routesByStop: new Map() },
      onDemandZones: {},
      stops: [],
    });

    expect(enrichTripPlanWithWalkingMock).toHaveBeenCalledTimes(1);
    expect(result.itineraries[0].legs[0].legGeometry).toEqual({ points: 'encoded-street-walk' });
    expect(result.routingDiagnostics.walkingEnrichment).toBe('trip_enrichment');
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
        fromLat: 44.30,
        fromLon: -79.80,
        toLat: 44.49,
        toLon: -79.56,
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

  test('local-router no-route errors return walking-only fallback when the walk is reasonable', async () => {
    const requestedTime = new Date(Date.now() + 10 * 60 * 1000);
    let RoutingErrorMockRef;
    const planTripLocalMock = jest.fn(async () => {
      throw new RoutingErrorMockRef('NO_ROUTE_FOUND', 'No transit routes found for this trip');
    });
    const { planTripAuto, RoutingErrorMock } = loadTripService({
      otpBaseUrl: '',
      planTripLocalMock,
    });
    RoutingErrorMockRef = RoutingErrorMock;

    const result = await planTripAuto({
      fromLat: 44.38,
      fromLon: -79.69,
      toLat: 44.384,
      toLon: -79.69,
      date: requestedTime,
      time: requestedTime,
      routingData: { routesByStop: new Map() },
      onDemandZones: {},
      stops: [],
    });

    expect(result.itineraries).toHaveLength(1);
    expect(result.itineraries[0]).toMatchObject({
      id: 'walking-only',
      isWalkingOnly: true,
      isRecommended: true,
      transfers: 0,
      legs: [
        expect.objectContaining({
          mode: 'WALK',
          from: expect.objectContaining({ lat: 44.38, lon: -79.69 }),
          to: expect.objectContaining({ lat: 44.384, lon: -79.69 }),
        }),
      ],
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

  test('OTP itineraries are ranked with transfer penalty while preserving real duration', async () => {
    const baseTime = new Date('2026-03-06T10:00:00Z').getTime();
    const transferTrip = {
      duration: 25 * 60,
      startTime: baseTime,
      endTime: baseTime + 25 * 60 * 1000,
      walkTime: 0,
      transitTime: 20 * 60,
      waitingTime: 5 * 60,
      walkDistance: 0,
      transfers: 1,
      legs: [
        {
          mode: 'BUS',
          startTime: baseTime,
          endTime: baseTime + 10 * 60 * 1000,
          duration: 10 * 60,
          distance: 1000,
          from: { name: 'Origin Stop', lat: 44.38, lon: -79.69, stopId: 'S1' },
          to: { name: 'Transfer Stop', lat: 44.385, lon: -79.685, stopId: 'S2' },
          route: '1',
          routeId: '1',
          routeShortName: '1',
          tripId: 'TRIP-TRANSFER-A',
        },
        {
          mode: 'BUS',
          startTime: baseTime + 15 * 60 * 1000,
          endTime: baseTime + 25 * 60 * 1000,
          duration: 10 * 60,
          distance: 1000,
          from: { name: 'Transfer Stop', lat: 44.385, lon: -79.685, stopId: 'S2' },
          to: { name: 'Dest Stop', lat: 44.39, lon: -79.68, stopId: 'S3' },
          route: '2',
          routeId: '2',
          routeShortName: '2',
          tripId: 'TRIP-TRANSFER-B',
        },
      ],
    };
    const directTrip = {
      duration: 30 * 60,
      startTime: baseTime,
      endTime: baseTime + 30 * 60 * 1000,
      walkTime: 0,
      transitTime: 30 * 60,
      waitingTime: 0,
      walkDistance: 0,
      transfers: 0,
      legs: [
        {
          mode: 'BUS',
          startTime: baseTime,
          endTime: baseTime + 30 * 60 * 1000,
          duration: 30 * 60,
          distance: 2000,
          from: { name: 'Origin Stop', lat: 44.38, lon: -79.69, stopId: 'S1' },
          to: { name: 'Dest Stop', lat: 44.39, lon: -79.68, stopId: 'S3' },
          route: '10',
          routeId: '10',
          routeShortName: '10',
          tripId: 'TRIP-DIRECT',
        },
      ],
    };
    const retryFetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => makeOtpPlanResponse({
        itineraries: [transferTrip, directTrip],
      }),
    }));
    const { planTripAuto } = loadTripService({ retryFetchMock });

    const result = await planTripAuto({
      fromLat: 44.30,
      fromLon: -79.80,
      toLat: 44.49,
      toLon: -79.56,
      date: new Date('2026-03-06T10:00:00Z'),
      time: new Date('2026-03-06T10:00:00Z'),
      onDemandZones: {},
      stops: [],
    });

    expect(result.itineraries.map((itinerary) => itinerary.id)).toEqual([
      'itinerary-1',
      'itinerary-0',
    ]);
    expect(result.itineraries[0]).toMatchObject({
      duration: 30 * 60,
      transfers: 0,
      riderCostSeconds: 30 * 60,
    });
    expect(result.itineraries[1]).toMatchObject({
      duration: 25 * 60,
      transfers: 1,
      riderCostSeconds: 32 * 60,
      transferPenaltySeconds: 7 * 60,
    });
  });

  test('walking-only is recommended when it is at least 25 percent faster than transit', async () => {
    const baseTime = Date.now() + 10 * 60 * 1000;
    const requestedTime = new Date(baseTime);
    const retryFetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => makeOtpPlanResponse({
        itineraries: [{
          duration: 12 * 60,
          startTime: baseTime,
          endTime: baseTime + 12 * 60 * 1000,
          walkTime: 0,
          transitTime: 12 * 60,
          waitingTime: 0,
          walkDistance: 0,
          transfers: 0,
          legs: [{
            mode: 'BUS',
            startTime: baseTime,
            endTime: baseTime + 12 * 60 * 1000,
            duration: 12 * 60,
            distance: 2000,
            from: { name: 'Origin Stop', lat: 44.38, lon: -79.69, stopId: 'S1' },
            to: { name: 'Dest Stop', lat: 44.384, lon: -79.69, stopId: 'S2' },
            route: '10',
            routeId: '10',
            routeShortName: '10',
            tripId: 'TRIP-DIRECT',
          }],
        }],
      }),
    }));
    const { planTripAuto } = loadTripService({ retryFetchMock });

    const result = await planTripAuto({
      fromLat: 44.38,
      fromLon: -79.69,
      toLat: 44.384,
      toLon: -79.69,
      date: requestedTime,
      time: requestedTime,
      onDemandZones: {},
      stops: [],
    });

    expect(result.itineraries[0]).toMatchObject({
      id: 'walking-only',
      isWalkingOnly: true,
      isRecommended: true,
    });
    expect(result.itineraries[1].id).toBe('itinerary-0');
  });

  test('walking-only can be recommended even when it crosses the high-walk warning threshold', async () => {
    const baseTime = Date.now() + 10 * 60 * 1000;
    const requestedTime = new Date(baseTime);
    const retryFetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => makeOtpPlanResponse({
        itineraries: [{
          duration: 40 * 60,
          startTime: baseTime,
          endTime: baseTime + 40 * 60 * 1000,
          walkTime: 0,
          transitTime: 40 * 60,
          waitingTime: 0,
          walkDistance: 0,
          transfers: 0,
          legs: [{
            mode: 'BUS',
            startTime: baseTime,
            endTime: baseTime + 40 * 60 * 1000,
            duration: 40 * 60,
            distance: 4000,
            from: { name: 'Origin Stop', lat: 44.38, lon: -79.69, stopId: 'S1' },
            to: { name: 'Dest Stop', lat: 44.392, lon: -79.69, stopId: 'S2' },
            route: '10',
            routeId: '10',
            routeShortName: '10',
            tripId: 'TRIP-DIRECT',
          }],
        }],
      }),
    }));
    const { planTripAuto } = loadTripService({ retryFetchMock });

    const result = await planTripAuto({
      fromLat: 44.38,
      fromLon: -79.69,
      toLat: 44.392,
      toLon: -79.69,
      date: requestedTime,
      time: requestedTime,
      onDemandZones: {},
      stops: [],
    });

    expect(result.itineraries[0]).toMatchObject({
      id: 'walking-only',
      isWalkingOnly: true,
      hasHighWalk: true,
      isRecommended: true,
    });
  });

  test('walking-only is shown but not recommended when it is less than 25 percent faster', async () => {
    const baseTime = Date.now() + 10 * 60 * 1000;
    const requestedTime = new Date(baseTime);
    const retryFetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => makeOtpPlanResponse({
        itineraries: [{
          duration: 9 * 60,
          startTime: baseTime,
          endTime: baseTime + 9 * 60 * 1000,
          walkTime: 0,
          transitTime: 9 * 60,
          waitingTime: 0,
          walkDistance: 0,
          transfers: 0,
          legs: [{
            mode: 'BUS',
            startTime: baseTime,
            endTime: baseTime + 9 * 60 * 1000,
            duration: 9 * 60,
            distance: 2000,
            from: { name: 'Origin Stop', lat: 44.38, lon: -79.69, stopId: 'S1' },
            to: { name: 'Dest Stop', lat: 44.384, lon: -79.69, stopId: 'S2' },
            route: '10',
            routeId: '10',
            routeShortName: '10',
            tripId: 'TRIP-DIRECT',
          }],
        }],
      }),
    }));
    const { planTripAuto } = loadTripService({ retryFetchMock });

    const result = await planTripAuto({
      fromLat: 44.38,
      fromLon: -79.69,
      toLat: 44.384,
      toLon: -79.69,
      date: requestedTime,
      time: requestedTime,
      onDemandZones: {},
      stops: [],
    });

    expect(result.itineraries.map((itinerary) => itinerary.id)).toEqual([
      'itinerary-0',
      'walking-only',
    ]);
    expect(result.itineraries[0].isRecommended).toBe(true);
    expect(result.itineraries[1]).toMatchObject({
      isWalkingOnly: true,
      recommendationEligible: false,
    });
    expect(result.itineraries[1].isRecommended).not.toBe(true);
  });

  test('mixed zone trips add direct walking-only from original endpoints instead of wrapping hub walking with on-demand', async () => {
    const requestedTime = new Date(Date.now() + 10 * 60 * 1000);
    const transitStartTime = requestedTime.getTime() + 10 * 60 * 1000;
    const transitEndTime = transitStartTime + 12 * 60 * 1000;
    const originalFrom = { lat: 44.38, lon: -79.69 };
    const originalTo = { lat: 44.386, lon: -79.69 };
    const fromHub = { lat: 44.381, lon: -79.691 };
    const toHub = { lat: 44.382, lon: -79.690 };
    const planTripLocalMock = jest.fn(async () => ({
      from: { name: 'Origin', lat: fromHub.lat, lon: fromHub.lon },
      to: { name: 'Destination', lat: toHub.lat, lon: toHub.lon },
      itineraries: [{
        id: 'hub-transit',
        duration: 12 * 60,
        startTime: transitStartTime,
        endTime: transitEndTime,
        walkTime: 0,
        transitTime: 12 * 60,
        waitingTime: 0,
        walkDistance: 0,
        transfers: 0,
        legs: [{
          mode: 'BUS',
          startTime: transitStartTime,
          endTime: transitEndTime,
          duration: 12 * 60,
          distance: 1000,
          from: { name: 'From Hub', lat: fromHub.lat, lon: fromHub.lon, stopId: 'H1' },
          to: { name: 'To Hub', lat: toHub.lat, lon: toHub.lon, stopId: 'H2' },
          route: '10',
          routeId: '10',
          routeShortName: '10',
          tripId: 'TRIP-HUB',
        }],
      }],
    }));
    const { planTripAuto } = loadTripService({
      planTripLocalMock,
      enrichTripPlanWithWalkingMock: jest.fn(async (tripPlan) => tripPlan),
      analyzeZoneInvolvementMock: jest.fn(() => ({ needsOnDemand: true })),
      buildZoneAwareTripMock: jest.fn(() => ({
        sameZone: false,
        raptorFrom: fromHub,
        raptorTo: toHub,
        prependLeg: {
          zone: { id: 'south', name: 'South End', color: '#007A5E', bookingPhone: '705-555-1111' },
          hubStop: { latitude: fromHub.lat, longitude: fromHub.lon, name: 'From Hub' },
        },
        appendLeg: {
          zone: { id: 'north', name: 'North End', color: '#004B91', bookingPhone: '705-555-2222' },
          hubStop: { latitude: toHub.lat, longitude: toHub.lon, name: 'To Hub' },
        },
      })),
      estimateOnDemandDurationMock: jest.fn(() => 10 * 60),
    });

    const result = await planTripAuto({
      fromLat: originalFrom.lat,
      fromLon: originalFrom.lon,
      toLat: originalTo.lat,
      toLon: originalTo.lon,
      date: requestedTime,
      time: requestedTime,
      enrichWalking: false,
      routingData: { mocked: true },
      onDemandZones: { south: {}, north: {} },
      stops: [],
    });

    expect(planTripLocalMock).toHaveBeenCalledWith(expect.objectContaining({
      fromLat: fromHub.lat,
      fromLon: fromHub.lon,
      toLat: toHub.lat,
      toLon: toHub.lon,
    }));

    const walkingOnly = result.itineraries.find((itinerary) => itinerary.isWalkingOnly);
    const zoneTransit = result.itineraries.find((itinerary) => !itinerary.isWalkingOnly);

    expect(walkingOnly).toBeTruthy();
    expect(walkingOnly.legs).toHaveLength(1);
    expect(walkingOnly.legs[0]).toMatchObject({
      mode: 'WALK',
      from: expect.objectContaining(originalFrom),
      to: expect.objectContaining(originalTo),
    });
    expect(walkingOnly.legs.some((leg) => leg.mode === 'ON_DEMAND')).toBe(false);
    expect(zoneTransit.legs[0].mode).toBe('ON_DEMAND');
    expect(zoneTransit.legs[zoneTransit.legs.length - 1].mode).toBe('ON_DEMAND');
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

  test('trip preview searches request walking geometry', async () => {
    const planTripAutoMock = jest.fn(async () => ({ itineraries: [] }));
    const { getHook, act, unmount } = loadUseTripPlanner({ planTripAutoMock });

    await act(async () => {
      await getHook().searchTrips(
        { lat: 44.38, lon: -79.69 },
        { lat: 44.39, lon: -79.68 }
      );
      await flushMicrotasks();
    });

    expect(planTripAutoMock).toHaveBeenCalledWith(expect.objectContaining({
      enrichWalking: true,
    }));

    unmount();
  });

  test('passes live vehicle context to trip delay enrichment', async () => {
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
    const delayOptions = {
      vehicles: [{ tripId: 'TRIP-1', currentStopSequence: 4 }],
    };
    const applyDelaysMock = jest.fn(async (itineraries) => itineraries);
    const { getHook, act, unmount } = loadUseTripPlanner({
      planTripAutoMock: jest.fn(async () => ({ itineraries: [itinerary] })),
      hookOptions: {
        applyDelays: applyDelaysMock,
        delayOptions,
      },
    });

    await act(async () => {
      await getHook().searchTrips(
        { lat: 44.38, lon: -79.69 },
        { lat: 44.39, lon: -79.68 }
      );
      await flushMicrotasks();
    });

    expect(applyDelaysMock).toHaveBeenCalledWith([itinerary], delayOptions);

    unmount();
  });

  test('validation failures use structured trip-planning errors', async () => {
    const planTripAutoMock = jest.fn(async () => ({ itineraries: [] }));
    const { getHook, act, unmount } = loadUseTripPlanner({ planTripAutoMock });

    await act(async () => {
      await getHook().searchTrips(
        { lat: 45.1, lon: -79.69 },
        { lat: 44.39, lon: -79.68 }
      );
      await flushMicrotasks();
    });

    expect(planTripAutoMock).not.toHaveBeenCalled();
    expect(getHook().state.error).toEqual(expect.objectContaining({
      code: 'OUTSIDE_SERVICE_AREA',
      message: expect.stringContaining('outside Barrie Transit service area'),
    }));
    expect(getHook().state.hasSearched).toBe(true);

    unmount();
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

  test('current-location lookup gives immediate feedback while GPS resolves', async () => {
    const locationDeferred = createDeferred();
    const { getHook, act, unmount } = loadUseTripPlanner();
    let lookupPromise;

    act(() => {
      lookupPromise = getHook().useCurrentLocation(() => locationDeferred.promise);
    });

    expect(getHook().state.isLocatingFrom).toBe(true);
    expect(getHook().state.fromUsesCurrentLocation).toBe(true);
    expect(getHook().state.fromText).toBe('Finding your location…');
    expect(getHook().state.from).toBeNull();

    locationDeferred.resolve({ lat: 44.381, lon: -79.691 });
    await act(async () => {
      await lookupPromise;
      await flushMicrotasks();
    });

    expect(getHook().state.isLocatingFrom).toBe(false);
    expect(getHook().state.fromText).toBe('Current Location');
    expect(getHook().state.from).toEqual({ lat: 44.381, lon: -79.691 });

    unmount();
  });

  test('current-location origin is tracked separately from manual origin selection', async () => {
    const { getHook, act, unmount } = loadUseTripPlanner();

    await act(async () => {
      await getHook().useCurrentLocation(async () => ({ lat: 44.381, lon: -79.691 }));
      await flushMicrotasks();
    });

    expect(getHook().state.fromUsesCurrentLocation).toBe(true);

    act(() => {
      getHook().setFrom({ lat: 44.402, lon: -79.682 }, 'Selected origin');
    });

    expect(getHook().state.fromUsesCurrentLocation).toBe(false);

    unmount();
  });

  test('destination seeding can suppress stale-origin auto-search while GPS resolves', async () => {
    const planTripAutoMock = jest.fn(async () => ({ itineraries: [] }));
    const { getHook, act, unmount } = loadUseTripPlanner({ planTripAutoMock });

    await act(async () => {
      getHook().setFrom({ lat: 44.38, lon: -79.69 }, 'Old origin');
      await flushMicrotasks();
    });

    planTripAutoMock.mockClear();

    act(() => {
      getHook().setTo(
        { lat: 44.401, lon: -79.681 },
        'New destination',
        { suppressAutoSearch: true }
      );
    });

    expect(planTripAutoMock).not.toHaveBeenCalled();
    expect(getHook().state.toText).toBe('New destination');
    expect(getHook().state.itineraries).toEqual([]);
    expect(getHook().state.hasSearched).toBe(false);

    unmount();
  });

  test('current-location search does not wait for reverse geocoding before routing', async () => {
    const planTripAutoMock = jest.fn(async () => ({ itineraries: [] }));
    const reverseGeocodeDeferred = createDeferred();
    const { getHook, act, unmount } = loadUseTripPlanner({
      planTripAutoMock,
      reverseGeocodeMock: jest.fn(() => reverseGeocodeDeferred.promise),
    });

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
    expect(getHook().state.fromText).toBe('Current Location');

    reverseGeocodeDeferred.resolve({ shortName: 'My Position' });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(getHook().state.fromText).toBe('My Position');

    unmount();
  });

  test('reset cancels pending current-location reverse geocode updates', async () => {
    const reverseGeocodeDeferred = createDeferred();
    const { getHook, act, unmount } = loadUseTripPlanner({
      reverseGeocodeMock: jest.fn(() => reverseGeocodeDeferred.promise),
    });

    await act(async () => {
      await getHook().useCurrentLocation(async () => ({ lat: 44.381, lon: -79.691 }));
      await flushMicrotasks();
    });

    expect(getHook().state.fromText).toBe('Current Location');

    act(() => {
      getHook().reset();
    });

    reverseGeocodeDeferred.resolve({ shortName: 'Late Location Name' });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(getHook().state.fromText).toBe('');
    expect(getHook().state.from).toBeNull();

    unmount();
  });

  test('manual origin selection cancels pending current-location overwrite', async () => {
    const reverseGeocodeDeferred = createDeferred();
    const { getHook, act, unmount } = loadUseTripPlanner({
      reverseGeocodeMock: jest.fn(() => reverseGeocodeDeferred.promise),
    });

    await act(async () => {
      await getHook().useCurrentLocation(async () => ({ lat: 44.381, lon: -79.691 }));
      await flushMicrotasks();
    });

    expect(getHook().state.fromText).toBe('Current Location');

    act(() => {
      getHook().setFrom({ lat: 44.402, lon: -79.682 }, 'Selected map point');
    });

    reverseGeocodeDeferred.resolve({ shortName: 'Late GPS Location' });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(getHook().state.fromText).toBe('Selected map point');
    expect(getHook().state.from).toEqual({ lat: 44.402, lon: -79.682 });

    unmount();
  });

  test('manual origin selection cancels pending current-position lookup', async () => {
    const locationDeferred = createDeferred();
    const { getHook, act, unmount } = loadUseTripPlanner();

    act(() => {
      getHook().useCurrentLocation(() => locationDeferred.promise);
    });

    act(() => {
      getHook().setFrom({ lat: 44.402, lon: -79.682 }, 'Directions from here');
    });

    locationDeferred.resolve({ lat: 44.381, lon: -79.691 });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(getHook().state.fromText).toBe('Directions from here');
    expect(getHook().state.from).toEqual({ lat: 44.402, lon: -79.682 });

    unmount();
  });

  test('failed current-location lookup clears stale trip results and stops loading', async () => {
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

    expect(getHook().state.itineraries).toHaveLength(1);
    expect(getHook().state.hasSearched).toBe(true);

    await act(async () => {
      await getHook().useCurrentLocation(async () => {
        throw new Error('permission denied');
      });
      await flushMicrotasks();
    });

    expect(getHook().state.error).toBe('Could not get your location');
    expect(getHook().state.itineraries).toEqual([]);
    expect(getHook().state.isLoading).toBe(false);
    expect(getHook().state.hasSearched).toBe(false);

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

  test('annotates planned trip legs when their route is on detour', async () => {
    const itinerary = {
      id: 'detour-trip',
      duration: 600,
      startTime: 1000,
      endTime: 1600,
      walkDistance: 0,
      walkTime: 0,
      transitTime: 600,
      waitingTime: 0,
      transfers: 0,
      legs: [{
        mode: 'BUS',
        route: { id: '10', shortName: '10' },
        from: { stopId: 'S1', stopCode: '1001', name: 'Origin Stop' },
        to: { stopId: 'S2', stopCode: '1002', name: 'Destination Stop' },
      }],
    };
    const { getHook, act, unmount } = loadUseTripPlanner({
      planTripAutoMock: jest.fn(async () => ({ itineraries: [itinerary] })),
      hookOptions: {
        activeDetours: {
          10: { routeId: '10', state: 'active' },
        },
        detourStopDetailsByRouteId: {
          10: {
            segmentStopDetails: [{
              skippedStops: [{ stopId: 'S1', stopCode: '1001', name: 'Origin Stop' }],
            }],
          },
        },
      },
    });

    await act(async () => {
      await getHook().searchTrips(
        { lat: 44.38, lon: -79.69 },
        { lat: 44.39, lon: -79.68 }
      );
      await flushMicrotasks();
    });

    expect(getHook().state.itineraries[0]).toMatchObject({
      hasDetour: true,
      hasStopDetourImpact: true,
    });
    expect(getHook().state.itineraries[0].legs[0].detourImpact).toMatchObject({
      severity: 'stop_affected',
      affectedStopRoles: expect.arrayContaining(['boarding']),
    });

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

  test('web search header shows planning feedback while trip search is loading', () => {
    const { root, unmount } = loadTripSearchHeaderWeb({
      fromText: 'Current Location',
      toText: 'Downtown Terminal',
      isLoading: true,
    });

    const loadingText = root.findAll(
      (node) => node.children?.includes('Planning your trip…')
    );
    const progressIndicators = root.findAll(
      (node) => node.props.accessibilityRole === 'progressbar'
    );
    const loadingAnimations = root.findAll(
      (node) => node.props.testID === 'trip-planning-loading-animation'
    );

    expect(loadingText).toHaveLength(1);
    expect(progressIndicators).toHaveLength(1);
    expect(loadingAnimations).toHaveLength(1);

    unmount();
  });

  test('native search header shows animated planning feedback while trip search is loading', () => {
    const { root, unmount } = loadTripSearchHeaderNative({
      fromText: 'Current Location',
      toText: 'Downtown Terminal',
      isLoading: true,
    });

    const loadingText = root.findAll(
      (node) => node.children?.includes('Planning your trip…')
    );
    const progressIndicators = root.findAll(
      (node) => node.props.accessibilityRole === 'progressbar'
    );
    const loadingAnimations = root.findAll(
      (node) => node.props.testID === 'trip-planning-loading-animation'
    );

    expect(loadingText).toHaveLength(1);
    expect(progressIndicators).toHaveLength(1);
    expect(loadingAnimations).toHaveLength(1);

    unmount();
  });

  test('native search header gives address fields saved places for instant work/home matches', () => {
    const savedPlaces = [
      { id: 'work', name: 'Work', addressText: '70 Collier St', lat: 44.389, lon: -79.69 },
    ];
    const { root, unmount } = loadTripSearchHeaderNative({ savedPlaces });

    const addressFields = root.findAll((node) => node.type === 'AddressAutocomplete');

    expect(addressFields).toHaveLength(2);
    expect(addressFields[0].props.savedPlaces).toBe(savedPlaces);
    expect(addressFields[1].props.savedPlaces).toBe(savedPlaces);

    unmount();
  });

  test('web search header lets typing work select a saved place in the destination field', () => {
    const onToSelect = jest.fn();
    const { root, act, unmount } = loadTripSearchHeaderWeb({
      toText: 'work',
      savedPlaces: [
        { id: 'work', name: 'Work', addressText: '70 Collier St', lat: 44.389, lon: -79.69 },
      ],
      onToSelect,
    });

    const savedWorkOption = root.find(
      (node) => node.props.accessibilityLabel === 'Saved place: Work'
    );

    act(() => {
      savedWorkOption.props.onPress();
    });

    expect(onToSelect).toHaveBeenCalledWith(expect.objectContaining({
      source: 'saved_place',
      shortName: 'Work',
      lat: 44.389,
      lon: -79.69,
    }));

    unmount();
  });

  test('native search header compacts after trip results and can be edited', () => {
    const { root, act, unmount } = loadTripSearchHeaderNative({
      compact: true,
      fromText: 'Current Location',
      toText: 'Downtown Terminal',
    });

    expect(root.findAll((node) => node.children?.includes('Trip planned'))).toHaveLength(1);
    expect(root.findAll((node) => node.children?.includes('Use current location'))).toHaveLength(0);

    const editButton = root.find((node) => node.props.accessibilityLabel === 'Edit trip search');
    act(() => {
      editButton.props.onPress();
    });

    expect(root.findAll((node) => node.children?.includes('Plan your trip'))).toHaveLength(1);

    unmount();
  });

  test('web search header compacts after trip results and can be edited', () => {
    const { root, act, unmount } = loadTripSearchHeaderWeb({
      compact: true,
      fromText: 'Current Location',
      toText: 'Downtown Terminal',
    });

    expect(root.findAll((node) => node.children?.includes('Trip planned'))).toHaveLength(1);
    expect(root.findAll((node) => node.children?.includes('Use current location'))).toHaveLength(0);

    const editButton = root.find((node) => node.props.accessibilityLabel === 'Edit trip search');
    act(() => {
      editButton.props.onPress();
    });

    expect(root.findAll((node) => node.children?.includes('Plan your trip'))).toHaveLength(1);

    unmount();
  });

  test('native search header shows an explicit Use current location button', () => {
    const onUseCurrentLocation = jest.fn();
    const { root, act, unmount } = loadTripSearchHeaderNative({ onUseCurrentLocation });

    const visibleLabels = root.findAll(
      (node) => node.children?.includes('Use current location')
    );
    expect(visibleLabels).toHaveLength(1);

    const locationButtons = root.findAll(
      (node) => node.props.accessibilityLabel === 'Use current location'
    );
    expect(locationButtons.length).toBeGreaterThan(0);

    act(() => {
      locationButtons[0].props.onPress({ nativeEvent: { pageX: 10 } });
    });
    expect(onUseCurrentLocation).toHaveBeenCalledTimes(1);
    expect(onUseCurrentLocation).toHaveBeenCalledWith();

    unmount();
  });

  test('native search header shows immediate current-location feedback', () => {
    const onUseCurrentLocation = jest.fn();
    const { root, unmount } = loadTripSearchHeaderNative({
      onUseCurrentLocation,
      isLocatingCurrentLocation: true,
    });

    const visibleLabels = root.findAll(
      (node) => node.children?.includes('Getting location…')
    );
    const locationButtons = root.findAll(
      (node) => node.props.accessibilityLabel === 'Use current location'
    );
    const progressIndicators = root.findAll((node) => node.type === 'ActivityIndicator');

    expect(visibleLabels).toHaveLength(1);
    expect(locationButtons[0].props.disabled).toBe(true);
    expect(locationButtons[0].props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(progressIndicators.length).toBeGreaterThan(0);

    unmount();
  });

  test('native search header hides current-location button after From is selected', () => {
    const { root, unmount } = loadTripSearchHeaderNative({
      fromText: 'Downtown Terminal',
      showUseCurrentLocation: false,
    });

    const locationButtons = root.findAll(
      (node) => node.props.accessibilityLabel === 'Use current location'
    );
    const visibleLabels = root.findAll(
      (node) => node.children?.includes('Use current location')
    );

    expect(locationButtons).toHaveLength(0);
    expect(visibleLabels).toHaveLength(0);

    unmount();
  });

  test('web search header shows an explicit Use current location button', () => {
    const onUseCurrentLocation = jest.fn();
    const { root, act, unmount } = loadTripSearchHeaderWeb({ onUseCurrentLocation });

    const visibleLabels = root.findAll(
      (node) => node.children?.includes('Use current location')
    );
    expect(visibleLabels).toHaveLength(1);

    const locationButtons = root.findAll(
      (node) => node.props.accessibilityLabel === 'Use current location'
    );
    expect(locationButtons.length).toBeGreaterThan(0);

    act(() => {
      locationButtons[0].props.onPress({ nativeEvent: { pageX: 10 } });
    });
    expect(onUseCurrentLocation).toHaveBeenCalledTimes(1);
    expect(onUseCurrentLocation).toHaveBeenCalledWith();

    unmount();
  });

  test('web search header shows immediate current-location feedback', () => {
    const { root, unmount } = loadTripSearchHeaderWeb({
      isLocatingCurrentLocation: true,
    });

    const visibleLabels = root.findAll(
      (node) => node.children?.includes('Getting location…')
    );
    const locationButtons = root.findAll(
      (node) => node.props.accessibilityLabel === 'Use current location'
    );
    const progressIndicators = root.findAll((node) => node.type === 'ActivityIndicator');

    expect(visibleLabels).toHaveLength(1);
    expect(locationButtons[0].props.disabled).toBe(true);
    expect(locationButtons[0].props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(progressIndicators.length).toBeGreaterThan(0);

    unmount();
  });

  test('web search header hides current-location button after From is selected', () => {
    const { root, unmount } = loadTripSearchHeaderWeb({
      fromText: 'Downtown Terminal',
      showUseCurrentLocation: false,
    });

    const locationButtons = root.findAll(
      (node) => node.props.accessibilityLabel === 'Use current location'
    );
    const visibleLabels = root.findAll(
      (node) => node.children?.includes('Use current location')
    );

    expect(locationButtons).toHaveLength(0);
    expect(visibleLabels).toHaveLength(0);

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

  test('web trip bottom sheet makes saved and recent trips obvious before a search', () => {
    const { root, unmount } = loadTripBottomSheetWeb({
      savedTrips: [{ id: 'saved-1', name: 'Morning commute' }],
      recentTrips: [{ fromText: 'Home', toText: 'Work' }],
    });

    expect(root.findAll((node) => node.children?.includes('Your trips start here'))).toHaveLength(1);
    expect(root.findAll((node) => node.children?.includes('Saved routes'))).toHaveLength(1);
    expect(root.findAll((node) => node.children?.includes('Recent routes'))).toHaveLength(1);

    unmount();
  });

  test('web trip bottom sheet uses clearer save route wording after results', () => {
    const { root, unmount } = loadTripBottomSheetWeb({
      itineraries: [{ id: 'itinerary-1', legs: [], startTime: 1, endTime: 2, duration: 60 }],
      hasSearched: true,
      onSaveCurrentTrip: jest.fn(),
    });

    expect(root.findAll((node) => node.children?.includes('Save this route'))).toHaveLength(1);

    unmount();
  });

  test('web trip bottom sheet suggests saving a repeatedly planned route', () => {
    const onSaveCurrentTrip = jest.fn();
    const { root, act, unmount } = loadTripBottomSheetWeb({
      itineraries: [{ id: 'itinerary-1', legs: [], startTime: 1, endTime: 2, duration: 60 }],
      hasSearched: true,
      onSaveCurrentTrip,
      repeatTripSuggestion: {
        name: 'Home to Work',
        count: 2,
      },
    });

    expect(root.findAll((node) => node.children?.includes('Save Home to Work?'))).toHaveLength(1);

    const saveRepeatButton = root.find(
      (node) => node.props.accessibilityLabel === 'Save recurring route Home to Work'
    );

    act(() => {
      saveRepeatButton.props.onPress();
    });

    expect(onSaveCurrentTrip).toHaveBeenCalledTimes(1);

    unmount();
  });
});
