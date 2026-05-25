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

function isInvalidNonClosureSegment(segment) {
  return (
    isNonClosureSelfLoopSegment(segment) ||
    isUnanchoredNoStopSegment(segment) ||
    isPointLoopNoClosureSegment(segment)
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
  isInvalidNonClosureSegment,
  filterNonClosureSelfLoopSegments,
};
