const EARTH_RADIUS_METERS = 6371000;
const DETOUR_DIRECTION_ARROW_COUNT = 4;

const toRadians = (degrees) => Number(degrees) * Math.PI / 180;

const isFiniteCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude)) &&
  Number.isFinite(Number(point?.longitude))
);

const getDistanceMeters = (from, to) => {
  if (!isFiniteCoordinate(from) || !isFiniteCoordinate(to)) {
    return 0;
  }

  const startLat = toRadians(from.latitude);
  const endLat = toRadians(to.latitude);
  const deltaLat = toRadians(Number(to.latitude) - Number(from.latitude));
  const deltaLon = toRadians(Number(to.longitude) - Number(from.longitude));

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};

const getBearingDegrees = (from, to) => {
  if (!isFiniteCoordinate(from) || !isFiniteCoordinate(to)) return 0;

  const startLat = toRadians(from.latitude);
  const endLat = toRadians(to.latitude);
  const deltaLon = toRadians(Number(to.longitude) - Number(from.longitude));
  const y = Math.sin(deltaLon) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLon);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

const interpolatePoint = (from, to, ratio) => ({
  latitude: Number(from.latitude) + (Number(to.latitude) - Number(from.latitude)) * ratio,
  longitude: Number(from.longitude) + (Number(to.longitude) - Number(from.longitude)) * ratio,
});

export const getDirectionArrowPoints = (path, arrowCount = DETOUR_DIRECTION_ARROW_COUNT) => {
  if (!Array.isArray(path) || path.length < 2 || arrowCount <= 0) return [];

  const segments = [];
  let totalDistance = 0;

  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const next = path[index];
    const distance = getDistanceMeters(previous, next);

    if (distance <= 0) continue;

    segments.push({
      from: previous,
      to: next,
      startDistance: totalDistance,
      distance,
    });
    totalDistance += distance;
  }

  if (segments.length === 0 || totalDistance <= 0) return [];

  return Array.from({ length: arrowCount }, (_, arrowIndex) => {
    const targetDistance = totalDistance * ((arrowIndex + 1) / (arrowCount + 1));
    const segment =
      segments.find((candidate) => targetDistance <= candidate.startDistance + candidate.distance) ??
      segments[segments.length - 1];
    const segmentRatio = Math.max(
      0,
      Math.min(1, (targetDistance - segment.startDistance) / segment.distance)
    );

    return {
      point: interpolatePoint(segment.from, segment.to, segmentRatio),
      bearing: getBearingDegrees(segment.from, segment.to),
    };
  });
};
