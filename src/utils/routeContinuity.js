const MAX_SAME_BUS_GAP_SECONDS = 2 * 60;
const MAX_ROUTE_8_TURNAROUND_GAP_SECONDS = 20 * 60;
const MAX_STAY_ON_BUS_WALK_SECONDS = 60;
const MAX_STAY_ON_BUS_WALK_METERS = 35;
const ROUTE_8_SOUTH_TO_NORTH_TURNAROUND_STOP_IDS = new Set(['725']);

const DIRECTION_WORDS = ['NORTH', 'SOUTH', 'EAST', 'WEST', 'NB', 'SB', 'EB', 'WB', 'N', 'S', 'E', 'W'];
const DIRECTION_WORD_PATTERN = '(NORTH|SOUTH|EAST|WEST|NB|SB|EB|WB|N|S|E|W)';

const isNumber = (value) => Number.isFinite(Number(value));

export const isTransitRideLeg = (leg) => (
  leg?.isOnDemand ||
  ['BUS', 'TRANSIT', 'RAIL', 'SUBWAY', 'TRAM', 'FERRY'].includes(String(leg?.mode || '').toUpperCase())
);

export const getTransitRideLegsWithIndexes = (legs = []) => legs
  .map((leg, index) => ({ leg, index }))
  .filter(({ leg }) => isTransitRideLeg(leg));

const normalizeRouteText = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/^ROUTE\s+/, '')
  .replace(/\s+/g, ' ');

export const getRouteDisplayName = (leg) => (
  leg?.route?.shortName ||
  leg?.route?.longName ||
  leg?.route?.id ||
  leg?.zoneName ||
  'Bus'
);

const getRouteIdentity = (leg) => {
  const routeLabel = normalizeRouteText(getRouteDisplayName(leg));
  const headsign = normalizeRouteText(leg?.headsign || leg?.tripHeadsign || '');
  const combined = normalizeRouteText(`${routeLabel} ${headsign}`);
  const compactRoute = routeLabel.replace(/[^A-Z0-9]/g, '');
  const compactWithoutDirection = compactRoute.replace(new RegExp(`${DIRECTION_WORD_PATTERN}$`), '');
  const routeDirectionMatch = compactRoute.match(new RegExp(`^(\\d+)${DIRECTION_WORD_PATTERN}$`));
  const routeMatch =
    compactWithoutDirection.match(/^(\d+)([AB])$/) ||
    routeDirectionMatch ||
    compactRoute.match(/^(\d+)$/);
  const family = routeMatch?.[1] || compactRoute;
  const branch = compactWithoutDirection.match(/^(\d+)([AB])$/)?.[2] || null;
  const direction = DIRECTION_WORDS.find((word) => new RegExp(`\\b${word}\\b`).test(combined)) || null;

  return {
    family,
    displayName: routeLabel || 'BUS',
    compactRoute,
    branch,
    direction,
    hasBranchOrDirection: Boolean(branch || direction),
  };
};

const hasMeaningfulWalkBetween = (legs, previousIndex, nextIndex) => legs
  .slice(previousIndex + 1, nextIndex)
  .some((leg) => {
    if (String(leg?.mode || '').toUpperCase() !== 'WALK') return false;
    const duration = isNumber(leg.duration) ? Number(leg.duration) : 0;
    const distance = isNumber(leg.distance) ? Number(leg.distance) : 0;
    return duration > MAX_STAY_ON_BUS_WALK_SECONDS || distance > MAX_STAY_ON_BUS_WALK_METERS;
  });

const getStopId = (stop) => String(stop?.stopId || stop?.id || stop?.code || '').trim();

const getStopName = (stop) => normalizeRouteText(stop?.name || stop?.stopName || '');

const getLegEndpointStopId = (leg, endpoint) => getStopId(endpoint === 'start' ? leg?.from : leg?.to);

const isBarrieSouthGoStop = (stop) => (
  ROUTE_8_SOUTH_TO_NORTH_TURNAROUND_STOP_IDS.has(getStopId(stop)) ||
  getStopName(stop).includes('BARRIE SOUTH GO')
);

const getBlockId = (leg) => String(
  leg?.blockId ||
  leg?.block_id ||
  leg?.trip?.blockId ||
  leg?.trip?.block_id ||
  ''
).trim();

const getDirectionId = (leg) => {
  const rawDirectionId = leg?.directionId ?? leg?.direction_id ?? leg?.trip?.directionId ?? leg?.trip?.direction_id;
  if (rawDirectionId === null || rawDirectionId === undefined || rawDirectionId === '') return null;
  const numericDirectionId = Number(rawDirectionId);
  return Number.isFinite(numericDirectionId) ? numericDirectionId : String(rawDirectionId);
};

const endpointsMatch = (previousLeg, nextLeg) => {
  const previousStopId = getLegEndpointStopId(previousLeg, 'end');
  const nextStopId = getLegEndpointStopId(nextLeg, 'start');
  return Boolean(previousStopId && nextStopId && previousStopId === nextStopId);
};

const hasMatchingBlock = (previousLeg, nextLeg) => {
  const previousBlockId = getBlockId(previousLeg);
  const nextBlockId = getBlockId(nextLeg);
  return Boolean(previousBlockId && nextBlockId && previousBlockId === nextBlockId);
};

const isSouthboundToNorthboundRoute8Turnaround = (previousLeg, nextLeg, previousDirectionId, nextDirectionId) => (
  previousDirectionId === 1 &&
  nextDirectionId === 0 &&
  isBarrieSouthGoStop(previousLeg?.to) &&
  isBarrieSouthGoStop(nextLeg?.from)
);

export const isSameBusContinuation = (previousEntry, nextEntry, legs = []) => {
  const previousLeg = previousEntry?.leg || previousEntry;
  const nextLeg = nextEntry?.leg || nextEntry;
  if (!isTransitRideLeg(previousLeg) || !isTransitRideLeg(nextLeg)) return false;
  if (previousLeg?.isOnDemand || nextLeg?.isOnDemand) return false;

  const previousIndex = previousEntry?.index;
  const nextIndex = nextEntry?.index;
  if (
    isNumber(previousIndex) &&
    isNumber(nextIndex) &&
    hasMeaningfulWalkBetween(legs, Number(previousIndex), Number(nextIndex))
  ) {
    return false;
  }

  const gapSeconds = isNumber(previousLeg?.endTime) && isNumber(nextLeg?.startTime)
    ? Math.max(0, Math.round((Number(nextLeg.startTime) - Number(previousLeg.endTime)) / 1000))
    : null;

  const previousRoute = getRouteIdentity(previousLeg);
  const nextRoute = getRouteIdentity(nextLeg);
  if (!previousRoute.family || previousRoute.family !== nextRoute.family) return false;
  if (!previousRoute.hasBranchOrDirection && !nextRoute.hasBranchOrDirection) return false;

  if (!hasMatchingBlock(previousLeg, nextLeg)) return false;
  if (!endpointsMatch(previousLeg, nextLeg)) return false;

  const previousDirectionId = getDirectionId(previousLeg);
  const nextDirectionId = getDirectionId(nextLeg);
  const hasDirectionIdChange = (
    previousDirectionId !== null &&
    nextDirectionId !== null &&
    previousDirectionId !== nextDirectionId
  );

  const isRouteChangeOrDirectionChange = (
    previousRoute.compactRoute !== nextRoute.compactRoute ||
    Boolean(previousRoute.direction && nextRoute.direction && previousRoute.direction !== nextRoute.direction) ||
    hasDirectionIdChange
  );

  if (!isRouteChangeOrDirectionChange) return false;

  const isRoute8SouthToNorthTurnaround = (
    previousRoute.family === '8' &&
    hasDirectionIdChange &&
    previousDirectionId === 1 &&
    nextDirectionId === 0 &&
    isSouthboundToNorthboundRoute8Turnaround(
      previousLeg,
      nextLeg,
      previousDirectionId,
      nextDirectionId
    )
  );

  if (gapSeconds !== null) {
    const maxGapSeconds = isRoute8SouthToNorthTurnaround
      ? MAX_ROUTE_8_TURNAROUND_GAP_SECONDS
      : MAX_SAME_BUS_GAP_SECONDS;
    if (gapSeconds > maxGapSeconds) return false;
  }

  if (
    previousRoute.family === '8' &&
    hasDirectionIdChange &&
    previousDirectionId === 1 &&
    nextDirectionId === 0
  ) {
    return isRoute8SouthToNorthTurnaround;
  }

  return true;
};

export const getSameBusContinuationPairs = (legs = []) => {
  const rideLegs = getTransitRideLegsWithIndexes(legs);
  const pairs = [];

  for (let index = 1; index < rideLegs.length; index += 1) {
    const previousEntry = rideLegs[index - 1];
    const nextEntry = rideLegs[index];
    if (isSameBusContinuation(previousEntry, nextEntry, legs)) {
      pairs.push({
        previousIndex: previousEntry.index,
        nextIndex: nextEntry.index,
        previousRoute: getRouteDisplayName(previousEntry.leg),
        nextRoute: getRouteDisplayName(nextEntry.leg),
      });
    }
  }

  return pairs;
};

export const getEffectiveTransferCount = (itineraryOrLegs = {}, fallbackTransfers = null) => {
  const legs = Array.isArray(itineraryOrLegs) ? itineraryOrLegs : itineraryOrLegs?.legs;
  const suppliedTransfers = fallbackTransfers ?? (Array.isArray(itineraryOrLegs) ? null : itineraryOrLegs?.transfers);
  const rideLegs = getTransitRideLegsWithIndexes(legs || []);
  const baseTransfers = isNumber(suppliedTransfers)
    ? Math.max(0, Number(suppliedTransfers))
    : Math.max(0, rideLegs.length - 1);

  return Math.max(0, baseTransfers - getSameBusContinuationPairs(legs || []).length);
};
