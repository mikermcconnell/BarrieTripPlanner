/**
 * Local Geocoding Service
 *
 * Provides reverse geocoding and address autocomplete using a bundled
 * dataset of ~57k Barrie address points from City of Barrie Open Data.
 *
 * HOW IT WORKS:
 * - Spatial grid index for O(1) reverse geocode lookups
 * - Prefix-based street search for instant autocomplete
 * - Falls back gracefully if data hasn't loaded yet
 *
 * Data format: Array of [lat, lon, houseNumber, street, fullAddress]
 */

import { LOCATIONIQ_CONFIG } from '../config/constants';
import { haversineDistance as haversineMeters } from '../utils/geometryUtils';

const { BARRIE_CENTER } = LOCATIONIQ_CONFIG;

// Grid cell size in degrees (~220m at Barrie's latitude)
const GRID_CELL_SIZE = 0.002;

// Barrie bounding box (generous)
const BOUNDS = {
  minLat: 44.25,
  maxLat: 44.50,
  minLon: -79.85,
  maxLon: -79.55,
};

// Internal state
let addresses = null; // Raw address array
let spatialGrid = null; // Map<cellKey, addressIndex[]>
let streetIndex = null; // Map<streetName, addressIndex[]>
let dataReadyResolve = null;
const dataReadyPromise = new Promise((resolve) => {
  dataReadyResolve = resolve;
});

/**
 * Load and index the address dataset.
 * Called once on app startup or lazily on first geocoding call.
 */
export async function initLocalGeocoding() {
  if (addresses) return; // Already loaded

  try {
    // Dynamic import of the bundled JSON
    const data = require('../data/barrie-addresses.json');
    addresses = data;

    buildSpatialGrid();
    buildStreetIndex();

    if (__DEV__) console.log(`[LocalGeocoding] Loaded ${addresses.length} addresses`);
    dataReadyResolve(true);
  } catch (err) {
    if (__DEV__) console.warn('[LocalGeocoding] Failed to load address data:', err.message);
    dataReadyResolve(false);
  }
}

/**
 * Check if local geocoding data is available
 */
export function isLocalDataReady() {
  return addresses !== null && addresses.length > 0;
}

/**
 * Wait for data to be ready (for callers that need to await)
 */
export async function waitForData() {
  return dataReadyPromise;
}

// ─── Spatial Grid (Reverse Geocoding) ────────────────────────────

function cellKey(lat, lon) {
  const row = Math.floor((lat - BOUNDS.minLat) / GRID_CELL_SIZE);
  const col = Math.floor((lon - BOUNDS.minLon) / GRID_CELL_SIZE);
  return `${row},${col}`;
}

function buildSpatialGrid() {
  spatialGrid = new Map();

  for (let i = 0; i < addresses.length; i++) {
    const [lat, lon] = addresses[i];
    const key = cellKey(lat, lon);

    if (!spatialGrid.has(key)) {
      spatialGrid.set(key, []);
    }
    spatialGrid.get(key).push(i);
  }
}

/**
 * Reverse geocode: find nearest address to given coordinates
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Object|null} Address result in LocationIQ-compatible format
 */
export function localReverseGeocode(lat, lon) {
  if (!addresses || !spatialGrid) return null;

  // Check if within Barrie bounds
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLon || lon > BOUNDS.maxLon) {
    return null;
  }

  // Search 3x3 neighborhood of grid cells
  const centerRow = Math.floor((lat - BOUNDS.minLat) / GRID_CELL_SIZE);
  const centerCol = Math.floor((lon - BOUNDS.minLon) / GRID_CELL_SIZE);

  let bestIndex = -1;
  let bestDist = Infinity;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const key = `${centerRow + dr},${centerCol + dc}`;
      const indices = spatialGrid.get(key);
      if (!indices) continue;

      for (const idx of indices) {
        const [aLat, aLon] = addresses[idx];
        const dist = haversineDistance(lat, lon, aLat, aLon);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = idx;
        }
      }
    }
  }

  if (bestIndex === -1 || bestDist > 1.5) {
    // No address within 1.5km
    return null;
  }

  return formatResult(addresses[bestIndex], 'local');
}

// ─── Street Index (Autocomplete) ─────────────────────────────────

function buildStreetIndex() {
  streetIndex = new Map();

  for (let i = 0; i < addresses.length; i++) {
    const street = addresses[i][3]; // street name
    if (!streetIndex.has(street)) {
      streetIndex.set(street, []);
    }
    streetIndex.get(street).push(i);
  }
}

/**
 * Check if a query matches a local street name or address pattern.
 * Used to decide whether to skip the API call entirely.
 *
 * @param {string} query - User's search text
 * @returns {boolean} True if the query looks like a Barrie address
 */
export function matchesLocalStreet(query) {
  if (!streetIndex || !query) return false;
  const normalized = query.trim().toUpperCase();

  // "123 BAY..." — starts with digits + street prefix
  const numMatch = normalized.match(/^(\d+)\s+(.+)/);
  if (numMatch) {
    const streetQuery = numMatch[2];
    for (const street of streetIndex.keys()) {
      if (street.startsWith(streetQuery)) return true;
    }
    return false;
  }

  // Text only — check if it matches a street name prefix
  for (const street of streetIndex.keys()) {
    if (street.startsWith(normalized)) return true;
  }
  return false;
}

/**
 * Autocomplete: search for addresses matching a query string
 *
 * @param {string} query - User's search text
 * @param {number} [limit=5] - Maximum results to return
 * @returns {Array} Address results in LocationIQ-compatible format
 */
export function localAutocomplete(query, limit = 5) {
  if (!addresses || !streetIndex) return [];
  if (!query || query.trim().length < 2) return [];

  const normalized = query.trim().toUpperCase();
  const results = [];

  // Try to parse: "123 BAY..." → houseNumber=123, streetQuery="BAY..."
  const numMatch = normalized.match(/^(\d+)\s+(.+)/);

  if (numMatch) {
    // User typed a house number + street prefix
    const houseNum = parseInt(numMatch[1], 10);
    const streetQuery = numMatch[2];

    for (const [street, indices] of streetIndex) {
      if (!street.startsWith(streetQuery)) continue;

      for (const idx of indices) {
        const addr = addresses[idx];
        if (addr[2] === houseNum) {
          // Exact house number match
          results.push({ addr, dist: distFromCenter(addr[0], addr[1]), exact: true });
        }
      }
    }

    // If no exact match, show addresses on matching streets with closest house numbers
    if (results.length === 0) {
      for (const [street, indices] of streetIndex) {
        if (!street.startsWith(streetQuery)) continue;

        for (const idx of indices) {
          const addr = addresses[idx];
          const numDiff = Math.abs(addr[2] - houseNum);
          results.push({ addr, dist: numDiff, exact: false });
        }
      }
      // Sort by house number proximity
      results.sort((a, b) => a.dist - b.dist);
    }
  } else {
    // Text only — match street name prefix or full address
    for (const [street, indices] of streetIndex) {
      if (!street.startsWith(normalized)) continue;

      // Add a representative address from each matching street
      // Pick the one closest to center
      let bestIdx = indices[0];
      let bestDist = distFromCenter(addresses[bestIdx][0], addresses[bestIdx][1]);

      for (let i = 1; i < Math.min(indices.length, 20); i++) {
        const d = distFromCenter(addresses[indices[i]][0], addresses[indices[i]][1]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = indices[i];
        }
      }

      results.push({ addr: addresses[bestIdx], dist: bestDist, exact: false });
    }

    // Also check if normalized matches fullAddress prefix
    if (results.length < limit) {
      for (let i = 0; i < addresses.length && results.length < limit * 3; i++) {
        const fullAddr = addresses[i][4];
        if (fullAddr && fullAddr.startsWith(normalized)) {
          const dist = distFromCenter(addresses[i][0], addresses[i][1]);
          // Avoid duplicates
          if (!results.some((r) => r.addr === addresses[i])) {
            results.push({ addr: addresses[i], dist, exact: false });
          }
        }
      }
    }

    results.sort((a, b) => a.dist - b.dist);
  }

  return results.slice(0, limit).map((r) => formatResult(r.addr, 'local'));
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatResult(addr, source) {
  const [lat, lon, houseNum, street, fullAddress] = addr;
  const streetAddr = houseNum ? `${houseNum} ${street}` : street;
  const shortName = `${streetAddr}, Barrie`;
  const displayName = fullAddress
    ? `${fullAddress}, Barrie, ON`
    : `${streetAddr}, Barrie, ON`;

  return {
    id: `local-${lat}-${lon}`,
    lat,
    lon,
    displayName,
    shortName,
    address: {
      house_number: houseNum ? String(houseNum) : '',
      road: street,
      city: 'Barrie',
      state: 'Ontario',
      country: 'Canada',
    },
    source,
  };
}

function distFromCenter(lat, lon) {
  return haversineDistance(lat, lon, BARRIE_CENTER.lat, BARRIE_CENTER.lon);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  return haversineMeters(lat1, lon1, lat2, lon2) / 1000;
}
