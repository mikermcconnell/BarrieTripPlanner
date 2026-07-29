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

const isTransitLeg = (leg) => leg?.mode === 'BUS' || leg?.mode === 'TRANSIT';

const findNextTransitLegIndex = (legs, startIndex) => {
  for (let index = startIndex; index < legs.length; index += 1) {
    if (isTransitLeg(legs[index])) return index;
  }
  return -1;
};

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

  const legs = itinerary?.legs || [];
  const tripOrigin = legs[0]?.from;
  const previousLeg = itinerary?.legs?.[currentLegIndex - 1];
  const isPostTransitWalk = currentLegIndex > 0 && !nextTransitLeg && previousLeg?.mode !== 'WALK';
  const startLocation = currentLegIndex === 0 && hasValidCoordinates(tripOrigin)
    ? tripOrigin
    : currentLeg.from;
  const targetLocation = nextTransitLeg?.from || currentLeg.to;
  let startCaption = 'Walk starts';
  if (currentLegIndex === 0) {
    startCaption = 'Started here';
  } else if (nextTransitLeg && isTransitLeg(previousLeg)) {
    startCaption = 'Transfer here';
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

  for (let index = Math.max(0, currentLegIndex); index < legs.length; index += 1) {
    const transitLeg = legs[index];
    if (!isTransitLeg(transitLeg) || !hasValidCoordinates(transitLeg.to)) continue;

    const hasTransferAhead = findNextTransitLegIndex(legs, index + 1) >= 0;
    const hasFinalWalkAhead = legs.slice(index + 1).some((leg) => leg?.mode === 'WALK');
    if (!hasTransferAhead && !hasFinalWalkAhead) continue;

    const type = hasTransferAhead ? 'walk-transfer-stop' : 'walk-exit-stop';
    const duplicatesExistingMarker = result.some((marker) => (
      marker.latitude === transitLeg.to.lat && marker.longitude === transitLeg.to.lon
    ));
    if (duplicatesExistingMarker) continue;

    result.push({
      id: `${type}-${index}`,
      latitude: transitLeg.to.lat,
      longitude: transitLeg.to.lon,
      type,
      title: formatNavigationLocationLabel(transitLeg.to, 'Transit stop'),
      caption: hasTransferAhead ? 'Transfer here' : 'Get off here',
      detail: null,
    });
  }

  return result;
};

export default buildWalkingLandmarkMarkers;
