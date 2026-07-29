import React from 'react';
import { act, create } from 'react-test-renderer';
import { useMapNavigation } from '../hooks/useMapNavigation';

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

describe('useMapNavigation one-shot camera actions', () => {
  test('consumes a selected stop once even if stop data refreshes before params clear', async () => {
    const props = buildProps({
      route: { params: { selectedStopId: 'stop-1' } },
      stops: [{ id: 'stop-1', latitude: 44.39, longitude: -79.69 }],
    });
    let renderer;

    await act(async () => {
      renderer = create(<Harness {...props} />);
    });
    await act(async () => {
      renderer.update(<Harness {...props} stops={[...props.stops]} />);
    });

    expect(props.mapRef.current.animateToRegion).toHaveBeenCalledTimes(1);
    expect(props.navigation.setParams).toHaveBeenCalledWith({ selectedStopId: undefined });
  });

  test('consumes a selected address once across repeated renders', async () => {
    const props = buildProps({
      route: {
        params: {
          selectedCoordinate: { latitude: 44.39, longitude: -79.69 },
          selectedAddressLabel: 'Downtown',
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

    expect(props.mapRef.current.animateToRegion).toHaveBeenCalledTimes(1);
    expect(props.showLocation).toHaveBeenCalledTimes(1);
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
