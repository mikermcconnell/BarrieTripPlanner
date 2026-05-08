import { COLORS } from '../config/theme';
import { haversineDistance, pointToPolylineDistance } from './geometryUtils';
import { extractShapeSegment, findClosestPointIndex } from './polylineUtils';

const STATIC_PREVIEW_LOOKBACK_METERS = 900;
const CLOSED_LOOP_ENDPOINT_TOLERANCE_METERS = 60;
const CLOSEST_POINT_TIE_TOLERANCE_METERS = 80;

const hasValidPoint = (point) => (
  Number.isFinite(point?.latitude) &&
  Number.isFinite(point?.longitude)
);

const hasValidStop = (stop) => (
  Number.isFinite(stop?.lat) &&
  Number.isFinite(stop?.lon)
);

const isClosedLoopShape = (shapeCoords) => {
  if (!Array.isArray(shapeCoords) || shapeCoords.length < 3) {
    return false;
  }

  const first = shapeCoords[0];
  const last = shapeCoords[shapeCoords.length - 1];
  return haversineDistance(
    first.latitude,
    first.longitude,
    last.latitude,
    last.longitude
  ) <= CLOSED_LOOP_ENDPOINT_TOLERANCE_METERS;
};

const getShapeCumulativeMeters = (shapeCoords) => {
  const cumulative = [0];
  let total = 0;

  for (let i = 1; i < shapeCoords.length; i += 1) {
    total += haversineDistance(
      shapeCoords[i - 1].latitude,
      shapeCoords[i - 1].longitude,
      shapeCoords[i].latitude,
      shapeCoords[i].longitude
    );
    cumulative.push(total);
  }

  return cumulative;
};

const getClosestPointCandidates = (shapeCoords, lat, lon) => {
  const distances = shapeCoords.map((coord, index) => ({
    index,
    distanceToPoint: haversineDistance(lat, lon, coord.latitude, coord.longitude),
  }));
  const bestDistance = Math.min(...distances.map((candidate) => candidate.distanceToPoint));

  return distances
    .filter((candidate) => (
      candidate.distanceToPoint <= bestDistance + CLOSEST_POINT_TIE_TOLERANCE_METERS
    ))
    .sort((a, b) => (
      a.distanceToPoint - b.distanceToPoint ||
      a.index - b.index
    ));
};

const getForwardShapeDistance = (cumulative, fromIndex, toIndex) => {
  if (toIndex >= fromIndex) {
    return cumulative[toIndex] - cumulative[fromIndex];
  }

  const total = cumulative[cumulative.length - 1];
  return (total - cumulative[fromIndex]) + cumulative[toIndex];
};

const extractForwardShapeSegment = (shapeCoords, startIdx, endIdx) => {
  if (startIdx <= endIdx) {
    return shapeCoords.slice(startIdx, endIdx + 1);
  }

  return [
    ...shapeCoords.slice(startIdx),
    ...shapeCoords.slice(0, endIdx + 1),
  ];
};

const extractApproachShapeSegment = (shapeCoords, fromLat, fromLon, toLat, toLon) => {
  if (!isClosedLoopShape(shapeCoords)) {
    return extractShapeSegment(shapeCoords, fromLat, fromLon, toLat, toLon);
  }

  const cumulative = getShapeCumulativeMeters(shapeCoords);
  const startCandidates = getClosestPointCandidates(shapeCoords, fromLat, fromLon);
  const endCandidates = getClosestPointCandidates(shapeCoords, toLat, toLon);

  let best = null;
  startCandidates.forEach((startCandidate) => {
    endCandidates.forEach((endCandidate) => {
      const distance = getForwardShapeDistance(
        cumulative,
        startCandidate.index,
        endCandidate.index
      );
      const wraps = endCandidate.index < startCandidate.index ? 1 : 0;
      const score = distance + wraps;

      if (
        !best ||
        score < best.score ||
        (score === best.score && wraps < best.wraps)
      ) {
        best = {
          startIdx: startCandidate.index,
          endIdx: endCandidate.index,
          score,
          wraps,
        };
      }
    });
  });

  if (!best) {
    return [];
  }

  return extractForwardShapeSegment(shapeCoords, best.startIdx, best.endIdx);
};

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
    isStaticApproach: true,
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

  const segment = extractApproachShapeSegment(
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
