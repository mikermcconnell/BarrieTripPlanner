import { COLORS } from '../../../config/theme';
import {
  WALKING_ROUTE_DOT_OUTLINE_COLOR,
  WALKING_ROUTE_DOT_OUTLINE_WIDTH,
  WALKING_ROUTE_DOT_PATTERN,
  WALKING_ROUTE_DOT_STROKE_WIDTH,
} from '../../../config/mapLineStyles';
import {
  decodePolyline,
  extractShapeSegment,
  findClosestPointIndex,
} from '../../../utils/polylineUtils';

const GOOGLE_WALK_BLUE = '#4285F4';

const isTransitLeg = (leg) => leg?.mode === 'BUS' || leg?.mode === 'TRANSIT';

const buildFallbackCoordinates = (leg) => {
  if (!leg?.from || !leg?.to) return [];

  return [
    { latitude: leg.from.lat, longitude: leg.from.lon },
    { latitude: leg.to.lat, longitude: leg.to.lon },
  ];
};

const buildTransitLegCoordinates = (leg, shapes = {}, routeShapeMapping = {}) => {
  if (!isTransitLeg(leg) || !leg?.route?.id || !leg?.from || !leg?.to) {
    return buildFallbackCoordinates(leg);
  }

  const shapeIds = routeShapeMapping[leg.route.id] || [];
  let bestSegment = [];
  let bestLength = 0;

  for (const shapeId of shapeIds) {
    const shapeCoords = shapes[shapeId] || [];
    if (shapeCoords.length === 0) continue;

    const segment = extractShapeSegment(
      shapeCoords,
      leg.from.lat,
      leg.from.lon,
      leg.to.lat,
      leg.to.lon
    );

    if (segment.length > bestLength) {
      bestLength = segment.length;
      bestSegment = segment;
    }
  }

  return bestSegment.length > 0 ? bestSegment : buildFallbackCoordinates(leg);
};

const resolveLegCoordinates = (leg, shapes = {}, routeShapeMapping = {}) => {
  if (leg?.legGeometry?.points) {
    return decodePolyline(leg.legGeometry.points);
  }

  if (isTransitLeg(leg)) {
    return buildTransitLegCoordinates(leg, shapes, routeShapeMapping);
  }

  return buildFallbackCoordinates(leg);
};

const buildLineStyle = ({ leg, index, currentLegIndex }) => {
  const isWalk = leg?.mode === 'WALK';
  const isCurrentLeg = index === currentLegIndex;
  const isCompletedLeg = index < currentLegIndex;
  const isCurrentWalkLeg = isCurrentLeg && isWalk;

  return {
    isCurrentLeg,
    isCurrentWalkLeg,
    color: isCompletedLeg
      ? COLORS.grey400
      : isCurrentWalkLeg
      ? GOOGLE_WALK_BLUE
      : isWalk
      ? COLORS.grey500
      : leg?.isOnDemand
      ? (leg.zoneColor || COLORS.primary)
      : (leg?.route?.color || COLORS.primary),
    width: isCurrentWalkLeg ? 6 : isWalk ? WALKING_ROUTE_DOT_STROKE_WIDTH : isCurrentLeg ? 7 : 4,
    dashPattern: isCurrentWalkLeg ? null : isWalk ? WALKING_ROUTE_DOT_PATTERN : leg?.isOnDemand ? [8, 6] : null,
    opacity: isCompletedLeg ? 0.28 : isCurrentLeg ? 1 : 0.62,
    outlineWidth: isCurrentWalkLeg ? 4 : isWalk ? WALKING_ROUTE_DOT_OUTLINE_WIDTH : 0,
    outlineColor: isCurrentWalkLeg ? COLORS.white : isWalk ? WALKING_ROUTE_DOT_OUTLINE_COLOR : undefined,
  };
};

export const buildNavigationRoutePolylines = ({
  itinerary,
  currentLegIndex = 0,
  userLocation = null,
  shapes = {},
  routeShapeMapping = {},
}) => {
  if (!itinerary?.legs) return [];

  const result = [];

  itinerary.legs.forEach((leg, index) => {
    const coordinates = resolveLegCoordinates(leg, shapes, routeShapeMapping);
    const style = buildLineStyle({ leg, index, currentLegIndex });

    if (style.isCurrentLeg && userLocation && coordinates.length > 1) {
      const splitIdx = findClosestPointIndex(
        coordinates,
        userLocation.latitude,
        userLocation.longitude
      );

      if (splitIdx > 0 && splitIdx < coordinates.length - 1) {
        result.push({
          id: `leg-${index}-completed`,
          coordinates: coordinates.slice(0, splitIdx + 1),
          color: style.isCurrentWalkLeg ? '#9BBBF9' : '#9E9E9E',
          width: style.width,
          dashPattern: style.dashPattern,
          opacity: 0.5,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
        });
        result.push({
          id: `leg-${index}-remaining`,
          coordinates: coordinates.slice(splitIdx),
          color: style.color,
          width: style.width,
          dashPattern: style.dashPattern,
          opacity: style.opacity,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
        });
        return;
      }
    }

    result.push({
      id: `leg-${index}`,
      coordinates,
      color: style.color,
      width: style.width,
      dashPattern: style.dashPattern,
      opacity: style.opacity,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    });
  });

  return result;
};

export default buildNavigationRoutePolylines;
