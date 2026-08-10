function normalizeDetourCoordinate(point) {
  if (!point) return null;

  const latitude = point.latitude ?? point.lat ?? null;
  const longitude = point.longitude ?? point.lon ?? null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

function appendCoordinate(target, seen, point) {
  const normalized = normalizeDetourCoordinate(point);
  if (!normalized) return;

  const key = `${normalized.latitude.toFixed(6)}:${normalized.longitude.toFixed(6)}`;
  if (seen.has(key)) return;

  seen.add(key);
  target.push(normalized);
}

function appendPolyline(target, seen, polyline) {
  if (!Array.isArray(polyline)) return;
  polyline.forEach((point) => appendCoordinate(target, seen, point));
}

function getNormalizedSegments(detour) {
  if (Array.isArray(detour?.segments) && detour.segments.length > 0) {
    return detour.segments;
  }

  if (!detour) return [];
  return [detour];
}

function appendSegmentGeometry(target, seen, segment) {
  if (!segment) return;

  appendPolyline(target, seen, segment.skippedSegmentPolyline);
  appendPolyline(target, seen, segment.likelyDetourPolyline);
  appendPolyline(target, seen, segment.inferredDetourPolyline);
  appendCoordinate(target, seen, segment.entryPoint);
  appendCoordinate(target, seen, segment.exitPoint);
}

function normalizeFocusedRouteIds({ activeDetours, focusedRouteId, focusedRouteIds }) {
  const ids = Array.isArray(focusedRouteIds) && focusedRouteIds.length > 0
    ? focusedRouteIds
    : focusedRouteId
      ? [focusedRouteId]
      : [];

  const normalized = [...new Set(ids.map((routeId) => String(routeId || '').trim()).filter(Boolean))]
    .filter((routeId) => activeDetours?.[routeId]);

  return normalized.length > 0 ? normalized : Object.keys(activeDetours || {});
}

function getViewportSegments(detour, segmentIndex = null) {
  const segments = getNormalizedSegments(detour);
  if (!Number.isInteger(segmentIndex)) return segments;
  return segments[segmentIndex] ? [segments[segmentIndex]] : segments;
}

export function getDetourViewportCoordinates({
  activeDetours = {},
  focusedRouteId = null,
  focusedRouteIds = null,
  segmentIndex = null,
}) {
  const routeIds = normalizeFocusedRouteIds({ activeDetours, focusedRouteId, focusedRouteIds });

  const coordinates = [];
  const seen = new Set();

  routeIds.forEach((routeId) => {
    const detour = activeDetours?.[routeId];
    if (!detour) return;

    const segments = getViewportSegments(detour, segmentIndex);
    segments.forEach((segment) => appendSegmentGeometry(coordinates, seen, segment));
  });

  return coordinates;
}

export function getDetourEventViewportCoordinates({
  activeDetours = {},
  detourEvent = null,
  fallbackRouteId = null,
}) {
  const candidates = Array.isArray(detourEvent?.candidates)
    ? detourEvent.candidates
    : [];

  if (candidates.length === 0) {
    return getDetourViewportCoordinates({
      activeDetours,
      focusedRouteId: fallbackRouteId || detourEvent?.primaryRouteId || null,
      focusedRouteIds: detourEvent?.routeIds,
      segmentIndex: Number.isInteger(detourEvent?.primarySegmentIndex)
        ? detourEvent.primarySegmentIndex
        : null,
    });
  }

  const coordinates = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    const routeId = String(candidate?.routeId || '').trim();
    const detour = (routeId ? activeDetours?.[routeId] : null) || candidate?.detour || null;
    const segments = getNormalizedSegments(detour);
    const segment = candidate?.segment || (
      Number.isInteger(candidate?.segmentIndex)
        ? segments[candidate.segmentIndex]
        : detour
    );

    appendSegmentGeometry(coordinates, seen, segment || detour);
  });

  if (coordinates.length > 0) return coordinates;

  return getDetourViewportCoordinates({
    activeDetours,
    focusedRouteId: fallbackRouteId || detourEvent?.primaryRouteId || null,
    focusedRouteIds: detourEvent?.routeIds,
    segmentIndex: Number.isInteger(detourEvent?.primarySegmentIndex)
      ? detourEvent.primarySegmentIndex
      : null,
  });
}

function focusMapOnCoordinates({
  coordinates,
  mapRef = null,
  edgePadding = null,
  animated = true,
  duration = 500,
  singlePointDelta = 0.01,
}) {
  const map = mapRef?.current || mapRef;
  if (!map || coordinates.length === 0) {
    return { focused: false, coordinateCount: coordinates.length };
  }

  if (coordinates.length === 1 && typeof map.animateToRegion === 'function') {
    const coordinate = coordinates[0];
    map.animateToRegion({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      latitudeDelta: singlePointDelta,
      longitudeDelta: singlePointDelta,
    }, duration);
    return { focused: true, coordinateCount: coordinates.length };
  }

  if (coordinates.length >= 2 && typeof map.fitToCoordinates === 'function') {
    map.fitToCoordinates(coordinates, {
      edgePadding,
      animated,
    });
    return { focused: true, coordinateCount: coordinates.length };
  }

  return { focused: false, coordinateCount: coordinates.length };
}

export function focusMapToDetour({
  activeDetours = {},
  routeId = null,
  routeIds = null,
  segmentIndex = null,
  mapRef = null,
  edgePadding = null,
  animated = true,
  duration = 500,
  singlePointDelta = 0.01,
}) {
  const coordinates = getDetourViewportCoordinates({
    activeDetours,
    focusedRouteId: routeId,
    focusedRouteIds: routeIds,
    segmentIndex,
  });

  return focusMapOnCoordinates({
    coordinates,
    mapRef,
    edgePadding,
    animated,
    duration,
    singlePointDelta,
  });
}

export function focusMapToDetourEvent({
  activeDetours = {},
  detourEvent = null,
  fallbackRouteId = null,
  mapRef = null,
  edgePadding = null,
  animated = true,
  duration = 500,
  singlePointDelta = 0.01,
}) {
  const coordinates = getDetourEventViewportCoordinates({
    activeDetours,
    detourEvent,
    fallbackRouteId,
  });

  return focusMapOnCoordinates({
    coordinates,
    mapRef,
    edgePadding,
    animated,
    duration,
    singlePointDelta,
  });
}
