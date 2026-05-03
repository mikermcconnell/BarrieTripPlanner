import {
  formatBoardingArrivalDetail,
  formatNavigationLocationLabel,
} from '../model/formatNavigationCopy';

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

export const buildWalkingLandmarkMarkers = ({
  itinerary,
  currentLeg,
  currentLegIndex = 0,
  nextTransitLeg,
  nextTransitProximity = null,
}) => {
  if (!currentLeg?.from || !currentLeg?.to) {
    return [];
  }

  const tripOrigin = itinerary?.legs?.[0]?.from;
  const previousLeg = itinerary?.legs?.[currentLegIndex - 1];
  const isPostTransitWalk = currentLegIndex > 0 && !nextTransitLeg && previousLeg?.mode !== 'WALK';
  const startLocation = currentLegIndex === 0 && hasValidCoordinates(tripOrigin)
    ? tripOrigin
    : currentLeg.from;
  const targetLocation = nextTransitLeg?.from || currentLeg.to;
  let startCaption = 'Walk starts';
  if (currentLegIndex === 0) {
    startCaption = 'Started here';
  } else if (isPostTransitWalk) {
    startCaption = 'Get off here';
  }
  const result = [];

  if (hasValidCoordinates(startLocation)) {
    result.push({
      id: currentLegIndex === 0 ? 'walk-search-origin' : `walk-start-${currentLegIndex}`,
      latitude: startLocation.lat,
      longitude: startLocation.lon,
      type: 'walk-start',
      title: formatNavigationLocationLabel(startLocation, 'Start'),
      caption: startCaption,
      detail: null,
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
      caption: isBoardingStop ? 'Board here' : 'Walk here',
      detail: isBoardingStop ? formatBoardingArrivalDetail(nextTransitProximity) : null,
    });
  }

  return result;
};

export default buildWalkingLandmarkMarkers;
