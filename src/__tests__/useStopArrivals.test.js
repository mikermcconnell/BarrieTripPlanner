global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { create, act } = require('react-test-renderer');

const mockUseTransitStatic = jest.fn();
const mockFetchTripUpdates = jest.fn();
const mockGetArrivalsForStop = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../context/TransitContext', () => ({
  useTransitStatic: () => mockUseTransitStatic(),
}));

jest.mock('../services/arrivalService', () => ({
  fetchTripUpdates: (...args) => mockFetchTripUpdates(...args),
  getArrivalsForStop: (...args) => mockGetArrivalsForStop(...args),
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: (...args) => mockLoggerError(...args) },
}));

const { useStopArrivals } = require('../hooks/useStopArrivals');

const stop = { id: 'STOP-1' };
const routes = [{ id: '8A', shortName: '8A' }];

let latestHookValue;
const HookHarness = ({ selectedStop = stop }) => {
  latestHookValue = useStopArrivals(selectedStop);
  return null;
};

const runImmediateArrivalLoad = async () => {
  await act(async () => {
    jest.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useStopArrivals destination refresh lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    latestHookValue = undefined;
    mockFetchTripUpdates.mockResolvedValue([]);
    mockGetArrivalsForStop.mockImplementation((_updates, _stopId, _routes, tripMapping) => [{
      tripId: 'live-trip-8a',
      routeId: '8A',
      routeShortName: '8A',
      headsign: tripMapping['live-trip-8a']?.headsign || '',
      destinationStatus: tripMapping['live-trip-8a'] ? 'available' : 'trip-unmatched',
      minutesAway: 5,
      isRealtime: true,
    }]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('refreshes static data once, reports context after failure, and resolves on mapping update', async () => {
    const loadStaticData = jest.fn().mockResolvedValue(undefined);
    let staticState = {
      routes,
      tripMapping: {},
      isLoadingStatic: false,
      isRefreshingStatic: false,
      loadStaticData,
    };
    mockUseTransitStatic.mockImplementation(() => staticState);

    let instance;
    await act(async () => {
      instance = create(React.createElement(HookHarness));
    });
    await runImmediateArrivalLoad();

    expect(loadStaticData).toHaveBeenCalledTimes(1);
    expect(latestHookValue.arrivals[0]).toEqual(expect.objectContaining({
      destinationStatus: 'trip-unmatched',
      isDestinationUpdating: true,
    }));
    expect(mockLoggerError).not.toHaveBeenCalled();

    staticState = { ...staticState, tripMapping: {} };
    await act(async () => {
      instance.update(React.createElement(HookHarness));
    });
    await runImmediateArrivalLoad();

    expect(loadStaticData).toHaveBeenCalledTimes(1);
    expect(latestHookValue.arrivals[0].isDestinationUpdating).toBe(false);
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError.mock.calls[0][0].message).toContain(
      'trip live-trip-8a, route 8A, stop STOP-1'
    );

    staticState = {
      ...staticState,
      tripMapping: { 'live-trip-8a': { routeId: '8A', headsign: 'Downtown Terminal' } },
    };
    await act(async () => {
      instance.update(React.createElement(HookHarness));
    });
    await runImmediateArrivalLoad();

    expect(loadStaticData).toHaveBeenCalledTimes(1);
    expect(latestHookValue.arrivals[0]).toEqual(expect.objectContaining({
      headsign: 'Downtown Terminal',
      destinationStatus: 'available',
      isDestinationUpdating: false,
    }));

    act(() => instance.unmount());
  });

  test('ignores a slower response from the previously selected stop', async () => {
    const pending = [];
    mockFetchTripUpdates.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    mockGetArrivalsForStop.mockImplementation((updates, stopId) => [{
      tripId: updates[0].tripId,
      routeId: '8A',
      headsign: `To ${stopId}`,
      destinationStatus: 'available',
    }]);
    mockUseTransitStatic.mockReturnValue({
      routes,
      tripMapping: {},
      isLoadingStatic: false,
      isRefreshingStatic: false,
      loadStaticData: jest.fn(),
    });

    let instance;
    await act(async () => {
      instance = create(React.createElement(HookHarness, { selectedStop: { id: 'STOP-A' } }));
    });
    await runImmediateArrivalLoad();

    await act(async () => {
      instance.update(React.createElement(HookHarness, { selectedStop: { id: 'STOP-B' } }));
    });
    await runImmediateArrivalLoad();

    await act(async () => {
      pending[1]([{ tripId: 'trip-b' }]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latestHookValue.arrivals[0]).toEqual(expect.objectContaining({
      tripId: 'trip-b',
      headsign: 'To STOP-B',
    }));

    await act(async () => {
      pending[0]([{ tripId: 'trip-a' }]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(latestHookValue.arrivals[0].tripId).toBe('trip-b');

    act(() => instance.unmount());
  });
});
