import { useMemo } from 'react';
import { haversineDistance, pointToPolylineDistance, projectPointToPolyline } from '../utils/geometryUtils';
import { getRouteStopSequence } from '../utils/gtfsStopSequences';
import { getUniqueDetourSections } from '../utils/detourHelpers';

const SKIPPED_STOP_POLYLINE_PROXIMITY_METERS = 50;
const BOUNDARY_STOP_OPEN_BUFFER_METERS = 60;

const normalizeStopKey = (value) => (
  value == null ? null : String(value).trim().toLowerCase()
);

const getStopKey = (stop) => normalizeStopKey(
  stop?.id ?? stop?.stopId ?? stop?.stop_id ?? stop?.code ?? stop?.stopCode
);

const getStopCodeKey = (stop) => normalizeStopKey(
  stop?.code ?? stop?.stopCode ?? stop?.stop_code
);

const getCumulativeDistances = (polyline) => {
  if (!Array.isArray(polyline) || polyline.length === 0) return [];

  const cumulative = [0];
  for (let index = 1; index < polyline.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + haversineDistance(
      polyline[index - 1].latitude,
      polyline[index - 1].longitude,
      polyline[index].latitude,
      polyline[index].longitude
    );
  }
  return cumulative;
};

const getProjectionProgressMeters = (projection, polyline, cumulativeDistances) => {
  if (!projection || !Array.isArray(polyline) || polyline.length < 2) return null;
  const segmentStart = polyline[projection.segmentIndex] || polyline[0];
  const segmentStartProgress = cumulativeDistances[projection.segmentIndex] || 0;
  const progress = segmentStartProgress + haversineDistance(
    segmentStart.latitude,
    segmentStart.longitude,
    projection.point.latitude,
    projection.point.longitude
  );
  return Number.isFinite(progress) ? progress : null;
};

const buildStopLookups = (stops = []) => {
  const byId = new Map();
  const byCode = new Map();

  (Array.isArray(stops) ? stops : []).forEach((stop) => {
    const idKey = getStopKey(stop);
    const codeKey = getStopCodeKey(stop);
    if (idKey) byId.set(idKey, stop);
    if (codeKey) byCode.set(codeKey, stop);
  });

  return { byId, byCode };
};

const resolveStopReference = (reference, lookups) => {
  if (reference == null) return null;

  if (typeof reference === 'object') {
    const idKey = getStopKey(reference);
    const codeKey = getStopCodeKey(reference);
    return (
      (idKey && lookups.byId.get(idKey)) ||
      (codeKey && lookups.byCode.get(codeKey)) ||
      reference
    );
  }

  const key = normalizeStopKey(reference);
  return key ? (lookups.byId.get(key) || lookups.byCode.get(key) || null) : null;
};

const resolveStopList = (references, lookups) => (
  (Array.isArray(references) ? references : [])
    .map((reference) => resolveStopReference(reference, lookups))
    .filter(Boolean)
);

const hasNonEmptyArray = (value) => Array.isArray(value) && value.length > 0;

const hasExplicitStopImpacts = (segment) => (
  hasNonEmptyArray(segment?.skippedStopIds) ||
  hasNonEmptyArray(segment?.affectedStopIds) ||
  hasNonEmptyArray(segment?.skippedStops) ||
  hasNonEmptyArray(segment?.affectedStops)
);

const deriveExplicitAffectedStops = ({
  routeId,
  shapeId,
  segment,
  stops,
  routeStopsMapping,
  routeStopSequencesMapping,
}) => {
  const stopIds = getRouteStopSequence({ routeId, shapeId, routeStopsMapping, routeStopSequencesMapping }) || [];
  const stopMap = new Map((Array.isArray(stops) ? stops : []).map((stop) => [stop.id, stop]));
  const routeStops = stopIds.map((id) => stopMap.get(id)).filter(Boolean);
  const lookups = buildStopLookups(stops);
  const skippedStops = resolveStopList(
    Array.isArray(segment?.skippedStops) && segment.skippedStops.length > 0
      ? segment.skippedStops
      : segment?.skippedStopIds,
    lookups
  );
  const affectedStops = resolveStopList(
    Array.isArray(segment?.affectedStops) && segment.affectedStops.length > 0
      ? segment.affectedStops
      : segment?.affectedStopIds,
    lookups
  );
  const resolvedAffectedStops = affectedStops.length > 0 ? affectedStops : skippedStops;
  const entryStop =
    resolveStopReference(segment?.entryStop, lookups) ||
    resolveStopReference(segment?.entryStopId, lookups) ||
    resolvedAffectedStops[0] ||
    null;
  const exitStop =
    resolveStopReference(segment?.exitStop, lookups) ||
    resolveStopReference(segment?.exitStopId, lookups) ||
    resolvedAffectedStops[resolvedAffectedStops.length - 1] ||
    null;
  const affectedKeys = new Set(resolvedAffectedStops.map(getStopKey).filter(Boolean));

  return {
    routeStops,
    affectedStops: resolvedAffectedStops,
    skippedStops,
    unaffectedStops: affectedKeys.size > 0
      ? routeStops.filter((stop) => !affectedKeys.has(getStopKey(stop)))
      : [],
    entryStop,
    exitStop,
    entryStopName: entryStop?.name ?? null,
    exitStopName: exitStop?.name ?? null,
  };
};

const getSkippedPolylineStopIndexes = (routeStops, skippedSegmentPolyline) => {
  if (!Array.isArray(skippedSegmentPolyline) || skippedSegmentPolyline.length < 2) {
    return [];
  }

  const cumulativeDistances = getCumulativeDistances(skippedSegmentPolyline);
  const skippedLengthMeters = cumulativeDistances[cumulativeDistances.length - 1] || 0;

  return routeStops.reduce((indexes, stop, index) => {
    const stopPoint = { latitude: stop.latitude, longitude: stop.longitude };
    const distance = pointToPolylineDistance(stopPoint, skippedSegmentPolyline);
    if (Number.isFinite(distance) && distance <= SKIPPED_STOP_POLYLINE_PROXIMITY_METERS) {
      const projection = projectPointToPolyline(stopPoint, skippedSegmentPolyline);
      const progressMeters = getProjectionProgressMeters(projection, skippedSegmentPolyline, cumulativeDistances);
      const remainingMeters = skippedLengthMeters - (progressMeters ?? skippedLengthMeters);
      const isSafelyInsideSkippedSegment =
        Number.isFinite(progressMeters) &&
        progressMeters > BOUNDARY_STOP_OPEN_BUFFER_METERS &&
        remainingMeters > BOUNDARY_STOP_OPEN_BUFFER_METERS;

      if (isSafelyInsideSkippedSegment) {
        indexes.push(index);
      }
    }
    return indexes;
  }, []);
};

/**
 * Pure derivation — exported for testing without React.
 */
export function deriveAffectedStops({
  routeId,
  shapeId,
  entryPoint,
  exitPoint,
  skippedSegmentPolyline,
  stops,
  routeStopsMapping,
  routeStopSequencesMapping,
}) {
  const empty = {
    routeStops: [],
    affectedStops: [],
    skippedStops: [],
    unaffectedStops: [],
    entryStop: null,
    exitStop: null,
    entryStopName: null,
    exitStopName: null,
  };

  if (!entryPoint || !exitPoint) return empty;
  if (!routeId) return empty;

  const stopIds = getRouteStopSequence({ routeId, shapeId, routeStopsMapping, routeStopSequencesMapping });
  if (!stopIds || stopIds.length === 0) return empty;

  const stopMap = new Map(stops.map(s => [s.id, s]));
  const routeStops = stopIds.map(id => stopMap.get(id)).filter(Boolean);

  if (routeStops.length === 0) return empty;

  // Find closest stop to entry and exit points
  let entryIndex = 0;
  let exitIndex = 0;
  let minEntryDist = Infinity;
  let minExitDist = Infinity;

  routeStops.forEach((stop, i) => {
    const dEntry = haversineDistance(
      stop.latitude, stop.longitude,
      entryPoint.latitude, entryPoint.longitude
    );
    const dExit = haversineDistance(
      stop.latitude, stop.longitude,
      exitPoint.latitude, exitPoint.longitude
    );
    if (dEntry < minEntryDist) { minEntryDist = dEntry; entryIndex = i; }
    if (dExit < minExitDist) { minExitDist = dExit; exitIndex = i; }
  });

  // Ensure entry comes before exit in stop order
  const startIdx = Math.min(entryIndex, exitIndex);
  const endIdx = Math.max(entryIndex, exitIndex);

  const pathSkippedIndexes = getSkippedPolylineStopIndexes(routeStops, skippedSegmentPolyline);
  const expandedStartIdx = Math.min(startIdx, ...pathSkippedIndexes);
  const expandedEndIdx = Math.max(endIdx, ...pathSkippedIndexes);

  const affectedStops = routeStops.slice(expandedStartIdx, expandedEndIdx + 1);
  const entryStop = affectedStops.length > 0 ? affectedStops[0] : null;
  const exitStop = affectedStops.length > 0 ? affectedStops[affectedStops.length - 1] : null;
  const skippedStopIndexes = new Set([
    ...routeStops
      .slice(startIdx, endIdx + 1)
      .slice(1, -1)
      .map((_, relativeIndex) => startIdx + 1 + relativeIndex),
    ...pathSkippedIndexes,
  ]);
  const skippedStops = routeStops.filter((_, index) => skippedStopIndexes.has(index));
  const unaffectedStops = routeStops.filter((_, index) => index < expandedStartIdx || index > expandedEndIdx);

  return {
    routeStops,
    affectedStops,
    skippedStops,
    unaffectedStops,
    entryStop,
    exitStop,
    entryStopName: entryStop?.name ?? null,
    exitStopName: exitStop?.name ?? null,
  };
}

export function deriveAffectedStopDetailsForDetour({
  routeId,
  segments,
  stops,
  routeStopsMapping,
  routeStopSequencesMapping,
}) {
  const normalizedSegments = Array.isArray(segments) ? segments : [];
  if (!routeId || normalizedSegments.length === 0) {
    return {
      routeStops: [],
      segmentStopDetails: [],
    };
  }

  const segmentStopDetails = getUniqueDetourSections(normalizedSegments.map((segment) => ({
    ...segment,
    ...(segment?.suppressStopDerivation
      ? {
        routeStops: [],
        affectedStops: [],
        skippedStops: [],
        unaffectedStops: [],
        entryStop: null,
        exitStop: null,
        entryStopName: null,
        exitStopName: null,
      }
      : hasExplicitStopImpacts(segment)
        ? deriveExplicitAffectedStops({
          routeId,
          shapeId: segment?.shapeId,
          segment,
          stops,
          routeStopsMapping,
          routeStopSequencesMapping,
        })
      : deriveAffectedStops({
        routeId,
        shapeId: segment?.shapeId,
        entryPoint: segment?.entryPoint,
        exitPoint: segment?.exitPoint,
        skippedSegmentPolyline: segment?.skippedSegmentPolyline,
        stops,
        routeStopsMapping,
        routeStopSequencesMapping,
      })),
  })));

  const routeStops =
    segmentStopDetails.find((segment) => Array.isArray(segment.routeStops) && segment.routeStops.length > 0)?.routeStops ??
    [];

  return {
    routeStops,
    segmentStopDetails,
  };
}

export const useAffectedStops = ({
  routeId,
  shapeId,
  entryPoint,
  exitPoint,
  skippedSegmentPolyline,
  stops,
  routeStopsMapping,
  routeStopSequencesMapping,
}) => {
  const result = useMemo(
    () => deriveAffectedStops({
      routeId,
      shapeId,
      entryPoint,
      exitPoint,
      skippedSegmentPolyline,
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    }),
    [routeId, shapeId, entryPoint, exitPoint, skippedSegmentPolyline, stops, routeStopsMapping, routeStopSequencesMapping]
  );
  return result;
};
