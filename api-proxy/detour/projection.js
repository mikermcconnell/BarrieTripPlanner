'use strict';

const { haversineDistance } = require('../geometry');
const { buildCumulativeDistances, findClosestShapePoint } = require('../detourGeometry');

function normalizePoint(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function projectOntoPolyline(coordinate, polyline) {
  if (!coordinate || !Array.isArray(polyline) || polyline.length < 2) return null;
  const closest = findClosestShapePoint(coordinate, polyline);
  if (!closest || !closest.projectedPoint) return null;
  const cumulative = buildCumulativeDistances(polyline);
  const segmentStart = polyline[closest.index];
  const progressMeters =
    cumulative[closest.index] +
    haversineDistance(
      segmentStart.latitude,
      segmentStart.longitude,
      closest.projectedPoint.latitude,
      closest.projectedPoint.longitude
    );

  return {
    index: closest.index,
    projectedPoint: closest.projectedPoint,
    distanceMeters: closest.distanceMeters,
    progressMeters,
  };
}

function projectCoordinateToRoute(routeId, coordinate, shapes, routeShapeMapping, tripShapeId = null) {
  const shapeIds = routeShapeMapping.get(routeId);
  if (!Array.isArray(shapeIds) || shapeIds.length === 0 || !coordinate) return null;

  let candidateShapeIds = shapeIds;
  if (tripShapeId && shapeIds.includes(tripShapeId)) {
    candidateShapeIds = [tripShapeId, ...shapeIds.filter((shapeId) => shapeId !== tripShapeId)];
  }

  let best = null;
  for (const shapeId of candidateShapeIds) {
    const polyline = shapes.get(shapeId);
    if (!polyline || polyline.length < 2) continue;
    const projection = projectOntoPolyline(coordinate, polyline);
    if (!projection) continue;

    if (!best || projection.distanceMeters < best.distanceMeters) {
      best = {
        ...projection,
        shapeId,
      };
    }

    if (tripShapeId && shapeId === tripShapeId) {
      break;
    }
  }

  return best;
}

function projectCoordinateToShape(shapeId, coordinate, shapes) {
  if (!shapeId || !coordinate || !shapes) return null;
  const polyline = shapes.get(shapeId);
  if (!Array.isArray(polyline) || polyline.length < 2) return null;
  const projection = projectOntoPolyline(coordinate, polyline);
  return projection ? { ...projection, shapeId } : null;
}

function classifyRouteProjection(distanceMeters, routeConfig) {
  if (!Number.isFinite(distanceMeters)) return 'no-projection';
  if (distanceMeters > routeConfig.offRouteThresholdMeters) return 'off-route';
  if (distanceMeters <= routeConfig.onRouteClearThresholdMeters) return 'on-route-clear';
  return 'deadband';
}

function buildRouteProjectionDiagnostic({
  routeId,
  coordinate,
  routeProjection,
  distanceMeters,
  routeConfig,
  sampleTimeMs,
  checkedAt,
  tripId,
  tripShapeId,
}) {
  const normalizedCoordinate = normalizePoint(coordinate);
  return {
    routeId: routeId || null,
    tripId: tripId || null,
    tripShapeId: tripShapeId || null,
    shapeId: routeProjection?.shapeId || null,
    classification: classifyRouteProjection(distanceMeters, routeConfig),
    distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : null,
    progressMeters: Number.isFinite(routeProjection?.progressMeters)
      ? routeProjection.progressMeters
      : null,
    offRouteThresholdMeters: routeConfig.offRouteThresholdMeters,
    onRouteClearThresholdMeters: routeConfig.onRouteClearThresholdMeters,
    sampledAt: Number.isFinite(sampleTimeMs) ? sampleTimeMs : null,
    checkedAt: Number.isFinite(checkedAt) ? checkedAt : null,
    coordinate: normalizedCoordinate,
  };
}

module.exports = {
  buildRouteProjectionDiagnostic,
  classifyRouteProjection,
  projectCoordinateToRoute,
  projectCoordinateToShape,
  projectOntoPolyline,
};