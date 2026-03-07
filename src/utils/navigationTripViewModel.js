const isTransitMode = (leg) => leg?.mode === 'BUS' || leg?.mode === 'TRANSIT';

const formatStopLabel = (stop) => {
  const stopName = stop?.name || '';
  const stopCode = stop?.stopCode;
  if (!stopName) {
    return stopCode ? `#${stopCode}` : '';
  }
  return stopCode ? `${stopName} (#${stopCode})` : stopName;
};

const formatLegTime = (value) => {
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export const findNextTransitLeg = (legs, currentLegIndex) => {
  for (let i = currentLegIndex + 1; i < legs.length; i += 1) {
    if (isTransitMode(legs[i])) {
      return legs[i];
    }
  }
  return null;
};

export const buildNavigationTripViewModel = ({
  itinerary,
  currentLegIndex,
  currentLeg,
  distanceToDestination,
}) => {
  const legs = itinerary?.legs || [];
  const isWalkingLeg = currentLeg?.mode === 'WALK';
  const isTransitLeg = isTransitMode(currentLeg);
  const isOnDemandLeg = currentLeg?.isOnDemand === true;
  const currentTransitLeg = isTransitLeg ? currentLeg : null;
  const nextTransitLeg = isWalkingLeg ? findNextTransitLeg(legs, currentLegIndex) : null;
  const isLastWalkingLeg = isWalkingLeg && !nextTransitLeg;

  let nextLegPreviewText = null;
  if (isWalkingLeg && nextTransitLeg) {
    const routeName = nextTransitLeg.route?.shortName || nextTransitLeg.routeShortName || '';
    const stopLabel = formatStopLabel(nextTransitLeg.from);
    const timeLabel = formatLegTime(nextTransitLeg.startTime);
    nextLegPreviewText = [
      `Then board Route ${routeName}`,
      stopLabel && `at ${stopLabel}`,
      timeLabel && `at ${timeLabel}`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  let transitPeekAheadText = null;
  if (isTransitLeg) {
    const nextLeg = legs[currentLegIndex + 1];
    if (nextLeg?.mode === 'WALK') {
      const durationMin = nextLeg.duration ? Math.ceil(nextLeg.duration / 60) : null;
      const durationLabel = durationMin ? `${durationMin} min` : '';
      const legAfterWalk = legs[currentLegIndex + 2];
      if (isTransitMode(legAfterWalk)) {
        const routeName = legAfterWalk.route?.shortName || legAfterWalk.routeShortName || '';
        const stopLabel = formatStopLabel(legAfterWalk.from);
        transitPeekAheadText = [
          `Next: Walk${durationLabel ? ` ${durationLabel}` : ''}`,
          stopLabel && `to ${stopLabel}`,
          routeName && `for Route ${routeName}`,
        ]
          .filter(Boolean)
          .join(' ');
      } else {
        const destinationName = nextLeg.to?.name || 'your destination';
        transitPeekAheadText = `Next: Walk${durationLabel ? ` ${durationLabel}` : ''} to ${destinationName}`;
      }
    }
  }

  const lastLeg = legs[legs.length - 1];
  const finalDestination = lastLeg?.to?.name || 'Destination';

  let totalRemainingDistance = 0;
  if (typeof distanceToDestination === 'number') {
    totalRemainingDistance += distanceToDestination;
  }
  for (let i = currentLegIndex + 1; i < legs.length; i += 1) {
    totalRemainingDistance += legs[i].distance || 0;
  }

  return {
    currentTransitLeg,
    finalDestination,
    isLastWalkingLeg,
    isOnDemandLeg,
    isTransitLeg,
    isWalkingLeg,
    nextLegPreviewText,
    nextTransitLeg,
    totalRemainingDistance,
    transitPeekAheadText,
  };
};
