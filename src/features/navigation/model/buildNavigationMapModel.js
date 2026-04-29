import { buildWalkingLandmarkMarkers } from '../geometry/buildWalkingLandmarkMarkers';
import { formatNavigationLocationLabel } from './formatNavigationCopy';
import { buildTransitStopProgress } from '../../../utils/transitStopUtils';

const hasValidCoordinates = (location) => (
  Number.isFinite(location?.lat) &&
  Number.isFinite(location?.lon)
);

const buildTransitStopMarkers = (currentTransitLeg, liveStopsRemaining = null) => {
  if (!currentTransitLeg) return [];

  const progress = buildTransitStopProgress(currentTransitLeg, liveStopsRemaining);
  const markers = [];
  const nextStop = progress.nextStop;
  const exitStop = progress.alightingStop;

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
    isUserOnBoard ? liveStopsRemaining : null
  );

  return {
    mapMarkers,
    busStopMarker,
    walkingLandmarkMarkers,
    transitStopMarkers,
  };
};

export default buildNavigationMapModel;

