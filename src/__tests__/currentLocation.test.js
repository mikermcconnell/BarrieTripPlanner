import { getForegroundDeviceLocation } from '../utils/currentLocation';

describe('getForegroundDeviceLocation', () => {
  test('returns the current device location when available', async () => {
    const LocationApi = {
      Accuracy: { Balanced: 'balanced' },
      requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
      getCurrentPositionAsync: jest.fn(async () => ({
        coords: { latitude: 44.3894, longitude: -79.6903 },
      })),
      getLastKnownPositionAsync: jest.fn(),
    };

    await expect(getForegroundDeviceLocation(LocationApi)).resolves.toEqual({
      lat: 44.3894,
      lon: -79.6903,
    });
    expect(LocationApi.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });

  test('falls back to last known location when current lookup fails', async () => {
    const LocationApi = {
      Accuracy: { Balanced: 'balanced' },
      requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
      getCurrentPositionAsync: jest.fn(async () => {
        throw new Error('timeout');
      }),
      getLastKnownPositionAsync: jest.fn(async () => ({
        coords: { latitude: 44.4, longitude: -79.68 },
      })),
    };

    await expect(getForegroundDeviceLocation(LocationApi)).resolves.toEqual({
      lat: 44.4,
      lon: -79.68,
    });
  });

  test('falls back to last known location when current lookup times out', async () => {
    jest.useFakeTimers();
    const LocationApi = {
      Accuracy: { Balanced: 'balanced' },
      requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
      getCurrentPositionAsync: jest.fn(() => new Promise(() => {})),
      getLastKnownPositionAsync: jest.fn(async () => ({
        coords: { latitude: 44.41, longitude: -79.67 },
      })),
    };

    const locationPromise = getForegroundDeviceLocation(LocationApi, { timeoutMs: 1000 });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(locationPromise).resolves.toEqual({
      lat: 44.41,
      lon: -79.67,
    });
    jest.useRealTimers();
  });

  test('does not hang forever when current and last-known lookups both stall', async () => {
    jest.useFakeTimers();
    const LocationApi = {
      Accuracy: { Balanced: 'balanced' },
      requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
      getCurrentPositionAsync: jest.fn(() => new Promise(() => {})),
      getLastKnownPositionAsync: jest.fn(() => new Promise(() => {})),
    };

    const locationPromise = getForegroundDeviceLocation(LocationApi, { timeoutMs: 1000 });
    const expectation = expect(locationPromise).rejects.toThrow('Location lookup timed out');
    await jest.advanceTimersByTimeAsync(2000);

    await expectation;
    jest.useRealTimers();
  });

  test('throws when permission is denied', async () => {
    const LocationApi = {
      Accuracy: { Balanced: 'balanced' },
      requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
      getCurrentPositionAsync: jest.fn(),
      getLastKnownPositionAsync: jest.fn(),
    };

    await expect(getForegroundDeviceLocation(LocationApi)).rejects.toThrow('Location permission required');
  });
});
