/**
 * Utilities for selecting representative GTFS shapes for map rendering.
 * We keep one longest shape per branch signature so branch variants
 * (e.g. 8A/8B) stay visible while duplicate trip variants are collapsed.
 */

const DEFAULT_OPTIONS = {
  maxShapes: 1,
  precision: 3,
};

const roundCoord = (value, precision) => {
  return Number(value).toFixed(precision);
};

const pointKey = (point, precision) => {
  return `${roundCoord(point.latitude, precision)},${roundCoord(point.longitude, precision)}`;
};

const samplePoint = (coordinates, ratio) => {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  const maxIndex = coordinates.length - 1;
  const idx = Math.min(maxIndex, Math.max(0, Math.round(maxIndex * ratio)));
  return coordinates[idx];
};

const canonicalEndpointKey = (coordinates, precision) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const first = pointKey(coordinates[0], precision);
  const last = pointKey(coordinates[coordinates.length - 1], precision);
  return [first, last].sort().join('|');
};

const branchSignature = (coordinates, precision) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const a = samplePoint(coordinates, 0.2);
  const b = samplePoint(coordinates, 0.5);
  const c = samplePoint(coordinates, 0.8);
  if (!a || !b || !c) return null;

  const forward = [pointKey(a, precision), pointKey(b, precision), pointKey(c, precision)];
  const reverse = [...forward].reverse();
  const directionalAgnostic = forward.join(';') < reverse.join(';') ? forward.join(';') : reverse.join(';');

  const endpoints = canonicalEndpointKey(coordinates, precision) || 'unknown-endpoints';
  return `${endpoints}::${directionalAgnostic}`;
};

/**
 * Returns representative shape IDs for a route, grouped by branch signature.
 * For each signature, the longest shape is kept.
 */
export const getRepresentativeShapeIds = (shapeIds, shapeSource, options = {}) => {
  const { maxShapes, precision } = { ...DEFAULT_OPTIONS, ...options };
  if (!Array.isArray(shapeIds) || shapeIds.length === 0) return [];

  const longestBySignature = new Map();

  shapeIds.forEach((shapeId) => {
    const coords = shapeSource[shapeId];
    if (!Array.isArray(coords) || coords.length < 2) return;

    const signature = branchSignature(coords, precision) || `shape:${shapeId}`;
    const existing = longestBySignature.get(signature);

    if (!existing || coords.length > existing.coords.length) {
      longestBySignature.set(signature, { shapeId, coords });
    }
  });

  return Array.from(longestBySignature.values())
    .sort((a, b) => b.coords.length - a.coords.length)
    .slice(0, Math.max(1, maxShapes))
    .map((entry) => entry.shapeId);
};
