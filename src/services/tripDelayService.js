/**
 * Trip Delay Service
 * Applies real-time GTFS-RT delays to trip itineraries
 */

import { fetchTripUpdates } from './arrivalService';
import { formatMinutes } from './tripService';
import {
  groupSimilarItinerariesForDisplay,
  rankItinerariesForRider,
} from '../utils/tripItineraryRanking';
import {
  getTransitRideLegsWithIndexes,
  isSameBusContinuation,
} from '../utils/routeContinuity';
import logger from '../utils/logger';

const MISSED_DEPARTURE_LABEL = 'Likely departed';
const MISSED_TRANSFER_LABEL = 'Missed transfer';
const TIGHT_TRANSFER_LABEL = 'Tight transfer';
const DEFAULT_MISSED_DEPARTURE_GRACE_SECONDS = 60;
const DEFAULT_VEHICLE_FRESHNESS_SECONDS = 15 * 60;
const DEFAULT_TIGHT_TRANSFER_BUFFER_SECONDS = 2 * 60;
const DEFAULT_WARN_TRANSFER_BUFFER_SECONDS = 5 * 60;
const MISSED_TRANSFER_RANKING_PENALTY_SECONDS = 24 * 60 * 60;
const TIGHT_TRANSFER_RANKING_PENALTY_SECONDS = 8 * 60;
const WARN_TRANSFER_RANKING_PENALTY_SECONDS = 4 * 60;

const isWalkLeg = (leg) => String(leg?.mode || '').toUpperCase() === 'WALK';

const isTransitLeg = (leg) => (
  !isWalkLeg(leg) &&
  Boolean(leg?.tripId)
);

const getNumericTime = (value, fallback = null) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const getTripUpdateMap = (updates = []) => {
  const tripUpdateMap = new Map();
  if (!Array.isArray(updates)) return tripUpdateMap;

  updates.forEach((entity) => {
    const tripUpdate = entity?.tripUpdate;
    if (tripUpdate?.tripId) {
      tripUpdateMap.set(String(tripUpdate.tripId), tripUpdate);
    }
  });

  return tripUpdateMap;
};

const getBoardingStopSequence = (leg) => getNumericTime(
  leg?.boardingStopSequence,
  getNumericTime(leg?.from?.stopSequence, null)
);

const getStopTimeUpdateForLeg = (leg, tripUpdateMap) => {
  if (!isTransitLeg(leg)) return null;

  const update = tripUpdateMap.get(String(leg.tripId));
  if (!update || !Array.isArray(update.stopTimeUpdates)) return null;

  const boardingStopId = String(leg.from?.stopId || '');
  const boardingStopSequence = getBoardingStopSequence(leg);

  if (boardingStopSequence != null) {
    const sequenceMatch = update.stopTimeUpdates.find((st) => (
      getNumericTime(st?.stopSequence, null) === boardingStopSequence &&
      (!boardingStopId || String(st?.stopId || '') === boardingStopId)
    ));
    if (sequenceMatch) return sequenceMatch;
  }

  if (boardingStopId) {
    const stopIdMatch = update.stopTimeUpdates.find(
      (st) => String(st?.stopId || '') === boardingStopId
    );
    if (stopIdMatch) return stopIdMatch;
  }

  if (boardingStopSequence != null) {
    return update.stopTimeUpdates.find(
      (st) => getNumericTime(st?.stopSequence, null) === boardingStopSequence
    ) || null;
  }

  return null;
};

const getLegDurationSeconds = (leg) => {
  if (Number.isFinite(Number(leg?.duration))) {
    return Math.max(0, Number(leg.duration));
  }

  const startTime = getNumericTime(leg?.startTime);
  const endTime = getNumericTime(leg?.endTime);
  if (startTime != null && endTime != null) {
    return Math.max(0, Math.round((endTime - startTime) / 1000));
  }

  return 0;
};

const getLegDelaySeconds = (leg, tripUpdateMap) => {
  const stopUpdate = getStopTimeUpdateForLeg(leg, tripUpdateMap);
  if (!stopUpdate) return null;

  return stopUpdate?.departure?.delay ?? stopUpdate?.arrival?.delay ?? 0;
};

const applyTransitDelayToLeg = (leg, tripUpdateMap) => {
  if (!isTransitLeg(leg)) {
    return {
      ...leg,
      delaySeconds: 0,
      isRealtime: false,
    };
  }

  const delaySeconds = getLegDelaySeconds(leg, tripUpdateMap);
  if (delaySeconds == null) {
    return {
      ...leg,
      delaySeconds: 0,
      isRealtime: false,
    };
  }

  const scheduledStartTime = getNumericTime(leg.scheduledStartTime, leg.startTime);
  const scheduledEndTime = getNumericTime(leg.scheduledEndTime, leg.endTime);
  const startTime = scheduledStartTime + delaySeconds * 1000;
  const endTime = scheduledEndTime + delaySeconds * 1000;

  return {
    ...leg,
    scheduledStartTime,
    scheduledEndTime,
    delaySeconds,
    isRealtime: true,
    startTime,
    endTime,
    duration: Math.max(0, Math.round((endTime - startTime) / 1000)),
  };
};

const findPreviousTransitLeg = (legs, index) => {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (isTransitLeg(legs[i])) return legs[i];
  }
  return null;
};

const findNextTransitLeg = (legs, index) => {
  for (let i = index + 1; i < legs.length; i += 1) {
    if (isTransitLeg(legs[i])) return legs[i];
  }
  return null;
};

const realignWalkLegs = (legs) => legs.map((leg, index) => {
  if (!isWalkLeg(leg)) return leg;

  const durationSeconds = getLegDurationSeconds(leg);
  const durationMs = durationSeconds * 1000;
  const previousTransit = findPreviousTransitLeg(legs, index);
  const nextTransit = findNextTransitLeg(legs, index);
  let startTime = getNumericTime(leg.startTime, null);
  let endTime = getNumericTime(leg.endTime, null);

  if (previousTransit && getNumericTime(previousTransit.endTime) != null) {
    startTime = previousTransit.endTime;
    endTime = startTime + durationMs;
  } else if (nextTransit && getNumericTime(nextTransit.startTime) != null) {
    endTime = nextTransit.startTime;
    startTime = endTime - durationMs;
  }

  if (startTime == null || endTime == null) return leg;

  return {
    ...leg,
    startTime,
    endTime,
    duration: durationSeconds,
  };
});

const recalculateItinerarySummary = (itinerary, legs) => {
  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const startTime = getNumericTime(firstLeg?.startTime, itinerary.startTime);
  const endTime = getNumericTime(lastLeg?.endTime, itinerary.endTime);
  const scheduledStartTime = getNumericTime(itinerary.scheduledStartTime, itinerary.startTime);
  const scheduledEndTime = getNumericTime(itinerary.scheduledEndTime, itinerary.endTime);
  const transitLegs = legs.filter(isTransitLeg);
  const walkLegs = legs.filter(isWalkLeg);

  const walkTime = walkLegs.reduce((sum, leg) => sum + getLegDurationSeconds(leg), 0);
  const walkDistance = walkLegs.reduce((sum, leg) => sum + (Number(leg.distance) || 0), 0);
  const transitTime = transitLegs.reduce((sum, leg) => sum + getLegDurationSeconds(leg), 0);
  const waitingTime = legs.reduce((sum, leg, index) => {
    if (index === 0) return sum;
    const previousEnd = getNumericTime(legs[index - 1]?.endTime);
    const currentStart = getNumericTime(leg?.startTime);
    if (previousEnd == null || currentStart == null) return sum;
    return sum + Math.max(0, Math.round((currentStart - previousEnd) / 1000));
  }, 0);
  const firstRealtimeTransitLeg = transitLegs.find((leg) => leg.isRealtime);
  const totalDelaySeconds = firstRealtimeTransitLeg?.delaySeconds || 0;
  const arrivalDelaySeconds = scheduledEndTime != null && endTime != null
    ? Math.round((endTime - scheduledEndTime) / 1000)
    : totalDelaySeconds;
  const now = Date.now();
  const departureDate = startTime != null ? new Date(startTime) : null;
  const nowDate = new Date(now);
  const minutesUntilDeparture = startTime != null
    ? Math.max(0, Math.round((startTime - now) / 60000))
    : itinerary.minutesUntilDeparture;
  const isTomorrow = departureDate
    ? (
        departureDate.getDate() !== nowDate.getDate() ||
        departureDate.getMonth() !== nowDate.getMonth() ||
        departureDate.getFullYear() !== nowDate.getFullYear()
      )
    : itinerary.isTomorrow;

  return {
    ...itinerary,
    legs,
    startTime,
    endTime,
    scheduledStartTime,
    scheduledEndTime,
    duration: startTime != null && endTime != null
      ? Math.max(0, Math.round((endTime - startTime) / 1000))
      : itinerary.duration,
    walkTime: Math.round(walkTime),
    walkDistance: Math.round(walkDistance),
    transitTime: Math.round(transitTime),
    waitingTime: Math.round(waitingTime),
    hasRealtimeInfo: transitLegs.some((leg) => leg.isRealtime),
    totalDelaySeconds,
    arrivalDelaySeconds,
    minutesUntilDeparture,
    isTomorrow,
  };
};

const getFirstTransitLeg = (itinerary) => (
  Array.isArray(itinerary?.legs) ? itinerary.legs.find(isTransitLeg) : null
);

const getStopEventTimeMs = (stopUpdate) => {
  const departureTime = getNumericTime(stopUpdate?.departure?.time, null);
  const arrivalTime = getNumericTime(stopUpdate?.arrival?.time, null);
  const eventTimeSeconds = departureTime ?? arrivalTime;

  return eventTimeSeconds == null ? null : eventTimeSeconds * 1000;
};

const getVehicleTimestampMs = (vehicle) => {
  const timestamp = getNumericTime(vehicle?.timestamp, null);
  if (timestamp == null) return null;

  return timestamp > 100000000000 ? timestamp : timestamp * 1000;
};

const isFreshVehicle = (vehicle, nowMs, freshnessSeconds) => {
  const timestampMs = getVehicleTimestampMs(vehicle);
  if (timestampMs == null) return true;

  return Math.abs(nowMs - timestampMs) <= freshnessSeconds * 1000;
};

const getVehicleStopSequence = (vehicle) => getNumericTime(
  vehicle?.currentStopSequence,
  getNumericTime(vehicle?.current_stop_sequence, null)
);

const findVehicleForLeg = (leg, vehicles, nowMs, options = {}) => {
  if (!isTransitLeg(leg) || !Array.isArray(vehicles) || vehicles.length === 0) return null;

  const freshnessSeconds = options.vehicleFreshnessSeconds ?? DEFAULT_VEHICLE_FRESHNESS_SECONDS;
  const matchingVehicles = vehicles
    .filter((vehicle) => String(vehicle?.tripId || '') === String(leg.tripId))
    .filter((vehicle) => isFreshVehicle(vehicle, nowMs, freshnessSeconds))
    .sort((a, b) => (getVehicleTimestampMs(b) || 0) - (getVehicleTimestampMs(a) || 0));

  return matchingVehicles[0] || null;
};

const getMissedDepartureInfo = (itinerary, tripUpdateMap, options = {}) => {
  const firstTransitLeg = getFirstTransitLeg(itinerary);
  if (!firstTransitLeg) return null;

  const nowMs = options.nowMs ?? Date.now();
  const boardingStopSequence = getBoardingStopSequence(firstTransitLeg);
  const vehicle = findVehicleForLeg(firstTransitLeg, options.vehicles, nowMs, options);
  const vehicleStopSequence = getVehicleStopSequence(vehicle);

  if (
    boardingStopSequence != null &&
    vehicleStopSequence != null &&
    vehicleStopSequence > boardingStopSequence
  ) {
    return {
      reason: 'vehicle_passed_stop',
      tripId: firstTransitLeg.tripId,
      routeId: firstTransitLeg.routeId || firstTransitLeg.route?.id || null,
      routeShortName: firstTransitLeg.routeShortName || firstTransitLeg.route?.shortName || null,
      boardingStopId: firstTransitLeg.from?.stopId || null,
      boardingStopName: firstTransitLeg.from?.name || null,
      boardingStopSequence,
      currentStopSequence: vehicleStopSequence,
      checkedAt: nowMs,
    };
  }

  const stopUpdate = getStopTimeUpdateForLeg(firstTransitLeg, tripUpdateMap);
  const eventTimeMs = getStopEventTimeMs(stopUpdate);
  const graceSeconds = options.missedDepartureGraceSeconds ?? DEFAULT_MISSED_DEPARTURE_GRACE_SECONDS;

  if (eventTimeMs != null && nowMs > eventTimeMs + graceSeconds * 1000) {
    return {
      reason: 'departure_time_passed',
      tripId: firstTransitLeg.tripId,
      routeId: firstTransitLeg.routeId || firstTransitLeg.route?.id || null,
      routeShortName: firstTransitLeg.routeShortName || firstTransitLeg.route?.shortName || null,
      boardingStopId: firstTransitLeg.from?.stopId || null,
      boardingStopName: firstTransitLeg.from?.name || null,
      departedAt: eventTimeMs,
      checkedAt: nowMs,
    };
  }

  return null;
};

const markMissedDeparture = (itinerary, tripUpdateMap, options = {}) => {
  const missedDeparture = getMissedDepartureInfo(itinerary, tripUpdateMap, options);
  if (!missedDeparture) {
    return itinerary;
  }

  return {
    ...itinerary,
    hasMissedDeparture: true,
    missedDeparture,
    legs: itinerary.legs.map((leg, index) => {
      if (index !== itinerary.legs.findIndex(isTransitLeg)) return leg;
      return {
        ...leg,
        missedDeparture: true,
        missedDepartureReason: missedDeparture.reason,
      };
    }),
  };
};

const getLegRouteLabel = (leg) => (
  leg?.route?.shortName ||
  leg?.routeShortName ||
  leg?.routeId ||
  leg?.route ||
  leg?.zoneName ||
  'next bus'
);

const getTransferWalkSeconds = (legs, previousLegIndex, nextLegIndex) => (
  legs.slice(previousLegIndex + 1, nextLegIndex).reduce((total, leg) => (
    isWalkLeg(leg) ? total + getLegDurationSeconds(leg) : total
  ), 0)
);

const getTransferLocationName = (previousLeg, nextLeg) => (
  nextLeg?.from?.name ||
  previousLeg?.to?.name ||
  null
);

const compareTransferRiskPriority = (candidate, current) => {
  if (!current) return candidate;
  const priority = { missed: 3, tight: 2, warning: 1 };
  const candidatePriority = priority[candidate.status] || 0;
  const currentPriority = priority[current.status] || 0;

  if (candidatePriority > currentPriority) return candidate;
  if (candidatePriority < currentPriority) return current;

  return candidate.bufferSeconds < current.bufferSeconds ? candidate : current;
};

const getTransferRiskInfo = (itinerary, options = {}) => {
  const legs = itinerary?.legs || [];
  const transitLegs = getTransitRideLegsWithIndexes(legs);
  if (transitLegs.length < 2) return null;

  const tightThresholdSeconds =
    options.tightTransferBufferSeconds ?? DEFAULT_TIGHT_TRANSFER_BUFFER_SECONDS;
  const warnThresholdSeconds =
    options.warnTransferBufferSeconds ?? DEFAULT_WARN_TRANSFER_BUFFER_SECONDS;
  let riskiestTransfer = null;

  for (let index = 1; index < transitLegs.length; index += 1) {
    const previousEntry = transitLegs[index - 1];
    const nextEntry = transitLegs[index];
    if (isSameBusContinuation(previousEntry, nextEntry, legs)) continue;

    const previousLeg = previousEntry.leg;
    const nextLeg = nextEntry.leg;
    const previousEnd = getNumericTime(previousLeg?.endTime, null);
    const nextStart = getNumericTime(nextLeg?.startTime, null);
    if (previousEnd == null || nextStart == null) continue;

    const transferWalkSeconds = getTransferWalkSeconds(legs, previousEntry.index, nextEntry.index);
    const windowSeconds = Math.round((nextStart - previousEnd) / 1000);
    const bufferSeconds = windowSeconds - transferWalkSeconds;
    let status = null;

    if (bufferSeconds < 0) {
      status = 'missed';
    } else if (bufferSeconds <= tightThresholdSeconds) {
      status = 'tight';
    } else if (bufferSeconds <= warnThresholdSeconds) {
      status = 'warning';
    }

    if (!status) continue;

    riskiestTransfer = compareTransferRiskPriority({
      status,
      bufferSeconds,
      windowSeconds,
      transferWalkSeconds,
      fromRoute: getLegRouteLabel(previousLeg),
      toRoute: getLegRouteLabel(nextLeg),
      locationName: getTransferLocationName(previousLeg, nextLeg),
      previousLegIndex: previousEntry.index,
      nextLegIndex: nextEntry.index,
    }, riskiestTransfer);
  }

  return riskiestTransfer;
};

const markTransferRisk = (itinerary, options = {}) => {
  const transferRisk = getTransferRiskInfo(itinerary, options);
  if (!transferRisk) return itinerary;

  return {
    ...itinerary,
    transferRisk,
    hasMissedTransfer: transferRisk.status === 'missed',
    hasTightTransfer: transferRisk.status !== 'missed',
    transferRiskPenaltySeconds:
      transferRisk.status === 'missed'
        ? MISSED_TRANSFER_RANKING_PENALTY_SECONDS
        : transferRisk.status === 'tight'
          ? TIGHT_TRANSFER_RANKING_PENALTY_SECONDS
          : WARN_TRANSFER_RANKING_PENALTY_SECONDS,
  };
};

const withoutRecommendedLabel = (labels) => {
  if (!Array.isArray(labels)) return [];
  return labels.filter((label) => (
    label !== 'Recommended' &&
    label !== MISSED_DEPARTURE_LABEL &&
    label !== MISSED_TRANSFER_LABEL &&
    label !== TIGHT_TRANSFER_LABEL
  ));
};

const isWalkingOnlyItinerary = (itinerary) => (
  itinerary?.isWalkingOnly ||
  (
    Array.isArray(itinerary?.legs) &&
    itinerary.legs.length === 1 &&
    isWalkLeg(itinerary.legs[0])
  )
);

const getLiveRiskPenaltySeconds = (itinerary) => (
  itinerary.transferRiskPenaltySeconds ||
  (itinerary.hasMissedDeparture ? MISSED_TRANSFER_RANKING_PENALTY_SECONDS : 0)
);

const refreshRecommendedLabels = (itineraries) => groupSimilarItinerariesForDisplay(
  rankItinerariesForRider(itineraries)
    .sort((a, b) => (
      Number(Boolean(a.hasMissedDeparture || a.hasMissedTransfer)) -
        Number(Boolean(b.hasMissedDeparture || b.hasMissedTransfer)) ||
      (a.riderRankingCostSeconds + getLiveRiskPenaltySeconds(a)) -
        (b.riderRankingCostSeconds + getLiveRiskPenaltySeconds(b)) ||
      a.transfers - b.transfers ||
      (a.endTime || 0) - (b.endTime || 0) ||
      (a.walkDistance || 0) - (b.walkDistance || 0)
    ))
)
  .map((itinerary, index) => {
    const shouldRecommend =
      index === 0 &&
      !itinerary.hasMissedDeparture &&
      !itinerary.hasMissedTransfer &&
      itinerary.recommendationEligible !== false &&
      !itinerary.isTomorrow &&
      !itinerary.hasLongWait &&
      (!itinerary.hasHighWalk || isWalkingOnlyItinerary(itinerary));
    const labels = withoutRecommendedLabel(itinerary.labels);
    if (itinerary.hasMissedDeparture) {
      labels.unshift(MISSED_DEPARTURE_LABEL);
    }
    if (itinerary.hasMissedTransfer) {
      labels.unshift(MISSED_TRANSFER_LABEL);
    } else if (itinerary.hasTightTransfer) {
      labels.unshift(TIGHT_TRANSFER_LABEL);
    }
    if (shouldRecommend) {
      labels.unshift('Recommended');
    }

    return {
      ...itinerary,
      labels: labels.length > 0 ? labels : null,
      isRecommended: shouldRecommend,
    };
  });

/**
 * Apply real-time delays to a single itinerary
 * @param {Object} itinerary - The itinerary to apply delays to
 * @param {Array} tripUpdates - Pre-fetched trip updates (optional, will fetch if not provided)
 * @returns {Promise<Object>} Itinerary with delay information applied
 */
export const applyDelaysToItinerary = async (itinerary, tripUpdates = null, options = {}) => {
  // Fetch trip updates if not provided
  let updates = tripUpdates;
  if (!updates) {
    try {
      updates = await fetchTripUpdates();
    } catch (error) {
      logger.warn('Could not fetch trip updates for delays:', error);
      // Return itinerary unchanged if we can't get updates
      return itinerary;
    }
  }

  const tripUpdateMap = getTripUpdateMap(updates);

  const delayedLegs = itinerary.legs.map((leg) => applyTransitDelayToLeg(leg, tripUpdateMap));
  const updatedLegs = realignWalkLegs(delayedLegs);

  return markTransferRisk(
    markMissedDeparture(
      recalculateItinerarySummary(itinerary, updatedLegs),
      tripUpdateMap,
      options
    ),
    options
  );
};

/**
 * Apply real-time delays to multiple itineraries
 * Fetches trip updates once and applies to all itineraries
 * @param {Array} itineraries - Array of itineraries to apply delays to
 * @returns {Promise<Array>} Array of itineraries with delay information
 */
export const applyDelaysToItineraries = async (itineraries, options = {}) => {
  if (!itineraries || itineraries.length === 0) {
    return itineraries;
  }

  // Fetch trip updates once for all itineraries
  let tripUpdates = null;
  try {
    tripUpdates = await fetchTripUpdates();
  } catch (error) {
    logger.warn('Could not fetch trip updates:', error);
    // Return itineraries unchanged
    return itineraries;
  }

  // Apply delays to each itinerary, then re-rank because live delays can
  // change which option should surface first.
  const updatedItineraries = await Promise.all(
    itineraries.map((itinerary) => applyDelaysToItinerary(itinerary, tripUpdates, options))
  );

  return refreshRecommendedLabels(updatedItineraries);
};

/**
 * Format delay for display
 * @param {number} delaySeconds - Delay in seconds
 * @returns {Object} Formatted delay info with text and status
 */
export const formatDelay = (delaySeconds) => {
  if (delaySeconds === 0) {
    return {
      text: 'On time',
      status: 'ontime',
      minutes: 0,
    };
  }

  const minutes = Math.round(delaySeconds / 60);

  if (minutes > 0) {
    return {
      text: `+${formatMinutes(minutes)}`,
      status: minutes <= 2 ? 'slight' : minutes <= 5 ? 'moderate' : 'severe',
      minutes,
    };
  } else {
    return {
      text: `${formatMinutes(Math.abs(minutes))} early`,
      status: 'early',
      minutes,
    };
  }
};
