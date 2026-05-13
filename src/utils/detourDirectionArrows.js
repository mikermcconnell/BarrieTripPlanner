const EARTH_RADIUS_METERS = 6371000;
const DETOUR_DIRECTION_ARROW_COUNT = 4;
const BIDIRECTIONAL_ARROW_OFFSET_METERS = 7;

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

const offsetPoint = (point, bearing, distanceMeters) => {
  if (!isFiniteCoordinate(point) || !Number.isFinite(Number(bearing)) || !Number.isFinite(Number(distanceMeters)) || Number(distanceMeters) === 0) {
    return point;
  }

  const angularDistance = Number(distanceMeters) / EARTH_RADIUS_METERS;
  const offsetBearing = toRadians(Number(bearing) + 90);
  const lat1 = toRadians(point.latitude);
  const lon1 = toRadians(point.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(offsetBearing)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(offsetBearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    latitude: lat2 * 180 / Math.PI,
    longitude: lon2 * 180 / Math.PI,
  };
};

export const getDirectionArrowPoints = (path, arrowCount = DETOUR_DIRECTION_ARROW_COUNT) => {
  return getDirectionArrowPointsWithOptions(path, { arrowCount });
};

const getDirectionArrowPointsWithOptions = (
  path,
  { arrowCount = DETOUR_DIRECTION_ARROW_COUNT, positionOffsetRatio = 0 } = {}
) => {
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
    const baseRatio = (arrowIndex + 1) / (arrowCount + 1);
    const targetRatio = Math.max(0.08, Math.min(0.92, baseRatio + Number(positionOffsetRatio || 0)));
    const targetDistance = totalDistance * targetRatio;
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

export const getDirectionalArrowPoints = (
  path,
  {
    mode = 'forward',
    arrowCount = DETOUR_DIRECTION_ARROW_COUNT,
    bidirectionalOffsetMeters = BIDIRECTIONAL_ARROW_OFFSET_METERS,
    pathOffsetMeters = 0,
    positionOffsetRatio = 0,
  } = {}
) => {
  if (mode === 'none') return [];

  const includeForward = mode === 'forward' || mode === 'both';
  const includeReverse = mode === 'reverse' || mode === 'both';
  const offsetMeters = mode === 'both' ? bidirectionalOffsetMeters : Number(pathOffsetMeters || 0);
  const arrows = [];

  if (includeForward) {
    arrows.push(...getDirectionArrowPointsWithOptions(path, {
      arrowCount,
      positionOffsetRatio,
    }).map((arrow) => ({
      ...arrow,
      point: offsetPoint(arrow.point, arrow.bearing, offsetMeters),
      direction: 'forward',
    })));
  }

  if (includeReverse) {
    const reversedPath = Array.isArray(path) ? [...path].reverse() : path;
    arrows.push(...getDirectionArrowPointsWithOptions(reversedPath, {
      arrowCount,
      positionOffsetRatio: -Number(positionOffsetRatio || 0),
    }).map((arrow) => ({
      ...arrow,
      point: offsetPoint(arrow.point, arrow.bearing, offsetMeters),
      direction: 'reverse',
    })));
  }

  return arrows;
};
