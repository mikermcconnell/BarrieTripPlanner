const { createDetourOps } = require('../services/detourOps');

describe('detourOps rollout health', () => {
  test('enqueues one delayed offset sample after a primary scheduled run', async () => {
    const runTick = jest.fn().mockResolvedValue({
      ok: true,
      skipped: false,
      vehiclesProcessed: 17,
      detourCount: 0,
      tickCount: 12,
      status: { mode: 'scheduled' },
    });
    const enqueueOffsetSample = jest.fn().mockResolvedValue({
      ok: true,
      scheduledFor: '2026-05-24T19:30:30.000Z',
      delaySeconds: 30,
    });
    const detourWorker = {
      getStatus: () => ({ mode: 'scheduled', running: false }),
      runTick,
    };

    const ops = createDetourOps({
      detourWorker,
      offsetSampleScheduler: { enqueueOffsetSample },
      env: {
        DETOUR_OFFSET_SAMPLING_ENABLED: 'true',
        DETOUR_OFFSET_SAMPLE_DELAY_SECONDS: '30',
      },
    });

    const result = await ops.runOnce({ triggerSource: 'scheduler-primary' });

    expect(result.status).toBe(200);
    expect(runTick).toHaveBeenCalledWith({
      source: 'api-run-once',
      forceReloadState: true,
    });
    expect(enqueueOffsetSample).toHaveBeenCalledWith(expect.objectContaining({
      delaySeconds: 30,
      source: 'offset-30s',
    }));
    expect(result.body.offsetSampling).toMatchObject({
      enabled: true,
      enqueued: true,
      delaySeconds: 30,
    });
  });

  test('does not enqueue another offset sample from the offset run itself', async () => {
    const runTick = jest.fn().mockResolvedValue({ ok: true, skipped: false, tickCount: 13 });
    const enqueueOffsetSample = jest.fn();
    const ops = createDetourOps({
      detourWorker: {
        getStatus: () => ({ mode: 'scheduled', running: false }),
        runTick,
      },
      offsetSampleScheduler: { enqueueOffsetSample },
      env: { DETOUR_OFFSET_SAMPLING_ENABLED: 'true' },
    });

    const result = await ops.runOnce({ triggerSource: 'offset-30s' });

    expect(result.status).toBe(200);
    expect(enqueueOffsetSample).not.toHaveBeenCalled();
    expect(result.body.offsetSampling).toBeUndefined();
  });

  test('uses a distributed lock to skip overlapping detour runs across instances', async () => {
    const runTick = jest.fn();
    const acquire = jest.fn().mockResolvedValue(null);
    const release = jest.fn();
    const ops = createDetourOps({
      detourWorker: {
        getStatus: () => ({ mode: 'scheduled', running: false }),
        runTick,
      },
      runLock: { acquire, release },
      env: { DETOUR_DISTRIBUTED_LOCK_ENABLED: 'true' },
    });

    const result = await ops.runOnce({ triggerSource: 'scheduler-primary' });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: false,
      skipped: true,
      reason: 'distributed-lock-busy',
    });
    expect(runTick).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
  test('runs multiple burst samples for scheduled detour run-once requests', async () => {
    const runTick = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        skipped: false,
        vehiclesProcessed: 10,
        detourCount: 0,
        tickCount: 1,
        status: { mode: 'scheduled' },
      })
      .mockResolvedValueOnce({
        ok: true,
        skipped: false,
        vehiclesProcessed: 11,
        detourCount: 1,
        tickCount: 2,
        status: { mode: 'scheduled' },
      })
      .mockResolvedValueOnce({
        ok: true,
        skipped: false,
        vehiclesProcessed: 11,
        detourCount: 1,
        tickCount: 3,
        status: { mode: 'scheduled' },
      });
    const sleep = jest.fn().mockResolvedValue(undefined);
    const detourWorker = {
      getStatus: () => ({ mode: 'scheduled', running: false }),
      runTick,
    };

    const ops = createDetourOps({
      detourWorker,
      sleep,
      env: {
        DETOUR_BURST_SAMPLING_ENABLED: 'true',
        DETOUR_BURST_MAX_SAMPLES: '3',
        DETOUR_BURST_SAMPLE_INTERVAL_MS: '15000',
        DETOUR_BURST_DURATION_MS: '45000',
      },
    });

    const result = await ops.runOnce();

    expect(result.status).toBe(200);
    expect(runTick).toHaveBeenCalledTimes(3);
    expect(runTick).toHaveBeenNthCalledWith(1, {
      source: 'api-run-once-burst',
      forceReloadState: true,
    });
    expect(runTick).toHaveBeenNthCalledWith(2, {
      source: 'api-run-once-burst',
      forceReloadState: false,
    });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(result.body).toMatchObject({
      ok: true,
      detourCount: 1,
      tickCount: 3,
      burstSampling: {
        enabled: true,
        sampleCount: 3,
        okSamples: 3,
        failedSamples: 0,
        skippedSamples: 0,
        sampleIntervalMs: 15000,
      },
    });
  });

  test('skips an overlapping detour run-once while a burst is already active', async () => {
    let releaseFirstTick;
    const runTick = jest.fn().mockImplementation(() =>
      new Promise((resolve) => {
        releaseFirstTick = () => resolve({
          ok: true,
          skipped: false,
          vehiclesProcessed: 10,
          detourCount: 0,
          tickCount: 1,
          status: { mode: 'scheduled' },
        });
      })
    );
    const detourWorker = {
      getStatus: () => ({ mode: 'scheduled', running: false }),
      runTick,
    };
    const ops = createDetourOps({
      detourWorker,
      sleep: jest.fn().mockResolvedValue(undefined),
      env: {
        DETOUR_BURST_SAMPLING_ENABLED: 'true',
        DETOUR_BURST_MAX_SAMPLES: '1',
      },
    });

    const firstRun = ops.runOnce();
    const secondRun = await ops.runOnce();
    releaseFirstTick();
    await firstRun;

    expect(secondRun.status).toBe(200);
    expect(secondRun.body).toMatchObject({
      ok: false,
      skipped: true,
      reason: 'run-once-in-progress',
    });
    expect(runTick).toHaveBeenCalledTimes(1);
  });

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

  test('blocks launch when the stored baseline diverges from live GTFS', async () => {
    const now = Date.parse('2026-05-05T12:00:00Z');
    const detourWorker = {
      getStatus: () => ({
        running: false,
        mode: 'scheduled',
        tickCount: 20,
        lastSuccessfulTick: new Date(now - 60 * 1000).toISOString(),
        consecutiveFailureCount: 0,
        activeDetours: {},
        baseline: { readyForDetours: true, source: 'firestore' },
        errors: { publishFailures: 0 },
      }),
    };

    const ops = createDetourOps({
      detourWorker,
      queryDetourHistory: jest.fn().mockResolvedValue([]),
      getBaselineStatusWithDivergence: jest.fn().mockResolvedValue({
        readyForDetours: true,
        divergence: {
          hasChanges: true,
          added: [{ routeId: '8A', shapes: ['new-shape'] }],
          removed: [],
        },
      }),
      now: () => now,
      env: {
        DETOUR_WORKER_ENABLED: 'true',
      },
    });

    const result = await ops.getRolloutHealth();

    expect(result.baselineDivergence.hasChanges).toBe(true);
    expect(result.launchReadiness.status).toBe('not_ready');
    expect(result.launchReadiness.failedCritical).toContain('baseline_matches_live_gtfs');
  });

  test('counts stale auto-clears as rollout warning evidence', async () => {
    const now = Date.parse('2026-05-05T12:00:00Z');
    const detourWorker = {
      getStatus: () => ({
        running: false,
        mode: 'scheduled',
        tickCount: 20,
        lastSuccessfulTick: new Date(now - 60 * 1000).toISOString(),
        consecutiveFailureCount: 0,
        activeDetours: {},
        baseline: { readyForDetours: true, source: 'firestore' },
        errors: { publishFailures: 0 },
      }),
    };

    const staleClear = {
      routeId: '2A',
      eventType: 'DETOUR_AUTO_CLEARED_STALE',
      durationMs: 12 * 60 * 1000,
      confidence: 'low',
    };

    const ops = createDetourOps({
      detourWorker,
      queryDetourHistory: jest
        .fn()
        .mockResolvedValueOnce([staleClear])
        .mockResolvedValueOnce([staleClear])
        .mockResolvedValueOnce([{ routeId: '2A', eventType: 'DETOUR_DETECTED' }]),
      getBaselineStatusWithDivergence: jest.fn().mockResolvedValue({
        readyForDetours: true,
        divergence: { hasChanges: false, added: [], removed: [] },
      }),
      now: () => now,
      env: {
        DETOUR_WORKER_ENABLED: 'true',
      },
    });

    const result = await ops.getRolloutHealth();

    expect(result.staleAutoClears.count).toBe(1);
    expect(result.suspiciousShortLivedDetours.count).toBe(1);
    expect(result.launchReadiness.status).toBe('pilot_ready_with_cautions');
    expect(result.launchReadiness.failedWarnings).toContain('no_recent_stale_auto_clears');
  });

  test('default status and debug loaders use the V2 detector when configured', () => {
    jest.resetModules();
    process.env.DETOUR_DETECTOR_VERSION = 'v2';

    jest.doMock('../detourDetector', () => ({
      getDetourEvidence: jest.fn(() => ({ v1: { pointCount: 1 } })),
      getRouteDebug: jest.fn(() => ({ candidateEvidence: { pointCount: 1 } })),
    }));
    jest.doMock('../detourV2/workerAdapter', () => ({
      getDetourEvidence: jest.fn(() => ({ '8A': { pointCount: 2, uniqueVehicles: 2 } })),
      getRouteDebug: jest.fn(() => ({
        candidateEvidence: { pointCount: 2, uniqueSignatureCount: 2 },
        projectionDiagnostics: [{ vehicleId: 'bus-1', classification: 'off-route' }],
      })),
    }));

    const { createDetourOps: createIsolatedDetourOps } = require('../services/detourOps');
    const ops = createIsolatedDetourOps({
      detourWorker: {
        getStatus: () => ({
          running: false,
          detourVersion: 'v2',
          storage: { activeCollection: 'activeDetoursV2' },
        }),
      },
      env: { DETOUR_DETECTOR_VERSION: 'v2' },
    });

    expect(ops.getStatus()).toEqual(expect.objectContaining({
      detourVersion: 'v2',
      storage: { activeCollection: 'activeDetoursV2' },
      evidenceSummary: { '8A': { pointCount: 2, uniqueVehicles: 2 } },
    }));
    expect(ops.getDebug('8A')).toEqual(expect.objectContaining({
      detourVersion: 'v2',
      storage: { activeCollection: 'activeDetoursV2' },
      routeId: '8A',
      evidence: expect.objectContaining({
        candidateEvidence: { pointCount: 2, uniqueSignatureCount: 2 },
        projectionDiagnostics: [{ vehicleId: 'bus-1', classification: 'off-route' }],
      }),
    }));
  });

  test('rollout health reports and queries V2 storage when configured', async () => {
    const now = Date.parse('2026-05-31T12:00:00Z');
    const queryDetourHistory = jest.fn().mockResolvedValue([]);
    const ops = createDetourOps({
      detourWorker: {
        getStatus: () => ({
          running: false,
          mode: 'scheduled',
          detourVersion: 'v2',
          storage: {
            activeCollection: 'activeDetoursV2',
            historyCollection: 'detourHistoryV2',
          },
          tickCount: 3,
          lastSuccessfulTick: new Date(now - 60 * 1000).toISOString(),
          consecutiveFailureCount: 0,
          activeDetours: {},
          baseline: { readyForDetours: true },
          errors: { publishFailures: 0 },
        }),
      },
      queryDetourHistory,
      getBaselineStatusWithDivergence: jest.fn().mockResolvedValue({
        divergence: { hasChanges: false },
      }),
      now: () => now,
      env: {
        DETOUR_DETECTOR_VERSION: 'v2',
        DETOUR_WORKER_ENABLED: 'true',
      },
    });

    const result = await ops.getRolloutHealth();

    expect(result).toEqual(expect.objectContaining({
      detourVersion: 'v2',
      storage: expect.objectContaining({
        activeCollection: 'activeDetoursV2',
        historyCollection: 'detourHistoryV2',
      }),
    }));
    expect(queryDetourHistory).toHaveBeenCalledWith(expect.objectContaining({
      storageConfig: expect.objectContaining({
        detourVersion: 'v2',
        historyCollection: 'detourHistoryV2',
      }),
    }));
  });
});

