'use strict';

function normalizeStopId(value) {
  return value == null ? null : String(value).trim();
}

function uniqueStopIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizeStopId)
      .filter(Boolean)
  )];
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

function hasRenderablePolyline(value) {
  return Array.isArray(value) && value.length >= 2;
}

const POINT_LOOP_NO_CLOSURE_MAX_METERS = Number.parseFloat(
  process.env.DETOUR_POINT_LOOP_NO_CLOSURE_MAX_METERS || '35'
);
const TINY_CLOSED_SPAN_MAX_METERS = Number.parseFloat(
  process.env.DETOUR_TINY_CLOSED_SPAN_MAX_METERS || '100'
);
const LONG_PATH_WITH_TINY_SPAN_MIN_METERS = Number.parseFloat(
  process.env.DETOUR_LONG_PATH_WITH_TINY_SPAN_MIN_METERS || '200'
);
const LONG_PATH_TINY_SPAN_MIN_RATIO = Number.parseFloat(
  process.env.DETOUR_LONG_PATH_TINY_SPAN_MIN_RATIO || '3'
);
const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function normalizeCoordinate(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function polylineLengthMeters(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    const from = normalizeCoordinate(polyline[index - 1]);
    const to = normalizeCoordinate(polyline[index]);
    if (!from || !to) continue;
    total += distanceMeters(from, to);
  }
  return total;
}

function hasStopImpact(segment) {
  return (
    uniqueStopIds(segment?.skippedStopIds).length > 0 ||
    uniqueStopIds(segment?.affectedStopIds).length > 0 ||
    uniqueStopIds(segment?.skippedStopCodes).length > 0 ||
    uniqueStopIds(segment?.affectedStopCodes).length > 0 ||
    (Array.isArray(segment?.skippedStops) && segment.skippedStops.length > 0) ||
    (Array.isArray(segment?.affectedStops) && segment.affectedStops.length > 0)
  );
}

function isNonClosureSelfLoopSegment(segment) {
  const entryStopId = normalizeStopId(segment?.entryStopId);
  const exitStopId = normalizeStopId(segment?.exitStopId);
  if (!entryStopId || !exitStopId || entryStopId !== exitStopId) return false;

  const skippedStopIds = uniqueStopIds(segment?.skippedStopIds);
  const affectedStopIds = uniqueStopIds(segment?.affectedStopIds);
  const impactedStopIds = uniqueStopIds([...skippedStopIds, ...affectedStopIds]);

  return (
    impactedStopIds.length <= 1 &&
    (impactedStopIds.length === 0 || impactedStopIds[0] === entryStopId)
  );
}

function isUnanchoredNoStopSegment(segment) {
  const entryStopId = normalizeStopId(segment?.entryStopId);
  const exitStopId = normalizeStopId(segment?.exitStopId);
  if (entryStopId || exitStopId) return false;

  const hasExplicitStopImpactFields =
    hasOwn(segment, 'skippedStopIds') ||
    hasOwn(segment, 'affectedStopIds') ||
    hasOwn(segment, 'skippedStops') ||
    hasOwn(segment, 'affectedStops');
  if (!hasExplicitStopImpactFields) return false;

  const skippedStopIds = uniqueStopIds(segment?.skippedStopIds);
  const affectedStopIds = uniqueStopIds(segment?.affectedStopIds);
  const skippedStops = Array.isArray(segment?.skippedStops) ? segment.skippedStops : [];
  const affectedStops = Array.isArray(segment?.affectedStops) ? segment.affectedStops : [];
  const hasClosedRouteSegment = hasRenderablePolyline(segment?.skippedSegmentPolyline);

  return (
    !hasClosedRouteSegment &&
    skippedStopIds.length === 0 &&
    affectedStopIds.length === 0 &&
    skippedStops.length === 0 &&
    affectedStops.length === 0
  );
}

function isPointLoopNoClosureSegment(segment) {
  if (hasRenderablePolyline(segment?.skippedSegmentPolyline)) return false;
  if (hasStopImpact(segment)) return false;

  const entryPoint = normalizeCoordinate(segment?.entryPoint);
  const exitPoint = normalizeCoordinate(segment?.exitPoint);
  if (!entryPoint || !exitPoint) return false;

  return distanceMeters(entryPoint, exitPoint) <= POINT_LOOP_NO_CLOSURE_MAX_METERS;
}

function isMisleadingTinySpanLongPathSegment(segment) {
  if (hasRenderablePolyline(segment?.skippedSegmentPolyline)) return false;
  if (hasStopImpact(segment)) return false;

  const spanMeters = Number(segment?.spanMeters);
  if (!Number.isFinite(spanMeters) || spanMeters <= 0 || spanMeters >= TINY_CLOSED_SPAN_MAX_METERS) {
    return false;
  }

  const pathLengthMeters = Math.max(
    polylineLengthMeters(segment?.likelyDetourPolyline),
    polylineLengthMeters(segment?.inferredDetourPolyline)
  );
  if (pathLengthMeters < LONG_PATH_WITH_TINY_SPAN_MIN_METERS) return false;

  const ratio = pathLengthMeters / Math.max(spanMeters, 1);
  if (ratio < LONG_PATH_TINY_SPAN_MIN_RATIO) return false;

  const debug = segment?.debug || {};
  const hasAmbiguousBoundarySelection =
    Number(debug.entryCandidateCount) > 1 ||
    Number(debug.exitCandidateCount) > 1 ||
    debug.entryAnchorSource === 'boundary-candidate' ||
    debug.exitAnchorSource === 'boundary-candidate';

  return hasAmbiguousBoundarySelection || ratio >= LONG_PATH_TINY_SPAN_MIN_RATIO * 2;
}

function isInvalidNonClosureSegment(segment) {
  return (
    isNonClosureSelfLoopSegment(segment) ||
    isUnanchoredNoStopSegment(segment) ||
    isPointLoopNoClosureSegment(segment) ||
    isMisleadingTinySpanLongPathSegment(segment)
  );
}

function filterNonClosureSelfLoopSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .filter((segment) => !isInvalidNonClosureSegment(segment));
}

module.exports = {
  isNonClosureSelfLoopSegment,
  isUnanchoredNoStopSegment,
  isPointLoopNoClosureSegment,
  isMisleadingTinySpanLongPathSegment,
  isInvalidNonClosureSegment,
  filterNonClosureSelfLoopSegments,
};
