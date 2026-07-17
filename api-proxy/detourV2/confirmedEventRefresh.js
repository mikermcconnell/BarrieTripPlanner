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

function createConfirmedEventRefresh({
  activeDetours,
  getActiveEventsForRoute,
  getPathPolylines,
  getShapeId,
  getProgressBounds,
  getDistanceToPaths,
  clearNormalRouteEvidence,
  rules,
}) {
  const {
    minimumUniqueSignatures,
    offRouteThresholdMeters,
    marginalThresholdMeters,
    pathProximityMeters,
    minimumTraversalMeters,
    reversalToleranceMeters,
    maximumSampleGapMs,
  } = rules;

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

  function arm(previousState, projectedSample, matchingEvents) {
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
      byEventId.set(detour.eventId, {
        eventId: detour.eventId,
        shapeId: projectedSample.shapeId,
        entryProgressMeters: Number(entrySample.progressMeters),
        marginalProgressMeters: Number(projectedSample.progressMeters),
        observedAt: projectedSample.timestampMs,
      });
    }
    return [...byEventId.values()];
  }

  function finalize(previousState, exitSample) {
    const pending = Array.isArray(previousState?.pendingConfirmedRefreshes)
      ? previousState.pendingConfirmedRefreshes
      : [];
    const refreshedEventIds = new Set();
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

      detour.latestGpsEvidenceAt = Math.max(
        Number(detour.latestGpsEvidenceAt || 0),
        observedAt
      );
      detour.lastSeenAt = new Date(Math.max(timestampMs(detour.lastSeenAt), observedAt));
      detour.lastConfirmedRefreshAt = observedAt;
      detour.confirmedRefreshCount = Number(detour.confirmedRefreshCount || 0) + 1;
      clearNormalRouteEvidence(item.eventId);
      refreshedEventIds.add(item.eventId);
    }
    return refreshedEventIds;
  }

  return {
    arm,
    finalize,
    findMatches,
  };
}

module.exports = {
  createConfirmedEventRefresh,
};
