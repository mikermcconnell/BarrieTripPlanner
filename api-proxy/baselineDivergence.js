const COORDINATE_PRECISION = 5;

function normalizeRouteId(routeId) {
  return routeId == null ? '' : String(routeId).trim();
}

function getShapeCoordinateSignature(shape = []) {
  if (!Array.isArray(shape) || shape.length === 0) {
    return '';
  }

  return shape
    .map((point) => {
      const latitude = Number(point?.latitude);
      const longitude = Number(point?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return 'invalid';
      }
      return `${latitude.toFixed(COORDINATE_PRECISION)},${longitude.toFixed(COORDINATE_PRECISION)}`;
    })
    .join('|');
}

function getMapValue(collection, key) {
  if (!collection) return undefined;
  if (typeof collection.get === 'function') return collection.get(key);
  return collection[key];
}

function hasMapKey(collection, key) {
  if (!collection) return false;
  if (typeof collection.has === 'function') return collection.has(key);
  return Object.prototype.hasOwnProperty.call(collection, key);
}

function mapEntries(collection) {
  if (!collection) return [];
  if (typeof collection.entries === 'function') return [...collection.entries()];
  return Object.entries(collection);
}

function mapKeys(collection) {
  if (!collection) return [];
  if (typeof collection.keys === 'function') return [...collection.keys()];
  return Object.keys(collection);
}

function buildShapeEntries(shapeIds = [], shapes = new Map()) {
  return (Array.isArray(shapeIds) ? shapeIds : [])
    .map((shapeId) => ({
      shapeId,
      signature: getShapeCoordinateSignature(getMapValue(shapes, shapeId)),
    }))
    .filter((entry) => entry.signature);
}

function buildBaselineDivergence({
  baselineShapes,
  baselineRouteShapeMapping,
  liveShapes,
  liveRouteShapeMapping,
} = {}) {
  const baselineMapping = baselineRouteShapeMapping || new Map();
  const liveMapping = liveRouteShapeMapping || new Map();
  const baselineShapeMap = baselineShapes || new Map();
  const liveShapeMap = liveShapes || new Map();

  const added = [];
  const removed = [];
  const changedRouteIds = new Set();

  for (const [rawRouteId, liveShapeIds] of mapEntries(liveMapping)) {
    const routeId = normalizeRouteId(rawRouteId);
    const baselineShapeIds = getMapValue(baselineMapping, rawRouteId) || getMapValue(baselineMapping, routeId);

    if (!baselineShapeIds) {
      added.push({ routeId, shapeCount: Array.isArray(liveShapeIds) ? liveShapeIds.length : 0 });
      changedRouteIds.add(routeId);
      continue;
    }

    const baselineEntries = buildShapeEntries(baselineShapeIds, baselineShapeMap);
    const liveEntries = buildShapeEntries(liveShapeIds, liveShapeMap);
    const baselineSignatures = new Set(baselineEntries.map((entry) => entry.signature));
    const liveSignatures = new Set(liveEntries.map((entry) => entry.signature));

    const addedShapes = liveEntries
      .filter((entry) => !baselineSignatures.has(entry.signature))
      .map((entry) => entry.shapeId);
    const removedShapes = baselineEntries
      .filter((entry) => !liveSignatures.has(entry.signature))
      .map((entry) => entry.shapeId);

    if (addedShapes.length > 0) {
      added.push({ routeId, shapes: addedShapes });
      changedRouteIds.add(routeId);
    }
    if (removedShapes.length > 0) {
      removed.push({ routeId, shapes: removedShapes });
      changedRouteIds.add(routeId);
    }
  }

  for (const rawRouteId of mapKeys(baselineMapping)) {
    const routeId = normalizeRouteId(rawRouteId);
    if (!hasMapKey(liveMapping, rawRouteId) && !hasMapKey(liveMapping, routeId)) {
      removed.push({ routeId, note: 'route removed from live' });
      changedRouteIds.add(routeId);
    }
  }

  const changedRouteIdList = [...changedRouteIds].filter(Boolean).sort();

  return {
    hasChanges: changedRouteIdList.length > 0,
    added,
    removed,
    changedRouteIds: changedRouteIdList,
  };
}

module.exports = {
  buildBaselineDivergence,
  getShapeCoordinateSignature,
};
