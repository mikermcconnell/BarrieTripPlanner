/**
 * LocationIQ Service (Hybrid)
 *
 * Provides address autocomplete, geocoding, and reverse geocoding.
 * Uses a local Barrie address database first, falling back to
 * LocationIQ's API for POIs and out-of-area queries.
 *
 * HOW IT WORKS:
 * 1. Local data handles ~80-90% of requests (no API cost, instant)
 * 2. LocationIQ fills gaps: POIs, business names, out-of-area
 * 3. All results share the same format for seamless integration
 *
 * Local data: City of Barrie Open Data — Address Points
 * API DOCS: https://locationiq.com/docs
 */

import { LOCATIONIQ_CONFIG } from '../config/constants';
import {
  initLocalGeocoding,
  isLocalDataReady,
  localReverseGeocode,
  localAutocomplete,
  matchesLocalStreet,
} from './localGeocodingService';
import { haversineDistance } from '../utils/geometryUtils';
import { retryFetch } from '../utils/retryFetch';
import logger from '../utils/logger';

// Initialize local geocoding on module load
initLocalGeocoding();

// ─── Response Cache (reduces repeat API calls) ───────────────────
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const autocompleteCache = new Map();
const reverseGeocodeCache = new Map();

function getCached(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(cache, key, data) {
  // Cap cache size to prevent memory leaks
  if (cache.size > 500) {
    // Delete oldest entries
    const keys = [...cache.keys()];
    for (let i = 0; i < 100; i++) cache.delete(keys[i]);
  }
  cache.set(key, { data, time: Date.now() });
}

const { API_KEY, BASE_URL, PROXY_URL, BARRIE_BOUNDS, BARRIE_CENTER, MAX_RESULTS } = LOCATIONIQ_CONFIG;
const PROXY_TOKEN = LOCATIONIQ_CONFIG.PROXY_TOKEN || '';

const getProxyRequestOptions = () => {
  const headers = {};
  if (PROXY_TOKEN) {
    headers['x-api-token'] = PROXY_TOKEN;
    headers['x-client-id'] = 'barrie-transit-app';
  }
  return Object.keys(headers).length > 0 ? { headers } : {};
};

const assertDirectApiKeyConfigured = () => {
  if (!PROXY_URL && !API_KEY) {
    const err = new Error('Location service is not configured');
    err.code = 'SERVICE_UNAVAILABLE';
    throw err;
  }
};

/**
 * LocationIQ API autocomplete (internal — use autocompleteAddress instead)
 */
const _apiAutocomplete = async (query) => {
  // Don't search for very short queries (wastes API calls)
  if (!query || query.trim().length < 3) {
    return [];
  }

  try {
    assertDirectApiKeyConfigured();
    let response;
    if (PROXY_URL) {
      // Route through proxy (API key stays server-side)
      const params = new URLSearchParams({ q: query });
      response = await retryFetch(`${PROXY_URL}/api/autocomplete?${params}`, {
        maxRetries: 2,
        ...getProxyRequestOptions(),
      });
    } else {
      // Direct call (native app or dev without proxy)
      const params = new URLSearchParams({
        key: API_KEY,
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: MAX_RESULTS.toString(),
        countrycodes: 'ca',
        viewbox: BARRIE_BOUNDS,
        bounded: '1',
      });
      response = await retryFetch(`${BASE_URL}/autocomplete?${params}`, { maxRetries: 2 });
    }

    if (!response.ok) {
      if (response.status === 429) {
        logger.warn('LocationIQ rate limit reached. Please wait.');
        const err = new Error('Search limit reached, try again in a moment');
        err.code = 'RATE_LIMITED';
        throw err;
      }
      throw new Error(`LocationIQ API error: ${response.status}`);
    }

    const data = await response.json();

    return data.map((item) => ({
      id: item.place_id,
      displayName: item.display_name,
      shortName: formatShortAddress(item),
      address: item.address || {},
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      type: item.type,
      importance: item.importance,
    }));
  } catch (error) {
    console.error('Autocomplete error:', error);
    const wrapped = new Error(error.code === 'RATE_LIMITED'
      ? 'Search limit reached, try again in a moment'
      : 'Address search temporarily unavailable');
    wrapped.code = error.code || 'SERVICE_UNAVAILABLE';
    throw wrapped;
  }
};

/**
 * LocationIQ API geocode (internal — use geocodeAddress instead)
 */
const _apiGeocode = async (address) => {
  if (!address || address.trim().length < 3) {
    return null;
  }

  try {
    assertDirectApiKeyConfigured();
    let response;
    if (PROXY_URL) {
      const params = new URLSearchParams({ q: address });
      response = await retryFetch(`${PROXY_URL}/api/geocode?${params}`, {
        maxRetries: 2,
        ...getProxyRequestOptions(),
      });
    } else {
      const params = new URLSearchParams({
        key: API_KEY,
        q: address,
        format: 'json',
        addressdetails: '1',
        limit: '1',
        countrycodes: 'ca',
        viewbox: BARRIE_BOUNDS,
        bounded: '1',
      });
      response = await retryFetch(`${BASE_URL}/search?${params}`, { maxRetries: 2 });
    }

    if (!response.ok) {
      throw new Error(`Geocoding error: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName: result.display_name,
      shortName: formatShortAddress(result),
      address: result.address || {},
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

/**
 * LocationIQ API reverse geocode (internal — use reverseGeocode instead)
 */
const _apiReverseGeocode = async (lat, lon) => {
  try {
    assertDirectApiKeyConfigured();
    let response;
    if (PROXY_URL) {
      const params = new URLSearchParams({ lat: lat.toString(), lon: lon.toString() });
      response = await retryFetch(`${PROXY_URL}/api/reverse-geocode?${params}`, {
        maxRetries: 2,
        ...getProxyRequestOptions(),
      });
    } else {
      const params = new URLSearchParams({
        key: API_KEY,
        lat: lat.toString(),
        lon: lon.toString(),
        format: 'json',
        addressdetails: '1',
      });
      response = await retryFetch(`${BASE_URL}/reverse?${params}`, { maxRetries: 2 });
    }

    if (!response.ok) {
      throw new Error(`Reverse geocoding error: ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      return null;
    }

    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName: result.display_name,
      shortName: formatShortAddress(result),
      address: result.address || {},
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
};

/**
 * Format a short, readable address from LocationIQ result
 *
 * Takes the full LocationIQ response and creates a short address like:
 * "123 Main St, Barrie" instead of the full display_name
 *
 * @param {Object} item - LocationIQ result object
 * @returns {string} Short formatted address
 */
const formatShortAddress = (item) => {
  const addr = item.address || {};

  // Build address parts in order of specificity
  const parts = [];

  // Street address (house number + road)
  if (addr.house_number && addr.road) {
    parts.push(`${addr.house_number} ${addr.road}`);
  } else if (addr.road) {
    parts.push(addr.road);
  } else if (addr.name || item.name) {
    parts.push(addr.name || item.name);
  }

  // Add city/town if not Barrie (to save space for local results)
  const city = addr.city || addr.town || addr.village || addr.municipality;
  if (city && city.toLowerCase() !== 'barrie') {
    parts.push(city);
  } else if (city) {
    parts.push(city);
  }

  // If we couldn't build a short name, use display_name truncated
  if (parts.length === 0 && item.display_name) {
    const truncated = item.display_name.split(',').slice(0, 2).join(',');
    return truncated;
  }

  return parts.join(', ') || item.display_name || 'Unknown location';
};

// ─── Hybrid Exports (Local First, API Fallback) ──────────────────

/**
 * Search for address suggestions as user types.
 * Uses local data for address queries (no API call). Only calls
 * LocationIQ for POI/business name queries that don't match any street.
 *
 * @param {string} query - The search text entered by user
 * @returns {Promise<Array>} Array of address suggestions
 */
export const autocompleteAddress = async (query) => {
  if (!query || query.trim().length < 3) {
    return [];
  }

  // Try local first
  if (isLocalDataReady()) {
    const localResults = localAutocomplete(query, MAX_RESULTS);

    // If query matches a known street/address pattern, use local only — no API call
    if (localResults.length > 0 && matchesLocalStreet(query)) {
      return localResults;
    }

    // Query doesn't match any street — likely a POI/business name, call API
    if (localResults.length === 0) {
      const cacheKey = query.trim().toLowerCase();
      const cached = getCached(autocompleteCache, cacheKey);
      if (cached) return cached;

      try {
        const apiResults = await _apiAutocomplete(query);
        setCache(autocompleteCache, cacheKey, apiResults);
        return apiResults;
      } catch {
        return [];
      }
    }

    // Some local results but query doesn't look like an address — supplement
    const cacheKey = query.trim().toLowerCase();
    const cached = getCached(autocompleteCache, cacheKey);
    if (cached) {
      return deduplicateResults([...localResults, ...cached]).slice(0, MAX_RESULTS);
    }

    try {
      const apiResults = await _apiAutocomplete(query);
      setCache(autocompleteCache, cacheKey, apiResults);
      return deduplicateResults([...localResults, ...apiResults]).slice(0, MAX_RESULTS);
    } catch {
      return localResults;
    }
  }

  // Local data not ready — use API with cache
  const cacheKey = query.trim().toLowerCase();
  const cached = getCached(autocompleteCache, cacheKey);
  if (cached) return cached;

  const results = await _apiAutocomplete(query);
  setCache(autocompleteCache, cacheKey, results);
  return results;
};

/**
 * Convert an address string to coordinates.
 * Tries local data for Barrie addresses, falls back to LocationIQ.
 *
 * @param {string} address - Full address text
 * @returns {Promise<Object|null>} Location object or null
 */
export const geocodeAddress = async (address) => {
  if (!address || address.trim().length < 3) {
    return null;
  }

  // Try local first — look for a confident match
  if (isLocalDataReady()) {
    const localResults = localAutocomplete(address, 1);
    if (localResults.length > 0) {
      return localResults[0];
    }
  }

  // Fall back to API
  return _apiGeocode(address);
};

/**
 * Convert coordinates to an address.
 * Uses local data for coordinates within Barrie, falls back to LocationIQ.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object|null>} Address object or null
 */
export const reverseGeocode = async (lat, lon) => {
  // Try local first if data is ready and coords are in Barrie
  if (isLocalDataReady()) {
    const localResult = localReverseGeocode(lat, lon);
    if (localResult) {
      return localResult;
    }
  }

  // Fall back to API with cache (round coords to ~50m grid for cache hits)
  const cacheKey = `${Math.round(lat * 2000) / 2000},${Math.round(lon * 2000) / 2000}`;
  const cached = getCached(reverseGeocodeCache, cacheKey);
  if (cached) return cached;

  const result = await _apiReverseGeocode(lat, lon);
  if (result) setCache(reverseGeocodeCache, cacheKey, result);
  return result;
};

/**
 * Remove duplicate results by proximity (within ~50m are considered same location)
 */
function deduplicateResults(results) {
  const seen = [];
  return results.filter((result) => {
    const isDupe = seen.some(
      (s) =>
        Math.abs(s.lat - result.lat) < 0.0005 && Math.abs(s.lon - result.lon) < 0.0005
    );
    if (!isDupe) {
      seen.push(result);
      return true;
    }
    return false;
  });
}

/**
 * Calculate distance between two points in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) =>
  haversineDistance(lat1, lon1, lat2, lon2) / 1000;

/**
 * Check if coordinates are within Barrie area
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if within Barrie bounds
 */
export const isInBarrieArea = (lat, lon) => {
  // Barrie approximate bounds
  const bounds = {
    minLat: 44.25,
    maxLat: 44.50,
    minLon: -79.85,
    maxLon: -79.55,
  };

  return lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon;
};

/**
 * Get distance from Barrie center
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {number} Distance in km from downtown Barrie
 */
export const getDistanceFromBarrie = (lat, lon) => {
  return calculateDistance(lat, lon, BARRIE_CENTER.lat, BARRIE_CENTER.lon);
};
