import {
  DIAGNOSTIC_STATUS,
  TRANSIT_DIAGNOSTIC_STALE_AFTER_MS,
  buildTransitDiagnostics,
} from '../utils/transitDiagnostics';

describe('buildTransitDiagnostics', () => {
  test('marks cached static data and stale vehicles as degraded', () => {
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);

    const diagnostics = buildTransitDiagnostics({
      isOffline: false,
      now,
      staticData: {
        isAvailable: true,
        usingCachedData: true,
        lastSuccessAt: now - 5 * 60 * 1000,
      },
      realtimeVehicles: {
        isAvailable: true,
        lastSuccessAt: now - TRANSIT_DIAGNOSTIC_STALE_AFTER_MS.realtimeVehicles - 1000,
      },
      routing: {
        isReady: true,
        lastSuccessAt: now - 60 * 1000,
      },
      counts: {
        routes: 32,
        stops: 1100,
        vehicles: 14,
        alerts: 2,
      },
    });

    expect(diagnostics.staticData.status).toBe(DIAGNOSTIC_STATUS.DEGRADED);
    expect(diagnostics.staticData.reason).toBe('using_cached_data');
    expect(diagnostics.realtimeVehicles.status).toBe(DIAGNOSTIC_STATUS.DEGRADED);
    expect(diagnostics.realtimeVehicles.reason).toBe('stale_data');
    expect(diagnostics.routing.status).toBe(DIAGNOSTIC_STATUS.HEALTHY);
    expect(diagnostics.overall.status).toBe(DIAGNOSTIC_STATUS.DEGRADED);
  });

  test('marks startup failure without static data as error', () => {
    const diagnostics = buildTransitDiagnostics({
      isOffline: false,
      now: Date.UTC(2026, 2, 7, 12, 0, 0),
      staticData: {
        isLoading: false,
        isAvailable: false,
        error: 'Failed to load transit data',
        lastFailureAt: Date.UTC(2026, 2, 7, 11, 59, 0),
      },
      realtimeVehicles: {},
      routing: {},
    });

    expect(diagnostics.staticData.status).toBe(DIAGNOSTIC_STATUS.ERROR);
    expect(diagnostics.overall.status).toBe(DIAGNOSTIC_STATUS.ERROR);
    expect(diagnostics.overall.reason).toBe('static_data_unavailable');
  });

  test('treats routing as idle until requested and healthy after build', () => {
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);

    const idleDiagnostics = buildTransitDiagnostics({
      isOffline: false,
      now,
      staticData: {
        isAvailable: true,
        lastSuccessAt: now - 10 * 60 * 1000,
      },
      realtimeVehicles: {
        isAvailable: true,
        lastSuccessAt: now - 15 * 1000,
      },
      routing: {},
    });

    const readyDiagnostics = buildTransitDiagnostics({
      isOffline: false,
      now,
      staticData: {
        isAvailable: true,
        lastSuccessAt: now - 10 * 60 * 1000,
      },
      realtimeVehicles: {
        isAvailable: true,
        lastSuccessAt: now - 15 * 1000,
      },
      routing: {
        isReady: true,
        lastSuccessAt: now - 30 * 1000,
      },
    });

    expect(idleDiagnostics.routing.status).toBe(DIAGNOSTIC_STATUS.IDLE);
    expect(idleDiagnostics.routing.reason).toBe('not_requested');
    expect(readyDiagnostics.routing.status).toBe(DIAGNOSTIC_STATUS.HEALTHY);
    expect(readyDiagnostics.overall.status).toBe(DIAGNOSTIC_STATUS.HEALTHY);
  });

  test('degrades overall health when proxy API is unavailable', () => {
    const now = Date.UTC(2026, 2, 7, 12, 0, 0);

    const diagnostics = buildTransitDiagnostics({
      isOffline: false,
      now,
      staticData: {
        isAvailable: true,
        lastSuccessAt: now - 10 * 60 * 1000,
      },
      realtimeVehicles: {
        isAvailable: true,
        lastSuccessAt: now - 10 * 1000,
      },
      routing: {
        isReady: true,
        lastSuccessAt: now - 30 * 1000,
      },
      proxyApi: {
        isAvailable: false,
        lastFailureAt: now - 5 * 1000,
        error: 'API proxy health check failed (503)',
      },
    });

    expect(diagnostics.proxyApi.status).toBe(DIAGNOSTIC_STATUS.ERROR);
    expect(diagnostics.overall.status).toBe(DIAGNOSTIC_STATUS.DEGRADED);
    expect(diagnostics.overall.reason).toBe('partial_backend_availability');
  });
});
