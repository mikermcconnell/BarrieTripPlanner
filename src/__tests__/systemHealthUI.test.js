import {
  getTransitLoadingState,
  getSystemHealthBannerState,
  getSystemHealthChipState,
} from '../utils/systemHealthUI';

describe('systemHealthUI', () => {
  test('shows backend retry guidance when proxy health fails', () => {
    const diagnostics = {
      overall: { status: 'degraded' },
      proxyApi: { status: 'error' },
      staticData: { usingCachedData: false, status: 'healthy', isAvailable: true },
      realtimeVehicles: { status: 'healthy' },
    };

    expect(getSystemHealthChipState(diagnostics).label).toBe('TRIPS');
    expect(getSystemHealthBannerState(diagnostics)).toEqual({
      tone: 'error',
      title: 'Trip planning is unavailable right now.',
      detail: 'Routes and stops are still available, but new trip searches may fail.',
      actionLabel: 'Try again',
      actionKey: 'proxy',
    });
  });

  test('shows updating guidance while opening with saved data', () => {
    const diagnostics = {
      overall: { status: 'degraded' },
      proxyApi: { status: 'healthy' },
      staticData: {
        usingCachedData: true,
        isRefreshing: true,
        isAvailable: true,
        status: 'degraded',
      },
      realtimeVehicles: { status: 'healthy' },
    };

    expect(getTransitLoadingState(diagnostics)).toEqual({
      title: 'Opening with saved transit info',
      detail: 'Checking for updates in the background.',
    });
    expect(getSystemHealthChipState(diagnostics).label).toBe('UPDATING');
    expect(getSystemHealthBannerState(diagnostics)).toEqual({
      tone: 'neutral',
      title: 'Opening with saved transit info',
      detail: 'Checking for updates in the background.',
      actionLabel: null,
      actionKey: null,
    });
  });

  test('shows saved-data fallback guidance after refresh failure', () => {
    const diagnostics = {
      overall: { status: 'degraded' },
      proxyApi: { status: 'healthy' },
      staticData: {
        usingCachedData: true,
        isRefreshing: false,
        isAvailable: true,
        status: 'degraded',
      },
      realtimeVehicles: { status: 'healthy' },
    };

    expect(getSystemHealthChipState(diagnostics).label).toBe('SAVED');
    expect(getSystemHealthBannerState(diagnostics)).toEqual({
      tone: 'warning',
      title: 'Showing saved transit info',
      detail: "Couldn't update just now, but the map is ready to use.",
      actionLabel: 'Refresh now',
      actionKey: 'static',
    });
  });

  test('returns no banner when all systems are healthy', () => {
    const diagnostics = {
      overall: { status: 'healthy' },
      proxyApi: { status: 'healthy' },
      staticData: { usingCachedData: false, status: 'healthy', isAvailable: true },
      realtimeVehicles: { status: 'healthy' },
    };

    expect(getSystemHealthChipState(diagnostics).label).toBe('READY');
    expect(getSystemHealthBannerState(diagnostics)).toBeNull();
  });
});
