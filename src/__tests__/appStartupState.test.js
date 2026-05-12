import { getAppStartupState } from '../utils/appStartupState';

describe('getAppStartupState', () => {
  const readyBase = {
    fontsLoaded: true,
    minimumStartupElapsed: true,
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

  test('preloads trip planning before releasing the app', () => {
    const state = getAppStartupState({
      ...readyBase,
      isRoutingReady: false,
      diagnostics: {
        ...readyBase.diagnostics,
        routing: { status: 'loading' },
      },
    });

    expect(state.ready).toBe(false);
    expect(state.statusText).toBe('Preparing trip planning...');
  });

  test('waits for initial live buses, alerts, detours, and proxy health', () => {
    expect(getAppStartupState({
      ...readyBase,
      lastVehicleUpdate: null,
      diagnostics: {
        ...readyBase.diagnostics,
        realtimeVehicles: { status: 'loading' },
      },
    }).statusText).toBe('Loading live bus locations...');

    expect(getAppStartupState({
      ...readyBase,
      hasLoadedServiceAlerts: false,
    }).statusText).toBe('Checking service alerts...');

    expect(getAppStartupState({
      ...readyBase,
      hasLoadedDetourFeed: false,
    }).statusText).toBe('Checking detour updates...');

    expect(getAppStartupState({
      ...readyBase,
      diagnostics: {
        ...readyBase.diagnostics,
        proxyApi: { status: 'loading' },
      },
    }).statusText).toBe('Checking trip planning connection...');
  });

  test('releases with static data after the optional startup wait expires', () => {
    const state = getAppStartupState({
      ...readyBase,
      isRoutingReady: false,
      lastVehicleUpdate: null,
      hasLoadedServiceAlerts: false,
      hasLoadedDetourFeed: false,
      optionalWaitElapsed: true,
      diagnostics: {
        routing: { status: 'loading' },
        realtimeVehicles: { status: 'loading' },
        proxyApi: { status: 'loading' },
      },
    });

    expect(state.ready).toBe(true);
  });
});
