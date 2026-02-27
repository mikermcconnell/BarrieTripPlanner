import { useMemo } from 'react';
import { haversineDistance } from '../utils/geometryUtils';

/**
 * Pure derivation — exported for testing without React.
 */
export function deriveAffectedStops({ routeId, entryPoint, exitPoint, stops, routeStopsMapping }) {
  const empty = { affectedStops: [], entryStopName: null, exitStopName: null };

  if (!entryPoint || !exitPoint) return empty;
  if (!routeId || !routeStopsMapping[routeId]) return empty;

  const stopIds = routeStopsMapping[routeId];
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

  return {
    affectedStops,
    entryStopName: affectedStops.length > 0 ? affectedStops[0].name : null,
    exitStopName: affectedStops.length > 0 ? affectedStops[affectedStops.length - 1].name : null,
  };
}

export const useAffectedStops = ({ routeId, entryPoint, exitPoint, stops, routeStopsMapping }) => {
  const result = useMemo(
    () => deriveAffectedStops({ routeId, entryPoint, exitPoint, stops, routeStopsMapping }),
    [routeId, entryPoint, exitPoint, stops, routeStopsMapping]
  );
  return result;
};
