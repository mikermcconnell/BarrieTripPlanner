import { COLORS } from '../config/theme';
import { haversineDistance, pointToPolylineDistance } from './geometryUtils';
import { extractShapeSegment, findClosestPointIndex } from './polylineUtils';

const STATIC_PREVIEW_LOOKBACK_METERS = 900;

const hasValidPoint = (point) => (
  Number.isFinite(point?.latitude) &&
  Number.isFinite(point?.longitude)
);

const hasValidStop = (stop) => (
  Number.isFinite(stop?.lat) &&
  Number.isFinite(stop?.lon)
);

export const buildRoutePathsByRouteId = ({ shapes = {}, routeShapeMapping = {} }) => {
  const map = new Map();

  Object.entries(routeShapeMapping || {}).forEach(([routeId, shapeIds]) => {
    const paths = (shapeIds || [])
      .map((shapeId) => shapes[shapeId])
      .filter((coords) => Array.isArray(coords) && coords.length >= 2);

    if (paths.length > 0) {
      map.set(routeId, paths);
    }
  });

  return map;
};

export const getVehicleSnapPath = (vehicle, routePathsByRouteId) => {
  const candidatePaths = routePathsByRouteId?.get(vehicle?.routeId);
  if (!candidatePaths || candidatePaths.length === 0) return null;
  if (candidatePaths.length === 1) return candidatePaths[0];

  const point = vehicle?.coordinate;
  if (!hasValidPoint(point)) return candidatePaths[0];

  let bestPath = candidatePaths[0];
  let bestDistance = pointToPolylineDistance(point, bestPath);

  for (let i = 1; i < candidatePaths.length; i += 1) {
    const distance = pointToPolylineDistance(point, candidatePaths[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPath = candidatePaths[i];
    }
  }

  return bestPath;
};

const getStopSnapPath = (transitLeg, targetStop, routePathsByRouteId) => {
  const candidatePaths = routePathsByRouteId?.get(transitLeg?.route?.id || transitLeg?.routeId);
  if (!candidatePaths || candidatePaths.length === 0 || !hasValidStop(targetStop)) {
    return null;
  }

  if (candidatePaths.length === 1) {
    return candidatePaths[0];
  }

  const point = {
    latitude: targetStop.lat,
    longitude: targetStop.lon,
  };

  let bestPath = candidatePaths[0];
  let bestDistance = pointToPolylineDistance(point, bestPath);

  for (let i = 1; i < candidatePaths.length; i += 1) {
    const distance = pointToPolylineDistance(point, candidatePaths[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPath = candidatePaths[i];
    }
  }

  return bestPath;
};

const resolvePreviewShape = ({
  transitLeg,
  vehicle,
  targetStop,
  shapes = {},
  tripMapping = {},
  routePathsByRouteId,
}) => {
  const mapping = transitLeg?.tripId ? tripMapping?.[transitLeg.tripId] : null;

  if (mapping?.shapeId && Array.isArray(shapes[mapping.shapeId]) && shapes[mapping.shapeId].length >= 2) {
    return shapes[mapping.shapeId];
  }

  if (vehicle?.coordinate) {
    return getVehicleSnapPath(vehicle, routePathsByRouteId);
  }

  return getStopSnapPath(transitLeg, targetStop, routePathsByRouteId);
};

const buildStaticApproachSegment = (shapeCoords, targetStop) => {
  if (!Array.isArray(shapeCoords) || shapeCoords.length < 2 || !hasValidStop(targetStop)) {
    return [];
  }

  const targetIdx = findClosestPointIndex(shapeCoords, targetStop.lat, targetStop.lon);
  let startIdx = targetIdx;
  let traversedMeters = 0;

  while (startIdx > 0 && traversedMeters < STATIC_PREVIEW_LOOKBACK_METERS) {
    traversedMeters += haversineDistance(
      shapeCoords[startIdx - 1].latitude,
      shapeCoords[startIdx - 1].longitude,
      shapeCoords[startIdx].latitude,
      shapeCoords[startIdx].longitude
    );
    startIdx -= 1;
  }

  return shapeCoords.slice(startIdx, targetIdx + 1);
};

const buildStaticBusPreviewLine = ({
  transitLeg,
  targetStop,
  previewKind,
  shapeCoords,
  lineId,
}) => {
  if (!Array.isArray(shapeCoords) || shapeCoords.length < 2 || !hasValidStop(targetStop)) {
    return null;
  }

  const segment = previewKind === 'alight' && hasValidStop(transitLeg?.from)
    ? extractShapeSegment(
        shapeCoords,
        transitLeg.from.lat,
        transitLeg.from.lon,
        targetStop.lat,
        targetStop.lon
      )
    : buildStaticApproachSegment(shapeCoords, targetStop);

  if (!Array.isArray(segment) || segment.length < 2) {
    return null;
  }

  return {
    id: `${lineId}-shape`,
    coordinates: segment,
    color: transitLeg.route?.color || COLORS.primary,
  };
};

export const buildBusApproachLine = ({
  transitLeg,
  vehicle,
  targetStop = null,
  previewKind = 'approach',
  shapes = {},
  tripMapping = {},
  routePathsByRouteId,
}) => {
  const resolvedTargetStop = targetStop || transitLeg?.from;

  if (!transitLeg || !hasValidStop(resolvedTargetStop)) {
    return null;
  }

  const lineIdBase = `nav-bus-approach-${transitLeg.tripId || transitLeg.route?.id || 'route'}`;
  const lineId = previewKind === 'approach'
    ? lineIdBase
    : `${lineIdBase}-${previewKind}`;

  const shapeCoords = resolvePreviewShape({
    transitLeg,
    vehicle,
    targetStop: resolvedTargetStop,
    shapes,
    tripMapping,
    routePathsByRouteId,
  });

  if (!vehicle?.coordinate) {
    return buildStaticBusPreviewLine({
      transitLeg,
      targetStop: resolvedTargetStop,
      previewKind,
      shapeCoords,
      lineId,
    });
  }

  if (!Array.isArray(shapeCoords) || shapeCoords.length < 2) {
    return {
      id: `${lineId}-fallback`,
      coordinates: [
        {
          latitude: vehicle.coordinate.latitude,
          longitude: vehicle.coordinate.longitude,
        },
        {
          latitude: resolvedTargetStop.lat,
          longitude: resolvedTargetStop.lon,
        },
      ],
      color: transitLeg.route?.color || COLORS.primary,
    };
  }

  const segment = extractShapeSegment(
    shapeCoords,
    vehicle.coordinate.latitude,
    vehicle.coordinate.longitude,
    resolvedTargetStop.lat,
    resolvedTargetStop.lon
  );

  if (segment.length < 2) {
    return {
      id: `${lineId}-fallback`,
      coordinates: [
        {
          latitude: vehicle.coordinate.latitude,
          longitude: vehicle.coordinate.longitude,
        },
        {
          latitude: resolvedTargetStop.lat,
          longitude: resolvedTargetStop.lon,
        },
      ],
      color: transitLeg.route?.color || COLORS.primary,
    };
  }

  return {
    id: lineId,
    coordinates: segment,
    color: transitLeg.route?.color || COLORS.primary,
  };
};

export const buildCurrentStepBusPreviewLine = ({
  isWalkingLeg = false,
  nextTransitLeg = null,
  walkingVehicle = null,
  currentTransitLeg = null,
  transitVehicle = null,
  transitStatus = 'waiting',
  shapes = {},
  tripMapping = {},
  routePathsByRouteId,
}) => {
  if (isWalkingLeg && nextTransitLeg) {
    return buildBusApproachLine({
      transitLeg: nextTransitLeg,
      vehicle: walkingVehicle,
      targetStop: nextTransitLeg.from,
      previewKind: 'board',
      shapes,
      tripMapping,
      routePathsByRouteId,
    });
  }

  if (!currentTransitLeg) {
    return null;
  }

  const targetStop = transitStatus === 'on_board'
    ? currentTransitLeg.to
    : currentTransitLeg.from;

  if (!hasValidStop(targetStop)) {
    return null;
  }

  return buildBusApproachLine({
    transitLeg: currentTransitLeg,
    vehicle: transitVehicle,
    targetStop,
    previewKind: transitStatus === 'on_board' ? 'alight' : 'board',
    shapes,
    tripMapping,
    routePathsByRouteId,
  });
};
