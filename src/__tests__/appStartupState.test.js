import { getAppStartupState } from '../utils/appStartupState';

describe('getAppStartupState', () => {
  const readyBase = {
    fontsLoaded: true,
    authLoading: false,
    isLoadingStatic: false,
    routesCount: 20,
    stopsCount: 800,
    isOffline: false,
    isRoutingReady: true,
    lastVehicleUpdate: new Date('2026-05-10T12:00:00Z'),
    hasLoadedServiceAlerts: true,
    hasLoadedDetourFeed: true,
    diagnostics: {
      routing: { status: 'healthy' },
      realtimeVehicles: { status: 'healthy' },
      proxyApi: { status: 'healthy' },
    },
  };

  test('holds startup while static transit data is still loading', () => {
    const state = getAppStartupState({
      ...readyBase,
      isLoadingStatic: true,
      routesCount: 0,
      stopsCount: 0,
    });

    expect(state.ready).toBe(false);
    expect(state.statusText).toBe('Loading routes, stops, and schedules...');
  });

  test('opens the map without waiting for trip planning', () => {
    const state = getAppStartupState({
      ...readyBase,
      isRoutingReady: false,
      diagnostics: {
        ...readyBase.diagnostics,
        routing: { status: 'loading' },
      },
    });

    expect(state.ready).toBe(true);
  });

  test('opens the map while auth, fonts, and live services finish in the background', () => {
    const state = getAppStartupState({
      ...readyBase,
      fontsLoaded: false,
      authLoading: true,
      lastVehicleUpdate: null,
      hasLoadedServiceAlerts: false,
      hasLoadedDetourFeed: false,
      diagnostics: {
        routing: { status: 'loading' },
        realtimeVehicles: { status: 'loading' },
        proxyApi: { status: 'loading' },
      },
    });

    expect(state.ready).toBe(true);
  });

  test('opens the app error state when static data cannot load', () => {
    const state = getAppStartupState({
      isLoadingStatic: false,
      staticError: new Error('network unavailable'),
      routesCount: 0,
      stopsCount: 0,
    });

    expect(state.ready).toBe(true);
  });

  test('does not hold startup for an artificial minimum loading time', () => {
    const state = getAppStartupState({
      ...readyBase,
      minimumStartupElapsed: false,
    });

    expect(state.ready).toBe(true);
  });
});
