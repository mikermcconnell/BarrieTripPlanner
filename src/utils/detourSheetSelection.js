export const getSelectedDetourSegments = (segments = [], selectedSegmentIndex = null) => {
  const normalizedSegments = Array.isArray(segments) ? segments : [];
  if (!Number.isInteger(selectedSegmentIndex)) return normalizedSegments;
  const selectedSegment = normalizedSegments[selectedSegmentIndex];
  return selectedSegment ? [selectedSegment] : normalizedSegments;
};

const getStopKey = (stop) => (
  String(stop?.id ?? stop?.stopId ?? stop?.stop_id ?? stop?.code ?? stop?.stopCode ?? stop?.name ?? '')
    .trim()
    .toLowerCase()
);

const tagStopsForRoute = (routeId, stops = []) => (
  (Array.isArray(stops) ? stops : []).map((stop) => ({
    ...stop,
    routeId: stop?.routeId ?? routeId,
  }))
);

const mergeUniqueStops = (...stopLists) => {
  const seen = new Set();
  const merged = [];

  stopLists.flat().forEach((stop) => {
    if (!stop) return;
    const key = getStopKey(stop);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    merged.push(stop);
  });

  return merged;
};

export const mergeFamilySegmentStopDetails = ({
  routeIds = [],
  primaryRouteId = null,
  segmentStopDetails = [],
  selectedSegmentIndex = null,
  detourStopDetailsByRouteId = {},
} = {}) => {
  const normalizedRouteIds = Array.isArray(routeIds) ? routeIds.filter(Boolean) : [];
  if (normalizedRouteIds.length < 2) return null;

  const selectedSegments = getSelectedDetourSegments(segmentStopDetails, selectedSegmentIndex);
  const baseSegment = selectedSegments[0] ||
    getSelectedDetourSegments(
      detourStopDetailsByRouteId[primaryRouteId]?.segmentStopDetails,
      selectedSegmentIndex
    )[0];
  if (!baseSegment) return null;

  const skippedStops = [];
  const affectedStops = [];
  normalizedRouteIds.forEach((routeId) => {
    const segments = getSelectedDetourSegments(
      detourStopDetailsByRouteId[routeId]?.segmentStopDetails,
      selectedSegmentIndex
    );
    segments.forEach((segment) => {
      skippedStops.push(...tagStopsForRoute(routeId, segment?.skippedStops));
      affectedStops.push(...tagStopsForRoute(routeId, segment?.affectedStops));
    });
  });

  return [{
    ...baseSegment,
    routeIds: normalizedRouteIds,
    skippedStops: mergeUniqueStops(
      tagStopsForRoute(primaryRouteId ?? normalizedRouteIds[0], baseSegment.skippedStops),
      skippedStops
    ),
    affectedStops: mergeUniqueStops(
      tagStopsForRoute(primaryRouteId ?? normalizedRouteIds[0], baseSegment.affectedStops),
      affectedStops
    ),
  }];
};
