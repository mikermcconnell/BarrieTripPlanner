export const DEFAULT_ROUTE_STOP_SEQUENCE_KEY = '__default__';

export const pickCanonicalStopSequence = (patternMap) => {
  const patterns = Array.from(patternMap.values());
  if (patterns.length === 0) return [];

  patterns.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.stopIds.length !== a.stopIds.length) return b.stopIds.length - a.stopIds.length;
    return a.signature.localeCompare(b.signature);
  });

  return patterns[0].stopIds;
};

/**
 * Create ordered stop sequences keyed by route and shape.
 * Chooses the most common stop pattern for each route/shape combination.
 * Also stores a route-level default sequence under __default__.
 * @param {Array<Object>} trips - Array of trip objects
 * @param {Array<Object>} stopTimes - Array of stop_time objects
 * @returns {Object} Mapping of route_id to { shapeId: stopIds[], __default__: stopIds[] }
 */
export const createRouteStopSequencesMapping = (trips, stopTimes) => {
  const tripMetaById = {};
  trips.forEach((trip) => {
    tripMetaById[trip.tripId] = {
      routeId: trip.routeId,
      shapeId: trip.shapeId || null,
    };
  });

  const stopTimesByTrip = {};
  stopTimes.forEach((stopTime) => {
    if (!tripMetaById[stopTime.tripId]?.routeId) return;
    if (!stopTimesByTrip[stopTime.tripId]) {
      stopTimesByTrip[stopTime.tripId] = [];
    }
    stopTimesByTrip[stopTime.tripId].push(stopTime);
  });

  const patternsByRoute = {};

  Object.entries(stopTimesByTrip).forEach(([tripId, tripStopTimes]) => {
    const tripMeta = tripMetaById[tripId];
    if (!tripMeta?.routeId) return;

    const orderedStopIds = tripStopTimes
      .slice()
      .sort((a, b) => a.stopSequence - b.stopSequence)
      .map((stopTime) => stopTime.stopId)
      .filter(Boolean);

    if (orderedStopIds.length === 0) return;

    const routeId = tripMeta.routeId;
    const shapeKey = tripMeta.shapeId || DEFAULT_ROUTE_STOP_SEQUENCE_KEY;
    const signature = orderedStopIds.join('|');

    if (!patternsByRoute[routeId]) {
      patternsByRoute[routeId] = {};
    }
    if (!patternsByRoute[routeId][shapeKey]) {
      patternsByRoute[routeId][shapeKey] = new Map();
    }
    if (!patternsByRoute[routeId][DEFAULT_ROUTE_STOP_SEQUENCE_KEY]) {
      patternsByRoute[routeId][DEFAULT_ROUTE_STOP_SEQUENCE_KEY] = new Map();
    }

    const shapePatterns = patternsByRoute[routeId][shapeKey];
    const routePatterns = patternsByRoute[routeId][DEFAULT_ROUTE_STOP_SEQUENCE_KEY];

    const existingShapePattern = shapePatterns.get(signature);
    shapePatterns.set(signature, {
      signature,
      stopIds: orderedStopIds,
      count: (existingShapePattern?.count || 0) + 1,
    });

    const existingRoutePattern = routePatterns.get(signature);
    routePatterns.set(signature, {
      signature,
      stopIds: orderedStopIds,
      count: (existingRoutePattern?.count || 0) + 1,
    });
  });

  const mapping = {};
  Object.entries(patternsByRoute).forEach(([routeId, shapePatterns]) => {
    mapping[routeId] = {};
    Object.entries(shapePatterns).forEach(([shapeKey, patternMap]) => {
      mapping[routeId][shapeKey] = pickCanonicalStopSequence(patternMap);
    });
  });

  return mapping;
};

export const getRouteStopSequence = ({
  routeId,
  shapeId,
  routeStopsMapping,
  routeStopSequencesMapping,
}) => {
  const shapeSequences = routeStopSequencesMapping?.[routeId];
  if (shapeSequences) {
    if (shapeId && Array.isArray(shapeSequences[shapeId]) && shapeSequences[shapeId].length > 0) {
      return shapeSequences[shapeId];
    }
    if (
      Array.isArray(shapeSequences[DEFAULT_ROUTE_STOP_SEQUENCE_KEY]) &&
      shapeSequences[DEFAULT_ROUTE_STOP_SEQUENCE_KEY].length > 0
    ) {
      return shapeSequences[DEFAULT_ROUTE_STOP_SEQUENCE_KEY];
    }
  }

  return routeStopsMapping?.[routeId] || null;
};
