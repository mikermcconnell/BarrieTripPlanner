import {
  getTransitRideLegsWithIndexes,
  isSameBusContinuation,
} from './routeContinuity';
import { deriveAffectedStopDetailsForDetour } from '../hooks/useAffectedStops';
import { annotateItinerariesWithDetours } from './tripDetourImpacts';
import { annotateItinerariesWithStopClosures } from './stopClosureTripWarnings';
import { getActiveOfficialServiceImpacts } from './officialServiceImpacts';

const BLOCKED_DETOUR_SCOPES = new Set([
  'boarding_stop',
  'exit_stop',
  'boarding_and_exit_stops',
]);

const BLOCKED_STOP_ROLES = new Set(['boarding', 'alighting']);

const hasBlockedStopRole = (items = []) => items.some((item) => (
  (item?.roles || []).some((role) => BLOCKED_STOP_ROLES.has(role))
));

const getTransferWalkSeconds = (legs, fromIndex, toIndex) => (
  legs
    .slice(fromIndex + 1, toIndex)
    .filter((leg) => String(leg?.mode || '').toUpperCase() === 'WALK')
    .reduce((total, leg) => total + (Number(leg?.duration) || 0), 0)
);

const getFiniteTime = (value) => {
  if (value == null || value === '') return null;
  const time = Number(value);
  return Number.isFinite(time) ? time : null;
};

const hasImpossibleTransfer = (itinerary) => {
  const legs = itinerary?.legs || [];
  const transitLegs = getTransitRideLegsWithIndexes(legs);

  for (let index = 1; index < transitLegs.length; index += 1) {
    const previous = transitLegs[index - 1];
    const next = transitLegs[index];
    if (isSameBusContinuation(previous, next, legs)) continue;

    const previousEnd = getFiniteTime(previous.leg?.endTime);
    const nextStart = getFiniteTime(next.leg?.startTime);
    if (previousEnd == null || nextStart == null) continue;

    const availableSeconds = Math.round((nextStart - previousEnd) / 1000);
    if (getTransferWalkSeconds(legs, previous.index, next.index) > availableSeconds) {
      return true;
    }
  }

  return false;
};

export const getItineraryNavigationBlock = (itinerary) => {
  if (!itinerary || !Array.isArray(itinerary.legs) || itinerary.legs.length === 0) {
    return {
      code: 'NO_ROUTE_DATA',
      title: 'Navigation unavailable',
      message: 'This trip does not have enough route data to start navigation.',
    };
  }

  if (itinerary.hasMissedDeparture) {
    return {
      code: 'MISSED_DEPARTURE',
      title: 'This bus has likely departed',
      message: 'Re-plan the trip to find the next available bus.',
    };
  }

  if (itinerary.hasMissedTransfer) {
    return {
      code: 'MISSED_TRANSFER',
      title: 'This transfer is no longer possible',
      message: 'Re-plan the trip to find a connection you can make.',
    };
  }

  if (hasImpossibleTransfer(itinerary)) {
    return {
      code: 'IMPOSSIBLE_TRANSFER',
      title: 'Not enough time to transfer',
      message: 'The updated walking time does not leave enough time to catch the next bus.',
    };
  }

  const blockedDetour = (itinerary.detourImpacts || []).find((impact) => (
    impact?.severity === 'stop_affected' &&
    BLOCKED_DETOUR_SCOPES.has(impact?.impactScope)
  ));
  if (blockedDetour) {
    return {
      code: 'DETOUR_STOP_UNAVAILABLE',
      title: 'A required stop may not be served',
      message: blockedDetour.guidance || blockedDetour.message || 'Choose another trip or re-plan before travelling.',
    };
  }

  const closureNotices = itinerary.stopClosureNotices;
  if (closureNotices?.hasTripImpact && hasBlockedStopRole(closureNotices.impactedStops || [])) {
    return {
      code: 'STOP_CLOSED',
      title: 'A required stop is closed',
      message: 'Choose another trip or re-plan using an open boarding and destination stop.',
    };
  }

  return null;
};

export const canStartItineraryNavigation = (itinerary) => (
  getItineraryNavigationBlock(itinerary) === null
);

export const annotateItineraryWithLiveService = ({
  itinerary,
  activeDetours = {},
  officialServiceImpacts = [],
  transitNewsImpacts = [],
  stops = [],
  routeStopsMapping = {},
  routeStopSequencesMapping = {},
}) => {
  if (!itinerary) return null;

  const detourStopDetailsByRouteId = Object.fromEntries(
    Object.entries(activeDetours || {}).map(([routeId, detour]) => [
      routeId,
      deriveAffectedStopDetailsForDetour({
        routeId,
        segments: detour?.segments?.length
          ? detour.segments
          : [{
              shapeId: detour?.shapeId ?? null,
              entryPoint: detour?.entryPoint ?? null,
              exitPoint: detour?.exitPoint ?? null,
              skippedSegmentPolyline: detour?.skippedSegmentPolyline ?? null,
              inferredDetourPolyline: detour?.inferredDetourPolyline ?? null,
            }],
        stops,
        routeStopsMapping,
        routeStopSequencesMapping,
      }),
    ])
  );
  const activeOfficialImpacts = getActiveOfficialServiceImpacts(officialServiceImpacts)
    .filter((impact) => impact.type === 'baseline_detour');
  const [detourAwareItinerary] = annotateItinerariesWithDetours(
    [itinerary],
    activeDetours,
    detourStopDetailsByRouteId,
    activeOfficialImpacts
  );
  return annotateItinerariesWithStopClosures(
    [detourAwareItinerary],
    transitNewsImpacts
  )[0];
};

export default getItineraryNavigationBlock;
