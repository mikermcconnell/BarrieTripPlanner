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
  if (nextTransitProximity.hasArrived) return 'Bus is here';

  if (!nextTransitProximity.estimatedArrival) {
    return null;
  }

  const arrivalTime = new Date(nextTransitProximity.estimatedArrival).getTime();
  if (!Number.isFinite(arrivalTime)) {
    return null;
  }

  const diffMinutes = Math.max(0, Math.floor((arrivalTime - nowMs) / 60000));
  return diffMinutes <= 0 ? 'Bus now' : `Bus in ${diffMinutes} min`;
};

