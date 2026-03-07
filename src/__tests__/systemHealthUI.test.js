import {
  getSystemHealthBannerState,
  getSystemHealthChipState,
} from '../utils/systemHealthUI';

describe('systemHealthUI', () => {
  test('shows backend retry guidance when proxy health fails', () => {
    const diagnostics = {
      overall: { status: 'degraded' },
      proxyApi: { status: 'error' },
      staticData: { usingCachedData: false, status: 'healthy' },
      realtimeVehicles: { status: 'healthy' },
    };

    expect(getSystemHealthChipState(diagnostics).label).toBe('PROXY');
    expect(getSystemHealthBannerState(diagnostics)).toEqual({
      tone: 'error',
      message: 'Trip backend is unavailable right now.',
      actionLabel: 'Retry backend',
      actionKey: 'proxy',
    });
  });

  test('shows cached-data recovery guidance when static feed falls back to cache', () => {
    const diagnostics = {
      overall: { status: 'degraded' },
      proxyApi: { status: 'healthy' },
      staticData: { usingCachedData: true, status: 'degraded' },
      realtimeVehicles: { status: 'healthy' },
    };

    expect(getSystemHealthChipState(diagnostics).label).toBe('CACHED');
    expect(getSystemHealthBannerState(diagnostics)).toEqual({
      tone: 'warning',
      message: 'Using cached transit data while fresh data reloads.',
      actionLabel: 'Refresh data',
      actionKey: 'static',
    });
  });

  test('returns no banner when all systems are healthy', () => {
    const diagnostics = {
      overall: { status: 'healthy' },
      proxyApi: { status: 'healthy' },
      staticData: { usingCachedData: false, status: 'healthy' },
      realtimeVehicles: { status: 'healthy' },
    };

    expect(getSystemHealthChipState(diagnostics).label).toBe('OK');
    expect(getSystemHealthBannerState(diagnostics)).toBeNull();
  });
});
