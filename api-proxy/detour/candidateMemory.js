'use strict';

function makeCandidateObservationSignature(observation) {
  if (observation?.vehicleId && observation?.tripId) {
    return `vehicle-trip:${observation.vehicleId}:${observation.tripId}`;
  }
  if (observation?.tripId) return `trip:${observation.tripId}`;
  if (observation?.vehicleId) return `vehicle:${observation.vehicleId}`;
  return 'unknown';
}

function createCandidateKey(observation, bucketMeters = 350) {
  const midpoint = (
    Number(observation?.progressMinMeters) +
    Number(observation?.progressMaxMeters)
  ) / 2;
  const bucket = Number.isFinite(midpoint)
    ? Math.round(midpoint / Math.max(1, bucketMeters))
    : 'unknown';
  return [
    observation?.routeId || 'unknown-route',
    observation?.shapeId || 'unknown-shape',
    bucket,
  ].join(':');
}

function getProgressGapMeters(candidate, observation) {
  if (!candidate || !observation) return Infinity;
  if (candidate.shapeId && observation.shapeId && candidate.shapeId !== observation.shapeId) {
    return Infinity;
  }

  const candidateMin = Number(candidate.progressMinMeters);
  const candidateMax = Number(candidate.progressMaxMeters);
  const observationMin = Number(observation.progressMinMeters);
  const observationMax = Number(observation.progressMaxMeters);

  if (![candidateMin, candidateMax, observationMin, observationMax].every(Number.isFinite)) {
    return Infinity;
  }
  if (observationMin > candidateMax) return observationMin - candidateMax;
  if (candidateMin > observationMax) return candidateMin - observationMax;
  return 0;
}

function findMatchingCandidate(candidates, observation, { maxGapMeters = 350 } = {}) {
  let best = null;
  for (const [key, candidate] of candidates || []) {
    if (candidate.routeId !== observation?.routeId) continue;
    const gapMeters = getProgressGapMeters(candidate, observation);
    if (gapMeters > maxGapMeters) continue;
    if (!best || gapMeters < best.gapMeters) best = { key, candidate, gapMeters };
  }
  return best;
}

function normalizeObservation(observation = {}) {
  const signature = observation.signature || makeCandidateObservationSignature(observation);
  return {
    routeId: observation.routeId || null,
    shapeId: observation.shapeId || null,
    progressMinMeters: Number(observation.progressMinMeters),
    progressMaxMeters: Number(observation.progressMaxMeters),
    timestampMs: Number(observation.timestampMs),
    vehicleId: observation.vehicleId || null,
    tripId: observation.tripId || null,
    tripShapeId: observation.tripShapeId || null,
    signature,
    entryObservation: observation.entryObservation || null,
    exitObservation: observation.exitObservation || null,
    evidencePoints: Array.isArray(observation.evidencePoints) ? observation.evidencePoints : [],
    lastCoordinate: observation.lastCoordinate || null,
  };
}

function mergeObservation(previous, next) {
  const previousEvidencePoints = previous.evidencePoints || [];
  const nextEvidencePoints = next.evidencePoints || [];
  const evidencePoints = nextEvidencePoints.length >= previousEvidencePoints.length
    ? nextEvidencePoints
    : [...previousEvidencePoints, ...nextEvidencePoints].slice(-10);

  return {
    ...previous,
    ...next,
    progressMinMeters: Math.min(previous.progressMinMeters, next.progressMinMeters),
    progressMaxMeters: Math.max(previous.progressMaxMeters, next.progressMaxMeters),
    timestampMs: Math.max(previous.timestampMs, next.timestampMs),
    entryObservation: previous.entryObservation || next.entryObservation,
    evidencePoints,
    lastCoordinate: next.lastCoordinate || previous.lastCoordinate || null,
  };
}

function isValidCandidateObservation(observation) {
  return Boolean(
    observation?.routeId &&
    observation?.shapeId &&
    Number.isFinite(observation.progressMinMeters) &&
    Number.isFinite(observation.progressMaxMeters) &&
    observation.progressMaxMeters >= observation.progressMinMeters &&
    Number.isFinite(observation.timestampMs)
  );
}

function upsertCandidateObservation(candidates, observation, { maxGapMeters = 350 } = {}) {
  const normalized = normalizeObservation(observation);
  if (!isValidCandidateObservation(normalized)) return null;

  const match = findMatchingCandidate(candidates, normalized, { maxGapMeters });
  const key = match?.key || createCandidateKey(normalized, maxGapMeters);
  const candidate = match?.candidate || {
    routeId: normalized.routeId,
    shapeId: normalized.shapeId,
    progressMinMeters: normalized.progressMinMeters,
    progressMaxMeters: normalized.progressMaxMeters,
    firstSeenAt: normalized.timestampMs,
    lastSeenAt: normalized.timestampMs,
    observations: [],
    evidencePoints: [],
  };

  const existingIndex = candidate.observations.findIndex((item) => item.signature === normalized.signature);
  if (existingIndex >= 0) {
    candidate.observations[existingIndex] = mergeObservation(
      candidate.observations[existingIndex],
      normalized
    );
  } else {
    candidate.observations.push(normalized);
  }

  candidate.progressMinMeters = Math.min(...candidate.observations.map((item) => item.progressMinMeters));
  candidate.progressMaxMeters = Math.max(...candidate.observations.map((item) => item.progressMaxMeters));
  candidate.firstSeenAt = Math.min(...candidate.observations.map((item) => item.timestampMs));
  candidate.lastSeenAt = Math.max(...candidate.observations.map((item) => item.timestampMs));
  candidate.evidencePoints = candidate.observations.flatMap((item) => item.evidencePoints || []);
  candidates.set(key, candidate);
  return candidate;
}

function pruneExpiredCandidates(candidates, { nowMs, windowMs, routeId = null } = {}) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(windowMs) || windowMs <= 0) return;
  const cutoff = nowMs - windowMs;
  for (const [key, candidate] of candidates || []) {
    if (routeId && candidate.routeId !== routeId) continue;
    candidate.observations = (candidate.observations || [])
      .map((observation) => ({
        ...observation,
        evidencePoints: (observation.evidencePoints || [])
          .filter((point) => Number(point.timestampMs) >= cutoff),
      }))
      .filter((observation) =>
        isValidCandidateObservation(observation) &&
        Number(observation.timestampMs) >= cutoff
      );
    candidate.evidencePoints = candidate.observations.flatMap((observation) => observation.evidencePoints || []);

    if (candidate.observations.length === 0) {
      candidates.delete(key);
      continue;
    }

    candidate.progressMinMeters = Math.min(...candidate.observations.map((item) => item.progressMinMeters));
    candidate.progressMaxMeters = Math.max(...candidate.observations.map((item) => item.progressMaxMeters));
    candidate.firstSeenAt = Math.min(...candidate.observations.map((item) => item.timestampMs));
    candidate.lastSeenAt = Math.max(...candidate.observations.map((item) => item.timestampMs));
  }
}

function hasEnoughUniqueEvidence(candidate, { minUniqueSignatures = 2 } = {}) {
  const signatures = new Set(
    (candidate?.observations || [])
      .map((observation) => observation.signature || makeCandidateObservationSignature(observation))
      .filter(Boolean)
  );
  return signatures.size >= minUniqueSignatures;
}

module.exports = {
  createCandidateKey,
  makeCandidateObservationSignature,
  findMatchingCandidate,
  upsertCandidateObservation,
  pruneExpiredCandidates,
  hasEnoughUniqueEvidence,
  getProgressGapMeters,
  isValidCandidateObservation,
};
