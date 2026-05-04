const MAX_SAME_BUS_GAP_SECONDS = 2 * 60;
const MAX_STAY_ON_BUS_WALK_SECONDS = 60;
const MAX_STAY_ON_BUS_WALK_METERS = 35;

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

  if (isNumber(previousLeg?.endTime) && isNumber(nextLeg?.startTime)) {
    const gapSeconds = Math.max(0, Math.round((Number(nextLeg.startTime) - Number(previousLeg.endTime)) / 1000));
    if (gapSeconds > MAX_SAME_BUS_GAP_SECONDS) return false;
  }

  const previousRoute = getRouteIdentity(previousLeg);
  const nextRoute = getRouteIdentity(nextLeg);
  if (!previousRoute.family || previousRoute.family !== nextRoute.family) return false;
  if (!previousRoute.hasBranchOrDirection && !nextRoute.hasBranchOrDirection) return false;

  return (
    previousRoute.compactRoute !== nextRoute.compactRoute ||
    Boolean(previousRoute.direction && nextRoute.direction && previousRoute.direction !== nextRoute.direction)
  );
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
