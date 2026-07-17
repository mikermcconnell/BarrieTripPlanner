'use strict';

// Converts broad GPS lifecycle boundaries into narrower public map boundaries
// without weakening the closed-segment overlap checks.

const {
  buildPolylineSpanFromProjections,
  dedupeConsecutivePoints,
  haversineDistance,
  normalizePolyline,
  pointToPolylineDistance,
  polylineLengthMeters,
  projectPointOntoPolyline,
  slicePolylineByProgressWindow,
} = require('./roadGeometry');

const DEFAULT_BLOCKED_PROXIMITY_METERS = 35;
const DEFAULT_BLOCKED_OVERLAP_RATIO = 0.05;
const DEFAULT_BLOCKED_ENDPOINT_RATIO = 0.12;
const DEFAULT_BLOCKED_MIN_POINTS = 3;
const DEFAULT_ROUTE_OVERLAP_PROXIMITY_METERS = 35;
const DEFAULT_ROUTE_OVERLAP_MIN_RUN_METERS = 35;
const DEFAULT_DISPLAY_MIN_SEPARATED_RUN_METERS = 75;
const DEFAULT_DISPLAY_PROGRESS_PADDING_METERS = 150;

function positiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function nonNegativeNumber(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function doesPathUseBlockedSegment(path, blockedPolyline, env = process.env) {
  const points = normalizePolyline(path);
  const blocked = normalizePolyline(blockedPolyline);
  if (points.length < 2 || blocked.length < 2) return false;

  const endpointRatio = nonNegativeNumber(
    env.DETOUR_ROAD_MATCHING_BLOCKED_ENDPOINT_RATIO,
    DEFAULT_BLOCKED_ENDPOINT_RATIO,
    0,
    0.45
  );
  const proximityMeters = positiveInteger(
    env.DETOUR_ROAD_MATCHING_BLOCKED_PROXIMITY_METERS,
    DEFAULT_BLOCKED_PROXIMITY_METERS,
    5,
    200
  );
  const overlapRatio = nonNegativeNumber(
    env.DETOUR_ROAD_MATCHING_BLOCKED_OVERLAP_RATIO,
    DEFAULT_BLOCKED_OVERLAP_RATIO,
    0.05,
    1
  );
  const minPoints = positiveInteger(
    env.DETOUR_ROAD_MATCHING_BLOCKED_MIN_POINTS,
    DEFAULT_BLOCKED_MIN_POINTS,
    1,
    50
  );
  const endpointPointCount = Math.min(
    Math.ceil(points.length * endpointRatio),
    Math.max(0, Math.floor((points.length - minPoints) / 2))
  );
  const interior = points.slice(endpointPointCount, points.length - endpointPointCount);
  if (interior.length === 0) return false;

  const nearBlockedCount = interior.filter((point) =>
    pointToPolylineDistance(point, blocked) <= proximityMeters
  ).length;
  return nearBlockedCount >= minPoints && nearBlockedCount / interior.length >= overlapRatio;
}

function buildConnectorPolyline(points) {
  const connector = dedupeConsecutivePoints(points);
  return connector.length >= 2 ? connector : null;
}

function getEndpointRouteOverlapRun(path, routeShapePolyline, env, fromEnd) {
  const orderedPath = fromEnd ? [...path].reverse() : path;
  const run = [];
  const proximityMeters = positiveInteger(
    env.DETOUR_ROAD_MATCHING_ROUTE_OVERLAP_PROXIMITY_METERS,
    DEFAULT_ROUTE_OVERLAP_PROXIMITY_METERS,
    5,
    200
  );
  for (const point of orderedPath) {
    if (pointToPolylineDistance(point, routeShapePolyline) > proximityMeters) break;
    run.push(point);
  }
  if (run.length < 2) return null;

  const runLengthMeters = polylineLengthMeters(fromEnd ? run.reverse() : run);
  const minRunMeters = positiveInteger(
    env.DETOUR_ROAD_MATCHING_ROUTE_OVERLAP_MIN_RUN_METERS,
    DEFAULT_ROUTE_OVERLAP_MIN_RUN_METERS,
    1,
    500
  );
  return runLengthMeters < minRunMeters
    ? null
    : { pointCount: run.length, runLengthMeters };
}

function trimNormalRouteEndpointOverlap(path, routeShapePolyline, env = process.env) {
  const points = normalizePolyline(path);
  const route = normalizePolyline(routeShapePolyline);
  if (points.length < 2 || route.length < 2) {
    return { path: points, prefixTrimmed: false, suffixTrimmed: false };
  }

  const prefixRun = getEndpointRouteOverlapRun(points, route, env, false);
  const suffixRun = getEndpointRouteOverlapRun(points, route, env, true);
  const startIndex = Math.max(0, Math.min(prefixRun ? prefixRun.pointCount : 0, points.length));
  const endIndex = Math.max(
    -1,
    Math.min(suffixRun ? points.length - suffixRun.pointCount - 1 : points.length - 1, points.length - 1)
  );
  const trimmed = startIndex <= endIndex ? points.slice(startIndex, endIndex + 1) : [];
  const entryConnectorPolyline = prefixRun && trimmed.length >= 1
    ? buildConnectorPolyline([...points.slice(0, startIndex), trimmed[0]])
    : null;
  const exitConnectorPolyline = suffixRun && trimmed.length >= 1
    ? buildConnectorPolyline([trimmed[trimmed.length - 1], ...points.slice(endIndex + 1)])
    : null;
  return {
    path: trimmed.length >= 2 ? trimmed : [],
    prefixTrimmed: Boolean(prefixRun),
    suffixTrimmed: Boolean(suffixRun),
    prefixOverlapMeters: prefixRun?.runLengthMeters || 0,
    suffixOverlapMeters: suffixRun?.runLengthMeters || 0,
    entryConnectorPolyline,
    exitConnectorPolyline,
  };
}

function getBoundaryProjectionRoute(routeShapePolyline, progressWindow = null, env = process.env) {
  const fullRoute = normalizePolyline(routeShapePolyline);
  const start = Number(progressWindow?.startProgressMeters);
  const end = Number(progressWindow?.endProgressMeters);
  if (fullRoute.length < 2 || !Number.isFinite(start) || !Number.isFinite(end) || start === end) {
    return { polyline: fullRoute, constrained: false, startProgressMeters: null, endProgressMeters: null };
  }

  const paddingMeters = nonNegativeNumber(
    env.DETOUR_ROAD_MATCHING_DISPLAY_PROGRESS_PADDING_METERS,
    DEFAULT_DISPLAY_PROGRESS_PADDING_METERS,
    0,
    1000
  );
  const routeLengthMeters = polylineLengthMeters(fullRoute);
  const windowStart = Math.max(0, Math.min(start, end) - paddingMeters);
  const windowEnd = Math.min(routeLengthMeters, Math.max(start, end) + paddingMeters);
  const windowedRoute = slicePolylineByProgressWindow(fullRoute, windowStart, windowEnd);
  if (windowedRoute.length < 2) {
    return { polyline: fullRoute, constrained: false, startProgressMeters: null, endProgressMeters: null };
  }
  return {
    polyline: windowedRoute,
    constrained: true,
    startProgressMeters: Math.round(windowStart),
    endProgressMeters: Math.round(windowEnd),
  };
}

function getLongestSeparatedRunMeters(path, routeShapePolyline, env = process.env) {
  const points = normalizePolyline(path);
  const route = normalizePolyline(routeShapePolyline);
  if (points.length < 2 || route.length < 2) return 0;
  const proximityMeters = positiveInteger(
    env.DETOUR_ROAD_MATCHING_ROUTE_OVERLAP_PROXIMITY_METERS,
    DEFAULT_ROUTE_OVERLAP_PROXIMITY_METERS,
    5,
    200
  );
  let longestRunMeters = 0;
  let currentRunMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    const startSeparated = pointToPolylineDistance(points[index - 1], route) > proximityMeters;
    const endSeparated = pointToPolylineDistance(points[index], route) > proximityMeters;
    // Require both sampled endpoints to be separated. This stays conservative
    // when the matcher returns a long, sparse segment that crosses the limit.
    if (startSeparated && endSeparated) {
      currentRunMeters += haversineDistance(points[index - 1], points[index]);
      longestRunMeters = Math.max(longestRunMeters, currentRunMeters);
    } else {
      currentRunMeters = 0;
    }
  }
  return longestRunMeters;
}

function buildBoundaryRefinedDisplayGeometry(path, routeTrim, options = {}) {
  const trimmedPath = normalizePolyline(path);
  const routeShape = normalizePolyline(options.routeShapePolyline);
  const projectionRoute = normalizePolyline(options.boundaryProjectionPolyline || routeShape);
  const blocked = normalizePolyline(options.blockedPolyline);
  if (
    trimmedPath.length < 2 ||
    routeShape.length < 2 ||
    projectionRoute.length < 2 ||
    blocked.length < 2 ||
    (!routeTrim?.prefixTrimmed && !routeTrim?.suffixTrimmed)
  ) {
    return null;
  }

  const separatedRunMeters = getLongestSeparatedRunMeters(trimmedPath, routeShape, options.env);
  const minimumSeparatedRunMeters = positiveInteger(
    options.env?.DETOUR_ROAD_MATCHING_DISPLAY_MIN_SEPARATED_RUN_METERS,
    DEFAULT_DISPLAY_MIN_SEPARATED_RUN_METERS,
    25,
    1000
  );
  if (separatedRunMeters < minimumSeparatedRunMeters) return null;

  const entryProjection = projectPointOntoPolyline(trimmedPath[0], projectionRoute);
  const exitProjection = projectPointOntoPolyline(trimmedPath[trimmedPath.length - 1], projectionRoute);
  if (!entryProjection || !exitProjection) return null;

  const displayEntryPoint = entryProjection.projectedPoint;
  const displayExitPoint = exitProjection.projectedPoint;
  const displaySkippedSegmentPolyline = buildPolylineSpanFromProjections(
    projectionRoute,
    entryProjection,
    exitProjection
  );
  if (displaySkippedSegmentPolyline.length < 2) return null;

  const displayPath = dedupeConsecutivePoints([
    displayEntryPoint,
    ...trimmedPath,
    displayExitPoint,
  ]);
  if (
    displayPath.length < 2 ||
    doesPathUseBlockedSegment(displayPath, displaySkippedSegmentPolyline, options.env)
  ) {
    return null;
  }

  return {
    displayEntryPoint,
    displayExitPoint,
    displaySkippedSegmentPolyline,
    displayDetourPolyline: displayPath,
    displayBoundaryRefined: true,
    displayBoundaryReason: 'trimmed-normal-route-approaches',
    displaySeparatedRunMeters: Math.round(separatedRunMeters),
    displayPrefixTrimmedMeters: Math.round(routeTrim.prefixOverlapMeters || 0),
    displaySuffixTrimmedMeters: Math.round(routeTrim.suffixOverlapMeters || 0),
    displayBoundaryProjectionConstrained: options.boundaryProjectionConstrained === true,
    displayBoundaryProjectionWindowStartMeters:
      options.boundaryProjectionWindowStartMeters ?? null,
    displayBoundaryProjectionWindowEndMeters:
      options.boundaryProjectionWindowEndMeters ?? null,
  };
}

module.exports = {
  buildBoundaryRefinedDisplayGeometry,
  doesPathUseBlockedSegment,
  getBoundaryProjectionRoute,
  trimNormalRouteEndpointOverlap,
};
