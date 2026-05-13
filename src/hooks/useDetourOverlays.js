/**
 * useDetourOverlays Hook
 *
 * Derives renderable detour overlay data from active detours and the
 * current route selection. Shared between native and web HomeScreens.
 *
 * Only returns overlays for selected routes that have geometry data.
 * Visibility can be controlled by the caller to support runtime rollout
 * and user-facing detour toggles.
 */
import { useMemo } from 'react';
import { COLORS } from '../config/theme';
import { getMatchingDetourRouteIds } from '../utils/routeDetourMatching';
import { getRouteFamilyId, normalizeRouteId } from '../utils/routeDetourMatching';
import { filterRiderVisibleDetours } from '../utils/detourVisibility';
import { haversineDistance, pointToPolylineDistance, projectPointToPolyline } from '../utils/geometryUtils';
import runtimeConfig from '../config/runtimeConfig';

const DETOUR_COLORS = {
  SKIPPED: COLORS.error,   // closed regular route segment riders should not expect service on
  DETOUR_FALLBACK: COLORS.primary, // open reroute path fallback when a route color is unavailable
  ROUTE_BASE: '#111827', // neutral base route, closer to the reference map
  ROUTE_STOP_FILL: '#ffffff',
  ROUTE_STOP_STROKE: '#111827',
};

const isValidColor = (value) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());

const getOverlayRouteColor = (routeId, routeColorByRouteId = {}) => {
  const color = routeColorByRouteId?.[routeId] ?? routeColorByRouteId?.[String(routeId)];
  return isValidColor(color) ? color : DETOUR_COLORS.DETOUR_FALLBACK;
};

const getLikelyDetourPath = (segment) => (
  segment?.likelyDetourPolyline?.length >= 2
    ? segment.likelyDetourPolyline
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
  getValidationPreviewDetourPath(segment, options);

const OPEN_CLOSED_OVERLAP_PROXIMITY_METERS = 35;
const OPEN_CLOSED_OVERLAP_MIN_RUN_METERS = 35;
const OPEN_CLOSED_INTERIOR_OVERLAP_RATIO = 0.5;
const OPEN_CLOSED_MIN_CLOSED_ROUTE_METERS = 100;
const DETOUR_FAMILY_LANE_SPACING_METERS = 18;
const DETOUR_FAMILY_ARROW_STAGGER_RATIO = 0.045;
const VALIDATION_PREVIEW_MAX_ENDPOINT_MISMATCH_METERS = 250;

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
  const topLevelPath = getRenderableDetourPath(detour, options);
  if (topLevelPath) return topLevelPath;

  const segments = Array.isArray(detour?.segments) ? detour.segments : [];
  const segment = segments.find((candidate) => getRenderableDetourPath(candidate, options));
  return segment ? getRenderableDetourPath(segment, options) : null;
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

const getFamilyHasDistinctDetourPaths = (familyRouteIds, riderVisibleDetours, options = {}) => {
  const signatures = familyRouteIds
    .map((routeId) => getPathSignature(getPrimaryRenderablePath(riderVisibleDetours[routeId], options)))
    .filter(Boolean);

  return new Set(signatures).size > 1;
};

const getCenteredOffset = (index, count, spacing) => {
  if (!Number.isFinite(index) || !Number.isFinite(count) || count <= 1) return 0;
  return (index - ((count - 1) / 2)) * spacing;
};

const getEndpointOrientationSign = (path, referencePath) => {
  const points = normalizePath(path);
  const reference = normalizePath(referencePath);
  if (points.length < 2 || reference.length < 2) return 1;

  const start = points[0];
  const end = points[points.length - 1];
  const referenceStart = reference[0];
  const referenceEnd = reference[reference.length - 1];
  const sameDirectionDistance =
    haversineDistance(start.latitude, start.longitude, referenceStart.latitude, referenceStart.longitude) +
    haversineDistance(end.latitude, end.longitude, referenceEnd.latitude, referenceEnd.longitude);
  const reversedDirectionDistance =
    haversineDistance(start.latitude, start.longitude, referenceEnd.latitude, referenceEnd.longitude) +
    haversineDistance(end.latitude, end.longitude, referenceStart.latitude, referenceStart.longitude);

  return reversedDirectionDistance < sameDirectionDistance ? -1 : 1;
};

const buildFamilyPathRenderInfo = (familyRouteIds, riderVisibleDetours, focusedRouteId = null, options = {}) => {
  const signatures = familyRouteIds.map((routeId) => ({
    routeId,
    path: getPrimaryRenderablePath(riderVisibleDetours[routeId], options),
    signature: getPathSignature(getPrimaryRenderablePath(riderVisibleDetours[routeId], options)),
  }));
  const signatureOrder = Array.from(new Set(signatures.map((entry) => entry.signature).filter(Boolean)));
  const referencePath = signatures.find((entry) => normalizePath(entry.path).length >= 2)?.path ?? null;
  const primaryRouteBySignature = signatures.reduce((acc, entry) => {
    if (!entry.signature) return acc;
    if (!acc[entry.signature] || entry.routeId === focusedRouteId) {
      acc[entry.signature] = entry.routeId;
    }
    return acc;
  }, {});

  return signatures.reduce((acc, entry, routeIndex) => {
    const signatureIndex = entry.signature ? signatureOrder.indexOf(entry.signature) : routeIndex;
    const laneCount = Math.max(signatureOrder.length, familyRouteIds.length > 1 ? 2 : 1);
    const laneIndex = signatureIndex >= 0 ? signatureIndex : routeIndex;
    const isDuplicateSharedPath =
      Boolean(entry.signature) &&
      signatureOrder.length === 1 &&
      familyRouteIds.length > 1 &&
      primaryRouteBySignature[entry.signature] !== entry.routeId;
    const rawLaneOffsetMeters = signatureOrder.length > 1
      ? getCenteredOffset(laneIndex, signatureOrder.length, DETOUR_FAMILY_LANE_SPACING_METERS)
      : 0;
    const orientationSign = getEndpointOrientationSign(entry.path, referencePath);

    acc[entry.routeId] = {
      isDuplicateSharedPath,
      laneOffsetMeters: rawLaneOffsetMeters * orientationSign,
      arrowPositionOffsetRatio: signatureOrder.length > 1
        ? getCenteredOffset(laneIndex, signatureOrder.length, DETOUR_FAMILY_ARROW_STAGGER_RATIO)
        : 0,
    };
    return acc;
  }, {});
};

/**
 * Pure derivation function (exported for testing without React).
 */
export function deriveDetourOverlays({
  selectedRouteIds,
  activeDetours,
  enabled,
  focusedRouteId = null,
  detourStopDetailsByRouteId = {},
  routeColorByRouteId = {},
  showAllClosedStopMarkers = false,
  showLowConfidenceGeometry = runtimeConfig.detours?.showLowConfidenceForValidation === true,
}) {
  if (!enabled) return [];

  const overlays = [];
  const renderOptions = { includeValidationPreview: showLowConfidenceGeometry };
  const riderVisibleDetours = filterRiderVisibleDetours(activeDetours, {
    showLowConfidence: showLowConfidenceGeometry,
  });

  // When no routes selected, show ALL active detours
  const routeIds = (selectedRouteIds && selectedRouteIds.size > 0)
    ? new Set(Array.from(selectedRouteIds).flatMap((routeId) => {
      const matches = getMatchingDetourRouteIds(routeId, riderVisibleDetours);
      return matches.length > 0 ? matches : [routeId];
    }))
    : new Set(Object.keys(riderVisibleDetours));
  const renderedRouteIds = Array.from(routeIds)
    .filter((routeId) => riderVisibleDetours[routeId])
    .sort((a, b) => normalizeRouteId(a).localeCompare(normalizeRouteId(b)));
  const renderedFamilyRouteIds = renderedRouteIds.reduce((acc, routeId) => {
    const familyId = getRouteFamilyId(routeId);
    if (!acc[familyId]) acc[familyId] = [];
    acc[familyId].push(routeId);
    return acc;
  }, {});

  routeIds.forEach((routeId) => {
    const detour = riderVisibleDetours[routeId];
    if (!detour) return;
    const familyRouteIds = renderedFamilyRouteIds[getRouteFamilyId(routeId)] || [routeId];
    const familyPathRenderInfo = buildFamilyPathRenderInfo(familyRouteIds, riderVisibleDetours, focusedRouteId, renderOptions);
    const routePathRenderInfo = familyPathRenderInfo[routeId] || {};
    if (routePathRenderInfo.isDuplicateSharedPath) return;

    const routeLineLabel = familyRouteIds.join('/');
    const familyHasDistinctDetourPaths = getFamilyHasDistinctDetourPaths(familyRouteIds, riderVisibleDetours, renderOptions);
    const directionArrowMode = familyRouteIds.length > 1
      ? (familyHasDistinctDetourPaths ? 'forward' : 'both')
      : 'forward';

    const normalizedSegments = Array.isArray(detour.segments) ? detour.segments : [];
    const topLevelLikelyDetourPath = getLikelyDetourPath(detour);
    const topLevelRenderableDetourPath = getRenderableDetourPath(detour, renderOptions);
    const hasSegmentRenderableDetourPath = normalizedSegments.some(
      (segment) => getRenderableDetourPath(segment, renderOptions)
    );
    const shouldRenderTopLevelRoadMatchOnly =
      topLevelRenderableDetourPath &&
      normalizedSegments.length > 1 &&
      !hasSegmentRenderableDetourPath;
    const topLevelRenderSegment = {
      shapeId: detour.shapeId ?? normalizedSegments[0]?.shapeId ?? null,
      skippedSegmentPolyline: detour.skippedSegmentPolyline ?? normalizedSegments[0]?.skippedSegmentPolyline ?? null,
      inferredDetourPolyline: topLevelRenderableDetourPath,
      likelyDetourPolyline: topLevelLikelyDetourPath,
      entryPoint: detour.entryPoint ?? normalizedSegments[0]?.entryPoint ?? null,
      exitPoint: detour.exitPoint ?? normalizedSegments[0]?.exitPoint ?? null,
      affectedStops: [],
      skippedStops: [],
      entryStop: null,
      exitStop: null,
    };
    const hasGeometry =
      normalizedSegments.some((segment) =>
        (segment?.skippedSegmentPolyline?.length >= 2) ||
        Boolean(getRenderableDetourPath(segment, renderOptions))
      ) ||
      (detour.skippedSegmentPolyline?.length >= 2) ||
      Boolean(topLevelRenderableDetourPath);
    if (!hasGeometry) return;

    const fallbackSegmentStopDetails = shouldRenderTopLevelRoadMatchOnly
      ? [topLevelRenderSegment]
      : normalizedSegments.length > 0
      ? normalizedSegments.map((segment) => ({
        shapeId: segment?.shapeId ?? detour.shapeId ?? null,
        skippedSegmentPolyline: segment?.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: getRenderableDetourPath(segment, renderOptions),
        likelyDetourPolyline: segment?.likelyDetourPolyline ?? null,
        entryPoint: segment?.entryPoint ?? null,
        exitPoint: segment?.exitPoint ?? null,
        affectedStops: [],
        skippedStops: [],
        entryStop: null,
        exitStop: null,
      }))
      : [{
        shapeId: detour.shapeId ?? null,
        skippedSegmentPolyline: detour.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: topLevelRenderableDetourPath,
        likelyDetourPolyline: detour.likelyDetourPolyline ?? null,
        entryPoint: detour.entryPoint ?? null,
        exitPoint: detour.exitPoint ?? null,
        affectedStops: [],
        skippedStops: [],
        entryStop: null,
        exitStop: null,
      }];
    const baseResolvedSegmentStopDetails = shouldRenderTopLevelRoadMatchOnly
      ? [topLevelRenderSegment]
      : detourStopDetailsByRouteId[routeId]?.segmentStopDetails?.length
        ? detourStopDetailsByRouteId[routeId].segmentStopDetails
        : fallbackSegmentStopDetails;
    const hasResolvedSegmentRenderableDetourPath = baseResolvedSegmentStopDetails.some(
      (segment) => getRenderableDetourPath(segment, renderOptions)
    );
    const resolvedSegmentStopDetails = baseResolvedSegmentStopDetails
      .map((segment, index) => ({
        ...segment,
        // Rendering reads inferredDetourPolyline for each segment. Prefer the
        // backend road-matched line whenever it exists, then backend-trusted raw
        // geometry. Do not put untrusted raw GPS/inferred paths back on the map.
        inferredDetourPolyline:
          getRenderableDetourPath(segment, renderOptions) ??
          (!hasResolvedSegmentRenderableDetourPath && index === 0 ? topLevelRenderableDetourPath : null),
        likelyDetourPolyline:
          segment?.likelyDetourPolyline ??
          (!hasResolvedSegmentRenderableDetourPath && index === 0 ? topLevelLikelyDetourPath : null),
      }))
      .map(trimOverlappingSegmentGeometry);
    const routeColor = getOverlayRouteColor(routeId, routeColorByRouteId);
    const primaryResolvedSegment = resolvedSegmentStopDetails[0] || {};
    const primaryStopsSuppressed = primaryResolvedSegment.suppressStopDerivation === true;
    const primaryRenderableDetourPath = getRenderableDetourPath(primaryResolvedSegment, renderOptions);
    const primaryLikelyDetourPath = getLikelyDetourPath(primaryResolvedSegment);

    overlays.push({
      routeId,
      state: detour.state ?? 'active',
      skippedSegmentPolyline: primaryResolvedSegment.skippedSegmentPolyline ?? null,
      inferredDetourPolyline:
        primaryRenderableDetourPath ??
        getRenderableDetourPath(detour, renderOptions) ??
        getRenderableDetourPath(normalizedSegments[0], renderOptions) ??
        null,
      likelyDetourPolyline:
        primaryLikelyDetourPath ??
        getLikelyDetourPath(detour) ??
        getLikelyDetourPath(normalizedSegments[0]) ??
        null,
      entryPoint: primaryResolvedSegment.entryPoint ?? detour.entryPoint ?? normalizedSegments[0]?.entryPoint ?? null,
      exitPoint: primaryResolvedSegment.exitPoint ?? detour.exitPoint ?? normalizedSegments[0]?.exitPoint ?? null,
      routeStops: detourStopDetailsByRouteId[routeId]?.routeStops ?? [],
      skippedStops: primaryStopsSuppressed
        ? []
        : (
          primaryResolvedSegment.skippedStops?.length
            ? primaryResolvedSegment.skippedStops
            : detourStopDetailsByRouteId[routeId]?.segmentStopDetails?.[0]?.skippedStops ??
              detourStopDetailsByRouteId[routeId]?.skippedStops ??
              []
        ),
      entryStop:
        primaryResolvedSegment.entryStop ??
        detourStopDetailsByRouteId[routeId]?.entryStop ??
        null,
      exitStop:
        primaryResolvedSegment.exitStop ??
        detourStopDetailsByRouteId[routeId]?.exitStop ??
        null,
      segmentStopDetails: resolvedSegmentStopDetails,
      opacity:
        focusedRouteId && routeId !== focusedRouteId
          ? 0.24
          : detour.state === 'clear-pending'
            ? 0.45
            : 0.95,
      skippedColor: DETOUR_COLORS.SKIPPED,
      detourColor: routeColor,
      routeBaseColor: routeColor,
      routeStopFillColor: DETOUR_COLORS.ROUTE_STOP_FILL,
      routeStopStrokeColor: DETOUR_COLORS.ROUTE_STOP_STROKE,
      routeLineLabel,
      directionArrowMode,
      detourLaneOffsetMeters: routePathRenderInfo.laneOffsetMeters || 0,
      detourArrowPositionOffsetRatio: routePathRenderInfo.arrowPositionOffsetRatio || 0,
      showLineLabels: true,
      showCallouts: false,
      showStopMarkers: false,
      showClosedStopMarkers: false,
    });
  });

  const shouldShowCallouts = overlays.length === 1 && !focusedRouteId;
  overlays.forEach((overlay) => {
    const isFocusedOverlay = focusedRouteId ? overlay.routeId === focusedRouteId : false;
    overlay.showCallouts = focusedRouteId
      ? isFocusedOverlay
      : shouldShowCallouts;
    overlay.showStopMarkers = focusedRouteId
      ? isFocusedOverlay
      : overlays.length === 1;
    overlay.showClosedStopMarkers = focusedRouteId
      ? isFocusedOverlay
      : showAllClosedStopMarkers || overlays.length === 1;
  });

  return overlays;
}

export const getDetourOverlayRouteIds = (detourOverlays = []) => {
  const routeIds = new Set();

  (Array.isArray(detourOverlays) ? detourOverlays : []).forEach((overlay) => {
    if (overlay?.routeId) {
      routeIds.add(normalizeRouteId(overlay.routeId));
    }

    if (typeof overlay?.routeLineLabel === 'string') {
      overlay.routeLineLabel
        .split('/')
        .map((routeId) => normalizeRouteId(routeId))
        .filter(Boolean)
        .forEach((routeId) => routeIds.add(routeId));
    }
  });

  return routeIds;
};

export const useDetourOverlays = ({
  selectedRouteIds,
  activeDetours,
  enabled = true,
  focusedRouteId = null,
  detourStopDetailsByRouteId = {},
  routeColorByRouteId = {},
  showAllClosedStopMarkers = false,
  showLowConfidenceGeometry = runtimeConfig.detours?.showLowConfidenceForValidation === true,
}) => {
  const detourOverlays = useMemo(
    () => deriveDetourOverlays({
      selectedRouteIds,
      activeDetours,
      enabled,
      focusedRouteId,
      detourStopDetailsByRouteId,
      routeColorByRouteId,
      showAllClosedStopMarkers,
      showLowConfidenceGeometry,
    }),
    [enabled, selectedRouteIds, activeDetours, focusedRouteId, detourStopDetailsByRouteId, routeColorByRouteId, showAllClosedStopMarkers, showLowConfidenceGeometry]
  );

  return { detourOverlays };
};
