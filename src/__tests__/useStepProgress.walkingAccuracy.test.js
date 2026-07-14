global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act, create } = require('react-test-renderer');
const { useStepProgress } = require('../hooks/useStepProgress');

const itinerary = {
  legs: [{
    mode: 'WALK',
    from: { lat: 44.38, lon: -79.69 },
    to: { lat: 44.39, lon: -79.68, name: 'Destination' },
    steps: [{ instruction: 'Walk to destination' }],
  }],
};

describe('walking navigation arrival evidence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not finish on an inaccurate fix and requires two accurate samples', () => {
    let hookApi;
    let location = {
      latitude: 44.39,
      longitude: -79.68,
      accuracy: 100,
      timestamp: 1000,
    };

    const Harness = () => {
      hookApi = useStepProgress(itinerary, location, null);
      return null;
    };

    let instance;
    act(() => {
      instance = create(React.createElement(Harness));
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(hookApi.isNavigationComplete).toBe(false);

    location = { ...location, accuracy: 12, timestamp: 2000 };
    act(() => instance.update(React.createElement(Harness)));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(hookApi.isNavigationComplete).toBe(false);

    location = { ...location, timestamp: 5000 };
    act(() => instance.update(React.createElement(Harness)));
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    expect(hookApi.isNavigationComplete).toBe(true);

    act(() => instance.unmount());
  });

  test('requires fresh location evidence after advancing to another walking leg', () => {
    let hookApi;
    let location = {
      latitude: 44.39,
      longitude: -79.68,
      accuracy: 10,
      timestamp: 1000,
    };
    const twoWalkItinerary = {
      legs: [itinerary.legs[0], { ...itinerary.legs[0], from: itinerary.legs[0].to }],
    };

    const Harness = () => {
      hookApi = useStepProgress(twoWalkItinerary, location, null);
      return null;
    };

    let instance;
    act(() => {
      instance = create(React.createElement(Harness));
    });
    location = { ...location, timestamp: 2000 };
    act(() => instance.update(React.createElement(Harness)));
    expect(hookApi.hasReliableWalkingArrival).toBe(true);

    act(() => hookApi.advanceLeg());
    expect(hookApi.currentLegIndex).toBe(1);
    expect(hookApi.hasReliableWalkingArrival).toBe(false);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(hookApi.isNavigationComplete).toBe(false);

    location = { ...location, timestamp: 3000 };
    act(() => instance.update(React.createElement(Harness)));
    location = { ...location, timestamp: 4000 };
    act(() => instance.update(React.createElement(Harness)));
    act(() => {
      jest.advanceTimersByTime(2100);
    });
    expect(hookApi.isNavigationComplete).toBe(true);

    act(() => instance.unmount());
  });
});
