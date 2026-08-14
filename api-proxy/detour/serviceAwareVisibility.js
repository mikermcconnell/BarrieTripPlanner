'use strict';

const { normalizeRouteId } = require('./routeFamily');
const { projectOntoPolyline } = require('./projection');
const { isNonPassengerVehicleEvidence, makeEvidenceIdentity } = require('./evidenceIdentity');
const {
  calculateActiveServiceTimeMs,
  estimateExactRouteHeadwayMs,
  getServiceDay,
} = require('./routeSchedule');
const { ON_ROUTE_CLEAR_THRESHOLD_METERS } = require('./detectionConfig');

const DEFAULT_MISSED_OPPORTUNITIES_TO_HIDE = 2;
const DEFAULT_HEADWAY_BUFFER_MS = 10 * 60 * 1000;
const DEFAULT_PASSAGE_MAX_GAP_MS = 45 * 60 * 1000;
const DEFAULT_PASSAGE_WINDOW_MARGIN_METERS = 75;
const DEFAULT_PASSAGE_MAX_ROUTE_DISTANCE_METERS = ON_ROUTE_CLEAR_THRESHOLD_METERS;
const MAX_TRACKED_TRIPS = 8;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeDirectionId(value) {
  if (value == null || value === '') return null;
  return String(value).trim() || null;
}

function getMapValue(mapLike, key) {
  if (!mapLike || key == null) return null;
  if (typeof mapLike.get === 'function') return mapLike.get(key) || null;
  return mapLike[key] || null;
}

function getShapePolyline(shapes, shapeId) {
  const polyline = getMapValue(shapes, shapeId);
  return Array.isArray(polyline) && polyline.length >= 2 ? polyline : null;
}

function getTripMappingEntries(tripMapping) {
  if (tripMapping instanceof Map) return [...tripMapping.entries()];
  if (tripMapping && typeof tripMapping === 'object') return Object.entries(tripMapping);
  return [];
}

function getExactRouteTrips(routeId, scheduleIndex) {
  const routeKey = normalizeRouteId(routeId);
  return scheduleIndex?.tripsByRouteId?.get(routeKey) || [];
}

function getTripMeta(tripId, tripMapping, scheduleIndex, routeId) {
  if (!tripId) return null;
  const mapped = getMapValue(tripMapping, tripId);
  if (mapped) return mapped;
  return getExactRouteTrips(routeId, scheduleIndex)
    .find((trip) => String(trip?.tripId || '') === String(tripId)) || null;
}

function getEventWindow(detour, previousSnapshot) {
  const candidates = [
    detour?.eventWindow,
    detour?.detourZone,
    detour?.geometry?.eventWindow,
    detour?.geometry?.detourZone,
    previousSnapshot?.eventWindow,
    previousSnapshot?.detourZone,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const shapeId = candidate.shapeId ? String(candidate.shapeId) : null;
    const start = Number(
      candidate.coreStartProgressMeters ??
      candidate.sourceStartProgressMeters ??
      candidate.startProgressMeters
    );
    const end = Number(
      candidate.coreEndProgressMeters ??
      candidate.sourceEndProgressMeters ??
      candidate.endProgressMeters
    );
    if (shapeId && Number.isFinite(start) && Number.isFinite(end) && start !== end) {
      return {
        shapeId,
        startProgressMeters: Math.min(start, end),
        endProgressMeters: Math.max(start, end),
      };
    }
  }
  return null;
}

function getExplicitProgressDirection(detour, previousSnapshot) {
  const values = [
    detour?.progressDirection,
    detour?.geometry?.progressDirection,
    detour?.geometry?.segments?.[0]?.progressDirection,
    previousSnapshot?.progressDirection,
    previousSnapshot?.segments?.[0]?.progressDirection,
  ];
  return values.some((value) => Number(value) === -1) ? -1 : 1;
}

function inferEventDirection({ routeId, shapeId, detour, previousSnapshot, tripMapping, scheduleIndex }) {
  const explicit = normalizeDirectionId(
    detour?.directionId ??
    detour?.eventWindow?.directionId ??
    detour?.geometry?.directionId ??
    previousSnapshot?.directionId ??
    previousSnapshot?.eventWindow?.directionId
  );
  if (explicit != null) {
    return { directionId: explicit, source: 'event' };
  }

  const routeKey = normalizeRouteId(routeId);
  const directions = new Set();
  for (const [, trip] of getTripMappingEntries(tripMapping)) {
    if (
      normalizeRouteId(trip?.routeId) === routeKey &&
      String(trip?.shapeId || '') === String(shapeId || '')
    ) {
      const directionId = normalizeDirectionId(trip?.directionId);
      if (directionId != null) directions.add(directionId);
    }
  }
  for (const trip of getExactRouteTrips(routeId, scheduleIndex)) {
    if (shapeId && trip?.shapeId && String(trip.shapeId) !== String(shapeId)) continue;
    const directionId = normalizeDirectionId(trip?.directionId);
    if (directionId != null) directions.add(directionId);
  }

  if (directions.size === 1) {
    return { directionId: [...directions][0], source: 'shape-schedule' };
  }
  return {
    directionId: null,
    source: directions.size > 1 ? 'ambiguous-shape-direction' : 'missing-shape-direction',
  };
}

function buildPassageTarget({ routeId, detour, previousSnapshot, shapes, tripMapping, scheduleIndex }) {
  const eventWindow = getEventWindow(detour, previousSnapshot);
  if (!eventWindow) {
    return { available: false, reason: 'missing-event-progress-window' };
  }
  const polyline = getShapePolyline(shapes, eventWindow.shapeId);
  if (!polyline) {
    return { available: false, reason: 'missing-event-shape' };
  }
  const direction = inferEventDirection({
    routeId,
    shapeId: eventWindow.shapeId,
    detour,
    previousSnapshot,
    tripMapping,
    scheduleIndex,
  });
  if (direction.directionId == null) {
    return { available: false, reason: direction.source };
  }

  return {
    available: true,
    routeId: normalizeRouteId(routeId),
    directionId: direction.directionId,
    directionSource: direction.source,
    progressDirection: getExplicitProgressDirection(detour, previousSnapshot),
    polyline,
    ...eventWindow,
  };
}

function vehicleTimestampMs(vehicle, now) {
  const raw = Number(vehicle?.timestampMs ?? vehicle?.timestamp);
  if (!Number.isFinite(raw) || raw <= 0) return now;
  return raw < 1e12 ? raw * 1000 : raw;
}

function getPassageServiceDate(vehicle, sampledAtMs, scheduleIndex) {
  const explicit = String(
    vehicle?.startDate ?? vehicle?.tripStartDate ?? vehicle?.start_date ?? ''
  ).trim().replace(/-/g, '');
  if (/^\d{8}$/.test(explicit)) return explicit;

  try {
    return getServiceDay(
      sampledAtMs,
      scheduleIndex?.timeZone
    ).dateKey;
  } catch (_error) {
    return null;
  }
}

function makePassageSignature(vehicle, identity, sampledAtMs, scheduleIndex) {
  if (!identity?.signature) return null;
  const serviceDate = getPassageServiceDate(vehicle, sampledAtMs, scheduleIndex);
  return serviceDate ? `${identity.signature}:${serviceDate}` : null;
}

function normalizeTrackingState(rawState, evidenceMs, now) {
  const rawEvidenceMs = Number(rawState?.evidenceAtMs);
  if (!rawState || !Number.isFinite(rawEvidenceMs) || rawEvidenceMs !== evidenceMs) {
    return {
      version: 1,
      evidenceAtMs: evidenceMs,
      lastEvaluatedAtMs: now,
      missedOpportunitySignatures: [],
      observedTrips: [],
    };
  }

  return {
    version: 1,
    evidenceAtMs: evidenceMs,
    lastEvaluatedAtMs: now,
    missedOpportunitySignatures: [...new Set(
      (Array.isArray(rawState.missedOpportunitySignatures)
        ? rawState.missedOpportunitySignatures
        : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )].slice(-DEFAULT_MISSED_OPPORTUNITIES_TO_HIDE),
    observedTrips: (Array.isArray(rawState.observedTrips) ? rawState.observedTrips : [])
      .filter((trip) => trip?.signature)
      .slice(-MAX_TRACKED_TRIPS)
      .map((trip) => ({ ...trip })),
  };
}

function stageForProgress(progressMeters, target, marginMeters) {
  const lower = target.startProgressMeters;
  const upper = target.endProgressMeters;
  if (target.progressDirection === -1) {
    if (progressMeters > upper + marginMeters) return 'before';
    if (progressMeters < lower - marginMeters) return 'after';
    return 'inside';
  }
  if (progressMeters < lower - marginMeters) return 'before';
  if (progressMeters > upper + marginMeters) return 'after';
  return 'inside';
}

function observationCompletedPassage(observation, maxGapMs) {
  const approachAt = Number(observation.insideAtMs ?? observation.beforeAtMs);
  const afterAt = Number(observation.afterAtMs);
  if (!Number.isFinite(approachAt) || !Number.isFinite(afterAt) || afterAt <= approachAt) return false;
  return afterAt - approachAt <= maxGapMs;
}

function getEligibleVehicleProjection(vehicle, target, context) {
  if (normalizeRouteId(vehicle?.routeId) !== target.routeId) return null;
  if (isNonPassengerVehicleEvidence(vehicle)) return null;

  const identity = makeEvidenceIdentity(vehicle);
  if (!identity.canConfirm || !identity.signature) return null;
  const tripMeta = getTripMeta(vehicle.tripId, context.tripMapping, context.scheduleIndex, target.routeId);
  if (!tripMeta) return null;
  if (normalizeRouteId(tripMeta.routeId) !== target.routeId) return null;
  if (String(tripMeta.shapeId || '') !== target.shapeId) return null;
  if (normalizeDirectionId(tripMeta.directionId ?? vehicle.directionId) !== target.directionId) return null;

  const coordinate = {
    latitude: Number(vehicle?.latitude ?? vehicle?.coordinate?.latitude ?? vehicle?.coordinate?.lat),
    longitude: Number(
      vehicle?.longitude ?? vehicle?.coordinate?.longitude ??
      vehicle?.coordinate?.lon ?? vehicle?.coordinate?.lng
    ),
  };
  if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) return null;
  const projection = projectOntoPolyline(coordinate, target.polyline);
  if (!projection || !Number.isFinite(projection.progressMeters)) return null;
  if (
    !Number.isFinite(projection.distanceMeters) ||
    projection.distanceMeters > context.maxRouteDistanceMeters
  ) {
    return null;
  }
  const signature = makePassageSignature(
    vehicle,
    identity,
    context.sampledAtMs,
    context.scheduleIndex
  );
  if (!signature) return null;
  return { identity: { ...identity, signature }, projection };
}

function updateOpportunityTracking({
  state,
  target,
  vehicles,
  tripMapping,
  scheduleIndex,
  now,
  env,
}) {
  const maxGapMs = positiveNumber(
    env.DETOUR_RIDER_VISIBILITY_PASSAGE_MAX_GAP_MS,
    DEFAULT_PASSAGE_MAX_GAP_MS
  );
  const marginMeters = nonNegativeNumber(
    env.DETOUR_RIDER_VISIBILITY_PASSAGE_MARGIN_METERS,
    DEFAULT_PASSAGE_WINDOW_MARGIN_METERS
  );
  const maxRouteDistanceMeters = positiveNumber(
    env.DETOUR_RIDER_VISIBILITY_PASSAGE_MAX_ROUTE_DISTANCE_METERS,
    DEFAULT_PASSAGE_MAX_ROUTE_DISTANCE_METERS
  );
  const observations = new Map(
    state.observedTrips.map((observation) => [observation.signature, { ...observation }])
  );
  const missed = new Set(state.missedOpportunitySignatures);

  for (const vehicle of Array.isArray(vehicles) ? vehicles : []) {
    const sampledAtMs = vehicleTimestampMs(vehicle, now);
    if (sampledAtMs <= state.evidenceAtMs || now - sampledAtMs > maxGapMs) continue;
    const eligible = getEligibleVehicleProjection(vehicle, target, {
      tripMapping,
      scheduleIndex,
      sampledAtMs,
      maxRouteDistanceMeters,
    });
    if (!eligible || missed.has(eligible.identity.signature)) continue;

    const signature = eligible.identity.signature;
    const observation = observations.get(signature) || {
      signature,
      tripId: vehicle.tripId || null,
      firstSeenAtMs: sampledAtMs,
      lastSeenAtMs: sampledAtMs,
      beforeAtMs: null,
      insideAtMs: null,
      afterAtMs: null,
    };
    const stage = stageForProgress(eligible.projection.progressMeters, target, marginMeters);
    observation.firstSeenAtMs = Math.min(Number(observation.firstSeenAtMs) || sampledAtMs, sampledAtMs);
    observation.lastSeenAtMs = Math.max(Number(observation.lastSeenAtMs) || sampledAtMs, sampledAtMs);
    observation.lastProgressMeters = eligible.projection.progressMeters;
    const stageKey = `${stage}AtMs`;
    if (stage === 'after') {
      observation[stageKey] = Math.max(Number(observation[stageKey]) || 0, sampledAtMs);
    } else if (observation[stageKey] == null) {
      observation[stageKey] = sampledAtMs;
    }
    observations.set(signature, observation);

    if (observationCompletedPassage(observation, maxGapMs)) {
      missed.add(signature);
      observations.delete(signature);
    }
  }

  const freshObservations = [...observations.values()]
    .filter((observation) => now - Number(observation.lastSeenAtMs || 0) <= maxGapMs)
    .sort((a, b) => Number(a.lastSeenAtMs || 0) - Number(b.lastSeenAtMs || 0))
    .slice(-MAX_TRACKED_TRIPS);

  return {
    ...state,
    lastEvaluatedAtMs: now,
    directionId: target.directionId,
    directionSource: target.directionSource,
    shapeId: target.shapeId,
    missedOpportunitySignatures: [...missed].slice(-DEFAULT_MISSED_OPPORTUNITIES_TO_HIDE),
    observedTrips: freshObservations,
  };
}

function getFallbackThresholdMs({ routeId, scheduleIndex, now, directionId, minimumAgeMs, env }) {
  const bufferMs = nonNegativeNumber(
    env.DETOUR_RIDER_VISIBILITY_HEADWAY_BUFFER_MS,
    DEFAULT_HEADWAY_BUFFER_MS
  );
  const estimate = estimateExactRouteHeadwayMs(routeId, scheduleIndex, now, { directionId });
  if (!estimate || !Number.isFinite(estimate.headwayMs) || estimate.headwayMs <= 0) {
    return { available: false, reason: estimate?.source || 'missing-exact-route-headway' };
  }
  return {
    available: true,
    thresholdMs: Math.max(minimumAgeMs, 2 * estimate.headwayMs + bufferMs),
    headwayMs: estimate.headwayMs,
    headwaySource: estimate.source,
    serviceDate: estimate.serviceDate,
  };
}

function evaluateServiceAwareStaleness({
  routeId,
  detour,
  previousSnapshot,
  vehicles,
  scheduleIndex,
  shapes,
  tripMapping,
  evidenceMs,
  now,
  minimumAgeMs,
  env = process.env,
}) {
  const previousTracking = previousSnapshot?.staleVisibilityTracking || null;
  const trackingState = normalizeTrackingState(previousTracking, evidenceMs, now);
  const target = buildPassageTarget({
    routeId,
    detour,
    previousSnapshot,
    shapes,
    tripMapping,
    scheduleIndex,
  });

  if (target.available) {
    const updatedTracking = updateOpportunityTracking({
      state: trackingState,
      target,
      vehicles,
      tripMapping,
      scheduleIndex,
      now,
      env,
    });
    const missedOpportunityCount = updatedTracking.missedOpportunitySignatures.length;
    return {
      shouldHide: missedOpportunityCount >= DEFAULT_MISSED_OPPORTUNITIES_TO_HIDE,
      policySource: 'observed-passage-opportunities',
      trackingState: updatedTracking,
      missedOpportunityCount,
      passageTargetAvailable: true,
      directionId: target.directionId,
      shapeId: target.shapeId,
    };
  }

  const direction = inferEventDirection({
    routeId,
    shapeId: getEventWindow(detour, previousSnapshot)?.shapeId || null,
    detour,
    previousSnapshot,
    tripMapping,
    scheduleIndex,
  });
  if (direction.directionId == null) {
    return {
      shouldHide: false,
      policySource: 'fail-safe',
      trackingState,
      missedOpportunityCount: trackingState.missedOpportunitySignatures.length,
      passageTargetAvailable: false,
      failSafeReason: direction.source || target.reason,
    };
  }

  const fallback = getFallbackThresholdMs({
    routeId,
    scheduleIndex,
    now,
    directionId: direction.directionId,
    minimumAgeMs,
    env,
  });
  if (!fallback.available) {
    return {
      shouldHide: false,
      policySource: 'fail-safe',
      trackingState,
      missedOpportunityCount: trackingState.missedOpportunitySignatures.length,
      passageTargetAvailable: false,
      failSafeReason: fallback.reason || target.reason,
      directionId: direction.directionId,
    };
  }

  const activeService = calculateActiveServiceTimeMs(
    routeId,
    scheduleIndex,
    evidenceMs,
    now,
    { directionId: direction.directionId }
  );
  if (!activeService.available) {
    return {
      shouldHide: false,
      policySource: 'fail-safe',
      trackingState,
      missedOpportunityCount: trackingState.missedOpportunitySignatures.length,
      passageTargetAvailable: false,
      failSafeReason: activeService.reason || target.reason,
      directionId: direction.directionId,
    };
  }

  return {
    shouldHide: activeService.activeServiceMs > fallback.thresholdMs,
    policySource: 'active-service-time-fallback',
    trackingState: {
      ...trackingState,
      directionId: direction.directionId,
      directionSource: direction.source,
    },
    missedOpportunityCount: trackingState.missedOpportunitySignatures.length,
    passageTargetAvailable: false,
    passageUnavailableReason: target.reason,
    directionId: direction.directionId,
    activeServiceAgeMs: activeService.activeServiceMs,
    maxActiveServiceAgeMs: fallback.thresholdMs,
    headwayMs: fallback.headwayMs,
    headwaySource: fallback.headwaySource,
    serviceDate: fallback.serviceDate,
  };
}

module.exports = {
  evaluateServiceAwareStaleness,
  buildPassageTarget,
  inferEventDirection,
  getFallbackThresholdMs,
  updateOpportunityTracking,
};
