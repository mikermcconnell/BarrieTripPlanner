import { ROUTING_CONFIG } from '../config/constants';
import {
  getEffectiveTransferCount,
  getTransitRideLegsWithIndexes,
  isSameBusContinuation,
} from './routeContinuity';

const DEFAULT_TRANSFER_PENALTY_SECONDS = 7 * 60;
const DEFAULT_RISKY_TRANSFER_THRESHOLD_SECONDS = 3 * 60;
const DEFAULT_RISKY_TRANSFER_PENALTY_SECONDS = 5 * 60;
const DEFAULT_LONG_TRANSFER_WALK_THRESHOLD_METERS = 250;
const DEFAULT_SIMILAR_START_THRESHOLD_SECONDS = 5 * 60;
const DEFAULT_SIMILAR_END_THRESHOLD_SECONDS = 8 * 60;
const DEFAULT_SIMILAR_DURATION_THRESHOLD_SECONDS = 8 * 60;
const DEFAULT_SIMILAR_WALK_THRESHOLD_METERS = 250;

const isNumber = (value) => Number.isFinite(Number(value));

const toSeconds = (milliseconds) => Math.round(Number(milliseconds) / 1000);

const getTimeSeconds = (value) => (isNumber(value) ? toSeconds(Number(value)) : null);

const getTransferCount = (itinerary) => {
  return getEffectiveTransferCount(itinerary);
};

const getDurationSeconds = (itinerary) => {
  if (isNumber(itinerary?.duration)) {
    return Math.max(0, Number(itinerary.duration));
  }

  if (isNumber(itinerary?.startTime) && isNumber(itinerary?.endTime)) {
    return Math.max(0, toSeconds(Number(itinerary.endTime) - Number(itinerary.startTime)));
  }

  return 0;
};

const getEndTimeSeconds = (itinerary, durationSeconds) => {
  if (isNumber(itinerary?.endTime)) {
    return toSeconds(Number(itinerary.endTime));
  }

  if (isNumber(itinerary?.startTime)) {
    return toSeconds(Number(itinerary.startTime)) + durationSeconds;
  }

  return durationSeconds;
};

const getRiskyTransferPenaltySeconds = (legs = [], options) => {
  const transitLegs = getTransitRideLegsWithIndexes(legs);
  if (transitLegs.length < 2) return 0;

  const thresholdSeconds = options.riskyTransferThresholdSeconds;
  const penaltySeconds = options.riskyTransferPenaltySeconds;
  let totalPenalty = 0;

  for (let index = 1; index < transitLegs.length; index += 1) {
    const previousEntry = transitLegs[index - 1];
    const nextEntry = transitLegs[index];
    if (isSameBusContinuation(previousEntry, nextEntry, legs)) continue;

    const previousLeg = previousEntry.leg;
    const nextLeg = nextEntry.leg;
    if (!isNumber(previousLeg?.endTime) || !isNumber(nextLeg?.startTime)) continue;

    const transferWindowSeconds = toSeconds(Number(nextLeg.startTime) - Number(previousLeg.endTime));
    if (transferWindowSeconds > 0 && transferWindowSeconds < thresholdSeconds) {
      totalPenalty += penaltySeconds;
    }
  }

  return totalPenalty;
};

const isBetweenTransitLegs = (legs, index) => {
  const hasTransitBefore = legs.slice(0, index).some((leg) => (
    leg?.mode && !['WALK', 'ON_DEMAND'].includes(String(leg.mode).toUpperCase())
  ));
  const hasTransitAfter = legs.slice(index + 1).some((leg) => (
    leg?.mode && !['WALK', 'ON_DEMAND'].includes(String(leg.mode).toUpperCase())
  ));
  return hasTransitBefore && hasTransitAfter;
};

const getTransferWalkPenaltySeconds = (legs = [], options) => {
  const thresholdMeters = options.longTransferWalkThresholdMeters;
  const walkSpeed = ROUTING_CONFIG.WALK_SPEED || 1.2;

  return legs.reduce((total, leg, index) => {
    if (String(leg?.mode).toUpperCase() !== 'WALK' || !isBetweenTransitLegs(legs, index)) {
      return total;
    }

    const distance = isNumber(leg.distance) ? Number(leg.distance) : 0;
    const excessDistance = Math.max(0, distance - thresholdMeters);
    return total + Math.round(excessDistance / walkSpeed);
  }, 0);
};

export const scoreItineraryForRider = (itinerary, options = {}) => {
  const durationSeconds = getDurationSeconds(itinerary);
  const transfers = getTransferCount(itinerary);
  const scoringOptions = {
    transferPenaltySeconds:
      options.transferPenaltySeconds ??
      ROUTING_CONFIG.RIDER_TRANSFER_PENALTY_SECONDS ??
      DEFAULT_TRANSFER_PENALTY_SECONDS,
    riskyTransferThresholdSeconds:
      options.riskyTransferThresholdSeconds ??
      ROUTING_CONFIG.RISKY_TRANSFER_THRESHOLD_SECONDS ??
      DEFAULT_RISKY_TRANSFER_THRESHOLD_SECONDS,
    riskyTransferPenaltySeconds:
      options.riskyTransferPenaltySeconds ??
      ROUTING_CONFIG.RISKY_TRANSFER_PENALTY_SECONDS ??
      DEFAULT_RISKY_TRANSFER_PENALTY_SECONDS,
    longTransferWalkThresholdMeters:
      options.longTransferWalkThresholdMeters ??
      ROUTING_CONFIG.LONG_TRANSFER_WALK_THRESHOLD_METERS ??
      DEFAULT_LONG_TRANSFER_WALK_THRESHOLD_METERS,
  };

  const transferPenaltySeconds = transfers * scoringOptions.transferPenaltySeconds;
  const riskyTransferPenaltySeconds = getRiskyTransferPenaltySeconds(
    itinerary?.legs || [],
    scoringOptions
  );
  const transferWalkPenaltySeconds = getTransferWalkPenaltySeconds(
    itinerary?.legs || [],
    scoringOptions
  );
  const totalTransferPenaltySeconds =
    transferPenaltySeconds + riskyTransferPenaltySeconds + transferWalkPenaltySeconds;

  return {
    ...itinerary,
    transfers,
    riderCostSeconds: Math.round(durationSeconds + totalTransferPenaltySeconds),
    riderRankingCostSeconds: getEndTimeSeconds(itinerary, durationSeconds) + totalTransferPenaltySeconds,
    transferPenaltySeconds,
    riskyTransferPenaltySeconds,
    transferWalkPenaltySeconds,
    totalTransferPenaltySeconds,
  };
};

export const rankItinerariesForRider = (itineraries = [], options = {}) => (
  itineraries
    .map((itinerary) => scoreItineraryForRider(itinerary, options))
    .sort((a, b) => (
      a.riderRankingCostSeconds - b.riderRankingCostSeconds ||
      a.transfers - b.transfers ||
      (a.endTime || 0) - (b.endTime || 0) ||
      (a.walkDistance || 0) - (b.walkDistance || 0)
    ))
);

const getRouteName = (leg) => (
  leg?.route?.shortName ||
  leg?.routeShortName ||
  leg?.routeId ||
  leg?.route ||
  leg?.zoneName ||
  leg?.mode ||
  'ride'
);

const getSimilarityRouteSignature = (itinerary) => {
  const rideLegs = getTransitRideLegsWithIndexes(itinerary?.legs || []);
  if (rideLegs.length === 0) {
    return itinerary?.isWalkingOnly ? 'WALKING_ONLY' : 'NO_TRANSIT';
  }

  return rideLegs.map(({ leg }) => String(getRouteName(leg)).trim().toUpperCase()).join('>');
};

const areSimilarItineraries = (candidate, kept, options) => {
  if (getSimilarityRouteSignature(candidate) !== getSimilarityRouteSignature(kept)) return false;
  if (getTransferCount(candidate) !== getTransferCount(kept)) return false;
  if (Boolean(candidate?.isWalkingOnly) !== Boolean(kept?.isWalkingOnly)) return false;

  const candidateStart = getTimeSeconds(candidate?.startTime);
  const keptStart = getTimeSeconds(kept?.startTime);
  const candidateEnd = getTimeSeconds(candidate?.endTime);
  const keptEnd = getTimeSeconds(kept?.endTime);

  if (
    candidateStart != null &&
    keptStart != null &&
    Math.abs(candidateStart - keptStart) > options.similarStartThresholdSeconds
  ) {
    return false;
  }

  if (
    candidateEnd != null &&
    keptEnd != null &&
    Math.abs(candidateEnd - keptEnd) > options.similarEndThresholdSeconds
  ) {
    return false;
  }

  if (
    isNumber(candidate?.duration) &&
    isNumber(kept?.duration) &&
    Math.abs(Number(candidate.duration) - Number(kept.duration)) > options.similarDurationThresholdSeconds
  ) {
    return false;
  }

  if (
    isNumber(candidate?.walkDistance) &&
    isNumber(kept?.walkDistance) &&
    Math.abs(Number(candidate.walkDistance) - Number(kept.walkDistance)) > options.similarWalkThresholdMeters
  ) {
    return false;
  }

  return true;
};

export const groupSimilarItinerariesForDisplay = (itineraries = [], options = {}) => {
  const groupingOptions = {
    similarStartThresholdSeconds:
      options.similarStartThresholdSeconds ?? DEFAULT_SIMILAR_START_THRESHOLD_SECONDS,
    similarEndThresholdSeconds:
      options.similarEndThresholdSeconds ?? DEFAULT_SIMILAR_END_THRESHOLD_SECONDS,
    similarDurationThresholdSeconds:
      options.similarDurationThresholdSeconds ?? DEFAULT_SIMILAR_DURATION_THRESHOLD_SECONDS,
    similarWalkThresholdMeters:
      options.similarWalkThresholdMeters ?? DEFAULT_SIMILAR_WALK_THRESHOLD_METERS,
  };
  const visible = [];

  itineraries.forEach((itinerary) => {
    const existingIndex = visible.findIndex((kept) => (
      areSimilarItineraries(itinerary, kept, groupingOptions)
    ));

    if (existingIndex === -1) {
      visible.push(itinerary);
      return;
    }

    const kept = visible[existingIndex];
    visible[existingIndex] = {
      ...kept,
      similarOptionsHidden: (kept.similarOptionsHidden || 0) + 1 + (itinerary.similarOptionsHidden || 0),
      similarOptionIds: [
        ...(kept.similarOptionIds || []),
        itinerary.id,
        ...(itinerary.similarOptionIds || []),
      ].filter(Boolean),
    };
  });

  return visible;
};

const hasRecommendedLabel = (itinerary) => (
  itinerary?.isRecommended === true ||
  (Array.isArray(itinerary?.labels) && itinerary.labels.includes('Recommended'))
);

export const sortRecommendedItineraryFirst = (itineraries = []) => {
  const recommendedIndex = itineraries.findIndex(hasRecommendedLabel);
  if (recommendedIndex <= 0) {
    return itineraries;
  }

  return [
    itineraries[recommendedIndex],
    ...itineraries.slice(0, recommendedIndex),
    ...itineraries.slice(recommendedIndex + 1),
  ];
};
