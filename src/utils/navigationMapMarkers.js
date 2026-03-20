const getLocationCode = (location) => (
  location?.stopCode ||
  location?.stopId ||
  location?.code ||
  null
);

const hasValidCoordinates = (location) => (
  Number.isFinite(location?.lat) &&
  Number.isFinite(location?.lon)
);

const sameCoordinates = (first, second) => (
  hasValidCoordinates(first) &&
  hasValidCoordinates(second) &&
  first.lat === second.lat &&
  first.lon === second.lon
);

export const formatNavigationLocationLabel = (location, fallback = 'Destination') => {
  if (!location) return fallback;

  const name = location.name || fallback;
  const code = getLocationCode(location);
  return code ? `${name} (#${code})` : name;
};

export const buildWalkingLandmarkMarkers = ({
  itinerary,
  currentLeg,
  currentLegIndex = 0,
  nextTransitLeg,
}) => {
  if (!currentLeg?.from || !currentLeg?.to) {
    return [];
  }

  const tripOrigin = itinerary?.legs?.[0]?.from;
  const startLocation = currentLegIndex === 0 && hasValidCoordinates(tripOrigin)
    ? tripOrigin
    : currentLeg.from;
  const targetLocation = nextTransitLeg?.from || currentLeg.to;
  const result = [];

  if (hasValidCoordinates(startLocation)) {
    result.push({
      id: currentLegIndex === 0 ? 'walk-search-origin' : `walk-start-${currentLegIndex}`,
      latitude: startLocation.lat,
      longitude: startLocation.lon,
      type: 'walk-start',
      title: formatNavigationLocationLabel(startLocation, 'Start'),
      caption: currentLegIndex === 0 ? 'Started here' : 'Walk starts',
    });
  }

  if (hasValidCoordinates(targetLocation) && !sameCoordinates(startLocation, targetLocation)) {
    const isBoardingStop = Boolean(nextTransitLeg?.from);

    result.push({
      id: isBoardingStop ? `walk-target-stop-${currentLegIndex}` : `walk-target-destination-${currentLegIndex}`,
      latitude: targetLocation.lat,
      longitude: targetLocation.lon,
      type: isBoardingStop ? 'walk-target-stop' : 'walk-target-destination',
      title: formatNavigationLocationLabel(
        targetLocation,
        isBoardingStop ? 'Boarding stop' : 'Destination'
      ),
      caption: isBoardingStop ? 'Board here' : 'Destination',
    });
  }

  return result;
};
