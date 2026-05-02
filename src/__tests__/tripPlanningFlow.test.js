import {
  selectStopTripDestination,
  startTripToDestination,
} from '../utils/tripPlanningFlow';

describe('tripPlanningFlow', () => {
  test('starts destination trip flow without using current location automatically', () => {
    const enterPlanningMode = jest.fn();
    const setTripFrom = jest.fn();
    const setTripTo = jest.fn();
    const useCurrentLocationForTrip = jest.fn();
    const beforeEnter = jest.fn();
    const destination = { lat: 44.3894, lon: -79.6903 };

    startTripToDestination({
      destination,
      label: 'Downtown Hub',
      beforeEnter,
      enterPlanningMode,
      setTripFrom,
      setTripTo,
      useCurrentLocationForTrip,
    });

    expect(beforeEnter).toHaveBeenCalledTimes(1);
    expect(enterPlanningMode).toHaveBeenCalledTimes(1);
    expect(setTripFrom).not.toHaveBeenCalled();
    expect(setTripTo).toHaveBeenCalledWith(destination, 'Downtown Hub');
    expect(useCurrentLocationForTrip).not.toHaveBeenCalled();
  });

  test('falls back to normal destination selection when current location is unavailable', () => {
    const enterPlanningMode = jest.fn();
    const setTripFrom = jest.fn();
    const setTripTo = jest.fn();
    const destination = { lat: 44.3894, lon: -79.6903 };

    startTripToDestination({
      destination,
      label: 'Downtown Hub',
      enterPlanningMode,
      setTripFrom,
      setTripTo,
    });

    expect(enterPlanningMode).toHaveBeenCalledTimes(1);
    expect(setTripFrom).not.toHaveBeenCalled();
    expect(setTripTo).toHaveBeenCalledWith(destination, 'Downtown Hub');
  });

  test('does nothing when destination is missing', () => {
    const enterPlanningMode = jest.fn();
    const setTripTo = jest.fn();
    const useCurrentLocationForTrip = jest.fn();

    startTripToDestination({
      destination: null,
      enterPlanningMode,
      setTripTo,
      useCurrentLocationForTrip,
    });

    expect(enterPlanningMode).not.toHaveBeenCalled();
    expect(setTripTo).not.toHaveBeenCalled();
    expect(useCurrentLocationForTrip).not.toHaveBeenCalled();
  });

  test('fills stop destination directly when an origin stop already exists', () => {
    const setSelectedStop = jest.fn();
    const enterPlanningMode = jest.fn();
    const setTripFrom = jest.fn();
    const setTripTo = jest.fn();
    const useCurrentLocationForTrip = jest.fn();
    const origin = { lat: 44.38, lon: -79.69 };

    selectStopTripDestination({
      stopInfo: { lat: 44.401, lon: -79.681, name: 'Downtown Terminal' },
      tripFromLocation: origin,
      setSelectedStop,
      enterPlanningMode,
      setTripFrom,
      setTripTo,
      useCurrentLocationForTrip,
    });

    expect(setSelectedStop).toHaveBeenCalledWith(null);
    expect(enterPlanningMode).toHaveBeenCalledTimes(1);
    expect(setTripTo).toHaveBeenCalledWith(
      { lat: 44.401, lon: -79.681 },
      'Downtown Terminal'
    );
    expect(setTripFrom).not.toHaveBeenCalled();
    expect(useCurrentLocationForTrip).not.toHaveBeenCalled();
  });

  test('fills stop destination directly when already in trip planning mode', () => {
    const setTripTo = jest.fn();

    selectStopTripDestination({
      stopInfo: { lat: 44.401, lon: -79.681 },
      isTripPlanningMode: true,
      setSelectedStop: jest.fn(),
      enterPlanningMode: jest.fn(),
      setTripTo,
    });

    expect(setTripTo).toHaveBeenCalledWith(
      { lat: 44.401, lon: -79.681 },
      'Selected stop'
    );
  });

  test('fills stop destination without using current location when choosing a stop destination without an origin', () => {
    const setSelectedStop = jest.fn();
    const enterPlanningMode = jest.fn();
    const setTripFrom = jest.fn();
    const setTripTo = jest.fn();
    const useCurrentLocationForTrip = jest.fn();

    selectStopTripDestination({
      stopInfo: { lat: 44.401, lon: -79.681, name: 'Downtown Terminal' },
      setSelectedStop,
      enterPlanningMode,
      setTripFrom,
      setTripTo,
      useCurrentLocationForTrip,
    });

    expect(setSelectedStop).toHaveBeenCalledWith(null);
    expect(enterPlanningMode).toHaveBeenCalledTimes(1);
    expect(setTripFrom).not.toHaveBeenCalled();
    expect(setTripTo).toHaveBeenCalledWith(
      { lat: 44.401, lon: -79.681 },
      'Downtown Terminal'
    );
    expect(useCurrentLocationForTrip).not.toHaveBeenCalled();
  });
});
