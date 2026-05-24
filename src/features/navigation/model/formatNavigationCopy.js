const getLocationCode = (location) => (
  location?.stopCode ||
  location?.stopId ||
  location?.code ||
  null
);

export const formatNavigationLocationLabel = (location, fallback = 'Destination') => {
  if (!location) return fallback;

  const name = location.name || fallback;
  const code = getLocationCode(location);
  return code ? `${name} (#${code})` : name;
};

export const formatBoardingArrivalDetail = (nextTransitProximity, nowMs = Date.now()) => {
  if (!nextTransitProximity) return null;

  if (!nextTransitProximity.estimatedArrival) {
    return nextTransitProximity.hasArrived ? 'Bus is here' : null;
  }

  const arrivalTime = new Date(nextTransitProximity.estimatedArrival).getTime();
  if (!Number.isFinite(arrivalTime)) {
    return nextTransitProximity.hasArrived ? 'Bus is here' : null;
  }

  if (nextTransitProximity.hasArrived && arrivalTime <= nowMs) return 'Bus is here';

  const diffMinutes = Math.max(0, Math.ceil((arrivalTime - nowMs) / 60000));
  return diffMinutes <= 0 ? 'Bus now' : `Bus in ${diffMinutes} min`;
};
