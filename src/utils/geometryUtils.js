/**
 * Geometry utilities for detour detection
 * Provides distance calculations between points, segments, and polylines
 */

// Earth's radius in meters
const EARTH_RADIUS_METERS = 6371000;

/**
 * Convert degrees to radians
 */
const toRadians = (degrees) => degrees * (Math.PI / 180);

/**
 * Calculate the Haversine distance between two coordinates in meters
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
export const safeHaversineDistance = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  return haversineDistance(lat1, lon1, lat2, lon2);
};

export const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};

/**
 * Calculate the minimum distance from a point to a line segment
 * Uses projection to find the closest point on the segment
 * @param {Object} point - Point with latitude and longitude
 * @param {Object} segmentStart - Start point of segment with latitude and longitude
 * @param {Object} segmentEnd - End point of segment with latitude and longitude
 * @returns {number} Distance in meters
 */
export const pointToSegmentDistance = (point, segmentStart, segmentEnd) => {
  const x = point.longitude;
  const y = point.latitude;
  const x1 = segmentStart.longitude;
  const y1 = segmentStart.latitude;
  const x2 = segmentEnd.longitude;
  const y2 = segmentEnd.latitude;

  // Vector from segment start to segment end
  const dx = x2 - x1;
  const dy = y2 - y1;

  // If segment has zero length, return distance to the point
  if (dx === 0 && dy === 0) {
    return haversineDistance(y, x, y1, x1);
  }

  // Project point onto segment line using parametric form
  // t is the parameter where the projection falls
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));

  // Calculate the closest point on the segment
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  // Return haversine distance to the closest point
  return haversineDistance(y, x, closestY, closestX);
};

/**
 * Calculate the minimum distance from a point to a polyline (array of coordinates)
 * Checks distance to each segment and returns the minimum
 * @param {Object} point - Point with latitude and longitude
 * @param {Array} polyline - Array of coordinate objects with latitude and longitude
 * @returns {number} Minimum distance in meters
 */
export const pointToPolylineDistance = (point, polyline) => {
  if (!polyline || polyline.length === 0) {
    return Infinity;
  }

  if (polyline.length === 1) {
    return haversineDistance(
      point.latitude,
      point.longitude,
      polyline[0].latitude,
      polyline[0].longitude
    );
  }

  let minDistance = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    minDistance = Math.min(minDistance, pointToSegmentDistance(point, polyline[i], polyline[i + 1]));
  }
  return minDistance;
};

/**
 * Check if two paths overlap within a specified corridor width
 * A path is considered overlapping if a certain percentage of its points
 * fall within the corridor of the other path
 * @param {Array} path1 - First path (array of coordinates)
 * @param {Array} path2 - Second path (array of coordinates)
 * @param {number} corridorWidthMeters - Width of the corridor in meters (default 50m)
 * @param {number} overlapThreshold - Percentage of points that must overlap (default 0.70)
 * @returns {boolean} True if paths overlap sufficiently
 */
export const pathsOverlap = (path1, path2, corridorWidthMeters = 50, overlapThreshold = 0.70) => {
  if (!path1 || !path2 || path1.length < 2 || path2.length < 2) {
    return false;
  }

  // Check how many points of path1 are within the corridor of path2
  let path1PointsNearPath2 = 0;
  for (const point of path1) {
    const dist = pointToPolylineDistance(point, path2);
    if (dist <= corridorWidthMeters) {
      path1PointsNearPath2++;
    }
  }

  // Check how many points of path2 are within the corridor of path1
  let path2PointsNearPath1 = 0;
  for (const point of path2) {
    const dist = pointToPolylineDistance(point, path1);
    if (dist <= corridorWidthMeters) {
      path2PointsNearPath1++;
    }
  }

  // Calculate overlap percentages
  const path1Overlap = path1PointsNearPath2 / path1.length;
  const path2Overlap = path2PointsNearPath1 / path2.length;

  // Both paths must have sufficient overlap
  return path1Overlap >= overlapThreshold && path2Overlap >= overlapThreshold;
};

/**
 * Calculate the centroid (average center point) of a path
 * @param {Array} path - Array of coordinate objects
 * @returns {Object} Centroid with latitude and longitude
 */
export const calculatePathCentroid = (path) => {
  if (!path || path.length === 0) {
    return null;
  }

  const sumLat = path.reduce((sum, p) => sum + p.latitude, 0);
  const sumLon = path.reduce((sum, p) => sum + p.longitude, 0);

  return {
    latitude: sumLat / path.length,
    longitude: sumLon / path.length,
  };
};

/**
 * Simplify a path by removing points that are too close together
 * Uses Douglas-Peucker-like approach with distance threshold
 * @param {Array} path - Array of coordinate objects
 * @param {number} minDistanceMeters - Minimum distance between consecutive points
 * @returns {Array} Simplified path
 */
/**
 * Douglas-Peucker polyline simplification
 * Removes redundant points while preserving shape fidelity
 * @param {Array} path - Array of {latitude, longitude} objects
 * @param {number} toleranceMeters - Maximum allowed deviation in meters
 * @returns {Array} Simplified path
 */
export const douglasPeuckerSimplify = (path, toleranceMeters = 8) => {
  if (!path || path.length <= 2) return path;

  let maxDist = 0;
  let maxIndex = 0;
  const first = path[0];
  const last = path[path.length - 1];

  for (let i = 1; i < path.length - 1; i++) {
    const dist = pointToSegmentDistance(path[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > toleranceMeters) {
    const left = douglasPeuckerSimplify(path.slice(0, maxIndex + 1), toleranceMeters);
    const right = douglasPeuckerSimplify(path.slice(maxIndex), toleranceMeters);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
};

/**
 * Catmull-Rom spline interpolation for smooth curves
 * Inserts smooth intermediate points between waypoints
 * @param {Array} path - Array of {latitude, longitude} objects (minimum 3 points)
 * @param {number} tension - Spline tension (0.5=standard, lower=tighter to roads)
 * @param {number} segmentsPerPair - Number of interpolated segments between each point pair
 * @returns {Array} Smoothed path with additional interpolated points
 */
export const catmullRomSmooth = (path, tension = 0.4, segmentsPerPair = 4) => {
  if (!path || path.length < 3) return path;

  const result = [];

  for (let i = 0; i < path.length - 1; i++) {
    const p0 = path[Math.max(0, i - 1)];
    const p1 = path[i];
    const p2 = path[i + 1];
    const p3 = path[Math.min(path.length - 1, i + 2)];

    result.push(p1);

    for (let t = 1; t < segmentsPerPair; t++) {
      const s = t / segmentsPerPair;

      // Tangents
      const t1Lat = tension * (p2.latitude - p0.latitude);
      const t1Lon = tension * (p2.longitude - p0.longitude);
      const t2Lat = tension * (p3.latitude - p1.latitude);
      const t2Lon = tension * (p3.longitude - p1.longitude);

      // Hermite basis functions
      const h00 = 2 * s * s * s - 3 * s * s + 1;
      const h10 = s * s * s - 2 * s * s + s;
      const h01 = -2 * s * s * s + 3 * s * s;
      const h11 = s * s * s - s * s;

      result.push({
        latitude: h00 * p1.latitude + h10 * t1Lat + h01 * p2.latitude + h11 * t2Lat,
        longitude: h00 * p1.longitude + h10 * t1Lon + h01 * p2.longitude + h11 * t2Lon,
      });
    }
  }

  result.push(path[path.length - 1]);
  return result;
};

/**
 * Process a raw shape through the rendering pipeline: simplify then smooth
 * @param {Array} rawShape - Array of {latitude, longitude} objects
 * @param {Object} options - Processing options
 * @returns {Array} Processed shape ready for rendering
 */
export const processShapeForRendering = (rawShape, options = {}) => {
  const {
    dpTolerance = 8,
    smooth = false,
    splineTension = 0.4,
    splineSegments = 4,
  } = options;

  if (!rawShape || rawShape.length < 2) return rawShape;

  // Douglas-Peucker simplification removes redundant points
  const simplified = douglasPeuckerSimplify(rawShape, dpTolerance);

  // Catmull-Rom smoothing is opt-in — can overshoot at sharp turns
  if (smooth && simplified.length >= 3) {
    return catmullRomSmooth(simplified, splineTension, splineSegments);
  }

  return simplified;
};

/**
 * Detect overlapping route pairs and assign offset indices for parallel display
 * @param {Object} shapes - Map of shapeId → array of coordinates
 * @param {Object} routeShapeMapping - Map of routeId → array of shapeIds
 * @param {number} corridorMeters - Width of corridor for overlap detection
 * @returns {Object} Map of shapeId → { offsetIndex, totalOverlapping }
 */
export const computeOverlapOffsets = (shapes, routeShapeMapping, corridorMeters = 30) => {
  const routeIds = Object.keys(routeShapeMapping);
  if (routeIds.length < 2) return {};

  // Build route adjacency graph
  const overlapGraph = {};
  routeIds.forEach(id => { overlapGraph[id] = new Set(); });

  // Sample points from each route for faster overlap checking
  const routeSamples = {};
  routeIds.forEach(routeId => {
    const shapeIds = routeShapeMapping[routeId] || [];
    const samples = [];
    shapeIds.forEach(shapeId => {
      const coords = shapes[shapeId] || [];
      for (let i = 0; i < coords.length; i += 5) {
        samples.push(coords[i]);
      }
    });
    routeSamples[routeId] = samples;
  });

  // Check each pair of routes for overlap
  for (let i = 0; i < routeIds.length; i++) {
    for (let j = i + 1; j < routeIds.length; j++) {
      const routeA = routeIds[i];
      const routeB = routeIds[j];
      const samplesA = routeSamples[routeA];
      const samplesB = routeSamples[routeB];

      if (samplesA.length === 0 || samplesB.length === 0) continue;

      let nearCount = 0;
      const step = Math.max(1, Math.floor(samplesA.length / 20));

      for (let k = 0; k < samplesA.length; k += step) {
        const point = samplesA[k];
        for (const bPoint of samplesB) {
          const dist = haversineDistance(
            point.latitude, point.longitude,
            bPoint.latitude, bPoint.longitude
          );
          if (dist <= corridorMeters) {
            nearCount++;
            break;
          }
        }
      }

      const checkedPoints = Math.ceil(samplesA.length / step);
      if (checkedPoints > 0 && nearCount / checkedPoints >= 0.2) {
        overlapGraph[routeA].add(routeB);
        overlapGraph[routeB].add(routeA);
      }
    }
  }

  // BFS to find connected overlap groups
  const visited = new Set();
  const groups = [];

  routeIds.forEach(routeId => {
    if (visited.has(routeId) || overlapGraph[routeId].size === 0) return;

    const group = [];
    const queue = [routeId];
    visited.add(routeId);

    while (queue.length > 0) {
      const current = queue.shift();
      group.push(current);
      overlapGraph[current].forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }

    if (group.length > 1) {
      groups.push(group);
    }
  });

  // Assign offset indices within each group
  const offsets = {};
  groups.forEach(group => {
    group.forEach((routeId, index) => {
      const shapeIds = routeShapeMapping[routeId] || [];
      shapeIds.forEach(shapeId => {
        offsets[shapeId] = {
          offsetIndex: index,
          totalOverlapping: group.length,
        };
      });
    });
  });

  return offsets;
};

/**
 * Darken a hex color by a factor
 * @param {string} hex - Hex color string (e.g., '#E31837')
 * @param {number} factor - Darkening factor (0-1, higher = darker)
 * @returns {string} Darkened hex color
 */
export const darkenColor = (hex, factor = 0.3) => {
  const raw = hex.replace('#', '');
  const r = Math.round(parseInt(raw.substring(0, 2), 16) * (1 - factor));
  const g = Math.round(parseInt(raw.substring(2, 4), 16) * (1 - factor));
  const b = Math.round(parseInt(raw.substring(4, 6), 16) * (1 - factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Offset a path perpendicular to its direction by a given number of meters
 * Used for displaying overlapping routes as parallel lines on native maps
 * @param {Array} path - Array of {latitude, longitude} objects
 * @param {number} offsetMeters - Offset distance in meters (positive = right, negative = left)
 * @returns {Array} Offset path
 */
export const offsetPath = (path, offsetMeters) => {
  if (!path || path.length < 2 || offsetMeters === 0) return path;

  const latOffset = offsetMeters / 111000;
  const lonOffset = offsetMeters / (111000 * Math.cos(toRadians(44.39)));

  const result = [];
  for (let i = 0; i < path.length; i++) {
    let dx, dy;

    if (i === 0) {
      dx = path[1].longitude - path[0].longitude;
      dy = path[1].latitude - path[0].latitude;
    } else if (i === path.length - 1) {
      dx = path[i].longitude - path[i - 1].longitude;
      dy = path[i].latitude - path[i - 1].latitude;
    } else {
      dx = path[i + 1].longitude - path[i - 1].longitude;
      dy = path[i + 1].latitude - path[i - 1].latitude;
    }

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
      result.push(path[i]);
      continue;
    }

    const perpLat = -dx / len;
    const perpLon = dy / len;

    result.push({
      latitude: path[i].latitude + perpLat * latOffset,
      longitude: path[i].longitude + perpLon * lonOffset,
    });
  }

  return result;
};

/**
 * Ray-casting point-in-ring test for a single ring.
 * Ring is an array of [lng, lat] pairs (GeoJSON coordinate order).
 * @param {number} lat - Point latitude
 * @param {number} lon - Point longitude
 * @param {Array} ring - Array of [lng, lat] coordinate pairs
 * @returns {boolean}
 */
export const pointInRing = (lat, lon, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1]; // lat
    const yi = ring[i][0]; // lng
    const xj = ring[j][1]; // lat
    const yj = ring[j][0]; // lng

    const intersect =
      yi > lon !== yj > lon &&
      lat < ((xj - xi) * (lon - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * Point-in-polygon test supporting GeoJSON polygons with holes.
 * Coordinates use GeoJSON order: [lng, lat].
 * The first ring is the outer boundary; subsequent rings are holes.
 * @param {number} lat - Point latitude
 * @param {number} lon - Point longitude
 * @param {Array} coordinates - GeoJSON polygon coordinates array (array of rings)
 * @returns {boolean}
 */
export const pointInPolygon = (lat, lon, coordinates) => {
  if (!coordinates || coordinates.length === 0) return false;

  // Must be inside the outer ring
  if (!pointInRing(lat, lon, coordinates[0])) return false;

  // Must NOT be inside any hole
  for (let i = 1; i < coordinates.length; i++) {
    if (pointInRing(lat, lon, coordinates[i])) return false;
  }

  return true;
};

export const simplifyPath = (path, minDistanceMeters = 20) => {
  if (!path || path.length <= 2) {
    return path;
  }

  const simplified = [path[0]];

  for (let i = 1; i < path.length; i++) {
    const lastPoint = simplified[simplified.length - 1];
    const dist = haversineDistance(
      lastPoint.latitude,
      lastPoint.longitude,
      path[i].latitude,
      path[i].longitude
    );

    if (dist >= minDistanceMeters) {
      simplified.push(path[i]);
    }
  }

  // Always include the last point if it wasn't already
  const lastOriginal = path[path.length - 1];
  const lastSimplified = simplified[simplified.length - 1];
  if (
    lastOriginal.latitude !== lastSimplified.latitude ||
    lastOriginal.longitude !== lastSimplified.longitude
  ) {
    simplified.push(lastOriginal);
  }

  return simplified;
};
