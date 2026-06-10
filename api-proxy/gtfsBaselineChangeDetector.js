'use strict';

const DEFAULT_SEQUENCE_KEY = '__default__';

const MAJOR_STOP_NAME_PATTERN = /\b(?:go|terminal|hub|mall|college|school|station)\b/i;

function normalizeRouteId(value) {
  return value == null ? '' : String(value).trim().toUpperCase();
}

function normalizeStopId(value) {
  return value == null ? '' : String(value).trim();
}

function getMapValue(collection, key) {
  if (!collection) return null;
  if (typeof collection.get === 'function') return collection.get(key) || null;
  return collection[key] || null;
}

function getCanonicalStopSequence(routeSequences) {
  if (!routeSequences || typeof routeSequences !== 'object') return [];
  if (Array.isArray(routeSequences[DEFAULT_SEQUENCE_KEY])) {
    return routeSequences[DEFAULT_SEQUENCE_KEY].map(normalizeStopId).filter(Boolean);
  }

  const sequences = Object.values(routeSequences).filter((sequence) => Array.isArray(sequence));
  if (sequences.length === 0) return [];

  return sequences
    .slice()
    .sort((a, b) => b.length - a.length)[0]
    .map(normalizeStopId)
    .filter(Boolean);
}

function getStop(stopsById, stopId) {
  const normalizedStopId = normalizeStopId(stopId);
  const stop = getMapValue(stopsById, normalizedStopId) || {};
  const name = String(stop.name || stop.stop_name || '').trim();
  return {
    id: normalizedStopId,
    code: String(stop.code || stop.stop_code || normalizedStopId).trim(),
    name,
    latitude: Number(stop.latitude ?? stop.stop_lat),
    longitude: Number(stop.longitude ?? stop.stop_lon),
    isMajor: MAJOR_STOP_NAME_PATTERN.test(name),
  };
}

function sequenceEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function routeEntries(routeStopSequencesMapping = {}) {
  if (routeStopSequencesMapping instanceof Map) {
    return [...routeStopSequencesMapping.entries()];
  }
  return Object.entries(routeStopSequencesMapping || {});
}

function getRouteSequences(routeStopSequencesMapping = {}, routeId) {
  if (routeStopSequencesMapping instanceof Map) {
    return routeStopSequencesMapping.get(routeId);
  }
  return routeStopSequencesMapping?.[routeId];
}

function terminalChanged(previousSequence, currentSequence) {
  if (previousSequence.length === 0 || currentSequence.length === 0) return false;
  const previousFirst = previousSequence[0];
  const previousLast = previousSequence[previousSequence.length - 1];
  const currentFirst = currentSequence[0];
  const currentLast = currentSequence[currentSequence.length - 1];
  return previousFirst !== currentFirst || previousLast !== currentLast;
}

function buildRouteChange({ routeId, previousSequence, currentSequence, previousStopsById, currentStopsById }) {
  const currentStopSet = new Set(currentSequence);
  const previousStopSet = new Set(previousSequence);

  const removedStops = previousSequence
    .filter((stopId) => !currentStopSet.has(stopId))
    .map((stopId) => getStop(previousStopsById, stopId));
  const addedStops = currentSequence
    .filter((stopId) => !previousStopSet.has(stopId))
    .map((stopId) => getStop(currentStopsById, stopId));

  const reasons = [];
  if (removedStops.some((stop) => stop.isMajor)) reasons.push('major_stop_removed');
  if (terminalChanged(previousSequence, currentSequence)) reasons.push('terminal_changed');
  if (removedStops.length >= 3) reasons.push('multiple_stops_removed');

  return {
    routeId,
    changeType: 'route_stop_sequence_changed',
    significant: reasons.length > 0,
    reasons,
    previousStopCount: previousSequence.length,
    currentStopCount: currentSequence.length,
    removedStops,
    addedStops,
  };
}

function buildGtfsBaselineChanges({ previous = {}, current = {} } = {}) {
  const previousMapping = previous.routeStopSequencesMapping || {};
  const currentMapping = current.routeStopSequencesMapping || {};
  const changes = [];

  for (const [rawRouteId, previousRouteSequences] of routeEntries(previousMapping)) {
    const routeId = normalizeRouteId(rawRouteId);
    if (!routeId) continue;

    const currentRouteSequences = getRouteSequences(currentMapping, rawRouteId) ||
      getRouteSequences(currentMapping, routeId);
    if (!currentRouteSequences) continue;

    const previousSequence = getCanonicalStopSequence(previousRouteSequences);
    const currentSequence = getCanonicalStopSequence(currentRouteSequences);

    if (previousSequence.length === 0 || currentSequence.length === 0) continue;
    if (sequenceEqual(previousSequence, currentSequence)) continue;

    changes.push(buildRouteChange({
      routeId,
      previousSequence,
      currentSequence,
      previousStopsById: previous.stopsById,
      currentStopsById: current.stopsById,
    }));
  }

  return {
    hasChanges: changes.length > 0,
    changes,
    significantChanges: changes.filter((change) => change.significant),
  };
}

module.exports = {
  buildGtfsBaselineChanges,
  getCanonicalStopSequence,
};
