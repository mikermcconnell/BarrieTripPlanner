const React = require('react');
const { act, create } = require('react-test-renderer');

jest.mock('expo-location', () => ({
  Accuracy: { High: 'high' },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const Location = require('expo-location');
const { useNavigationLocation } = require('../hooks/useNavigationLocation');

const renderNavigationLocationHook = () => {
  let hookApi;
  const Harness = () => {
    hookApi = useNavigationLocation();
    return null;
  };

  let instance;
  act(() => {
    instance = create(React.createElement(Harness));
  });

  return {
    get api() {
      return hookApi;
    },
    instance,
  };
};

describe('useNavigationLocation native tracking lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not start GPS tracking when foreground permission is denied', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const hook = renderNavigationLocationHook();

    let started;
    await act(async () => {
      started = await hook.api.startTracking();
    });

    expect(started).toBe(false);
    expect(hook.api.error).toBe('Location permission is required for navigation');
    expect(hook.api.isTracking).toBe(false);
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();

    act(() => hook.instance.unmount());
  });

  test('publishes the initial fix, streams updates, and stops the native subscription', async () => {
    const subscription = { remove: jest.fn() };
    let locationListener;
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 44.389,
        longitude: -79.69,
        heading: 90,
        accuracy: 8,
        speed: null,
      },
      timestamp: 1000,
    });
    Location.watchPositionAsync.mockImplementation(async (config, listener) => {
      locationListener = listener;
      return subscription;
    });
    const hook = renderNavigationLocationHook();

    let started;
    await act(async () => {
      started = await hook.api.startTracking();
    });

    expect(started).toBe(true);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 'high' });
    expect(Location.watchPositionAsync).toHaveBeenCalledWith(
      {
        accuracy: 'high',
        distanceInterval: 10,
        timeInterval: 3000,
      },
      expect.any(Function)
    );
    expect(hook.api.location).toEqual(expect.objectContaining({
      latitude: 44.389,
      longitude: -79.69,
      accuracy: 8,
      timestamp: 1000,
    }));
    expect(hook.api.isTracking).toBe(true);

    act(() => {
      locationListener({
        coords: {
          latitude: 44.3891,
          longitude: -79.69,
          heading: 95,
          accuracy: 7,
          speed: null,
        },
        timestamp: 11000,
      });
    });
    expect(hook.api.location).toEqual(expect.objectContaining({
      latitude: 44.3891,
      longitude: -79.69,
      speed: expect.any(Number),
      timestamp: 11000,
    }));

    act(() => hook.api.stopTracking());
    expect(subscription.remove).toHaveBeenCalledTimes(1);
    expect(hook.api.isTracking).toBe(false);

    act(() => hook.instance.unmount());
    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });

  test('removes an active location subscription when the hook unmounts', async () => {
    const subscription = { remove: jest.fn() };
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 44.389,
        longitude: -79.69,
        heading: 0,
        accuracy: 10,
        speed: 0,
      },
      timestamp: 1000,
    });
    Location.watchPositionAsync.mockResolvedValue(subscription);
    const hook = renderNavigationLocationHook();

    await act(async () => {
      await hook.api.startTracking();
    });
    act(() => hook.instance.unmount());

    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });

  test('returns a rider-facing error when the initial GPS lookup fails', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockRejectedValue(new Error('Network request timed out'));
    const hook = renderNavigationLocationHook();

    let started;
    await act(async () => {
      started = await hook.api.startTracking();
    });

    expect(started).toBe(false);
    expect(hook.api.error).toBe('Check your connection, then try again.');
    expect(hook.api.isTracking).toBe(false);
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();

    act(() => hook.instance.unmount());
  });
});
