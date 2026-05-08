import { calculateBearing } from './geometryUtils';

export const ROUTE_LINE_LABEL_MARKERS = {
  SELECTED_MIN_ZOOM: 13.5,
  GENERAL_MIN_ZOOM: 14,
  SECONDARY_MIN_ZOOM: 15,
  TERTIARY_MIN_ZOOM: 16,
  FAMILY_HUB_MIN_ZOOM: 15,
  DEFAULT_MAX_LABELS: 36,
  DETOUR_FOCUS_MAX_LABELS: 12,
  DOWNTOWN_HUB_MAX_LABELS: 1,
  DOWNTOWN_HUB_DISTANCE: 0.0045,
  DEFAULT_COLLISION_DISTANCE: 0.0012,
  LONG_ROUTE_MIN_POINTS: 5,
  FALLBACK_COLOR: '#1A73E8',
};

const DOWNTOWN_HUB_COORDINATE = {
  latitude: 44.3891,
  longitude: -79.6903,
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

const getBranchFamily = (label) => {
  const text = String(label || '').trim().toUpperCase();
  const match = text.match(/^(.+?)([A-Z])$/);
  if (!match) return null;
  if (!/\d/.test(match[1])) return null;
  return {
    familyId: match[1],
    branch: match[2],
    label: text,
  };
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

const bearingForSegment = (start, end) => {
  const bearing = calculateBearing(start, end);
  return Number.isFinite(bearing) ? Number(bearing.toFixed(1)) : null;
};

const bearingNearIndex = (coordinates, index) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  if (index < coordinates.length - 1) {
    return bearingForSegment(coordinates[index], coordinates[index + 1]);
  }
  return bearingForSegment(coordinates[index - 1], coordinates[index]);
};

const distanceBetween = (a, b) => {
  if (!validCoordinate(a) || !validCoordinate(b)) return Number.POSITIVE_INFINITY;
  const lat = Number(b.latitude) - Number(a.latitude);
  const lon = Number(b.longitude) - Number(a.longitude);
  return Math.sqrt((lat * lat) + (lon * lon));
};

const routePassesNear = (coordinates, coordinate, maxDistance) => (
  Array.isArray(coordinates)
  && coordinates.some((point) => distanceBetween(point, coordinate) <= maxDistance)
);

const pickFamilyLabelPlacement = (branchRecords) => {
  const records = Array.isArray(branchRecords)
    ? branchRecords.filter((record) => Array.isArray(record.coordinates) && record.coordinates.length >= 2)
    : [];
  if (records.length < 2) return records[0] ? pickPrimaryLabelPlacement(records[0].coordinates) : null;

  const primary = records[0];
  const secondary = records[1];
  let best = null;

  primary.coordinates.forEach((firstPoint, firstIndex) => {
    secondary.coordinates.forEach((secondPoint, secondIndex) => {
      const distance = distanceBetween(firstPoint, secondPoint);
      if (!best || distance < best.distance) {
        best = {
          distance,
          firstPoint,
          secondPoint,
          firstIndex,
          secondIndex,
        };
      }
    });
  });

  if (!best) return pickPrimaryLabelPlacement(primary.coordinates);

  return {
    coordinate: midpoint(best.firstPoint, best.secondPoint),
    bearing: bearingNearIndex(primary.coordinates, best.firstIndex),
    branchBearings: {
      [primary.routeId]: bearingNearIndex(primary.coordinates, best.firstIndex),
      [secondary.routeId]: bearingNearIndex(secondary.coordinates, best.secondIndex),
    },
  };
};

const pickPrimaryLabelPlacement = (coordinates) => {
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

  return {
    coordinate: midpoint(points[bestIndex], points[bestIndex + 1]),
    bearing: bearingForSegment(points[bestIndex], points[bestIndex + 1]),
  };
};

export const pickPrimaryLabelCoordinate = (coordinates) => (
  pickPrimaryLabelPlacement(coordinates)?.coordinate || null
);

const pickPlacementAtRatio = (coordinates, ratio) => {
  let total = 0;
  const segments = [];

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const segment = { start: coordinates[index], end: coordinates[index + 1] };
    segment.length = segmentLength(segment.start, segment.end);
    total += segment.length;
    segments.push(segment);
  }

  if (total === 0) return pickPrimaryLabelPlacement(coordinates);

  const target = total * ratio;
  let travelled = 0;

  for (const segment of segments) {
    if (travelled + segment.length >= target) {
      const segmentRatio = (target - travelled) / segment.length;
      return {
        coordinate: {
          latitude: Number((segment.start.latitude + ((segment.end.latitude - segment.start.latitude) * segmentRatio)).toFixed(6)),
          longitude: Number((segment.start.longitude + ((segment.end.longitude - segment.start.longitude) * segmentRatio)).toFixed(6)),
        },
        bearing: bearingForSegment(segment.start, segment.end),
      };
    }
    travelled += segment.length;
  }

  return {
    coordinate: normalizeCoordinate(coordinates[coordinates.length - 1]),
    bearing: bearingForSegment(coordinates[coordinates.length - 2], coordinates[coordinates.length - 1]),
  };
};

const priorityFor = (routeId, selectedRouteIds, hoveredRouteId) => {
  if (selectedRouteIds?.has?.(routeId)) return 300;
  if (hoveredRouteId === routeId) return 200;
  return 100;
};

const priorityForFamily = (records, selectedRouteIds, hoveredRouteId) => {
  if (records.some((record) => selectedRouteIds?.has?.(record.routeId))) return 300;
  if (records.some((record) => hoveredRouteId === record.routeId)) return 200;
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
  const records = [];

  shapes.forEach((shape, index) => {
    const routeId = shape?.routeId;
    const label = getLabel(routeId, routeShortNameMap);
    if (!label || !visibleAtZoom(routeId, zoom, selectedRouteIds, hoveredRouteId)) return;

    const coordinates = getCoordinates(shape);
    if (coordinates.length < 2) return;

    records.push({
      index,
      shape,
      routeId,
      label,
      color: shape.color || shape.routeColor || ROUTE_LINE_LABEL_MARKERS.FALLBACK_COLOR,
      coordinates,
      family: getBranchFamily(label),
    });
  });

  const familyGroups = new Map();
  records.forEach((record) => {
    if (!record.family) return;
    const existing = familyGroups.get(record.family.familyId) || [];
    existing.push(record);
    familyGroups.set(record.family.familyId, existing);
  });

  const groupedRouteIds = new Set();

  familyGroups.forEach((group, familyId) => {
    const uniqueBranches = new Map();
    group.forEach((record) => {
      if (!uniqueBranches.has(record.family.branch)) uniqueBranches.set(record.family.branch, record);
    });
    const branchRecords = [...uniqueBranches.values()]
      .sort((a, b) => a.family.branch.localeCompare(b.family.branch));

    if (branchRecords.length < 2) return;

    branchRecords.forEach((record) => groupedRouteIds.add(record.routeId));

    const priority = priorityForFamily(branchRecords, selectedRouteIds, hoveredRouteId);
    const placement = pickFamilyLabelPlacement(branchRecords);
    const nearHub = branchRecords.some((record) => (
      routePassesNear(
        record.coordinates,
        DOWNTOWN_HUB_COORDINATE,
        ROUTE_LINE_LABEL_MARKERS.DOWNTOWN_HUB_DISTANCE
      )
    ));
    const slot = nearHub && zoom >= ROUTE_LINE_LABEL_MARKERS.FAMILY_HUB_MIN_ZOOM
      ? 'family-hub'
      : 'family-primary';
    const branches = branchRecords.map((record, branchIndex) => ({
      routeId: record.routeId,
      label: record.label,
      direction: branchIndex === 0 ? 'left' : 'right',
      bearing: placement?.branchBearings?.[record.routeId] ?? null,
      color: record.color,
    }));
    const color = branchRecords[0]?.color || ROUTE_LINE_LABEL_MARKERS.FALLBACK_COLOR;

    candidates.push({
      routeId: familyId,
      label: branches.map((branch) => branch.label).join('/'),
      color,
      isSelected: priority === 300,
      isHovered: priority === 200,
      isRouteFamily: true,
      branches,
      id: `route-line-label-family-${familyId}-${slot}`,
      coordinate: slot === 'family-hub' ? DOWNTOWN_HUB_COORDINATE : placement?.coordinate,
      bearing: placement?.bearing,
      priority: slot === 'family-hub' ? priority + 15 : priority + 10,
      slot,
      order: Math.min(...branchRecords.map((record) => record.index)),
    });
  });

  records.forEach((record) => {
    if (groupedRouteIds.has(record.routeId)) return;

    const { routeId, label, coordinates, shape, index } = record;
    const priority = priorityFor(routeId, selectedRouteIds, hoveredRouteId);
    const base = shape.id || shape.shapeId || routeId || `shape-${index}`;
    const common = {
      routeId,
      label,
      color: record.color,
      isSelected: priority === 300,
      isHovered: priority === 200,
    };

    const primaryPlacement = pickPrimaryLabelPlacement(coordinates);
    candidates.push({
      ...common,
      id: `route-line-label-${base}-primary`,
      coordinate: primaryPlacement?.coordinate,
      bearing: primaryPlacement?.bearing,
      priority,
      slot: 'primary',
      order: index,
    });

    if (zoom >= ROUTE_LINE_LABEL_MARKERS.SECONDARY_MIN_ZOOM && coordinates.length >= ROUTE_LINE_LABEL_MARKERS.LONG_ROUTE_MIN_POINTS) {
      const secondaryPlacement = pickPlacementAtRatio(coordinates, 0.72);
      candidates.push({
        ...common,
        id: `route-line-label-${base}-secondary`,
        coordinate: secondaryPlacement?.coordinate,
        bearing: secondaryPlacement?.bearing,
        priority: priority - 5,
        slot: 'secondary',
        order: index + 0.5,
      });
    }

    if (zoom >= ROUTE_LINE_LABEL_MARKERS.TERTIARY_MIN_ZOOM && coordinates.length >= ROUTE_LINE_LABEL_MARKERS.LONG_ROUTE_MIN_POINTS) {
      const tertiaryPlacement = pickPlacementAtRatio(coordinates, 0.28);
      candidates.push({
        ...common,
        id: `route-line-label-${base}-tertiary`,
        coordinate: tertiaryPlacement?.coordinate,
        bearing: tertiaryPlacement?.bearing,
        priority: priority - 10,
        slot: 'tertiary',
        order: index + 0.25,
      });
    }
  });

  const placedHubFamilies = new Set();

  return candidates
    .filter((candidate) => candidate.coordinate)
    .sort((a, b) => (b.priority - a.priority) || (a.order - b.order))
    .reduce((placed, candidate) => {
      if (placed.length >= limit) return placed;
      if (candidate.slot === 'family-hub') {
        if (placedHubFamilies.size >= ROUTE_LINE_LABEL_MARKERS.DOWNTOWN_HUB_MAX_LABELS) return placed;
      }
      if (placed.some((marker) => collides(candidate, marker, collisionDistance))) return placed;
      if (candidate.slot === 'family-hub') {
        placedHubFamilies.add(candidate.routeId);
      }
      placed.push(candidate);
      return placed;
    }, [])
    .map(({ order, ...marker }) => marker);
};
