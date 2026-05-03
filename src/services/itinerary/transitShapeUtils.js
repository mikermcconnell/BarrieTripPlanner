import { haversineDistance } from '../../utils/geometryUtils';

const normalizeWaypoint = (point) => {
  if (!point) return null;

  const latitude = point.latitude ?? point.lat;
  const longitude = point.longitude ?? point.lon;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
};

const findClosestPointIndexFrom = (shapeCoords, lat, lon, startIndex = 0) => {
  if (!Array.isArray(shapeCoords) || shapeCoords.length === 0) {
    return 0;
  }

  const safeStartIndex = Math.max(0, Math.min(startIndex, shapeCoords.length - 1));
  let minDist = Infinity;
  let closestIdx = safeStartIndex;

  for (let idx = safeStartIndex; idx < shapeCoords.length; idx += 1) {
    const coord = shapeCoords[idx];
    const dist = haversineDistance(lat, lon, coord.latitude, coord.longitude);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = idx;
    }
  }

  return closestIdx;
};

/**
 * Extract a shape segment while respecting the ordered stop progression of a trip.
 * This is important for loop routes where the boarding and alighting stops may be
 * geographically close even though the bus travels most of the shape in between.
 *
 * @param {Array<{latitude: number, longitude: number}>} shapeCoords
 * @param {Array<Object>} orderedWaypoints - Ordered stops/points using either
 *   {lat, lon} or {latitude, longitude}
 * @returns {Array<{latitude: number, longitude: number}>}
 */
export const extractShapeSegmentByWaypoints = (shapeCoords, orderedWaypoints = []) => {
  if (!Array.isArray(shapeCoords) || shapeCoords.length < 2) return [];

  const waypoints = orderedWaypoints
    .map(normalizeWaypoint)
    .filter(Boolean);

  if (waypoints.length < 2) {
    return [];
  }

  const matchedIndices = [];
  let searchStartIndex = 0;

  waypoints.forEach((waypoint) => {
    const matchedIndex = findClosestPointIndexFrom(
      shapeCoords,
      waypoint.latitude,
      waypoint.longitude,
      searchStartIndex
    );
    matchedIndices.push(matchedIndex);
    searchStartIndex = matchedIndex;
  });

  const startIdx = matchedIndices[0];
  const endIdx = matchedIndices[matchedIndices.length - 1];

  if (!Number.isInteger(startIdx) || !Number.isInteger(endIdx) || endIdx <= startIdx) {
    return [];
  }

  return shapeCoords.slice(startIdx, endIdx + 1);
};

export default extractShapeSegmentByWaypoints;
