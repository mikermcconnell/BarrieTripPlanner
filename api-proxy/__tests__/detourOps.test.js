const { createDetourOps } = require('../services/detourOps');

describe('detourOps rollout health', () => {
  test('marks rollout pilot-ready when core health checks pass', async () => {
    const now = Date.parse('2026-04-24T12:00:00Z');
    const detourWorker = {
      getStatus: () => ({
        running: false,
        mode: 'scheduled',
        tickCount: 20,
        lastSuccessfulTick: new Date(now - 60 * 1000).toISOString(),
        consecutiveFailureCount: 0,
        activeDetours: {},
        baseline: { readyForDetours: true, source: 'manual-live' },
        errors: { publishFailures: 0 },
      }),
    };

    const ops = createDetourOps({
      detourWorker,
      queryDetourHistory: jest.fn().mockResolvedValue([]),
      now: () => now,
      env: {
        DETOUR_WORKER_ENABLED: 'true',
        EXPO_PUBLIC_ENABLE_AUTO_DETOURS: 'true',
      },
    });

    const result = await ops.getRolloutHealth();

    expect(result.launchReadiness.status).toBe('pilot_ready');
    expect(result.falsePositiveCandidates.count).toBe(0);
    expect(result.falsePositiveRate.rate).toBeNull();
    expect(result.featureFlags.autoDetoursEnabled).toBe(true);
  });

  test('flags stale ticks, failures, flapping, and false-positive rate', async () => {
    const now = Date.parse('2026-04-24T12:00:00Z');
    const detourWorker = {
      getStatus: () => ({
        running: false,
        mode: 'manual',
        tickCount: 10,
        lastSuccessfulTick: new Date(now - 20 * 60 * 1000).toISOString(),
        consecutiveFailureCount: 3,
        activeDetours: {},
        baseline: { readyForDetours: false, reason: 'using_live_gtfs_fallback' },
        errors: { publishFailures: 2 },
      }),
    };

    const history = [
      { routeId: '8A', eventType: 'DETOUR_CLEARED', durationMs: 2 * 60 * 1000, confidence: 'low' },
      { routeId: '8A', eventType: 'DETOUR_CLEARED', durationMs: 8 * 60 * 1000, confidence: 'medium' },
    ];

    const ops = createDetourOps({
      detourWorker,
      queryDetourHistory: jest
        .fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValueOnce(history)
        .mockResolvedValueOnce([
          { routeId: '8A', eventType: 'DETOUR_DETECTED' },
          { routeId: '8A', eventType: 'DETOUR_DETECTED' },
        ]),
      now: () => now,
      env: {
        DETOUR_WORKER_ENABLED: 'true',
        DETOUR_ROLLOUT_STALE_TICK_MS: String(5 * 60 * 1000),
      },
    });

    const result = await ops.getRolloutHealth();

    expect(result.launchReadiness.status).toBe('not_ready');
    expect(result.launchReadiness.failedCritical).toEqual(expect.arrayContaining([
      'recent_successful_tick',
      'trusted_baseline_loaded',
      'consecutive_failures',
      'publish_failure_rate',
    ]));
    expect(result.launchReadiness.failedWarnings).toEqual(expect.arrayContaining([
      'scheduled_or_interval_mode',
      'no_flapping_routes',
      'false_positive_rate_under_target',
    ]));
    expect(result.flapping.flappingRoutes).toEqual([{ routeId: '8A', clearCount: 2 }]);
    expect(result.falsePositiveCandidates.count).toBe(1);
    expect(result.suspiciousShortLivedDetours).toMatchObject({
      count: 2,
      maxDurationMs: 15 * 60 * 1000,
      byConfidence: {
        low: 1,
        medium: 1,
      },
    });
    expect(result.falsePositiveRate).toMatchObject({
      rate: 0.5,
      falsePositiveCount: 1,
      detectedCount: 2,
    });
  });

  test('allows launch when short-lived detections stay below the false-positive target', async () => {
    const now = Date.parse('2026-04-24T12:00:00Z');
    const detourWorker = {
      getStatus: () => ({
        running: false,
        mode: 'scheduled',
        tickCount: 20,
        lastSuccessfulTick: new Date(now - 60 * 1000).toISOString(),
        consecutiveFailureCount: 0,
        activeDetours: {},
        baseline: { readyForDetours: true, source: 'manual-live' },
        errors: { publishFailures: 0 },
      }),
    };

    const detectedEvents = Array.from({ length: 20 }, (_, index) => ({
      routeId: `route-${index}`,
      eventType: 'DETOUR_DETECTED',
    }));

    const ops = createDetourOps({
      detourWorker,
      queryDetourHistory: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { routeId: '8A', eventType: 'DETOUR_CLEARED', durationMs: 2 * 60 * 1000 },
        ])
        .mockResolvedValueOnce(detectedEvents),
      now: () => now,
      env: {
        DETOUR_WORKER_ENABLED: 'true',
      },
    });

    const result = await ops.getRolloutHealth();

    expect(result.falsePositiveRate.rate).toBe(0.05);
    expect(result.launchReadiness.failedWarnings).not.toContain('false_positive_rate_under_target');
    expect(result.launchReadiness.status).toBe('pilot_ready');
  });
});
