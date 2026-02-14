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

  // Sample 5 points to better detect branch divergences (e.g. Route 8A vs 8B)
  const ratios = [0.1, 0.3, 0.5, 0.7, 0.9];
  const samples = ratios.map((r) => samplePoint(coordinates, r));
  if (samples.some((s) => !s)) return null;

  const forward = samples.map((s) => pointKey(s, precision));
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

const normalizeDirectionValues = (value) => {
  if (value === null || value === undefined) return [];
  if (value instanceof Set) return Array.from(value).map(String);
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
};

/**
 * Returns representative shape IDs while preferring direction diversity.
 * This avoids "All routes" rendering two reps from the same direction.
 *
 * @param {Array<string>} shapeIds
 * @param {Object} shapeSource
 * @param {Object<string, Set|string|Array<string|number>|number>} shapeDirectionMap
 * @param {Object} options
 * @returns {Array<string>}
 */
export const getRepresentativeShapeIdsByDirection = (
  shapeIds,
  shapeSource,
  shapeDirectionMap = {},
  options = {}
) => {
  const { maxShapes, precision } = { ...DEFAULT_OPTIONS, ...options };
  if (!Array.isArray(shapeIds) || shapeIds.length === 0) return [];
  if (maxShapes <= 1) {
    return getRepresentativeShapeIds(shapeIds, shapeSource, { maxShapes, precision });
  }

  const shapeIdsByDirection = new Map();

  shapeIds.forEach((shapeId) => {
    const coords = shapeSource[shapeId];
    if (!Array.isArray(coords) || coords.length < 2) return;

    const rawDirections = normalizeDirectionValues(shapeDirectionMap[shapeId]);
    const directionKey = rawDirections.length > 0 ? rawDirections.sort().join('|') : 'unknown';

    if (!shapeIdsByDirection.has(directionKey)) {
      shapeIdsByDirection.set(directionKey, []);
    }
    shapeIdsByDirection.get(directionKey).push(shapeId);
  });

  const selected = [];
  const seen = new Set();

  const sortedDirectionGroups = Array.from(shapeIdsByDirection.entries()).sort(([a], [b]) => {
    const aUnknown = a === 'unknown';
    const bUnknown = b === 'unknown';
    if (aUnknown === bUnknown) return 0;
    return aUnknown ? 1 : -1;
  });

  sortedDirectionGroups.forEach(([, groupShapeIds]) => {
    if (selected.length >= maxShapes) return;
    const [rep] = getRepresentativeShapeIds(groupShapeIds, shapeSource, {
      maxShapes: 1,
      precision,
    });
    if (rep && !seen.has(rep)) {
      selected.push(rep);
      seen.add(rep);
    }
  });

  if (selected.length < maxShapes) {
    const fallback = getRepresentativeShapeIds(shapeIds, shapeSource, { maxShapes, precision });
    fallback.forEach((shapeId) => {
      if (selected.length >= maxShapes || seen.has(shapeId)) return;
      selected.push(shapeId);
      seen.add(shapeId);
    });
  }

  return selected.slice(0, Math.max(1, maxShapes));
};
