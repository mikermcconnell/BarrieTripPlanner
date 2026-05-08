import { haversineDistance } from './geometryUtils';

const isFiniteCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude)) &&
  Number.isFinite(Number(point?.longitude))
);

const normalizePoint = (point) => ({
  latitude: Number(point.latitude),
  longitude: Number(point.longitude),
});

const interpolatePoint = (start, end, ratio) => ({
  latitude: start.latitude + ((end.latitude - start.latitude) * ratio),
  longitude: start.longitude + ((end.longitude - start.longitude) * ratio),
});

export const getPolylineDistanceMidpoint = (path) => {
  const points = Array.isArray(path)
    ? path.filter(isFiniteCoordinate).map(normalizePoint)
    : [];

  if (points.length === 0) return null;
  if (points.length === 1) return points[0];

  const segments = [];
  let totalDistance = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const distance = haversineDistance(
      start.latitude,
      start.longitude,
      end.latitude,
      end.longitude
    );

    if (!Number.isFinite(distance) || distance <= 0) continue;

    segments.push({ start, end, distance });
    totalDistance += distance;
  }

  if (totalDistance <= 0 || segments.length === 0) {
    return points[Math.floor(points.length / 2)] ?? null;
  }

  const targetDistance = totalDistance / 2;
  let travelled = 0;

  for (const segment of segments) {
    if (travelled + segment.distance >= targetDistance) {
      const ratio = (targetDistance - travelled) / segment.distance;
      return interpolatePoint(segment.start, segment.end, ratio);
    }
    travelled += segment.distance;
  }

  return points[points.length - 1];
};

export default getPolylineDistanceMidpoint;
