import { ANIMATION } from '../config/constants';
import {
  buildPolylineSegment,
  haversineDistance,
  projectPointToPolyline,
} from './geometryUtils';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toRadians = (degrees) => degrees * (Math.PI / 180);
const toDegrees = (radians) => radians * (180 / Math.PI);
const getFiniteBearing = (bearing) => {
  if (bearing == null || bearing === '') return null;
  const numericBearing = Number(bearing);
  return Number.isFinite(numericBearing) ? numericBearing : null;
};

const sameCoordinate = (first, second) => (
  first?.latitude === second?.latitude && first?.longitude === second?.longitude
);

const dedupeSequentialCoordinates = (coordinates = []) => coordinates.filter((coordinate, index) => (
  index === 0 || !sameCoordinate(coordinate, coordinates[index - 1])
));

const buildMeasuredPath = (points = []) => {
  if (points.length < 2) return null;
  const cumulative = [0];
  let totalDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    totalDistance += haversineDistance(
      points[index - 1].latitude,
      points[index - 1].longitude,
      points[index].latitude,
      points[index].longitude
    );
    cumulative.push(totalDistance);
  }

  return totalDistance > 0 ? { points, cumulative, totalDistance } : null;
};

const interpolateMeasuredPath = (measuredPath, progress) => {
  if (!measuredPath) return null;
  const safeProgress = clamp(progress, 0, 1);
  if (safeProgress <= 0) return measuredPath.points[0];
  if (safeProgress >= 1) return measuredPath.points[measuredPath.points.length - 1];

  const targetDistance = measuredPath.totalDistance * safeProgress;
  for (let index = 1; index < measuredPath.cumulative.length; index += 1) {
    if (targetDistance > measuredPath.cumulative[index]) continue;
    const segmentStart = measuredPath.cumulative[index - 1];
    const segmentDistance = measuredPath.cumulative[index] - segmentStart || 1;
    const segmentProgress = (targetDistance - segmentStart) / segmentDistance;
    const from = measuredPath.points[index - 1];
    const to = measuredPath.points[index];
    return {
      latitude: from.latitude + (to.latitude - from.latitude) * segmentProgress,
      longitude: from.longitude + (to.longitude - from.longitude) * segmentProgress,
    };
  }

  return measuredPath.points[measuredPath.points.length - 1];
};

const limitMotionPathPoints = (points, maxPoints) => {
  if (points.length <= maxPoints) return points;
  const measuredPath = buildMeasuredPath(points);
  if (!measuredPath) return [points[0], points[points.length - 1]];

  return Array.from({ length: maxPoints }, (_, index) => (
    interpolateMeasuredPath(measuredPath, index / (maxPoints - 1))
  ));
};

export const normalizeHomeVehicleBearingDelta = (delta) => {
  let normalized = Number(delta) % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
};

export const interpolateHomeVehicleBearing = (fromBearing, toBearing, progress) => {
  const from = getFiniteBearing(fromBearing);
  const to = getFiniteBearing(toBearing);
  if (from == null) return to;
  if (to == null) return from;
  const next = from + normalizeHomeVehicleBearingDelta(to - from) * clamp(progress, 0, 1);
  return (next + 360) % 360;
};

export const buildHomeVehicleMotionPath = ({
  fromCoordinate,
  toCoordinate,
  snapPath,
  snapMaxDistanceMeters = ANIMATION.BUS_HOME_ROUTE_SNAP_MAX_DISTANCE_M,
  maxPoints = ANIMATION.BUS_HOME_ROUTE_PATH_MAX_POINTS,
} = {}) => {
  if (
    !Number.isFinite(fromCoordinate?.latitude) ||
    !Number.isFinite(fromCoordinate?.longitude) ||
    !Number.isFinite(toCoordinate?.latitude) ||
    !Number.isFinite(toCoordinate?.longitude)
  ) return [];

  const straightPath = dedupeSequentialCoordinates([fromCoordinate, toCoordinate]);
  if (!Array.isArray(snapPath) || snapPath.length < 2 || straightPath.length < 2) {
    return straightPath;
  }

  const startProjection = projectPointToPolyline(fromCoordinate, snapPath);
  const endProjection = projectPointToPolyline(toCoordinate, snapPath);
  if (
    !startProjection ||
    !endProjection ||
    startProjection.distanceMeters > snapMaxDistanceMeters ||
    endProjection.distanceMeters > snapMaxDistanceMeters
  ) return straightPath;

  const routeSegment = buildPolylineSegment(snapPath, startProjection, endProjection);
  const routePath = dedupeSequentialCoordinates([
    fromCoordinate,
    startProjection.point,
    ...routeSegment,
    endProjection.point,
    toCoordinate,
  ]);
  const measuredRoutePath = buildMeasuredPath(routePath);
  const directDistance = haversineDistance(
    fromCoordinate.latitude,
    fromCoordinate.longitude,
    toCoordinate.latitude,
    toCoordinate.longitude
  );
  const maxRouteDistance = Math.max(
    directDistance * ANIMATION.BUS_HOME_ROUTE_PATH_MAX_RATIO,
    directDistance + ANIMATION.BUS_HOME_ROUTE_PATH_MAX_EXTRA_M
  );

  if (!measuredRoutePath || measuredRoutePath.totalDistance > maxRouteDistance) {
    return straightPath;
  }

  return limitMotionPathPoints(routePath, Math.max(2, maxPoints));
};

export const interpolateHomeVehicleMotionPath = (path, progress) => (
  interpolateMeasuredPath(buildMeasuredPath(path), progress)
);

export const getHomeVehicleMovementBearing = (fromCoordinate, toCoordinate) => {
  if (
    !Number.isFinite(fromCoordinate?.latitude) ||
    !Number.isFinite(fromCoordinate?.longitude) ||
    !Number.isFinite(toCoordinate?.latitude) ||
    !Number.isFinite(toCoordinate?.longitude)
  ) return null;

  const latitudeDelta = Math.abs(toCoordinate.latitude - fromCoordinate.latitude);
  const longitudeDelta = Math.abs(toCoordinate.longitude - fromCoordinate.longitude);
  if (latitudeDelta < 0.000001 && longitudeDelta < 0.000001) return null;

  const fromLatitude = toRadians(fromCoordinate.latitude);
  const toLatitude = toRadians(toCoordinate.latitude);
  const longitudeDifference = toRadians(toCoordinate.longitude - fromCoordinate.longitude);
  const y = Math.sin(longitudeDifference) * Math.cos(toLatitude);
  const x = (
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDifference)
  );

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
};

export const inferHomeVehicleBearings = ({ fromVehicles = [], toVehicles = [] } = {}) => {
  const fromById = new Map(fromVehicles.map((vehicle) => [String(vehicle.id), vehicle]));

  return toVehicles.map((target) => {
    if (getFiniteBearing(target?.bearing) != null) return target;
    const from = fromById.get(String(target?.id));
    const inferredBearing = getHomeVehicleMovementBearing(from?.coordinate, target?.coordinate);
    const fallbackBearing = getFiniteBearing(from?.bearing);
    const bearing = Number.isFinite(inferredBearing)
      ? inferredBearing
      : fallbackBearing != null
        ? fallbackBearing
        : null;

    return Number.isFinite(bearing) ? { ...target, bearing } : target;
  });
};

export const getHomeVehicleAnimationDuration = (observedIntervalMs) => (
  clamp(
    (Number(observedIntervalMs) || ANIMATION.BUS_POSITION_DURATION_MS) *
      ANIMATION.BUS_POSITION_DURATION_RATIO,
    ANIMATION.BUS_POSITION_MIN_DURATION_MS,
    ANIMATION.BUS_POSITION_MAX_DURATION_MS
  )
);

export const interpolateHomeVehicles = ({
  fromVehicles = [],
  toVehicles = [],
  progress = 1,
  motionPathsByVehicleId = new Map(),
} = {}) => {
  const safeProgress = clamp(Number(progress) || 0, 0, 1);
  const fromById = new Map(fromVehicles.map((vehicle) => [String(vehicle.id), vehicle]));

  return toVehicles.map((target) => {
    const from = fromById.get(String(target.id));
    const fromCoordinate = from?.coordinate;
    const toCoordinate = target?.coordinate;
    if (
      !Number.isFinite(fromCoordinate?.latitude) ||
      !Number.isFinite(fromCoordinate?.longitude) ||
      !Number.isFinite(toCoordinate?.latitude) ||
      !Number.isFinite(toCoordinate?.longitude)
    ) {
      return target;
    }

    const motionPath = motionPathsByVehicleId.get?.(String(target.id));
    const pathCoordinate = interpolateHomeVehicleMotionPath(motionPath, safeProgress);
    return {
      ...target,
      coordinate: pathCoordinate || {
        latitude: fromCoordinate.latitude + (toCoordinate.latitude - fromCoordinate.latitude) * safeProgress,
        longitude: fromCoordinate.longitude + (toCoordinate.longitude - fromCoordinate.longitude) * safeProgress,
      },
      bearing: interpolateHomeVehicleBearing(from?.bearing, target?.bearing, safeProgress),
    };
  });
};
