import { haversineDistance, pointToPolylineDistance, projectPointToPolyline } from './geometryUtils';

const stitchConnectorPolylines = (basePath, segment) => {
  const base = normalizePath(basePath);
  if (base.length < 2) return null;

  const entryConnector = normalizePath(segment?.entryConnectorPolyline);
  const exitConnector = normalizePath(segment?.exitConnectorPolyline);
  if (entryConnector.length === 0 && exitConnector.length === 0) {
    return basePath;
  }

  return dedupeConsecutivePoints([
    ...entryConnector,
    ...base,
    ...exitConnector,
  ]);
};

const getLikelyDetourPath = (segment) => {
  if (!segment?.likelyDetourPolyline || segment.likelyDetourPolyline.length < 2) return null;
  return stitchConnectorPolylines(segment.likelyDetourPolyline, segment);
};

const getTrustedInferredDetourPath = (segment) => (
  segment?.canShowDetourPath === true &&
  segment?.inferredDetourPolyline?.length >= 2
    ? stitchConnectorPolylines(segment.inferredDetourPolyline, segment)
    : null
);

const getValidationPreviewDetourPath = (segment, { includeValidationPreview = false } = {}) => (
  includeValidationPreview &&
  segment?.confidence === 'low' &&
  segment?.canShowDetourPath === false &&
  hasAnchoredPreviewGeometry(segment)
    ? segment.inferredDetourPolyline
    : null
);

const getRenderableDetourPath = (segment, options = {}) =>
  getLikelyDetourPath(segment) ??
  getTrustedInferredDetourPath(segment) ??
  getValidationPreviewDetourPath(segment, options);

const OPEN_CLOSED_OVERLAP_PROXIMITY_METERS = 35;
const OPEN_CLOSED_OVERLAP_MIN_RUN_METERS = 35;
const OPEN_CLOSED_INTERIOR_OVERLAP_RATIO = 0.5;
const OPEN_CLOSED_MIN_CLOSED_ROUTE_METERS = 100;
const VALIDATION_PREVIEW_MAX_ENDPOINT_MISMATCH_METERS = 250;
const DETOUR_PATH_STOP_SERVICE_PROXIMITY_METERS = 45;
const DETOUR_PATH_ENDPOINT_BUFFER_METERS = 60;

const isFiniteCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude)) &&
  Number.isFinite(Number(point?.longitude))
);

const normalizePath = (path) => (
  Array.isArray(path)
    ? path
      .filter(isFiniteCoordinate)
      .map((point) => ({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
      }))
    : []
);

const getEndpointDistanceMeters = (from, to) => {
  if (!isFiniteCoordinate(from) || !isFiniteCoordinate(to)) return Infinity;
  const distance = haversineDistance(
    Number(from.latitude),
    Number(from.longitude),
    Number(to.latitude),
    Number(to.longitude)
  );
  return Number.isFinite(distance) ? distance : Infinity;
};

const hasAnchoredPreviewGeometry = (segment) => {
  const path = normalizePath(segment?.inferredDetourPolyline);
  if (path.length < 2 || !isFiniteCoordinate(segment?.entryPoint) || !isFiniteCoordinate(segment?.exitPoint)) {
    return false;
  }

  const first = path[0];
  const last = path[path.length - 1];
  const forwardMismatch = Math.max(
    getEndpointDistanceMeters(first, segment.entryPoint),
    getEndpointDistanceMeters(last, segment.exitPoint)
  );
  const reverseMismatch = Math.max(
    getEndpointDistanceMeters(first, segment.exitPoint),
    getEndpointDistanceMeters(last, segment.entryPoint)
  );

  return Math.min(forwardMismatch, reverseMismatch) <= VALIDATION_PREVIEW_MAX_ENDPOINT_MISMATCH_METERS;
};

const getPathLengthMeters = (path) => {
  const points = normalizePath(path);
  if (points.length < 2) return 0;
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    const distance = haversineDistance(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude
    );
    return Number.isFinite(distance) ? sum + distance : sum;
  }, 0);
};

const dedupeConsecutivePoints = (points) => {
  if (!Array.isArray(points) || points.length === 0) return [];

  return points.reduce((deduped, point) => {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      previous.latitude === point.latitude &&
      previous.longitude === point.longitude
    ) {
      return deduped;
    }

    deduped.push({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    return deduped;
  }, []);
};

const getCumulativeDistances = (path) => {
  const points = normalizePath(path);
  if (points.length === 0) return [];

  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative[index] =
      cumulative[index - 1] +
      haversineDistance(
        points[index - 1].latitude,
        points[index - 1].longitude,
        points[index].latitude,
        points[index].longitude
      );
  }
  return cumulative;
};

const interpolatePointAlongPath = (path, cumulativeDistances, targetMeters) => {
  const points = normalizePath(path);
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];

  const maxDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const clampedTarget = Math.max(0, Math.min(targetMeters, maxDistance));

  for (let index = 1; index < cumulativeDistances.length; index += 1) {
    if (cumulativeDistances[index] < clampedTarget) continue;

    const segmentStartDistance = cumulativeDistances[index - 1];
    const segmentLength = cumulativeDistances[index] - segmentStartDistance;
    if (segmentLength <= 0) return points[index];

    const ratio = (clampedTarget - segmentStartDistance) / segmentLength;
    return {
      latitude: points[index - 1].latitude + (points[index].latitude - points[index - 1].latitude) * ratio,
      longitude: points[index - 1].longitude + (points[index].longitude - points[index - 1].longitude) * ratio,
    };
  }

  return points[points.length - 1];
};

const extractPathByProgress = (path, startProgressMeters, endProgressMeters) => {
  const points = normalizePath(path);
  if (points.length === 0) return [];

  const cumulative = getCumulativeDistances(points);
  const maxDistance = cumulative[cumulative.length - 1] ?? 0;
  const startMeters = Math.max(0, Math.min(startProgressMeters, endProgressMeters, maxDistance));
  const endMeters = Math.max(0, Math.min(Math.max(startProgressMeters, endProgressMeters), maxDistance));

  const extracted = [];
  const startPoint = interpolatePointAlongPath(points, cumulative, startMeters);
  if (startPoint) extracted.push(startPoint);

  for (let index = 1; index < cumulative.length - 1; index += 1) {
    if (cumulative[index] <= startMeters || cumulative[index] >= endMeters) continue;
    extracted.push(points[index]);
  }

  const endPoint = interpolatePointAlongPath(points, cumulative, endMeters);
  if (endPoint) extracted.push(endPoint);

  return dedupeConsecutivePoints(extracted);
};

const getEndpointOverlapRunLength = (openPath, closedPath, fromEnd = false) => {
  const orderedPath = fromEnd ? [...openPath].reverse() : openPath;
  const run = [];

  for (const point of orderedPath) {
    if (pointToPolylineDistance(point, closedPath) > OPEN_CLOSED_OVERLAP_PROXIMITY_METERS) {
      break;
    }
    run.push(point);
  }

  if (run.length < 2) return 0;
  return getPathLengthMeters(fromEnd ? run.reverse() : run);
};

const projectPointOntoPathWithProgress = (point, path) => {
  const projection = projectPointToPolyline(point, path);
  if (!projection?.point) return null;

  const points = normalizePath(path);
  const cumulative = getCumulativeDistances(points);
  const segmentStart = points[projection.segmentIndex] || points[0];
  const progressMeters =
    (cumulative[projection.segmentIndex] || 0) +
    haversineDistance(
      segmentStart.latitude,
      segmentStart.longitude,
      projection.point.latitude,
      projection.point.longitude
    );

  return {
    point: {
      latitude: projection.point.latitude,
      longitude: projection.point.longitude,
    },
    progressMeters,
  };
};

const isStopServedByRenderableDetourPath = (stop, segment, options = {}) => {
  if (!isFiniteCoordinate(stop)) return false;

  const path = normalizePath(getRenderableDetourPath(segment, options));
  if (path.length < 2) return false;

  const stopPoint = {
    latitude: Number(stop.latitude),
    longitude: Number(stop.longitude),
  };
  if (pointToPolylineDistance(stopPoint, path) > DETOUR_PATH_STOP_SERVICE_PROXIMITY_METERS) {
    return false;
  }

  const projection = projectPointOntoPathWithProgress(stopPoint, path);
  const pathLengthMeters = getPathLengthMeters(path);
  if (!projection || !Number.isFinite(pathLengthMeters)) return false;

  const remainingMeters = pathLengthMeters - projection.progressMeters;
  return (
    projection.progressMeters > DETOUR_PATH_ENDPOINT_BUFFER_METERS &&
    remainingMeters > DETOUR_PATH_ENDPOINT_BUFFER_METERS
  );
};

const getEndpointOverlapBoundary = (openPath, closedPath, fromEnd = false) => {
  const indexedPath = openPath.map((point, index) => ({ point, index }));
  const scanPath = fromEnd ? [...indexedPath].reverse() : indexedPath;
  const run = [];

  for (const entry of scanPath) {
    if (pointToPolylineDistance(entry.point, closedPath) > OPEN_CLOSED_OVERLAP_PROXIMITY_METERS) {
      break;
    }
    run.push(entry);
  }

  if (run.length < 2) return null;

  const runPoints = (fromEnd ? [...run].reverse() : run).map((entry) => entry.point);
  const overlapMeters = getPathLengthMeters(runPoints);
  if (overlapMeters < OPEN_CLOSED_OVERLAP_MIN_RUN_METERS) return null;

  const boundaryEntry = run[run.length - 1];
  const projection = projectPointOntoPathWithProgress(boundaryEntry.point, closedPath);
  if (!projection) return null;

  return {
    index: boundaryEntry.index,
    point: projection.point,
    progressMeters: projection.progressMeters,
  };
};

const trimOpenPathToBoundaries = (openPath, prefixBoundary, suffixBoundary) => {
  const startIndex = prefixBoundary?.index ?? 0;
  const endIndex = suffixBoundary?.index ?? openPath.length - 1;
  if (startIndex > endIndex) return null;

  const points = openPath.slice(startIndex, endIndex + 1).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  if (points.length === 0) return null;

  if (prefixBoundary) points[0] = { ...prefixBoundary.point };
  if (suffixBoundary) points[points.length - 1] = { ...suffixBoundary.point };

  const deduped = dedupeConsecutivePoints(points);
  return deduped.length >= 2 ? deduped : null;
};

const trimClosedPathToBoundaries = (closedPath, prefixBoundary, suffixBoundary) => {
  const closedLengthMeters = getPathLengthMeters(closedPath);
  if (closedLengthMeters <= 0) return null;

  const startProgress = prefixBoundary
    ? Math.max(0, Math.min(prefixBoundary.progressMeters, closedLengthMeters))
    : 0;
  const endProgress = suffixBoundary
    ? Math.max(0, Math.min(suffixBoundary.progressMeters, closedLengthMeters))
    : closedLengthMeters;

  if (endProgress <= startProgress) return null;
  if ((endProgress - startProgress) < OPEN_CLOSED_MIN_CLOSED_ROUTE_METERS) return null;

  const trimmed = extractPathByProgress(closedPath, startProgress, endProgress);
  if (trimmed.length < 2) return null;
  return getPathLengthMeters(trimmed) >= OPEN_CLOSED_MIN_CLOSED_ROUTE_METERS
    ? trimmed
    : null;
};

const hasMaterialOpenClosedOverlap = (openPath, closedPath) => {
  const open = normalizePath(openPath);
  const closed = normalizePath(closedPath);
  if (open.length < 2 || closed.length < 2) return false;

  if (getEndpointOverlapRunLength(open, closed) >= OPEN_CLOSED_OVERLAP_MIN_RUN_METERS) {
    return true;
  }
  if (getEndpointOverlapRunLength(open, closed, true) >= OPEN_CLOSED_OVERLAP_MIN_RUN_METERS) {
    return true;
  }

  const interior = open.slice(1, -1);
  if (interior.length < 3) return false;

  const nearClosedCount = interior.filter((point) =>
    pointToPolylineDistance(point, closed) <= OPEN_CLOSED_OVERLAP_PROXIMITY_METERS
  ).length;

  return (nearClosedCount / interior.length) >= OPEN_CLOSED_INTERIOR_OVERLAP_RATIO;
};

const trimOverlappingSegmentGeometry = (segment) => {
  const detourPath = getRenderableDetourPath(segment);
  const skippedPath = segment?.skippedSegmentPolyline;
  const open = normalizePath(detourPath);
  const closed = normalizePath(skippedPath);

  if (!hasMaterialOpenClosedOverlap(open, closed)) {
    return segment;
  }

  const prefixBoundary = getEndpointOverlapBoundary(open, closed, false);
  const suffixBoundary = getEndpointOverlapBoundary(open, closed, true);
  const trimmedOpenPath = trimOpenPathToBoundaries(open, prefixBoundary, suffixBoundary);
  const trimmedClosedPath = trimClosedPathToBoundaries(closed, prefixBoundary, suffixBoundary);
  const closedSegmentSuppressed = !trimmedClosedPath;
  const nextEntryPoint = trimmedClosedPath?.[0] ?? segment?.entryPoint ?? null;
  const nextExitPoint = trimmedClosedPath?.[trimmedClosedPath.length - 1] ?? segment?.exitPoint ?? null;

  return {
    ...segment,
    skippedSegmentPolyline: trimmedClosedPath,
    inferredDetourPolyline: trimmedOpenPath,
    likelyDetourPolyline: segment?.likelyDetourPolyline?.length >= 2 ? trimmedOpenPath : segment?.likelyDetourPolyline,
    entryPoint: nextEntryPoint,
    exitPoint: nextExitPoint,
    skippedStops: closedSegmentSuppressed ? [] : (segment?.skippedStops ?? []),
    suppressStopDerivation: closedSegmentSuppressed,
  };
};

const getPrimaryRenderablePath = (detour, options = {}) => {
  const segments = Array.isArray(detour?.segments) ? detour.segments : [];
  const segment = segments.find((candidate) => getRenderableDetourPath(candidate, options));
  if (segment) return getRenderableDetourPath(segment, options);

  return getRenderableDetourPath(detour, options);
};

const toRoundedCoordinateKey = (point) => (
  `${Number(point?.latitude).toFixed(5)},${Number(point?.longitude).toFixed(5)}`
);

const getPathSignature = (path) => {
  if (!Array.isArray(path) || path.length < 2) return null;

  const forward = path.map(toRoundedCoordinateKey).join('|');
  const reverse = [...path].reverse().map(toRoundedCoordinateKey).join('|');
  return forward < reverse ? forward : reverse;
};


export {
  getLikelyDetourPath,
  getPathSignature,
  getPrimaryRenderablePath,
  getRenderableDetourPath,
  getTrustedInferredDetourPath,
  isStopServedByRenderableDetourPath,
  normalizePath,
  trimOverlappingSegmentGeometry,
};
