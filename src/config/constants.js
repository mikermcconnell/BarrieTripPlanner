// Barrie Transit GTFS Data URLs
// Source: https://www.transit.land/feeds/f-dpzk-barrietransit
export const GTFS_URLS = {
  // Static GTFS data (ZIP file containing all .txt files)
  STATIC_ZIP: 'https://www.myridebarrie.ca/gtfs/Google_transit.zip',

  // Real-time GTFS-RT feeds (Protocol Buffer format)
  VEHICLE_POSITIONS: 'https://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb',
  TRIP_UPDATES: 'https://www.myridebarrie.ca/gtfs/GTFS_TripUpdates.pb',
  SERVICE_ALERTS: 'https://www.myridebarrie.ca/gtfs/GTFS_ServiceAlerts.pb',
};

// Map configuration
export const MAP_CONFIG = {
  // Barrie, Ontario coordinates
  INITIAL_REGION: {
    latitude: 44.3894,
    longitude: -79.6903,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  },
  // Downtown Barrie Terminal
  DOWNTOWN_TERMINAL: {
    latitude: 44.3891,
    longitude: -79.6903,
  },
};

// Refresh intervals (in milliseconds)
export const REFRESH_INTERVALS = {
  VEHICLE_POSITIONS: 15000, // 15 seconds
  TRIP_UPDATES: 30000, // 30 seconds
  SERVICE_ALERTS: 60000, // 1 minute
  STATIC_DATA: 86400000, // 24 hours
};

// Route colors (Barrie Transit official colors when available)
export const ROUTE_COLORS = {
  '1': '#E31837', // Red
  '2': '#00A651', // Green
  '3': '#0072BC', // Blue
  '4': '#F7941D', // Orange
  '5': '#8B4513', // Brown
  '6': '#9B59B6', // Purple
  '7': '#F1C40F', // Yellow
  '8': '#E91E63', // Pink
  '90': '#607D8B', // Grey (Express)
  '100': '#795548', // Brown (GO Connect)
  DEFAULT: '#1a73e8',
};

// App-wide constants
export const APP_CONFIG = {
  APP_NAME: 'Barrie Transit',
  VERSION: '1.0.0',
  SUPPORT_EMAIL: 'support@barrietransit.app',
};

// LocationIQ Configuration (Free tier: 5,000 requests/day)
// Get your API key at: https://locationiq.com/
// OpenTripPlanner Configuration
export const OTP_CONFIG = {
  BASE_URL: process.env.EXPO_PUBLIC_OTP_URL || 'http://localhost:8080/otp/routers/default',
  TIMEOUT_MS: 15000,
  USE_MOCK_IN_DEV: __DEV__, // Only use mock data in development
};

export const LOCATIONIQ_CONFIG = {
  API_KEY: process.env.EXPO_PUBLIC_LOCATIONIQ_API_KEY || '',
  BASE_URL: 'https://us1.locationiq.com/v1',
  // When set, API calls route through this proxy (hides API key server-side)
  PROXY_URL: process.env.EXPO_PUBLIC_API_PROXY_URL || '',

  // Barrie bounding box to prioritize local results
  // Format: minLon, minLat, maxLon, maxLat
  BARRIE_BOUNDS: '-79.85,44.25,-79.55,44.50',

  // Center point for biasing results toward Barrie
  BARRIE_CENTER: {
    lat: 44.3894,
    lon: -79.6903,
  },

  // Debounce delay in milliseconds (reduces API calls)
  DEBOUNCE_MS: 300,

  // Maximum number of autocomplete results to show
  MAX_RESULTS: 5,
};

// Detour Detection Configuration
export const DETOUR_CONFIG = {
  // Distance threshold for considering a vehicle "off-route" (meters)
  OFF_ROUTE_THRESHOLD_METERS: 50,

  // Width of corridor for comparing detour paths (meters)
  CORRIDOR_WIDTH_METERS: 50,

  // Minimum percentage of path points that must overlap to confirm a detour pattern
  PATH_OVERLAP_PERCENTAGE: 0.70,

  // Minimum number of GPS breadcrumbs before considering it a valid off-route path
  MIN_OFF_ROUTE_POINTS: 5,

  // How long to keep suspected detours active without confirmation (milliseconds)
  DETOUR_EXPIRY_MS: 3600000, // 1 hour

  // Minimum time a vehicle must be off-route to start tracking (milliseconds)
  MIN_OFF_ROUTE_DURATION_MS: 30000, // 30 seconds

  // Maximum age of a pending detour path before it's discarded (milliseconds)
  PENDING_PATH_EXPIRY_MS: 1800000, // 30 minutes

  // How long to keep a cleared detour before archiving (milliseconds)
  CLEARED_DETOUR_RETENTION_MS: 300000, // 5 minutes

  // Confidence scoring thresholds for rider-facing labels
  // score < likely => "suspected", likely..high => "likely", >= high => "high-confidence"
  CONFIDENCE_THRESHOLDS: {
    likely: 70,
    high: 85,
  },

  // Radius for matching route stops to a detour path (meters)
  STOP_MATCH_RADIUS_METERS: 120,

  // Maximum number of nearby stops to attach to each detour summary
  MAX_AFFECTED_STOPS: 6,

  // Number of archived detours to keep in memory/persistence
  DETOUR_HISTORY_LIMIT: 100,

  // Optional per-route override map.
  // First-pass tuning presets (can be adjusted with real-world telemetry):
  // - Local routes: moderate sensitivity, balanced noise tolerance
  // - Express/GO routes: higher tolerance and stronger confirmation requirements
  ROUTE_OVERRIDES: {
    // Local routes (core city service)
    '1': {
      OFF_ROUTE_THRESHOLD_METERS: 50,
      CORRIDOR_WIDTH_METERS: 50,
      PATH_OVERLAP_PERCENTAGE: 0.70,
      MIN_OFF_ROUTE_DURATION_MS: 30000,
    },
    '2': {
      OFF_ROUTE_THRESHOLD_METERS: 52,
      CORRIDOR_WIDTH_METERS: 52,
      PATH_OVERLAP_PERCENTAGE: 0.69,
      MIN_OFF_ROUTE_DURATION_MS: 35000,
    },
    '3': {
      OFF_ROUTE_THRESHOLD_METERS: 50,
      CORRIDOR_WIDTH_METERS: 50,
      PATH_OVERLAP_PERCENTAGE: 0.70,
      MIN_OFF_ROUTE_DURATION_MS: 30000,
    },
    '4': {
      OFF_ROUTE_THRESHOLD_METERS: 55,
      CORRIDOR_WIDTH_METERS: 55,
      PATH_OVERLAP_PERCENTAGE: 0.68,
      MIN_OFF_ROUTE_DURATION_MS: 35000,
    },
    '5': {
      OFF_ROUTE_THRESHOLD_METERS: 55,
      CORRIDOR_WIDTH_METERS: 55,
      PATH_OVERLAP_PERCENTAGE: 0.68,
      MIN_OFF_ROUTE_DURATION_MS: 35000,
    },
    '6': {
      OFF_ROUTE_THRESHOLD_METERS: 52,
      CORRIDOR_WIDTH_METERS: 52,
      PATH_OVERLAP_PERCENTAGE: 0.69,
      MIN_OFF_ROUTE_DURATION_MS: 35000,
    },
    '7': {
      OFF_ROUTE_THRESHOLD_METERS: 55,
      CORRIDOR_WIDTH_METERS: 55,
      PATH_OVERLAP_PERCENTAGE: 0.68,
      MIN_OFF_ROUTE_DURATION_MS: 40000,
    },
    '8': {
      OFF_ROUTE_THRESHOLD_METERS: 58,
      CORRIDOR_WIDTH_METERS: 58,
      PATH_OVERLAP_PERCENTAGE: 0.67,
      MIN_OFF_ROUTE_DURATION_MS: 40000,
    },

    // Express service (longer stretches / faster movement)
    '90': {
      OFF_ROUTE_THRESHOLD_METERS: 70,
      CORRIDOR_WIDTH_METERS: 70,
      PATH_OVERLAP_PERCENTAGE: 0.62,
      MIN_OFF_ROUTE_DURATION_MS: 60000,
      STOP_MATCH_RADIUS_METERS: 160,
      MAX_AFFECTED_STOPS: 4,
    },

    // GO Connect (regional-style alignment, prioritize lower false positives)
    '100': {
      OFF_ROUTE_THRESHOLD_METERS: 75,
      CORRIDOR_WIDTH_METERS: 75,
      PATH_OVERLAP_PERCENTAGE: 0.60,
      MIN_OFF_ROUTE_DURATION_MS: 75000,
      STOP_MATCH_RADIUS_METERS: 180,
      MAX_AFFECTED_STOPS: 4,
    },
  },
};

// RAPTOR Router Configuration
export const ROUTING_CONFIG = {
  // Maximum number of transfers allowed in a trip
  MAX_TRANSFERS: 2,

  // Maximum walking distance to reach a transit stop from origin (meters)
  MAX_WALK_TO_TRANSIT: 800,

  // Maximum walking distance for transfers between stops (meters)
  MAX_WALK_FOR_TRANSFER: 400,

  // Walking speed in meters per second (~4.3 km/h, typical walking speed)
  WALK_SPEED: 1.2,

  // Penalty added to transfer time to prefer fewer transfers (seconds)
  TRANSFER_PENALTY: 180,

  // Minimum time needed to make a transfer (seconds)
  MIN_TRANSFER_TIME: 60,

  // Buffer factor for straight-line walking estimates (actual paths are longer)
  WALK_DISTANCE_BUFFER: 1.3,

  // Maximum actual walking distance after route enrichment (meters)
  // This is checked after getting real walking directions from the API
  // Prevents itineraries where the actual walk is much longer than straight-line estimate
  MAX_ACTUAL_WALK_DISTANCE: 1200,

  // Maximum number of itineraries to return
  MAX_ITINERARIES: 3,

  // Time window to search for trips after departure time (seconds)
  TIME_WINDOW: 7200, // 2 hours

  // Maximum trip duration to display (seconds)
  // Trips longer than this are filtered out as unreasonable
  MAX_TRIP_DURATION: 7200, // 2 hours

  // Maximum time until departure to show (seconds)
  // Trips that start more than this far in the future are deprioritized
  MAX_WAIT_TIME: 3600, // 1 hour

  // Walk time multiplier for boarding stop selection.
  // Walking is valued as this multiple of wait/ride time.
  // 2.0 means a farther stop must save more bus-time than the extra walk costs.
  WALK_TIME_MULTIPLIER: 2.0,
};

// Shape Processing Configuration
export const SHAPE_PROCESSING = {
  DP_TOLERANCE_METERS: 8,
  SPLINE_TENSION: 0.4,
  SPLINE_SEGMENTS_PER_PAIR: 4,
  OVERLAP_CORRIDOR_METERS: 30,
  OVERLAP_OFFSET_PIXELS: 3,
};

// Trip UI Configuration
export const TRIP_UI_CONFIG = {
  // Walk distance considered "high" — triggers warning label (meters)
  HIGH_WALK_THRESHOLD: 800,
  // Minutes before departure to show "Leaving soon" badge
  LEAVING_SOON_MINUTES: 5,
  // Debounce delay for address autocomplete (ms)
  DEBOUNCE_DELAY_MS: 300,
  // Trip plan cache TTL (ms)
  TRIP_CACHE_TTL_MS: 5 * 60 * 1000,
  // Maximum stops to display on map for performance
  MAX_STOPS_DISPLAY: 150,
};
