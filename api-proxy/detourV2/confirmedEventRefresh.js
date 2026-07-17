'use strict';

// Keeps an already confirmed short detour fresh when GPS sampling catches only
// a marginal middle point. This module never confirms a new detour.

function timestampMs(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDirection(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  return numeric > 0 ? 1 : -1;
}

function normalizeDirectionMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['off', 'diagnostic', 'enforce'].includes(normalized)
    ? normalized
    : 'diagnostic';
}

const DIRECTION_STAT_FIELDS = [
  'armedIncreasing',
  'armedDecreasing',
  'unknown',
  'mismatch',
  'directionChanged',
  'diagnosticWouldReject',
  'enforcedReject',
  'refreshed',
];

function emptyDirectionStats(mode) {
  return {
    mode,
    armedIncreasing: 0,
    armedDecreasing: 0,
    unknown: 0,
    mismatch: 0,
    directionChanged: 0,
    diagnosticWouldReject: 0,
    enforcedReject: 0,
    refreshed: 0,
  };
}

function createConfirmedEventRefresh({
  activeDetours,
  getActiveEventsForRoute,
  getPathPolylines,
  getShapeId,
  getProgressBounds,
  getDistanceToPaths,
  resolveProgressDirection = () => null,
  clearNormalRouteEvidence,
  directionMode = 'diagnostic',
  rules,
}) {
  const mode = normalizeDirectionMode(directionMode);
  const stats = emptyDirectionStats(mode);
  const statsByRoute = new Map();
  const {
    minimumUniqueSignatures,
    offRouteThresholdMeters,
    marginalThresholdMeters,
    pathProximityMeters,
    minimumTraversalMeters,
    reversalToleranceMeters,
    maximumSampleGapMs,
  } = rules;

  function increment(detour, field) {
    stats[field] += 1;
    const routeId = String(detour?.routeId || '').trim();
    if (!routeId) return;
    const routeStats = statsByRoute.get(routeId) || emptyDirectionStats(mode);
    routeStats[field] += 1;
    statsByRoute.set(routeId, routeStats);
  }

  function isRefreshable(detour) {
    return Boolean(
      detour &&
      detour.state === 'active' &&
      Number(detour.uniqueVehicleCount || detour.vehicleCount || 0) >=
        minimumUniqueSignatures &&
      getPathPolylines(detour.geometry).length > 0
    );
  }

  function findMatches(routeId, projectedSample, distanceMeters) {
    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters <= marginalThresholdMeters ||
      distanceMeters > offRouteThresholdMeters
    ) {
      return [];
    }

    return getActiveEventsForRoute(routeId).filter((detour) => {
      if (!isRefreshable(detour)) return false;
      const detourShapeId = getShapeId(detour);
      if (detourShapeId && projectedSample.shapeId && detourShapeId !== projectedSample.shapeId) {
        return false;
      }
      const bounds = getProgressBounds(detour);
      if (
        !bounds ||
        projectedSample.progressMeters < bounds.start - reversalToleranceMeters ||
        projectedSample.progressMeters > bounds.end + reversalToleranceMeters
      ) {
        return false;
      }
      return getDistanceToPaths(
        projectedSample.coordinate,
        getPathPolylines(detour.geometry)
      ) <= pathProximityMeters;
    });
  }

  function arm(previousState, projectedSample, matchingEvents, context = {}) {
    const entrySample = previousState?.lastOnRouteSample;
    if (
      !entrySample ||
      entrySample.shapeId !== projectedSample.shapeId ||
      projectedSample.timestampMs - Number(entrySample.timestampMs || 0) > maximumSampleGapMs
    ) {
      return [];
    }

    const existing = Array.isArray(previousState.pendingConfirmedRefreshes)
      ? previousState.pendingConfirmedRefreshes
      : [];
    const byEventId = new Map(existing.map((item) => [item.eventId, item]));
    for (const detour of matchingEvents) {
      const expectedDirection = normalizeDirection(resolveProgressDirection(detour, context));
      if (expectedDirection > 0) increment(detour, 'armedIncreasing');
      if (expectedDirection < 0) increment(detour, 'armedDecreasing');
      if (mode !== 'off' && expectedDirection == null) {
        increment(detour, 'unknown');
        if (mode === 'enforce') {
          increment(detour, 'enforcedReject');
          byEventId.delete(detour.eventId);
          continue;
        }
      }
      byEventId.set(detour.eventId, {
        eventId: detour.eventId,
        shapeId: projectedSample.shapeId,
        entryProgressMeters: Number(entrySample.progressMeters),
        marginalProgressMeters: Number(projectedSample.progressMeters),
        observedAt: projectedSample.timestampMs,
        expectedProgressDirection: expectedDirection,
      });
    }
    return [...byEventId.values()];
  }

  function finalize(previousState, exitSample, context = {}) {
    const pending = Array.isArray(previousState?.pendingConfirmedRefreshes)
      ? previousState.pendingConfirmedRefreshes
      : [];
    const refreshedEventIds = new Set();
    const decisions = [];
    for (const item of pending) {
      const detour = activeDetours.get(item.eventId);
      const observedAt = Number(item.observedAt);
      const entryProgress = Number(item.entryProgressMeters);
      const marginalProgress = Number(item.marginalProgressMeters);
      const exitProgress = Number(exitSample.progressMeters);
      if (
        !isRefreshable(detour) ||
        item.shapeId !== exitSample.shapeId ||
        !Number.isFinite(observedAt) ||
        exitSample.timestampMs - observedAt > maximumSampleGapMs ||
        ![entryProgress, marginalProgress, exitProgress].every(Number.isFinite)
      ) {
        continue;
      }

      const traversalMeters = Math.abs(exitProgress - entryProgress);
      const lower = Math.min(entryProgress, exitProgress) - reversalToleranceMeters;
      const upper = Math.max(entryProgress, exitProgress) + reversalToleranceMeters;
      if (
        traversalMeters < minimumTraversalMeters ||
        marginalProgress < lower ||
        marginalProgress > upper
      ) {
        continue;
      }

      const observedDirection = normalizeDirection(exitProgress - entryProgress);
      const armedDirection = normalizeDirection(item.expectedProgressDirection);
      const currentDirection = normalizeDirection(resolveProgressDirection(detour, context));
      let rejectionReason = null;
      if (mode !== 'off' && (!armedDirection || !currentDirection)) {
        rejectionReason = 'confirmed-refresh-direction-unknown';
        increment(detour, 'unknown');
      } else if (mode !== 'off' && armedDirection !== currentDirection) {
        rejectionReason = 'confirmed-refresh-direction-changed';
        increment(detour, 'directionChanged');
      } else if (mode !== 'off' && observedDirection !== armedDirection) {
        rejectionReason = 'confirmed-refresh-direction-mismatch';
        increment(detour, 'mismatch');
      }

      if (rejectionReason && mode === 'enforce') {
        increment(detour, 'enforcedReject');
        decisions.push({ eventId: item.eventId, refreshed: false, reason: rejectionReason });
        continue;
      }
      if (rejectionReason) increment(detour, 'diagnosticWouldReject');

      detour.latestGpsEvidenceAt = Math.max(
        Number(detour.latestGpsEvidenceAt || 0),
        observedAt
      );
      detour.lastSeenAt = new Date(Math.max(timestampMs(detour.lastSeenAt), observedAt));
      detour.lastConfirmedRefreshAt = observedAt;
      detour.confirmedRefreshCount = Number(detour.confirmedRefreshCount || 0) + 1;
      clearNormalRouteEvidence(item.eventId);
      refreshedEventIds.add(item.eventId);
      increment(detour, 'refreshed');
      decisions.push({
        eventId: item.eventId,
        refreshed: true,
        reason: rejectionReason,
      });
    }
    return { refreshedEventIds, decisions };
  }

  function getDirectionStats(routeId = null) {
    if (routeId == null) return { ...stats };
    return { ...(statsByRoute.get(String(routeId)) || emptyDirectionStats(mode)) };
  }

  function serializeDirectionStats() {
    return {
      totals: getDirectionStats(),
      byRoute: Object.fromEntries(
        [...statsByRoute.entries()].map(([routeId, routeStats]) => [routeId, { ...routeStats }])
      ),
    };
  }

  function hydrateDirectionStats(snapshot = {}) {
    const apply = (target, source = {}) => {
      for (const field of DIRECTION_STAT_FIELDS) {
        const value = Number(source[field]);
        target[field] = Number.isFinite(value) && value >= 0 ? value : 0;
      }
      target.mode = mode;
    };
    apply(stats, snapshot.totals);
    statsByRoute.clear();
    for (const [routeId, routeStats] of Object.entries(snapshot.byRoute || {})) {
      const hydrated = emptyDirectionStats(mode);
      apply(hydrated, routeStats);
      statsByRoute.set(routeId, hydrated);
    }
  }

  return {
    arm,
    finalize,
    findMatches,
    getDirectionStats,
    hydrateDirectionStats,
    serializeDirectionStats,
  };
}

module.exports = {
  createConfirmedEventRefresh,
  normalizeDirection,
  normalizeDirectionMode,
};
