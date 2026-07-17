'use strict';

const EARTH_RADIUS_METERS = 6371000;

function normalizeCoordinate(point) {
  if (!point || typeof point !== 'object') return null;
  const latitude = Number(point.latitude ?? point.lat);
  const longitude = Number(point.longitude ?? point.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function haversineDistance(pointA, pointB) {
  if (!pointA || !pointB) return Infinity;
  const lat1 = Number(pointA.latitude);
  const lon1 = Number(pointA.longitude);
  const lat2 = Number(pointB.latitude);
  const lon2 = Number(pointB.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistance(point, start, end) {
  if (!point || !start || !end) return Infinity;

  const x = Number(point.longitude);
  const y = Number(point.latitude);
  const x1 = Number(start.longitude);
  const y1 = Number(start.latitude);
  const x2 = Number(end.longitude);
  const y2 = Number(end.latitude);
  if (![x, y, x1, y1, x2, y2].every(Number.isFinite)) return Infinity;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return haversineDistance(point, start);

  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return haversineDistance(point, {
    latitude: y1 + t * dy,
    longitude: x1 + t * dx,
  });
}

function normalizePolyline(polyline) {
  if (!Array.isArray(polyline)) return [];

  const points = [];
  let previousKey = null;
  for (const point of polyline) {
    const normalized = normalizeCoordinate(point);
    if (!normalized) continue;
    const key = `${normalized.latitude.toFixed(6)},${normalized.longitude.toFixed(6)}`;
    if (key === previousKey) continue;
    previousKey = key;
    points.push(normalized);
  }
  return points;
}

function pointToPolylineDistance(point, polyline) {
  const line = normalizePolyline(polyline);
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineDistance(point, line[0]);

  let minDistance = Infinity;
  for (let index = 0; index < line.length - 1; index += 1) {
    minDistance = Math.min(
      minDistance,
      pointToSegmentDistance(point, line[index], line[index + 1])
    );
  }
  return minDistance;
}

function polylineLengthMeters(polyline) {
  const points = normalizePolyline(polyline);
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = haversineDistance(points[index - 1], points[index]);
    if (Number.isFinite(distance)) length += distance;
  }
  return length;
}

function dedupeConsecutivePoints(points) {
  if (!Array.isArray(points) || points.length === 0) return [];

  return points.reduce((deduped, point) => {
    const normalized = normalizeCoordinate(point);
    if (!normalized) return deduped;
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      previous.latitude === normalized.latitude &&
      previous.longitude === normalized.longitude
    ) {
      return deduped;
    }
    deduped.push(normalized);
    return deduped;
  }, []);
}

function projectPointOntoPolyline(point, polyline) {
  const normalizedPoint = normalizeCoordinate(point);
  const line = normalizePolyline(polyline);
  if (!normalizedPoint || line.length < 2) return null;

  let best = null;
  let cumulativeMeters = 0;
  for (let index = 0; index < line.length - 1; index += 1) {
    const start = line[index];
    const end = line[index + 1];
    const dx = end.longitude - start.longitude;
    const dy = end.latitude - start.latitude;
    const denominator = dx * dx + dy * dy;
    const t = denominator > 0
      ? Math.max(0, Math.min(1, (
        (normalizedPoint.longitude - start.longitude) * dx +
        (normalizedPoint.latitude - start.latitude) * dy
      ) / denominator))
      : 0;
    const projectedPoint = {
      latitude: start.latitude + t * dy,
      longitude: start.longitude + t * dx,
    };
    const distanceMeters = haversineDistance(normalizedPoint, projectedPoint);
    const segmentLengthMeters = haversineDistance(start, end);
    const progressMeters = cumulativeMeters + segmentLengthMeters * t;
    if (!best || distanceMeters < best.distanceMeters) {
      best = { index, t, projectedPoint, distanceMeters, progressMeters };
    }
    cumulativeMeters += segmentLengthMeters;
  }
  return best;
}

function buildPolylineSpanFromProjections(polyline, firstProjection, secondProjection) {
  const line = normalizePolyline(polyline);
  if (line.length < 2 || !firstProjection || !secondProjection) return [];
  const lower = firstProjection.progressMeters <= secondProjection.progressMeters
    ? firstProjection
    : secondProjection;
  const upper = lower === firstProjection ? secondProjection : firstProjection;
  const span = [lower.projectedPoint];
  for (let index = lower.index + 1; index <= upper.index; index += 1) {
    span.push(line[index]);
  }
  span.push(upper.projectedPoint);
  return dedupeConsecutivePoints(span);
}

module.exports = {
  buildPolylineSpanFromProjections,
  dedupeConsecutivePoints,
  haversineDistance,
  normalizeCoordinate,
  normalizePolyline,
  pointToPolylineDistance,
  polylineLengthMeters,
  projectPointOntoPolyline,
  toRadians,
};
