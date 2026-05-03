const { haversineDistance, pointToSegmentDistance } = require('../../geometry');

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

function buildCumulativeDistances(polyline) {
  const cumulative = [0];
  for (let i = 1; i < polyline.length; i++) {
    cumulative[i] =
      cumulative[i - 1] +
      haversineDistance(
        polyline[i - 1].latitude,
        polyline[i - 1].longitude,
        polyline[i].latitude,
        polyline[i].longitude
      );
  }
  return cumulative;
}

function dedupeConsecutivePoints(points) {
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
}

function buildPolylineLengthMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }

  return total;
}

function interpolatePointAlongPolyline(polyline, cumulativeDistances, targetMeters) {
  if (!Array.isArray(polyline) || polyline.length === 0) return null;
  if (polyline.length === 1) {
    return {
      latitude: polyline[0].latitude,
      longitude: polyline[0].longitude,
    };
  }

  const maxDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const clampedTarget = Math.max(0, Math.min(targetMeters, maxDistance));

  for (let i = 1; i < cumulativeDistances.length; i++) {
    if (cumulativeDistances[i] < clampedTarget) continue;

    const segmentStartDistance = cumulativeDistances[i - 1];
    const segmentLength = cumulativeDistances[i] - segmentStartDistance;
    if (segmentLength <= 0) {
      return {
        latitude: polyline[i].latitude,
        longitude: polyline[i].longitude,
      };
    }

    const ratio = (clampedTarget - segmentStartDistance) / segmentLength;
    return {
      latitude: polyline[i - 1].latitude + (polyline[i].latitude - polyline[i - 1].latitude) * ratio,
      longitude: polyline[i - 1].longitude + (polyline[i].longitude - polyline[i - 1].longitude) * ratio,
    };
  }

  const lastPoint = polyline[polyline.length - 1];
  return {
    latitude: lastPoint.latitude,
    longitude: lastPoint.longitude,
  };
}

function extractSkippedSegment(polyline, entryIndex, exitIndex) {
  if (!polyline || polyline.length === 0) return [];
  const start = Math.max(0, entryIndex);
  const end = Math.min(polyline.length - 1, exitIndex);
  return polyline.slice(start, end + 1).map(p => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}

function extractSkippedSegmentByProgress(polyline, entryProgressMeters, exitProgressMeters) {
  if (!Array.isArray(polyline) || polyline.length === 0) return [];

  const cumulativeDistances = buildCumulativeDistances(polyline);
  const maxDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const startMeters = Math.max(0, Math.min(entryProgressMeters, exitProgressMeters, maxDistance));
  const endMeters = Math.max(0, Math.min(Math.max(entryProgressMeters, exitProgressMeters), maxDistance));

  const points = [];
  const startPoint = interpolatePointAlongPolyline(polyline, cumulativeDistances, startMeters);
  if (startPoint) points.push(startPoint);

  for (let i = 1; i < cumulativeDistances.length - 1; i++) {
    if (cumulativeDistances[i] <= startMeters || cumulativeDistances[i] >= endMeters) continue;
    points.push({
      latitude: polyline[i].latitude,
      longitude: polyline[i].longitude,
    });
  }

  const endPoint = interpolatePointAlongPolyline(polyline, cumulativeDistances, endMeters);
  if (endPoint) points.push(endPoint);

  return dedupeConsecutivePoints(points);
}

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

module.exports = {
  findClosestShapePoint,
  buildCumulativeDistances,
  dedupeConsecutivePoints,
  buildPolylineLengthMeters,
  interpolatePointAlongPolyline,
  extractSkippedSegment,
  extractSkippedSegmentByProgress,
  douglasPeucker,
};
