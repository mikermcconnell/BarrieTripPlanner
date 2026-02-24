/**
 * Trip Input Validation
 *
 * Validates trip planning inputs before sending to the router.
 * Returns structured error objects with codes matching errorMessages.js.
 */

import { haversineDistance } from './geometryUtils';
import { findContainingZone } from './zoneUtils';

// Barrie service area bounds (generous to include surrounding areas served)
const SERVICE_AREA = {
  minLat: 44.25,
  maxLat: 44.50,
  minLon: -79.85,
  maxLon: -79.55,
};

// Barrie centroid for distance calculations
const BARRIE_CENTROID = { lat: 44.3894, lon: -79.6903 };

// Maximum distance from Barrie centroid to be considered in-service (km)
const MAX_SERVICE_DISTANCE_KM = 20;

// Minimum distance between origin and destination (meters)
const MIN_TRIP_DISTANCE_M = 50;

/**
 * Validation result shape
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string|null} errorCode - Matches TRIP_ERROR_CODES from tripService.js
 * @property {string|null} errorMessage - User-facing message
 */

/**
 * Strip control characters from text input
 * @param {string} text
 * @returns {string}
 */
export const sanitizeInput = (text) => {
  if (typeof text !== 'string') return '';
  // Remove control characters (U+0000–U+001F, U+007F–U+009F) except common whitespace
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
};

/**
 * Check if coordinates are valid numbers within reasonable lat/lon ranges
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean}
 */
const isValidCoordinate = (lat, lon) => {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
};

/**
 * Check if a coordinate is within the Barrie service area bounds
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean}
 */
const isInServiceArea = (lat, lon) => {
  return (
    lat >= SERVICE_AREA.minLat &&
    lat <= SERVICE_AREA.maxLat &&
    lon >= SERVICE_AREA.minLon &&
    lon <= SERVICE_AREA.maxLon
  );
};

/**
 * Validate a trip planning request
 *
 * @param {Object} params
 * @param {Object|null} params.from - { lat, lon } or null
 * @param {Object|null} params.to - { lat, lon } or null
 * @param {string} [params.fromText] - Text input for origin
 * @param {string} [params.toText] - Text input for destination
 * @returns {ValidationResult}
 */
export const validateTripInputs = ({ from, to, fromText, toText, onDemandZones } = {}) => {
  // Check that both locations are set
  if (!from || from.lat == null || from.lon == null) {
    return {
      valid: false,
      errorCode: 'VALIDATION_ERROR',
      errorMessage: 'Please select a starting location.',
    };
  }

  if (!to || to.lat == null || to.lon == null) {
    return {
      valid: false,
      errorCode: 'VALIDATION_ERROR',
      errorMessage: 'Please select a destination.',
    };
  }

  // Validate coordinate formats
  if (!isValidCoordinate(from.lat, from.lon)) {
    return {
      valid: false,
      errorCode: 'VALIDATION_ERROR',
      errorMessage: 'Invalid starting location coordinates.',
    };
  }

  if (!isValidCoordinate(to.lat, to.lon)) {
    return {
      valid: false,
      errorCode: 'VALIDATION_ERROR',
      errorMessage: 'Invalid destination coordinates.',
    };
  }

  // Check service area for origin (skip if inside an on-demand zone)
  const originInZone = onDemandZones ? findContainingZone(from.lat, from.lon, onDemandZones) : null;
  if (!originInZone && !isInServiceArea(from.lat, from.lon)) {
    return {
      valid: false,
      errorCode: 'OUTSIDE_SERVICE_AREA',
      errorMessage: 'Your starting location is outside the Barrie Transit service area.',
    };
  }

  // Check service area for destination (skip if inside an on-demand zone)
  const destInZone = onDemandZones ? findContainingZone(to.lat, to.lon, onDemandZones) : null;
  if (!destInZone && !isInServiceArea(to.lat, to.lon)) {
    return {
      valid: false,
      errorCode: 'OUTSIDE_SERVICE_AREA',
      errorMessage: 'Your destination is outside the Barrie Transit service area.',
    };
  }

  // Detect origin === destination (haversine < 50m)
  const distanceMeters = haversineDistance(from.lat, from.lon, to.lat, to.lon);
  if (distanceMeters < MIN_TRIP_DISTANCE_M) {
    return {
      valid: false,
      errorCode: 'VALIDATION_ERROR',
      errorMessage: 'Your starting location and destination are too close together. Try walking instead!',
    };
  }

  return { valid: true, errorCode: null, errorMessage: null };
};
