import { ROUTING_CONFIG } from '../config/constants';
import { finiteNumber } from './realtimeTripMatching';
import { getTransitRideLegsWithIndexes, isSameBusContinuation } from './routeContinuity';

// Only for starting a journey, never for evaluating a journey already in progress.
export const getItineraryBoardingIssue = (itinerary, nowMs = Date.now()) => {
  const legs = itinerary?.legs || [];
  const firstRide = getTransitRideLegsWithIndexes(legs).find(({ leg }) => !leg.isOnDemand);
  if (!firstRide) return null;
  const departure = finiteNumber(firstRide.leg.startTime);
  if (departure == null) return 'INVALID_TRIP_TIME';
  const accessSeconds = legs.slice(0, firstRide.index)
    .reduce((sum, leg) => sum + Math.max(0, Number(leg.duration) || 0), 0);
  if (departure < nowMs - 1000) return 'MISSED_DEPARTURE';
  return departure < nowMs + accessSeconds * 1000 - 1000 ? 'CANNOT_REACH_DEPARTURE' : null;
};

export const getRequestedTimeMs = ({ date, time } = {}) => {
  const day = new Date(date ?? time ?? Date.now());
  const clock = new Date(time ?? date ?? Date.now());
  // Preserve the second occurrence of a repeated DST hour when supplied explicitly.
  if (day.getFullYear() === clock.getFullYear() && day.getMonth() === clock.getMonth()
    && day.getDate() === clock.getDate()) return clock.getTime();
  day.setHours(clock.getHours(), clock.getMinutes(), clock.getSeconds(), clock.getMilliseconds());
  return day.getTime();
};

export const withTripTimeConstraints = (itinerary, params) => ({
  ...itinerary,
  requestedTimeMs: getRequestedTimeMs(params),
  arriveBy: Boolean(params.arriveBy),
});

export const getItineraryTimeIssue = (itinerary) => {
  const requested = finiteNumber(itinerary?.requestedTimeMs);
  if (requested == null) return null; // Older saved trips have no request bounds.
  const start = finiteNumber(itinerary.startTime);
  const end = finiteNumber(itinerary.endTime);
  if (start == null || end == null) return 'INVALID_TRIP_TIME';
  // GTFS schedules have second precision; do not reject subsecond rounding.
  if (itinerary.arriveBy && end > requested + 1000) return 'ARRIVES_TOO_LATE';
  if (!itinerary.arriveBy && start < requested - 1000) return 'DEPARTS_TOO_EARLY';
  return null;
};

export const hasImpossibleItineraryTransfer = (itinerary) => {
  const legs = itinerary?.legs || [];
  const rides = getTransitRideLegsWithIndexes(legs);
  return rides.some((next, index) => {
    if (index === 0) return false;
    const previous = rides[index - 1];
    if (isSameBusContinuation(previous, next, legs)) return false;
    const end = finiteNumber(previous.leg.endTime);
    const start = finiteNumber(next.leg.startTime);
    if (end == null || start == null) return false;
    const walkSeconds = legs.slice(previous.index + 1, next.index)
      .filter((leg) => String(leg.mode).toUpperCase() === 'WALK')
      .reduce((sum, leg) => sum + (Number(leg.duration) || 0), 0);
    const fixedScheduleTransfer = previous.leg.mode !== 'ON_DEMAND' && next.leg.mode !== 'ON_DEMAND';
    const minimumBuffer = fixedScheduleTransfer ? (ROUTING_CONFIG.MIN_TRANSFER_TIME || 0) : 0;
    return start - end < (walkSeconds + minimumBuffer) * 1000;
  });
};

export const isItineraryFeasible = (itinerary) => (
  !getItineraryTimeIssue(itinerary) &&
  !hasImpossibleItineraryTransfer(itinerary) &&
  !itinerary?.hasRealtimeServiceDisruption && !itinerary?.hasMissedDeparture && !itinerary?.hasMissedTransfer &&
  !(itinerary?.legs || []).some((leg) => leg.realtimeUnavailable)
);
