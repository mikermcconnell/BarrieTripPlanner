'use strict';

const EARTH_RADIUS_METERS = 6371000;

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function normalizeCoordinate(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizePolyline(polyline) {
  return Array.isArray(polyline)
    ? polyline.map(normalizeCoordinate).filter(Boolean)
    : [];
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

function orientPolylineToEndpoints(polyline, entryPoint, exitPoint) {
  const points = normalizePolyline(polyline);
  if (points.length < 2) {
    return Array.isArray(polyline) ? points : polyline ?? null;
  }

  const entry = normalizeCoordinate(entryPoint);
  const exit = normalizeCoordinate(exitPoint);
  if (!entry || !exit) return points;

  const first = points[0];
  const last = points[points.length - 1];
  const directMismatch = Math.max(
    distanceMeters(first, entry),
    distanceMeters(last, exit)
  );
  const reverseMismatch = Math.max(
    distanceMeters(last, entry),
    distanceMeters(first, exit)
  );

  return reverseMismatch < directMismatch ? [...points].reverse() : points;
}

function normalizeDetourSegmentOrientation(segment) {
  if (!segment || typeof segment !== 'object') return segment;

  const next = cloneJson(segment);
  for (const key of ['skippedSegmentPolyline', 'inferredDetourPolyline', 'likelyDetourPolyline']) {
    if (Array.isArray(next[key])) {
      next[key] = orientPolylineToEndpoints(next[key], next.entryPoint, next.exitPoint);
    }
  }
  return next;
}

function hasRenderablePath(segment) {
  return (
    Array.isArray(segment?.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2
  ) || (
    Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2
  ) || (
    Array.isArray(segment?.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 2
  );
}

function normalizeDetourGeometryOrientation(geometry) {
  if (!geometry || typeof geometry !== 'object') return geometry;

  const next = cloneJson(geometry);
  const segments = Array.isArray(next.segments)
    ? next.segments.map(normalizeDetourSegmentOrientation)
    : [];

  if (Array.isArray(next.segments)) {
    next.segments = segments;
  }

  const primarySegment = segments.find(hasRenderablePath) || segments[0] || null;
  const entryPoint = next.entryPoint || primarySegment?.entryPoint || null;
  const exitPoint = next.exitPoint || primarySegment?.exitPoint || null;

  for (const key of ['skippedSegmentPolyline', 'inferredDetourPolyline', 'likelyDetourPolyline']) {
    if (Array.isArray(next[key])) {
      next[key] = orientPolylineToEndpoints(next[key], entryPoint, exitPoint);
    }
  }

  return next;
}

module.exports = {
  normalizeCoordinate,
  normalizePolyline,
  orientPolylineToEndpoints,
  normalizeDetourSegmentOrientation,
  normalizeDetourGeometryOrientation,
};
