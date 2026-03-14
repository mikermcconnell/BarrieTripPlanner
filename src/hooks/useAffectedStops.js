import { useMemo } from 'react';
import { haversineDistance } from '../utils/geometryUtils';
import { getRouteStopSequence } from '../utils/gtfsStopSequences';

/**
 * Pure derivation — exported for testing without React.
 */
export function deriveAffectedStops({
  routeId,
  shapeId,
  entryPoint,
  exitPoint,
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

  const affectedStops = routeStops.slice(startIdx, endIdx + 1);
  const entryStop = affectedStops.length > 0 ? affectedStops[0] : null;
  const exitStop = affectedStops.length > 0 ? affectedStops[affectedStops.length - 1] : null;
  const skippedStops = affectedStops.slice(1, -1);
  const unaffectedStops = routeStops.filter((_, index) => index < startIdx || index > endIdx);

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

  const segmentStopDetails = normalizedSegments.map((segment) => ({
    ...segment,
    ...deriveAffectedStops({
      routeId,
      shapeId: segment?.shapeId,
      entryPoint: segment?.entryPoint,
      exitPoint: segment?.exitPoint,
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    }),
  }));

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
      stops,
      routeStopsMapping,
      routeStopSequencesMapping,
    }),
    [routeId, shapeId, entryPoint, exitPoint, stops, routeStopsMapping, routeStopSequencesMapping]
  );
  return result;
};
