import React from 'react';
import { act, create } from 'react-test-renderer';
import { __TEST_ONLY__, useMapNavigation } from '../hooks/useMapNavigation';

const buildProps = (overrides = {}) => ({
  route: { params: {} },
  navigation: { setParams: jest.fn() },
  stops: [],
  mapRef: { current: { animateToRegion: jest.fn() } },
  selectRoute: jest.fn(),
  resetTrip: jest.fn(),
  setSelectedStop: jest.fn(),
  setShowStops: jest.fn(),
  hasSelection: false,
  showLocation: jest.fn(),
  ...overrides,
});

const Harness = (props) => {
  useMapNavigation(props);
  return null;
};

describe('useMapNavigation camera-neutral selections', () => {
  beforeEach(() => {
    __TEST_ONLY__.resetConsumedMapFocusRequests();
  });

  test('bounds remembered focus requests while preserving recent one-shot protection', () => {
    for (let index = 0; index < 300; index += 1) {
      expect(__TEST_ONLY__.claimMapFocusRequest(`bounded-focus-${index}`)).toBe(true);
    }

    expect(__TEST_ONLY__.getConsumedMapFocusRequestCount()).toBe(256);
    expect(__TEST_ONLY__.claimMapFocusRequest('bounded-focus-299')).toBe(false);
    expect(__TEST_ONLY__.claimMapFocusRequest('bounded-focus-0')).toBe(true);
    expect(__TEST_ONLY__.getConsumedMapFocusRequestCount()).toBe(256);
  });

  test('consumes a selected stop once even if stop data refreshes before params clear', async () => {
    const props = buildProps({
      route: {
        params: {
          selectedStopId: 'stop-1',
          selectedStopFocusRequestId: 'focus-refresh-1',
        },
      },
      stops: [{ id: 'stop-1', latitude: 44.39, longitude: -79.69 }],
    });
    let renderer;

    await act(async () => {
      renderer = create(<Harness {...props} />);
    });
    await act(async () => {
      renderer.update(<Harness {...props} stops={[...props.stops]} />);
    });

    expect(props.setSelectedStop).toHaveBeenCalledTimes(1);
    expect(props.mapRef.current.animateToRegion).not.toHaveBeenCalled();
    expect(props.navigation.setParams).toHaveBeenCalledWith({
      selectedStopId: undefined,
      selectedStopFocusRequestId: undefined,
    });
  });

  test('does not reclaim the camera when the same focus request resurfaces after remount', async () => {
    const props = buildProps({
      route: {
        params: {
          selectedStopId: 'stop-remount',
          selectedStopFocusRequestId: 'focus-remount-1',
        },
      },
      stops: [{ id: 'stop-remount', latitude: 44.39, longitude: -79.69 }],
    });
    let renderer;

    await act(async () => {
      renderer = create(<Harness {...props} />);
    });
    await act(async () => {
      renderer.unmount();
      renderer = create(<Harness {...props} />);
    });

    expect(props.setSelectedStop).toHaveBeenCalledTimes(1);
    expect(props.mapRef.current.animateToRegion).not.toHaveBeenCalled();
  });

  test('allows the same stop to be deliberately selected again with a new request', async () => {
    const props = buildProps({
      route: {
        params: {
          selectedStopId: 'stop-repeat',
          selectedStopFocusRequestId: 'focus-repeat-1',
        },
      },
      stops: [{ id: 'stop-repeat', latitude: 44.39, longitude: -79.69 }],
    });
    let renderer;

    await act(async () => {
      renderer = create(<Harness {...props} />);
    });
    await act(async () => {
      renderer.update(<Harness
        {...props}
        route={{
          params: {
            selectedStopId: 'stop-repeat',
            selectedStopFocusRequestId: 'focus-repeat-2',
          },
        }}
      />);
    });

    expect(props.setSelectedStop).toHaveBeenCalledTimes(2);
    expect(props.mapRef.current.animateToRegion).not.toHaveBeenCalled();
  });

  test('consumes a selected address once across repeated renders', async () => {
    const props = buildProps({
      route: {
        params: {
          selectedCoordinate: { latitude: 44.39, longitude: -79.69 },
          selectedAddressLabel: 'Downtown',
          selectedAddressFocusRequestId: 'address-focus-render-1',
        },
      },
    });
    let renderer;

    await act(async () => {
      renderer = create(<Harness {...props} />);
    });
    await act(async () => {
      renderer.update(<Harness {...props} />);
    });

    expect(props.mapRef.current.animateToRegion).not.toHaveBeenCalled();
    expect(props.showLocation).toHaveBeenCalledTimes(1);
  });

  test('does not reclaim the camera when an address request resurfaces after remount', async () => {
    const props = buildProps({
      route: {
        params: {
          selectedCoordinate: { latitude: 44.39, longitude: -79.69 },
          selectedAddressLabel: 'Downtown',
          selectedAddressFocusRequestId: 'address-focus-remount-1',
        },
      },
    });
    let renderer;

    await act(async () => {
      renderer = create(<Harness {...props} />);
    });
    await act(async () => {
      renderer.unmount();
      renderer = create(<Harness {...props} />);
    });

    expect(props.mapRef.current.animateToRegion).not.toHaveBeenCalled();
    expect(props.showLocation).toHaveBeenCalledTimes(1);
  });

  test('allows an address to be deliberately selected again with a new request', async () => {
    const props = buildProps({
      route: {
        params: {
          selectedCoordinate: { latitude: 44.39, longitude: -79.69 },
          selectedAddressLabel: 'Downtown',
          selectedAddressFocusRequestId: 'address-focus-repeat-1',
        },
      },
    });
    let renderer;

    await act(async () => {
      renderer = create(<Harness {...props} />);
    });
    await act(async () => {
      renderer.update(<Harness
        {...props}
        route={{
          params: {
            selectedCoordinate: { latitude: 44.39, longitude: -79.69 },
            selectedAddressLabel: 'Downtown',
            selectedAddressFocusRequestId: 'address-focus-repeat-2',
          },
        }}
      />);
    });

    expect(props.mapRef.current.animateToRegion).not.toHaveBeenCalled();
    expect(props.showLocation).toHaveBeenCalledTimes(2);
  });

  test('consumes a selected route once across repeated renders', async () => {
    const props = buildProps({
      route: { params: { selectedRouteId: '8A' } },
    });
    let renderer;

    await act(async () => {
      renderer = create(<Harness {...props} />);
    });
    await act(async () => {
      renderer.update(<Harness {...props} />);
    });

    expect(props.selectRoute).toHaveBeenCalledTimes(1);
    expect(props.navigation.setParams).toHaveBeenCalledWith({ selectedRouteId: undefined });
  });
});
