export const ROUTE_LINE_LABEL_MARKERS = {
  SELECTED_MIN_ZOOM: 13.5,
  GENERAL_MIN_ZOOM: 14,
  SECONDARY_MIN_ZOOM: 15,
  DEFAULT_MAX_LABELS: 24,
  DETOUR_FOCUS_MAX_LABELS: 8,
  DEFAULT_COLLISION_DISTANCE: 0.0012,
  LONG_ROUTE_MIN_POINTS: 5,
  FALLBACK_COLOR: '#1A73E8',
};

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const validCoordinate = (coordinate) => (
  coordinate
  && numberOrNull(coordinate.latitude) !== null
  && numberOrNull(coordinate.longitude) !== null
);

const normalizeCoordinate = (coordinate) => ({
  latitude: Number(coordinate.latitude),
  longitude: Number(coordinate.longitude),
});

const getCoordinates = (shape) => (
  Array.isArray(shape?.coordinates)
    ? shape.coordinates.filter(validCoordinate).map(normalizeCoordinate)
    : []
);

const getLabel = (routeId, routeShortNameMap) => {
  const value = typeof routeShortNameMap?.get === 'function'
    ? routeShortNameMap.get(routeId)
    : routeShortNameMap?.[routeId];
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || null;
};

const segmentLength = (a, b) => {
  const lat = b.latitude - a.latitude;
  const lon = b.longitude - a.longitude;
  return Math.sqrt((lat * lat) + (lon * lon));
};

const midpoint = (a, b) => ({
  latitude: Number(((a.latitude + b.latitude) / 2).toFixed(6)),
  longitude: Number(((a.longitude + b.longitude) / 2).toFixed(6)),
});

export const pickPrimaryLabelCoordinate = (coordinates) => {
  const points = Array.isArray(coordinates) ? coordinates.filter(validCoordinate).map(normalizeCoordinate) : [];
  if (points.length < 2) return null;

  let bestIndex = 0;
  let bestLength = -1;

  for (let index = 0; index < points.length - 1; index += 1) {
    const length = segmentLength(points[index], points[index + 1]);
    if (length > bestLength) {
      bestIndex = index;
      bestLength = length;
    }
  }

  return midpoint(points[bestIndex], points[bestIndex + 1]);
};

const pickCoordinateAtRatio = (coordinates, ratio) => {
  let total = 0;
  const segments = [];

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const segment = { start: coordinates[index], end: coordinates[index + 1] };
    segment.length = segmentLength(segment.start, segment.end);
    total += segment.length;
    segments.push(segment);
  }

  if (total === 0) return pickPrimaryLabelCoordinate(coordinates);

  const target = total * ratio;
  let travelled = 0;

  for (const segment of segments) {
    if (travelled + segment.length >= target) {
      const segmentRatio = (target - travelled) / segment.length;
      return {
        latitude: Number((segment.start.latitude + ((segment.end.latitude - segment.start.latitude) * segmentRatio)).toFixed(6)),
        longitude: Number((segment.start.longitude + ((segment.end.longitude - segment.start.longitude) * segmentRatio)).toFixed(6)),
      };
    }
    travelled += segment.length;
  }

  return normalizeCoordinate(coordinates[coordinates.length - 1]);
};

const priorityFor = (routeId, selectedRouteIds, hoveredRouteId) => {
  if (selectedRouteIds?.has?.(routeId)) return 300;
  if (hoveredRouteId === routeId) return 200;
  return 100;
};

const visibleAtZoom = (routeId, zoom, selectedRouteIds, hoveredRouteId) => {
  if (selectedRouteIds?.has?.(routeId) || hoveredRouteId === routeId) {
    return zoom >= ROUTE_LINE_LABEL_MARKERS.SELECTED_MIN_ZOOM;
  }
  return zoom >= ROUTE_LINE_LABEL_MARKERS.GENERAL_MIN_ZOOM;
};

const collides = (candidate, placed, distance) => (
  Math.abs(candidate.coordinate.latitude - placed.coordinate.latitude) < distance
  && Math.abs(candidate.coordinate.longitude - placed.coordinate.longitude) < distance
);

export const buildRouteLineLabelMarkers = ({
  shapes = [],
  currentZoom,
  routeShortNameMap,
  selectedRouteIds = new Set(),
  hoveredRouteId = null,
  isTripPreviewMode = false,
  hasDetourFocus = false,
  isDetourView = false,
  maxLabels = null,
  collisionDistance = ROUTE_LINE_LABEL_MARKERS.DEFAULT_COLLISION_DISTANCE,
} = {}) => {
  const zoom = numberOrNull(currentZoom);
  if (isTripPreviewMode || zoom === null || !Array.isArray(shapes)) return [];

  const limit = maxLabels !== null && maxLabels !== undefined && Number.isFinite(Number(maxLabels))
    ? Number(maxLabels)
    : hasDetourFocus || isDetourView
      ? ROUTE_LINE_LABEL_MARKERS.DETOUR_FOCUS_MAX_LABELS
      : ROUTE_LINE_LABEL_MARKERS.DEFAULT_MAX_LABELS;

  const candidates = [];

  shapes.forEach((shape, index) => {
    const routeId = shape?.routeId;
    const label = getLabel(routeId, routeShortNameMap);
    if (!label || !visibleAtZoom(routeId, zoom, selectedRouteIds, hoveredRouteId)) return;

    const coordinates = getCoordinates(shape);
    if (coordinates.length < 2) return;

    const priority = priorityFor(routeId, selectedRouteIds, hoveredRouteId);
    const base = shape.id || shape.shapeId || routeId || `shape-${index}`;
    const common = {
      routeId,
      label,
      color: shape.color || shape.routeColor || ROUTE_LINE_LABEL_MARKERS.FALLBACK_COLOR,
      isSelected: priority === 300,
      isHovered: priority === 200,
    };

    candidates.push({
      ...common,
      id: `route-line-label-${base}-primary`,
      coordinate: pickPrimaryLabelCoordinate(coordinates),
      priority,
      slot: 'primary',
      order: index,
    });

    if (zoom >= ROUTE_LINE_LABEL_MARKERS.SECONDARY_MIN_ZOOM && coordinates.length >= ROUTE_LINE_LABEL_MARKERS.LONG_ROUTE_MIN_POINTS) {
      candidates.push({
        ...common,
        id: `route-line-label-${base}-secondary`,
        coordinate: pickCoordinateAtRatio(coordinates, 0.72),
        priority: priority - 5,
        slot: 'secondary',
        order: index + 0.5,
      });
    }
  });

  return candidates
    .filter((candidate) => candidate.coordinate)
    .sort((a, b) => (b.priority - a.priority) || (a.order - b.order))
    .reduce((placed, candidate) => {
      if (placed.length >= limit) return placed;
      if (placed.some((marker) => collides(candidate, marker, collisionDistance))) return placed;
      placed.push(candidate);
      return placed;
    }, [])
    .map(({ order, ...marker }) => marker);
};
