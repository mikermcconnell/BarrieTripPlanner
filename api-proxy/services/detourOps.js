const { getDetourHistory, HISTORY_MAX_LIMIT } = require('../detourPublisher');
const { getDb } = require('../firebaseAdmin');
const { createDetourRunLock } = require('./detourRunLock');
const { createOffsetSampleScheduler } = require('./detourOffsetTasks');
const { buildDetourStorageConfig } = require('../detour/storageConfig');
const { getDetectorForStorageConfig } = require('../detour/detectorSelector');

const DEFAULT_ROLLOUT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FALSE_POSITIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_STALE_TICK_MS = 5 * 60 * 1000;
const FALSE_POSITIVE_DURATION_MS = 5 * 60 * 1000;
const SUSPICIOUS_SHORT_LIVED_DURATION_MS = 15 * 60 * 1000;
const MAX_FALSE_POSITIVE_RATE = 0.10;
const MAX_PUBLISH_FAILURE_RATE = 0.05;
const MAX_CONSECUTIVE_FAILURES = 2;
const DEFAULT_BURST_DURATION_MS = 50 * 1000;
const DEFAULT_BURST_SAMPLE_INTERVAL_MS = 15 * 1000;
const DEFAULT_BURST_MAX_SAMPLES = 4;
const MAX_BURST_SAMPLES = 10;
const DEFAULT_OFFSET_SAMPLE_DELAY_SECONDS = 30;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampPositiveInt(value, fallback, max) {
  return Math.min(parsePositiveInt(value, fallback), max);
}

function parseBurstSamplingConfig(env, status) {
  const mode = String(status?.mode || env.DETOUR_WORKER_MODE || '').trim().toLowerCase();
  const enabled = env.DETOUR_BURST_SAMPLING_ENABLED === 'true' && mode === 'scheduled';

  return {
    enabled,
    durationMs: parsePositiveInt(env.DETOUR_BURST_DURATION_MS, DEFAULT_BURST_DURATION_MS),
    sampleIntervalMs: parsePositiveInt(
      env.DETOUR_BURST_SAMPLE_INTERVAL_MS,
      DEFAULT_BURST_SAMPLE_INTERVAL_MS
    ),
    maxSamples: clampPositiveInt(env.DETOUR_BURST_MAX_SAMPLES, DEFAULT_BURST_MAX_SAMPLES, MAX_BURST_SAMPLES),
  };
}

function parseOffsetSamplingConfig(env) {
  return {
    enabled: env.DETOUR_OFFSET_SAMPLING_ENABLED === 'true',
    delaySeconds: parsePositiveInt(
      env.DETOUR_OFFSET_SAMPLE_DELAY_SECONDS,
      DEFAULT_OFFSET_SAMPLE_DELAY_SECONDS
    ),
    source: 'offset-30s',
  };
}

function shouldEnqueueOffsetSample(triggerSource) {
  return triggerSource === 'scheduler-primary' || triggerSource === 'scheduler';
}

function createConfiguredRunLock(env) {
  if (env.DETOUR_DISTRIBUTED_LOCK_ENABLED !== 'true') return null;
  const db = getDb();
  return createDetourRunLock({ db });
}

function createConfiguredOffsetSampleScheduler(env) {
  if (env.DETOUR_OFFSET_SAMPLING_ENABLED !== 'true') return null;
  return createOffsetSampleScheduler({ env });
}

function summarizeBurstSample(result, index) {
  return {
    index,
    ok: result?.ok === true,
    skipped: result?.skipped === true,
    reason: result?.reason || null,
    error: result?.error || null,
    vehiclesProcessed: Number.isFinite(result?.vehiclesProcessed) ? result.vehiclesProcessed : null,
    vehiclesFetched: Number.isFinite(result?.vehiclesFetched) ? result.vehiclesFetched : null,
    duplicateVehicleSamplesSkipped: Number.isFinite(result?.duplicateVehicleSamplesSkipped)
      ? result.duplicateVehicleSamplesSkipped
      : null,
    detourCount: Number.isFinite(result?.detourCount) ? result.detourCount : null,
    tickCount: Number.isFinite(result?.tickCount) ? result.tickCount : null,
  };
}

function buildLaunchReadinessChecks({
  status,
  currentTime,
  publishFailureRate,
  flapping,
  falsePositiveRate,
  baselineDivergence,
  staleAutoClears,
  staleTickMs,
  env,
}) {
  const lastSuccessfulMs = status.lastSuccessfulTick ? Date.parse(status.lastSuccessfulTick) : NaN;
  const hasRecentTick =
    Number.isFinite(lastSuccessfulMs) &&
    currentTime - lastSuccessfulMs <= staleTickMs;
  const checks = [
    {
      id: 'worker_enabled',
      ok: env.DETOUR_WORKER_ENABLED === 'true',
      severity: 'critical',
      message: 'Detour worker feature flag is enabled',
    },
    {
      id: 'scheduled_or_interval_mode',
      ok: status.mode === 'scheduled' || status.mode === 'interval',
      severity: 'warning',
      message: 'Worker is in scheduled or interval mode',
    },
    {
      id: 'recent_successful_tick',
      ok: hasRecentTick,
      severity: 'critical',
      message: 'Worker has completed a recent successful tick',
      detail: status.lastSuccessfulTick || null,
    },
    {
      id: 'trusted_baseline_loaded',
      ok: status.baseline?.readyForDetours === true,
      severity: 'critical',
      message: 'Trusted baseline route shapes are loaded',
      detail: status.baseline || null,
    },
    {
      id: 'baseline_matches_live_gtfs',
      ok: baselineDivergence == null || baselineDivergence.hasChanges === false,
      severity: 'critical',
      message: 'Stored detour baseline matches current live GTFS shapes',
      detail: baselineDivergence,
    },
    {
      id: 'consecutive_failures',
      ok: (status.consecutiveFailureCount || 0) <= MAX_CONSECUTIVE_FAILURES,
      severity: 'critical',
      message: `Consecutive failures are <= ${MAX_CONSECUTIVE_FAILURES}`,
      detail: status.consecutiveFailureCount || 0,
    },
    {
      id: 'publish_failure_rate',
      ok: publishFailureRate.rate == null || publishFailureRate.rate <= MAX_PUBLISH_FAILURE_RATE,
      severity: 'critical',
      message: `Publish failure rate is <= ${Math.round(MAX_PUBLISH_FAILURE_RATE * 100)}%`,
      detail: publishFailureRate,
    },
    {
      id: 'no_flapping_routes',
      ok: flapping.flappingCount === 0,
      severity: 'warning',
      message: 'No route cleared repeatedly in the rollout window',
      detail: flapping.flappingRoutes,
    },
    {
      id: 'false_positive_rate_under_target',
      ok: falsePositiveRate.rate == null || falsePositiveRate.rate < MAX_FALSE_POSITIVE_RATE,
      severity: 'warning',
      message: `False positive rate is below ${Math.round(MAX_FALSE_POSITIVE_RATE * 100)}%`,
      detail: falsePositiveRate,
    },
    {
      id: 'no_recent_stale_auto_clears',
      ok: (staleAutoClears?.count || 0) === 0,
      severity: 'warning',
      message: 'No stale auto-clears occurred in the rollout window',
      detail: staleAutoClears,
    },
  ];

  const failedCritical = checks.filter((check) => !check.ok && check.severity === 'critical');
  const failedWarnings = checks.filter((check) => !check.ok && check.severity === 'warning');
  const statusLabel = failedCritical.length > 0
    ? 'not_ready'
    : failedWarnings.length > 0
      ? 'pilot_ready_with_cautions'
      : 'pilot_ready';

  return {
    status: statusLabel,
    checks,
    failedCritical: failedCritical.map((check) => check.id),
    failedWarnings: failedWarnings.map((check) => check.id),
  };
}

function normalizeConfidence(value) {
  const confidence = value == null ? 'unknown' : String(value).trim().toLowerCase();
  return confidence || 'unknown';
}

function summarizeShortLivedDetours(events, maxDurationMs) {
  const shortLived = (Array.isArray(events) ? events : [])
    .filter((event) =>
      Number.isFinite(event.durationMs) &&
      event.durationMs > 0 &&
      event.durationMs < maxDurationMs
    )
    .map((event) => ({
      routeId: event.routeId || null,
      durationMs: event.durationMs,
      confidence: normalizeConfidence(event.confidence),
      occurredAt: event.occurredAt || event.clearedAt || null,
    }));

  const byConfidence = shortLived.reduce((counts, event) => {
    counts[event.confidence] = (counts[event.confidence] || 0) + 1;
    return counts;
  }, {});

  return {
    count: shortLived.length,
    maxDurationMs,
    byConfidence,
    routes: shortLived.slice(0, 20),
  };
}

function createDetourOps({
  detourWorker,
  loadDetector = null,
  queryDetourHistory = getDetourHistory,
  getBaselineStatusWithDivergence = async () => null,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  offsetSampleScheduler = null,
  runLock = null,
  env = process.env,
} = {}) {
  let runOnceInProgress = false;
  const activeRunLock = runLock || createConfiguredRunLock(env);
  const activeOffsetSampleScheduler =
    offsetSampleScheduler || createConfiguredOffsetSampleScheduler(env);
  const storageConfig = buildDetourStorageConfig(env);
  const resolveDetector = loadDetector ||
    (() => getDetectorForStorageConfig(storageConfig));

  function getStatus() {
    if (!detourWorker) {
      return { enabled: false };
    }

    const status = detourWorker.getStatus();
    try {
      status.evidenceSummary = resolveDetector().getDetourEvidence();
    } catch (_err) {
      status.evidenceSummary = {};
    }
    return { enabled: true, ...status };
  }

  function buildRunTickSource(triggerSource) {
    const source = String(triggerSource || '').trim();
    return source || 'manual';
  }

  async function runSingleTick(triggerSource) {
    const result = await detourWorker.runTick({
      source: buildRunTickSource(triggerSource),
      forceReloadState: true,
    });

    return {
      status: !result.ok && !result.skipped ? 500 : 200,
      body: result,
    };
  }

  async function maybeEnqueueOffsetSample(resultBody, options) {
    const config = parseOffsetSamplingConfig(env);
    if (
      !config.enabled ||
      !activeOffsetSampleScheduler ||
      typeof activeOffsetSampleScheduler.enqueueOffsetSample !== 'function' ||
      !shouldEnqueueOffsetSample(options.triggerSource)
    ) {
      return resultBody;
    }

    try {
      const enqueueResult = await activeOffsetSampleScheduler.enqueueOffsetSample({
        delaySeconds: config.delaySeconds,
        source: config.source,
        requestedAt: new Date(now()).toISOString(),
      });

      return {
        ...resultBody,
        offsetSampling: {
          enabled: true,
          enqueued: enqueueResult?.ok === true,
          delaySeconds: config.delaySeconds,
          source: config.source,
          scheduledFor: enqueueResult?.scheduledFor || null,
          taskName: enqueueResult?.taskName || null,
          skipped: enqueueResult?.skipped === true,
          reason: enqueueResult?.reason || null,
        },
      };
    } catch (err) {
      console.error('[detour-run-once] Failed to enqueue offset sample:', err.message);
      return {
        ...resultBody,
        offsetSampling: {
          enabled: true,
          enqueued: false,
          delaySeconds: config.delaySeconds,
          source: config.source,
          error: 'Failed to enqueue delayed offset sample',
        },
      };
    }
  }

  async function runBurstSamples(config) {
    const startedAt = now();
    const samples = [];

    for (let i = 0; i < config.maxSamples; i++) {
      const result = await detourWorker.runTick({
        source: 'api-run-once-burst',
        forceReloadState: i === 0,
      });
      samples.push(result);

      const nextSampleIndex = i + 1;
      if (nextSampleIndex >= config.maxSamples) break;

      const nextDueAt = startedAt + nextSampleIndex * config.sampleIntervalMs;
      const burstEndsAt = startedAt + config.durationMs;
      if (nextDueAt > burstEndsAt) break;

      const delayMs = Math.max(0, Math.min(nextDueAt - now(), burstEndsAt - now()));
      if (delayMs <= 0 && now() >= burstEndsAt) break;
      await sleep(delayMs);
    }

    const okSamples = samples.filter((sample) => sample?.ok === true).length;
    const skippedSamples = samples.filter((sample) => sample?.skipped === true).length;
    const failedSamples = samples.length - okSamples - skippedSamples;
    const finalResult = [...samples].reverse().find((sample) => sample?.ok === true) ||
      samples[samples.length - 1] ||
      { ok: false, skipped: false, error: 'No burst samples ran' };

    return {
      status: okSamples > 0 || skippedSamples > 0 ? 200 : 500,
      body: {
        ...finalResult,
        ok: okSamples > 0,
        burstSampling: {
          enabled: true,
          sampleCount: samples.length,
          okSamples,
          failedSamples,
          skippedSamples,
          durationMs: config.durationMs,
          sampleIntervalMs: config.sampleIntervalMs,
          maxSamples: config.maxSamples,
          samples: samples.map((sample, index) => summarizeBurstSample(sample, index + 1)),
        },
      },
    };
  }

  async function runOnce(options = {}) {
    if (!detourWorker || typeof detourWorker.runTick !== 'function') {
      return {
        status: 409,
        body: {
          ok: false,
          enabled: false,
          error: 'Detour worker is not enabled',
        },
      };
    }

    if (runOnceInProgress) {
      return {
        status: 200,
        body: {
          ok: false,
          skipped: true,
          reason: 'run-once-in-progress',
          status: detourWorker.getStatus?.() || null,
        },
      };
    }

    runOnceInProgress = true;
    let lockLease = null;
    try {
      if (env.DETOUR_DISTRIBUTED_LOCK_ENABLED === 'true' && activeRunLock) {
        lockLease = await activeRunLock.acquire({
          holder: options.triggerSource || 'api-run-once',
          nowMs: now(),
        });

        if (!lockLease) {
          return {
            status: 200,
            body: {
              ok: false,
              skipped: true,
              reason: 'distributed-lock-busy',
              status: detourWorker.getStatus?.() || null,
            },
          };
        }
      }

      const status = detourWorker.getStatus?.() || {};
      const burstConfig = parseBurstSamplingConfig(env, status);
      const result = await (burstConfig.enabled
        ? runBurstSamples(burstConfig)
        : runSingleTick(options.triggerSource));
      result.body = await maybeEnqueueOffsetSample(result.body, options);
      return result;
    } finally {
      if (lockLease && activeRunLock && typeof activeRunLock.release === 'function') {
        await activeRunLock.release(lockLease).catch((err) => {
          console.error('[detour-run-once] Failed to release distributed lock:', err.message);
        });
      }
      runOnceInProgress = false;
    }
  }

  function getDebug(routeId = null) {
    if (!detourWorker) {
      return { enabled: false };
    }

    const detector = resolveDetector();
    const status = detourWorker.getStatus();
    const meta = {
      detourVersion: status.detourVersion || storageConfig.detourVersion,
      storage: status.storage || {
        activeCollection: storageConfig.activeCollection,
        historyCollection: storageConfig.historyCollection,
        runtimeStateCollection: storageConfig.runtimeStateCollection,
        runtimeStateDoc: storageConfig.runtimeStateDoc,
      },
    };

    if (routeId) {
      const routeData = detector.getRouteDebug(routeId);
      if (!routeData) {
        return { ...meta, routeId, evidence: null, message: 'No evidence for this route' };
      }

      const MAX_DEBUG_POINTS = 200;
      const responseData = {
        ...routeData,
        points: Array.isArray(routeData.points) ? routeData.points.slice() : [],
      };
      if (responseData.points.length > MAX_DEBUG_POINTS) {
        responseData.points = responseData.points.slice(-MAX_DEBUG_POINTS);
        responseData.truncated = true;
      }
      return { ...meta, routeId, evidence: responseData };
    }

    const summary = detector.getDetourEvidence();
    return { ...meta, routes: summary, count: Object.keys(summary).length };
  }

  async function getLogs(filters) {
    const logs = await queryDetourHistory({ ...filters, storageConfig });

    return {
      detourVersion: storageConfig.detourVersion,
      storage: {
        historyCollection: storageConfig.historyCollection,
      },
      logs,
      count: logs.length,
      limit: filters.limit,
      filters: {
        routeId: filters.routeId || null,
        eventTypes: filters.eventTypes.length > 0 ? filters.eventTypes : null,
        start: filters.startMs,
        end: filters.endMs,
      },
    };
  }

  async function getRolloutHealth() {
    if (!detourWorker) {
      return { enabled: false, message: 'Detour worker is not enabled' };
    }

    const status = detourWorker.getStatus();
    const rolloutWindowMs = parsePositiveInt(env.DETOUR_ROLLOUT_WINDOW_MS, DEFAULT_ROLLOUT_WINDOW_MS);
    const falsePositiveWindowMs = parsePositiveInt(
      env.DETOUR_FALSE_POSITIVE_WINDOW_MS,
      DEFAULT_FALSE_POSITIVE_WINDOW_MS
    );
    const staleTickMs = parsePositiveInt(env.DETOUR_ROLLOUT_STALE_TICK_MS, DEFAULT_STALE_TICK_MS);
    const currentTime = now();

    const tickCount = status.tickCount || 0;
    const publishFailures = status.errors?.publishFailures || 0;
    const publishFailureRate = tickCount > 0
      ? { rate: publishFailures / tickCount, publishFailures, tickCount }
      : { rate: null, publishFailures, tickCount, note: 'No ticks yet' };

    let flapping = { flappingRoutes: [], flappingCount: 0, windowMs: rolloutWindowMs };
    let durationStats = { min: null, avg: null, max: null, count: 0 };
    let falsePositiveCandidates = { count: 0, maxDurationMs: FALSE_POSITIVE_DURATION_MS, routes: [] };
    let staleAutoClears = { count: 0, windowMs: rolloutWindowMs, routes: [] };
    let suspiciousShortLivedDetours = {
      count: 0,
      maxDurationMs: SUSPICIOUS_SHORT_LIVED_DURATION_MS,
      byConfidence: {},
      routes: [],
    };
    let falsePositiveRate = {
      rate: null,
      falsePositiveCount: 0,
      detectedCount: 0,
      windowMs: falsePositiveWindowMs,
      note: 'No detections in window',
    };
    let baselineDivergence = null;

    try {
      const baselineWithDivergence = await getBaselineStatusWithDivergence();
      baselineDivergence = baselineWithDivergence?.divergence || null;
    } catch (err) {
      baselineDivergence = { error: err.message || 'Could not compare baseline with live GTFS' };
    }

    try {
      const clearEventTypes = ['DETOUR_CLEARED', 'DETOUR_AUTO_CLEARED_STALE'];
      const clearedEvents = await queryDetourHistory({
        storageConfig,
        eventTypes: clearEventTypes,
        startMs: currentTime - rolloutWindowMs,
        limit: 200,
      });

      const routeClearCounts = {};
      for (const event of clearedEvents) {
        const route = event.routeId;
        if (route) routeClearCounts[route] = (routeClearCounts[route] || 0) + 1;
      }

      const flappingRoutes = Object.entries(routeClearCounts)
        .filter(([, count]) => count >= 2)
        .map(([routeId, count]) => ({ routeId, clearCount: count }))
        .sort((a, b) => b.clearCount - a.clearCount);

      flapping = {
        flappingRoutes,
        flappingCount: flappingRoutes.length,
        windowMs: rolloutWindowMs,
      };
      const staleClearEvents = clearedEvents
        .filter((event) => event.eventType === 'DETOUR_AUTO_CLEARED_STALE')
        .map((event) => ({
          routeId: event.routeId || null,
          durationMs: event.durationMs || null,
          confidence: normalizeConfidence(event.confidence),
          occurredAt: event.occurredAt || event.clearedAt || null,
        }));
      staleAutoClears = {
        count: staleClearEvents.length,
        windowMs: rolloutWindowMs,
        routes: staleClearEvents.slice(0, 20),
      };

      const durations = clearedEvents
        .map((event) => event.durationMs)
        .filter((duration) => duration != null && Number.isFinite(duration) && duration > 0);

      if (durations.length > 0) {
        const sum = durations.reduce((a, b) => a + b, 0);
        durationStats = {
          min: Math.min(...durations),
          avg: Math.round(sum / durations.length),
          max: Math.max(...durations),
          count: durations.length,
        };
      }

      const shortLived = clearedEvents
        .filter((event) =>
          Number.isFinite(event.durationMs) &&
          event.durationMs > 0 &&
          event.durationMs < FALSE_POSITIVE_DURATION_MS
        )
        .map((event) => ({
          routeId: event.routeId || null,
          durationMs: event.durationMs,
          occurredAt: event.occurredAt || event.clearedAt || null,
        }));
      falsePositiveCandidates = {
        count: shortLived.length,
        maxDurationMs: FALSE_POSITIVE_DURATION_MS,
        routes: shortLived.slice(0, 20),
      };
      suspiciousShortLivedDetours = summarizeShortLivedDetours(
        clearedEvents,
        SUSPICIOUS_SHORT_LIVED_DURATION_MS
      );

      const [falsePositiveClearedEvents, detectedEvents] = await Promise.all([
        queryDetourHistory({
          storageConfig,
          eventTypes: clearEventTypes,
          startMs: currentTime - falsePositiveWindowMs,
          limit: 200,
        }),
        queryDetourHistory({
          storageConfig,
          eventTypes: ['DETOUR_DETECTED'],
          startMs: currentTime - falsePositiveWindowMs,
          limit: 200,
        }),
      ]);

      const falsePositiveCount = falsePositiveClearedEvents.filter((event) =>
        Number.isFinite(event.durationMs) &&
        event.durationMs > 0 &&
        event.durationMs < FALSE_POSITIVE_DURATION_MS
      ).length;
      const detectedCount = detectedEvents.length;
      falsePositiveRate = {
        rate: detectedCount > 0 ? falsePositiveCount / detectedCount : null,
        falsePositiveCount,
        detectedCount,
        windowMs: falsePositiveWindowMs,
        maxFalsePositiveDurationMs: FALSE_POSITIVE_DURATION_MS,
        targetRate: MAX_FALSE_POSITIVE_RATE,
      };
      if (detectedCount === 0) {
        falsePositiveRate.note = 'No detections in window';
      }
    } catch (err) {
      console.error('[detour-rollout-health] Failed to query history:', err.message);
    }

    const launchReadiness = buildLaunchReadinessChecks({
      status,
      currentTime,
      publishFailureRate,
      flapping,
      falsePositiveRate,
      baselineDivergence,
      staleAutoClears,
      staleTickMs,
      env,
    });

    return {
      enabled: true,
      running: status.running,
      mode: status.mode,
      detourVersion: status.detourVersion || storageConfig.detourVersion,
      storage: status.storage || {
        activeCollection: storageConfig.activeCollection,
        historyCollection: storageConfig.historyCollection,
        runtimeStateCollection: storageConfig.runtimeStateCollection,
        runtimeStateDoc: storageConfig.runtimeStateDoc,
      },
      tickCount: status.tickCount,
      lastSuccessfulTick: status.lastSuccessfulTick,
      consecutiveFailureCount: status.consecutiveFailureCount,
      activeDetourCount: Object.keys(status.activeDetours || {}).length,
      baseline: status.baseline || null,
      baselineDivergence,
      publishFailureRate,
      flapping,
      durationStats,
      falsePositiveCandidates,
      staleAutoClears,
      suspiciousShortLivedDetours,
      falsePositiveRate,
      launchReadiness,
      featureFlags: {
        geometryUiEnabled: env.EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI === 'true',
        autoDetoursEnabled: env.EXPO_PUBLIC_ENABLE_AUTO_DETOURS === 'true',
        workerEnabled: env.DETOUR_WORKER_ENABLED === 'true',
      },
    };
  }

  return {
    getStatus,
    runOnce,
    getDebug,
    getLogs,
    getRolloutHealth,
  };
}

module.exports = {
  HISTORY_MAX_LIMIT,
  buildLaunchReadinessChecks,
  createDetourOps,
};
