/**
 * Mock constants for Jest tests
 * Only includes the constants needed for detour detection tests
 */

export const DETOUR_CONFIG = {
  OFF_ROUTE_THRESHOLD_METERS: 50,
  CORRIDOR_WIDTH_METERS: 50,
  PATH_OVERLAP_PERCENTAGE: 0.70,
  MIN_OFF_ROUTE_POINTS: 3,
  SUSPECTED_DETOUR_EXPIRY_MS: 10800000, // 3 hours
  MAX_DETOUR_RETENTION_MS: 86400000, // 24 hours
  CLEARING_EVIDENCE_WINDOW_MS: 1800000, // 30 minutes
  CLEARING_THRESHOLDS: {
    suspected: 2,
    likely: 3,
    highConfidence: 4,
  },
  DETOUR_EXPIRY_MS: 3600000, // 1 hour (legacy alias)
  MIN_OFF_ROUTE_DURATION_MS: 30000, // 30 seconds
  PENDING_PATH_EXPIRY_MS: 1800000, // 30 minutes
  CLEARED_DETOUR_RETENTION_MS: 300000, // 5 minutes
  CONFIDENCE_THRESHOLDS: {
    likely: 70,
    high: 85,
  },
  STOP_MATCH_RADIUS_METERS: 120,
  MAX_AFFECTED_STOPS: 6,
  DETOUR_HISTORY_LIMIT: 100,
  ROUTE_OVERRIDES: {},
};

// Other constants can be added as needed for testing
export const GTFS_URLS = {};
export const MAP_CONFIG = {};
export const REFRESH_INTERVALS = {};
export const ROUTE_COLORS = {};
export const APP_CONFIG = {};
export const OTP_CONFIG = {
  BASE_URL: 'http://localhost:8080/otp/routers/default',
  TIMEOUT_MS: 15000,
  USE_MOCK_IN_DEV: false,
};
export const LOCATIONIQ_CONFIG = {
  API_KEY: 'test-key',
  BASE_URL: 'https://us1.locationiq.com/v1',
  BARRIE_BOUNDS: '-79.85,44.25,-79.55,44.50',
  BARRIE_CENTER: { lat: 44.3894, lon: -79.6903 },
  DEBOUNCE_MS: 300,
  MAX_RESULTS: 5,
};
export const ROUTING_CONFIG = {
  MAX_TRANSFERS: 2,
  MAX_WALK_TO_TRANSIT: 800,
  MAX_WALK_FOR_TRANSFER: 400,
  WALK_SPEED: 1.2,
  TRANSFER_PENALTY: 180,
  MIN_TRANSFER_TIME: 60,
  WALK_DISTANCE_BUFFER: 1.3,
  MAX_ACTUAL_WALK_DISTANCE: 1200,
  MAX_ITINERARIES: 3,
  TIME_WINDOW: 7200,
  MAX_TRIP_DURATION: 7200,
  MAX_WAIT_TIME: 3600,
};
export const TRIP_UI_CONFIG = {
  HIGH_WALK_THRESHOLD: 800,
  LEAVING_SOON_MINUTES: 5,
  DEBOUNCE_DELAY_MS: 300,
  TRIP_CACHE_TTL_MS: 300000,
  MAX_STOPS_DISPLAY: 150,
};
