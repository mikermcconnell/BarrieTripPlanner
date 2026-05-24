import { safeHaversineDistance as calculateDistance } from './geometryUtils';
import { decodePolyline } from './polylineUtils';
import { buildTransitStopSequence } from './transitStopUtils';

const DEFAULT_MAX_SIMULATION_POINTS = 72;
const DEFAULT_ACCURACY_METERS = 8;
const DEFAULT_BUS_SPEED_METERS_PER_SECOND = 8;

const toCoordinate = (value) => {
  const latitude = value?.latitude ?? value?.lat;
  const longitude = value?.longitude ?? value?.lon;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
};

const dedupeConsecutiveCoordinates = (coordinates) => {
  const result = [];

  coordinates.forEach((coordinate) => {
    const point = toCoordinate(coordinate);
    if (!point) return;

    const previous = result[result.length - 1];
    if (
      previous &&
      calculateDistance(previous.latitude, previous.longitude, point.latitude, point.longitude) < 2
    ) {
      return;
    }

    result.push(point);
  });

  return result;
};

const interpolateCoordinate = (start, end, ratio) => ({
  latitude: start.latitude + (end.latitude - start.latitude) * ratio,
  longitude: start.longitude + (end.longitude - start.longitude) * ratio,
});

export const getPolylineDistanceMeters = (coordinates) => {
  const points = dedupeConsecutiveCoordinates(coordinates);
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += calculateDistance(
      points[index - 1].latitude,
      points[index - 1].longitude,
      points[index].latitude,
      points[index].longitude
    );
  }

  return total;
};

export const resamplePolylineByDistance = (
  coordinates,
  maxPoints = DEFAULT_MAX_SIMULATION_POINTS
) => {
  const points = dedupeConsecutiveCoordinates(coordinates);
  if (points.length <= 1) return points;

  const totalDistance = getPolylineDistanceMeters(points);
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) return points;

  const targetCount = Math.max(2, Math.min(maxPoints, Math.ceil(totalDistance / 80) + 1));
  const intervalMeters = totalDistance / (targetCount - 1);
  const resampled = [points[0]];

  let segmentIndex = 1;
  let traversedMeters = 0;

  for (let targetIndex = 1; targetIndex < targetCount - 1; targetIndex += 1) {
    const targetDistance = targetIndex * intervalMeters;

    while (segmentIndex < points.length) {
      const segmentStart = points[segmentIndex - 1];
      const segmentEnd = points[segmentIndex];
      const segmentDistance = calculateDistance(
        segmentStart.latitude,
        segmentStart.longitude,
        segmentEnd.latitude,
        segmentEnd.longitude
      );

      if (traversedMeters + segmentDistance >= targetDistance) {
        const ratio = segmentDistance > 0
          ? (targetDistance - traversedMeters) / segmentDistance
          : 0;
        resampled.push(interpolateCoordinate(segmentStart, segmentEnd, ratio));
        break;
      }

      traversedMeters += segmentDistance;
      segmentIndex += 1;
    }
  }

  resampled.push(points[points.length - 1]);
  return dedupeConsecutiveCoordinates(resampled);
};

export const buildNavigationSimulationPath = (
  transitLeg,
  { maxPoints = DEFAULT_MAX_SIMULATION_POINTS } = {}
) => {
  if (!transitLeg || (transitLeg.mode !== 'BUS' && transitLeg.mode !== 'TRANSIT')) {
    return [];
  }

  const stopSequence = buildTransitStopSequence(transitLeg);
  const boardingStop = toCoordinate(stopSequence[0]);
  const alightingStop = toCoordinate(stopSequence[stopSequence.length - 1]);
  const geometryPoints = transitLeg?.legGeometry?.points
    ? decodePolyline(transitLeg.legGeometry.points)
    : [];

  const basePath = geometryPoints.length >= 2
    ? [
        boardingStop,
        ...geometryPoints,
        alightingStop,
      ].filter(Boolean)
    : stopSequence.map(toCoordinate).filter(Boolean);

  return resamplePolylineByDistance(basePath, maxPoints);
};

const getBearingDegrees = (from, to) => {
  if (!from || !to) return null;

  const fromLat = from.latitude * Math.PI / 180;
  const toLat = to.latitude * Math.PI / 180;
  const deltaLon = (to.longitude - from.longitude) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;

  return (bearing + 360) % 360;
};

export const buildSimulatedNavigationLocation = (
  path,
  index,
  timestamp = Date.now()
) => {
  if (!Array.isArray(path) || path.length === 0) return null;

  const clampedIndex = Math.max(0, Math.min(index, path.length - 1));
  const point = path[clampedIndex];
  const nextPoint = path[Math.min(clampedIndex + 1, path.length - 1)];
  const previousPoint = path[Math.max(clampedIndex - 1, 0)];
  const heading = getBearingDegrees(point, nextPoint) ?? getBearingDegrees(previousPoint, point);

  return {
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: DEFAULT_ACCURACY_METERS,
    heading,
    speed: clampedIndex >= path.length - 1 ? 0 : DEFAULT_BUS_SPEED_METERS_PER_SECOND,
    timestamp,
    simulated: true,
  };
};

export const getNavigationSimulationProgress = (path, index) => {
  if (!Array.isArray(path) || path.length <= 1) return 0;
  return Math.round((Math.max(0, Math.min(index, path.length - 1)) / (path.length - 1)) * 100);
};

export const isNavigationSimulatorDevEnabled = ({
  isDev = typeof __DEV__ !== 'undefined' && __DEV__,
  envValue = process.env.EXPO_PUBLIC_NAVIGATION_SIMULATOR,
} = {}) => isDev && envValue !== 'false';
