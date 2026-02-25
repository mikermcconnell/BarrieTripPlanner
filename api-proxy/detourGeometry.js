'use strict';

const { haversineDistance, pointToSegmentDistance } = require('./geometry');

// Minimum evidence points needed for any geometry output
const MIN_EVIDENCE_FOR_GEOMETRY = 3;
// Minimum points after simplification to return an inferredDetourPolyline
const MIN_SIMPLIFIED_POINTS = 2;
// Douglas-Peucker tolerance in meters
const DP_TOLERANCE_METERS = 25;
// Confidence thresholds
const HIGH_CONFIDENCE_DURATION_MS = 5 * 60 * 1000;
const HIGH_CONFIDENCE_POINTS = 10;
const HIGH_CONFIDENCE_VEHICLES = 2;
const MEDIUM_CONFIDENCE_DURATION_MS = 2 * 60 * 1000;
const MEDIUM_CONFIDENCE_POINTS = 5;

/**
 * Find the closest point on a polyline to a coordinate.
 * Returns the segment start index, the projected point, and the distance in meters.
 */
function findClosestShapePoint(coord, polyline) {
  if (!polyline || polyline.length === 0) return null;
  if (polyline.length === 1) {
    return {
      index: 0,
      projectedPoint: { latitude: polyline[0].latitude, longitude: polyline[0].longitude },
      distanceMeters: haversineDistance(
        coord.latitude, coord.longitude,
        polyline[0].latitude, polyline[0].longitude
      ),
    };
  }

  let bestIndex = 0;
  let bestDist = Infinity;
  let bestProjected = null;

  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];

    const dx = p2.longitude - p1.longitude;
    const dy = p2.latitude - p1.latitude;
    const lenSq = dx * dx + dy * dy;

    let projLat, projLon;
    if (lenSq === 0) {
      projLat = p1.latitude;
      projLon = p1.longitude;
    } else {
      // Scale longitude by cos(lat) for accurate projection
      const cosLat = Math.cos(((p1.latitude + p2.latitude) / 2) * Math.PI / 180);
      const sdx = dx * cosLat;
      const sdy = dy;
      const t = Math.max(0, Math.min(1,
        ((coord.longitude - p1.longitude) * cosLat * sdx + (coord.latitude - p1.latitude) * sdy) / (sdx * sdx + sdy * sdy)
      ));
      projLat = p1.latitude + t * dy;
      projLon = p1.longitude + t * dx;
    }

    const dist = haversineDistance(coord.latitude, coord.longitude, projLat, projLon);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
      bestProjected = { latitude: projLat, longitude: projLon };
    }
  }

  return { index: bestIndex, projectedPoint: bestProjected, distanceMeters: bestDist };
}

/**
 * Find entry/exit anchor indices on the best-matching shape for the evidence points.
 * Uses earliest evidence as entry anchor, latest as exit anchor.
 * Picks the shape that minimizes the combined entry+exit distance.
 */
function findAnchors(evidencePoints, shapes, shapeIds) {
  if (!evidencePoints || evidencePoints.length === 0) return null;
  if (!shapeIds || shapeIds.length === 0) return null;

  const entryPoint = evidencePoints[0];
  const exitPoint = evidencePoints[evidencePoints.length - 1];

  let bestShapeId = null;
  let bestEntryIndex = 0;
  let bestExitIndex = 0;
  let bestTotalDist = Infinity;

  for (const shapeId of shapeIds) {
    const polyline = shapes.get(shapeId);
    if (!polyline || polyline.length < 2) continue;

    const entryCsp = findClosestShapePoint(entryPoint, polyline);
    const exitCsp = findClosestShapePoint(exitPoint, polyline);
    if (!entryCsp || !exitCsp) continue;

    const totalDist = entryCsp.distanceMeters + exitCsp.distanceMeters;
    if (totalDist < bestTotalDist) {
      bestTotalDist = totalDist;
      bestShapeId = shapeId;
      bestEntryIndex = entryCsp.index;
      bestExitIndex = exitCsp.index;
    }
  }

  if (!bestShapeId) return null;

  // Normalize so entryIndex <= exitIndex for consistent segment extraction.
  // Track whether we swapped for correct entry/exit point labeling.
  let swapped = false;
  if (bestEntryIndex > bestExitIndex) {
    [bestEntryIndex, bestExitIndex] = [bestExitIndex, bestEntryIndex];
    swapped = true;
  }

  return { shapeId: bestShapeId, entryIndex: bestEntryIndex, exitIndex: bestExitIndex, swapped };
}

/**
 * Extract a slice of the polyline between entryIndex and exitIndex (inclusive of endpoints).
 */
function extractSkippedSegment(polyline, entryIndex, exitIndex) {
  if (!polyline || polyline.length === 0) return [];
  const start = Math.max(0, entryIndex);
  const end = Math.min(polyline.length - 1, exitIndex + 1);
  return polyline.slice(start, end + 1).map(p => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}

/**
 * Douglas-Peucker polyline simplification using haversine distances.
 */
function douglasPeucker(points, toleranceMeters) {
  if (!points || points.length <= 2) return points ? points.slice() : [];

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > toleranceMeters) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), toleranceMeters);
    const right = douglasPeucker(points.slice(maxIdx), toleranceMeters);
    return left.slice(0, -1).concat(right);
  }

  return [start, end];
}

/**
 * Score geometry confidence based on evidence density, duration, and vehicle count.
 */
function scoreConfidence(evidencePoints, detectedAtMs, now) {
  if (!evidencePoints || evidencePoints.length === 0) return 'low';

  const count = evidencePoints.length;
  const durationMs = now - detectedAtMs;
  const uniqueVehicles = new Set(evidencePoints.map(p => p.vehicleId)).size;

  if (durationMs >= HIGH_CONFIDENCE_DURATION_MS &&
      count >= HIGH_CONFIDENCE_POINTS &&
      uniqueVehicles >= HIGH_CONFIDENCE_VEHICLES) {
    return 'high';
  }
  if (durationMs >= MEDIUM_CONFIDENCE_DURATION_MS && count >= MEDIUM_CONFIDENCE_POINTS) {
    return 'medium';
  }
  return 'low';
}

/**
 * Top-level geometry builder. Called per active detour when building the snapshot.
 */
function buildGeometry(routeId, evidenceWindow, shapes, routeShapeMapping, now, detectedAtMs) {
  const empty = {
    skippedSegmentPolyline: null,
    inferredDetourPolyline: null,
    entryPoint: null,
    exitPoint: null,
    confidence: 'low',
    evidencePointCount: 0,
    lastEvidenceAt: null,
  };

  if (!evidenceWindow || evidenceWindow.points.length < MIN_EVIDENCE_FOR_GEOMETRY) {
    return empty;
  }

  const points = evidenceWindow.points;
  const shapeIds = routeShapeMapping.get(routeId);
  if (!shapeIds || shapeIds.length === 0) return empty;

  const lastEvidenceAt = points[points.length - 1].timestampMs;

  const anchors = findAnchors(points, shapes, shapeIds);
  if (!anchors) return empty;

  const polyline = shapes.get(anchors.shapeId);
  const skippedSegmentPolyline = extractSkippedSegment(
    polyline, anchors.entryIndex, anchors.exitIndex
  );

  // Build inferred detour polyline from simplified evidence coordinates
  const rawCoords = points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  const simplified = douglasPeucker(rawCoords, DP_TOLERANCE_METERS);
  const inferredDetourPolyline = simplified.length >= MIN_SIMPLIFIED_POINTS ? simplified : null;

  const confidence = scoreConfidence(points, detectedAtMs, now);

  // Entry/exit points as lat/lon for Firestore.
  // If anchors were swapped (reverse traversal), un-swap the labels so entry = where vehicle
  // first left the route (earliest evidence) and exit = where it rejoined (latest evidence).
  const entryIdx = anchors.entryIndex;
  const exitIdx = Math.min(anchors.exitIndex + 1, polyline.length - 1);
  const rawEntry = polyline[entryIdx]
    ? { latitude: polyline[entryIdx].latitude, longitude: polyline[entryIdx].longitude }
    : null;
  const rawExit = polyline[exitIdx]
    ? { latitude: polyline[exitIdx].latitude, longitude: polyline[exitIdx].longitude }
    : null;
  const entryPoint = anchors.swapped ? rawExit : rawEntry;
  const exitPoint = anchors.swapped ? rawEntry : rawExit;

  return {
    skippedSegmentPolyline: skippedSegmentPolyline.length >= 2 ? skippedSegmentPolyline : null,
    inferredDetourPolyline,
    entryPoint,
    exitPoint,
    confidence,
    evidencePointCount: points.length,
    lastEvidenceAt,
  };
}

module.exports = {
  findClosestShapePoint,
  findAnchors,
  extractSkippedSegment,
  douglasPeucker,
  scoreConfidence,
  buildGeometry,
  MIN_EVIDENCE_FOR_GEOMETRY,
  MIN_SIMPLIFIED_POINTS,
  DP_TOLERANCE_METERS,
};
