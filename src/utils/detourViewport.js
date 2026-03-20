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

export function getDetourViewportCoordinates({ activeDetours = {}, focusedRouteId = null }) {
  const routeIds =
    focusedRouteId && activeDetours?.[focusedRouteId]
      ? [focusedRouteId]
      : Object.keys(activeDetours || {});

  const coordinates = [];
  const seen = new Set();

  routeIds.forEach((routeId) => {
    const detour = activeDetours?.[routeId];
    if (!detour) return;

    const segments = getNormalizedSegments(detour);
    segments.forEach((segment) => {
      appendPolyline(coordinates, seen, segment?.skippedSegmentPolyline);
      appendPolyline(coordinates, seen, segment?.inferredDetourPolyline);
      appendCoordinate(coordinates, seen, segment?.entryPoint);
      appendCoordinate(coordinates, seen, segment?.exitPoint);
    });
  });

  return coordinates;
}

export function shouldAutoFitDetourViewport({
  isDetourView,
  previousIsDetourView,
  focusedRouteId,
  previousFocusedRouteId,
}) {
  if (!isDetourView) return false;
  if (!previousIsDetourView) return true;
  return focusedRouteId !== previousFocusedRouteId;
}

