import { getTransitStartupProgress } from '../utils/systemHealthUI';

describe('getTransitStartupProgress', () => {
  test('uses a first-launch full-screen progress state when no saved routes are available', () => {
    const progress = getTransitStartupProgress({
      isLoadingStatic: true,
      usingCachedData: false,
      isLoadingVehicles: false,
      routesCount: 0,
      stopsCount: 0,
      vehiclesCount: 0,
      diagnostics: {
        staticData: {
          status: 'loading',
          isAvailable: false,
        },
      },
    });

    expect(progress.variant).toBe('full');
    expect(progress.percent).toBe(35);
    expect(progress.title).toBe('Getting Barrie Transit ready');
    expect(progress.detail).toBe('Downloading routes and stops for the first time.');
  });

  test('stays quiet while saved routes refresh in the background', () => {
    const progress = getTransitStartupProgress({
      isLoadingStatic: false,
      isRefreshingStatic: true,
      usingCachedData: true,
      isLoadingVehicles: false,
      routesCount: 20,
      stopsCount: 800,
      vehiclesCount: 12,
      diagnostics: {
        staticData: {
          status: 'degraded',
          isAvailable: true,
          usingCachedData: true,
          isRefreshing: true,
        },
        realtimeVehicles: {
          status: 'healthy',
          isAvailable: true,
        },
      },
    });

    expect(progress).toBeNull();
  });

  test('does not show an in-app loading card while live buses refresh', () => {
    const progress = getTransitStartupProgress({
      isLoadingStatic: false,
      isRefreshingStatic: true,
      usingCachedData: true,
      isLoadingVehicles: true,
      routesCount: 20,
      stopsCount: 800,
      vehiclesCount: 0,
      diagnostics: {
        staticData: {
          status: 'degraded',
          isAvailable: true,
          usingCachedData: true,
          isRefreshing: true,
        },
        realtimeVehicles: {
          status: 'loading',
          isAvailable: false,
        },
      },
    });

    expect(progress).toBeNull();
  });

  test('returns no progress state after the live map is ready', () => {
    const progress = getTransitStartupProgress({
      isLoadingStatic: false,
      usingCachedData: false,
      isLoadingVehicles: false,
      routesCount: 20,
      stopsCount: 800,
      vehiclesCount: 12,
      diagnostics: {
        staticData: {
          status: 'healthy',
          isAvailable: true,
        },
        realtimeVehicles: {
          status: 'healthy',
          isAvailable: true,
        },
      },
    });

    expect(progress).toBeNull();
  });
});
