/**
 * Polyline Utilities
 *
 * Shared functions for decoding Google-encoded polylines and
 * extracting shape segments between two coordinates.
 */

import { haversineDistance } from './geometryUtils';

/**
 * Decode a Google-encoded polyline string into coordinates
 * @param {string} encoded - Encoded polyline string
 * @returns {Array<{latitude: number, longitude: number}>} Decoded coordinates
 */
export const decodePolyline = (encoded) => {
  if (!encoded) return [];
  const coords = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
};

/**
 * Find the index of the closest point in a shape to a given location
 * @param {Array<{latitude: number, longitude: number}>} shapeCoords - Shape coordinates
 * @param {number} lat - Target latitude
 * @param {number} lon - Target longitude
 * @returns {number} Index of the closest point
 */
export const findClosestPointIndex = (shapeCoords, lat, lon) => {
  let minDist = Infinity;
  let closestIdx = 0;

  shapeCoords.forEach((coord, idx) => {
    const dist = haversineDistance(lat, lon, coord.latitude, coord.longitude);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = idx;
    }
  });

  return closestIdx;
};

/**
 * Extract a segment of a shape between two points
 * @param {Array<{latitude: number, longitude: number}>} shapeCoords - Full shape coordinates
 * @param {number} fromLat - Start latitude
 * @param {number} fromLon - Start longitude
 * @param {number} toLat - End latitude
 * @param {number} toLon - End longitude
 * @returns {Array<{latitude: number, longitude: number}>} Extracted segment
 */
/**
 * Encode coordinates into a Google-encoded polyline string (inverse of decodePolyline)
 * @param {Array<{latitude: number, longitude: number}>} coords - Coordinates to encode
 * @returns {string} Encoded polyline string
 */
export const encodePolyline = (coords) => {
  if (!coords || coords.length === 0) return '';

  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const coord of coords) {
    const lat = Math.round(coord.latitude * 1e5);
    const lng = Math.round(coord.longitude * 1e5);

    encoded += encodeSignedValue(lat - prevLat);
    encoded += encodeSignedValue(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
};

const encodeSignedValue = (value) => {
  let v = value < 0 ? ~(value << 1) : (value << 1);
  let encoded = '';
  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  encoded += String.fromCharCode(v + 63);
  return encoded;
};

export const extractShapeSegment = (shapeCoords, fromLat, fromLon, toLat, toLon) => {
  if (!shapeCoords || shapeCoords.length === 0) return [];

  const startIdx = findClosestPointIndex(shapeCoords, fromLat, fromLon);
  const endIdx = findClosestPointIndex(shapeCoords, toLat, toLon);

  // Handle both directions (shape might be in reverse order)
  if (startIdx <= endIdx) {
    return shapeCoords.slice(startIdx, endIdx + 1);
  } else {
    // Reverse direction - take from end to start and reverse
    return shapeCoords.slice(endIdx, startIdx + 1).reverse();
  }
};
