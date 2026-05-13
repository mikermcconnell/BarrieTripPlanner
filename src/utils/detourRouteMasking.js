import {
  pointToPolylineDistance,
  pointToSegmentDistance,
  projectPointToPolyline,
  haversineDistance,
} from './geometryUtils';
import { getRouteFamilyId, normalizeRouteId } from './routeDetourMatching';

const DEFAULT_CLOSED_ROUTE_MASK_BUFFER_METERS = 35;

const isFiniteCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude)) &&
  Number.isFinite(Number(point?.longitude))
);

const normalizePath = (path) => (
  Array.isArray(path)
    ? path.filter(isFiniteCoordinate)
    : []
);

const getOverlayClosedPaths = (overlay) => {
  const paths = [];

  if (normalizePath(overlay?.skippedSegmentPolyline).length >= 2) {
    paths.push(normalizePath(overlay.skippedSegmentPolyline));
  }

  if (Array.isArray(overlay?.segmentStopDetails)) {
    overlay.segmentStopDetails.forEach((segment) => {
      const path = normalizePath(segment?.skippedSegmentPolyline);
      if (path.length >= 2) {
        paths.push(path);
      }
    });
  }

  return paths;
};

const routeFamiliesMatch = (routeId, detourRouteId) => {
  const routeKey = normalizeRouteId(routeId);
  const detourKey = normalizeRouteId(detourRouteId);
  if (!routeKey || !detourKey) return false;
  if (routeKey === detourKey) return true;
  return getRouteFamilyId(routeKey) === getRouteFamilyId(detourKey);
};

export const getClosedDetourPathsForRoute = (routeId, detourOverlays = []) => (
  (Array.isArray(detourOverlays) ? detourOverlays : [])
    .filter((overlay) => routeFamiliesMatch(routeId, overlay?.routeId))
    .flatMap(getOverlayClosedPaths)
);

const midpoint = (start, end) => ({
  latitude: (Number(start.latitude) + Number(end.latitude)) / 2,
  longitude: (Number(start.longitude) + Number(end.longitude)) / 2,
});

const pointIsInsideClosedCorridor = (point, closedPaths, bufferMeters) => (
  closedPaths.some((path) => pointToPolylineDistance(point, path) <= bufferMeters)
);

const segmentCrossesClosedCorridor = (start, end, closedPaths, bufferMeters) => (
  closedPaths.some((closedPath) => {
    if (pointToPolylineDistance(midpoint(start, end), closedPath) <= bufferMeters) {
      return true;
    }

    return closedPath.some((closedPoint) =>
      pointToSegmentDistance(closedPoint, start, end) <= bufferMeters
    );
  })
);

const buildCumulativeDistances = (coordinates) => {
  const cumulative = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative[index] =
      cumulative[index - 1] +
      haversineDistance(
        coordinates[index - 1].latitude,
        coordinates[index - 1].longitude,
        coordinates[index].latitude,
        coordinates[index].longitude
      );
  }
  return cumulative;
};

const interpolatePointAlongRoute = (coordinates, cumulativeDistances, targetMeters) => {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  if (coordinates.length === 1) return coordinates[0];

  const maxDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const clampedTarget = Math.max(0, Math.min(targetMeters, maxDistance));

  for (let index = 1; index < cumulativeDistances.length; index += 1) {
    if (cumulativeDistances[index] < clampedTarget) continue;

    const segmentStartDistance = cumulativeDistances[index - 1];
    const segmentLength = cumulativeDistances[index] - segmentStartDistance;
    if (segmentLength <= 0) return coordinates[index];

    const ratio = (clampedTarget - segmentStartDistance) / segmentLength;
    return {
      latitude: coordinates[index - 1].latitude + (coordinates[index].latitude - coordinates[index - 1].latitude) * ratio,
      longitude: coordinates[index - 1].longitude + (coordinates[index].longitude - coordinates[index - 1].longitude) * ratio,
    };
  }

  return coordinates[coordinates.length - 1];
};

const projectPointToRouteProgress = (point, coordinates, cumulativeDistances) => {
  const projection = projectPointToPolyline(point, coordinates);
  if (!projection?.point) return null;

  const segmentStart = coordinates[projection.segmentIndex] || coordinates[0];
  const progressMeters =
    (cumulativeDistances[projection.segmentIndex] || 0) +
    haversineDistance(
      segmentStart.latitude,
      segmentStart.longitude,
      projection.point.latitude,
      projection.point.longitude
    );

  return {
    point: projection.point,
    progressMeters,
  };
};

const dedupeSequentialCoordinates = (points) => {
  if (!Array.isArray(points) || points.length <= 1) return points || [];

  const deduped = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = deduped[deduped.length - 1];
    const next = points[index];
    if (previous.latitude !== next.latitude || previous.longitude !== next.longitude) {
      deduped.push(next);
    }
  }
  return deduped;
};

const extractRouteSegmentByProgress = (coordinates, cumulativeDistances, startMeters, endMeters) => {
  const maxDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const start = Math.max(0, Math.min(startMeters, endMeters, maxDistance));
  const end = Math.max(0, Math.min(Math.max(startMeters, endMeters), maxDistance));
  if (end <= start) return [];

  const segment = [];
  const startPoint = interpolatePointAlongRoute(coordinates, cumulativeDistances, start);
  if (startPoint) segment.push(startPoint);

  for (let index = 1; index < cumulativeDistances.length - 1; index += 1) {
    if (cumulativeDistances[index] <= start || cumulativeDistances[index] >= end) continue;
    segment.push(coordinates[index]);
  }

  const endPoint = interpolatePointAlongRoute(coordinates, cumulativeDistances, end);
  if (endPoint) segment.push(endPoint);

  return dedupeSequentialCoordinates(segment);
};

const getClosedProgressIntervals = (coordinates, closedPaths) => {
  const cumulativeDistances = buildCumulativeDistances(coordinates);

  const intervals = closedPaths
    .map((path) => {
      const start = projectPointToRouteProgress(path[0], coordinates, cumulativeDistances);
      const end = projectPointToRouteProgress(path[path.length - 1], coordinates, cumulativeDistances);
      if (!start || !end) return null;

      return {
        start: Math.min(start.progressMeters, end.progressMeters),
        end: Math.max(start.progressMeters, end.progressMeters),
      };
    })
    .filter((interval) => interval && interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  return { intervals, cumulativeDistances };
};

const mergeIntervals = (intervals) => {
  const merged = [];

  intervals.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      return;
    }
    previous.end = Math.max(previous.end, interval.end);
  });

  return merged;
};

const splitRouteCoordinatesByClosedProgress = ({ coordinates, closedPaths }) => {
  const { intervals, cumulativeDistances } = getClosedProgressIntervals(coordinates, closedPaths);
  if (intervals.length === 0) return null;

  const routeLength = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const visibleSegments = [];
  let cursor = 0;

  mergeIntervals(intervals).forEach((interval) => {
    const before = extractRouteSegmentByProgress(coordinates, cumulativeDistances, cursor, interval.start);
    if (before.length >= 2) visibleSegments.push(before);
    cursor = Math.max(cursor, interval.end);
  });

  const after = extractRouteSegmentByProgress(coordinates, cumulativeDistances, cursor, routeLength);
  if (after.length >= 2) visibleSegments.push(after);

  return visibleSegments;
};

export const splitRouteCoordinatesAroundClosedPaths = ({
  coordinates,
  closedPaths,
  bufferMeters = DEFAULT_CLOSED_ROUTE_MASK_BUFFER_METERS,
}) => {
  const routeCoordinates = normalizePath(coordinates);
  const masks = (Array.isArray(closedPaths) ? closedPaths : [])
    .map(normalizePath)
    .filter((path) => path.length >= 2);

  if (routeCoordinates.length < 2) return [];
  if (masks.length === 0) return [routeCoordinates];

  const progressSegments = splitRouteCoordinatesByClosedProgress({
    coordinates: routeCoordinates,
    closedPaths: masks,
  });
  if (progressSegments) return progressSegments;

  const visibleSegments = [];
  let current = [];
  let previous = null;

  routeCoordinates.forEach((point) => {
    const pointMasked = pointIsInsideClosedCorridor(point, masks, bufferMeters);
    const segmentMasked =
      previous &&
      !pointMasked &&
      segmentCrossesClosedCorridor(previous, point, masks, bufferMeters);

    if (pointMasked || segmentMasked) {
      if (current.length >= 2) {
        visibleSegments.push(current);
      }
      current = pointMasked ? [] : [point];
      previous = point;
      return;
    }

    current.push(point);
    previous = point;
  });

  if (current.length >= 2) {
    visibleSegments.push(current);
  }

  return visibleSegments;
};

export const getRouteShapeVisibleSegments = ({
  shape,
  detourOverlays = [],
  bufferMeters = DEFAULT_CLOSED_ROUTE_MASK_BUFFER_METERS,
}) => {
  const rawCoordinates = Array.isArray(shape?.coordinates) ? shape.coordinates : [];
  if (rawCoordinates.length < 2) return [];

  const closedPaths = getClosedDetourPathsForRoute(shape?.routeId, detourOverlays);
  if (closedPaths.length === 0) return [rawCoordinates];

  return splitRouteCoordinatesAroundClosedPaths({
    coordinates: rawCoordinates,
    closedPaths,
    bufferMeters,
  });
};

export { DEFAULT_CLOSED_ROUTE_MASK_BUFFER_METERS };
