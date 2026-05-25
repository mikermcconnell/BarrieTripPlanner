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
    segments.forEach((segment) => {
      appendPolyline(coordinates, seen, segment?.skippedSegmentPolyline);
      appendPolyline(coordinates, seen, segment?.likelyDetourPolyline);
      appendPolyline(coordinates, seen, segment?.inferredDetourPolyline);
      appendCoordinate(coordinates, seen, segment?.entryPoint);
      appendCoordinate(coordinates, seen, segment?.exitPoint);
    });
  });

  return coordinates;
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
