import { buildWalkingLandmarkMarkers } from '../geometry/buildWalkingLandmarkMarkers';
import { formatNavigationLocationLabel } from './formatNavigationCopy';
import { buildTransitStopProgress } from '../../../utils/transitStopUtils';

const hasValidCoordinates = (location) => (
  Number.isFinite(location?.lat) &&
  Number.isFinite(location?.lon)
);

const buildTransitStopMarkers = (
  currentTransitLeg,
  liveStopsRemaining = null,
  { isUserOnBoard = false } = {}
) => {
  if (!currentTransitLeg) return [];

  const progress = buildTransitStopProgress(currentTransitLeg, liveStopsRemaining);
  const nextStop = progress.nextStop;
  const exitStop = progress.alightingStop;

  if (isUserOnBoard) {
    return progress.stops
      .filter(hasValidCoordinates)
      .map((stop) => {
        const isNext = stop.isNext || stop.id === nextStop?.id;
        const isExit = stop.isAlighting;
        return {
          id: `transit-stop-${stop.id}`,
          latitude: stop.lat,
          longitude: stop.lon,
          type: isExit
            ? 'transit-alight-stop'
            : isNext
            ? 'transit-next-stop'
            : 'transit-intermediate-stop',
          title: formatNavigationLocationLabel(stop, stop.name || 'Transit stop'),
          caption: isExit
            ? (isNext ? 'Get off next' : 'Your stop')
            : isNext
            ? 'Next stop'
            : `Stop ${stop.sequenceNumber}`,
          detail: null,
          showLabel: isNext || isExit,
          isPassed: stop.isPassed,
          isNext,
          sequenceNumber: stop.sequenceNumber,
        };
      });
  }

  const markers = [];

  if (nextStop && hasValidCoordinates(nextStop)) {
    markers.push({
      id: `transit-next-${nextStop.id}`,
      latitude: nextStop.lat,
      longitude: nextStop.lon,
      type: nextStop.type === 'alighting' ? 'transit-alight-stop' : 'transit-next-stop',
      title: formatNavigationLocationLabel(nextStop, nextStop.name || 'Next stop'),
      caption: nextStop.type === 'alighting' ? 'Get off next' : 'Next stop',
      detail: null,
    });
  }

  if (exitStop && exitStop.id !== nextStop?.id && hasValidCoordinates(exitStop)) {
    markers.push({
      id: `transit-exit-${exitStop.id}`,
      latitude: exitStop.lat,
      longitude: exitStop.lon,
      type: 'transit-alight-stop',
      title: formatNavigationLocationLabel(exitStop, exitStop.name || 'Your stop'),
      caption: 'Your stop',
      detail: null,
    });
  }

  return markers;
};

export const buildNavigationMapModel = ({
  itinerary,
  currentLeg,
  currentLegIndex = 0,
  isWalkingLeg = false,
  currentTransitLeg = null,
  nextTransitLeg = null,
  nextTransitProximity = null,
  transitStatus = 'waiting',
  isUserOnBoard = false,
  liveStopsRemaining = null,
}) => {
  if (!itinerary?.legs) {
    return {
      mapMarkers: [],
      busStopMarker: null,
      walkingLandmarkMarkers: [],
      transitStopMarkers: [],
    };
  }

  const mapMarkers = [];
  const legs = itinerary.legs;
  const suppressBaseMarkers = isWalkingLeg && currentLeg?.from && currentLeg?.to;

  if (!suppressBaseMarkers) {
    if (hasValidCoordinates(legs[0]?.from)) {
      mapMarkers.push({
        id: 'origin',
        latitude: legs[0].from.lat,
        longitude: legs[0].from.lon,
        type: 'origin',
        title: 'Start',
      });
    }

    const lastLeg = legs[legs.length - 1];
    if (hasValidCoordinates(lastLeg?.to)) {
      mapMarkers.push({
        id: 'destination',
        latitude: lastLeg.to.lat,
        longitude: lastLeg.to.lon,
        type: 'destination',
        title: 'End',
      });
    }

    if (hasValidCoordinates(currentLeg?.to) && currentLegIndex < legs.length - 1) {
      mapMarkers.push({
        id: 'current-destination',
        latitude: currentLeg.to.lat,
        longitude: currentLeg.to.lon,
        type: 'waypoint',
        title: currentLeg.to.name,
      });
    }
  }

  const busStopMarker = currentTransitLeg?.from && transitStatus === 'waiting' && hasValidCoordinates(currentTransitLeg.from)
    ? {
        id: 'bus-stop',
        latitude: currentTransitLeg.from.lat,
        longitude: currentTransitLeg.from.lon,
        type: 'bus-stop',
        title: currentTransitLeg.from.name,
      }
    : null;

  const walkingLandmarkMarkers = isWalkingLeg
    ? buildWalkingLandmarkMarkers({
        itinerary,
        currentLeg,
        currentLegIndex,
        nextTransitLeg,
        nextTransitProximity,
      })
    : [];

  const transitStopMarkers = buildTransitStopMarkers(
    currentTransitLeg,
    isUserOnBoard ? liveStopsRemaining : null,
    { isUserOnBoard }
  );

  return {
    mapMarkers,
    busStopMarker,
    walkingLandmarkMarkers,
    transitStopMarkers,
  };
};

export default buildNavigationMapModel;
