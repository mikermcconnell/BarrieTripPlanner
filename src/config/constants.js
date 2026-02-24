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

// MapLibre style — muted light basemap (CartoDB Positron)
// Free, no API key required, clean desaturated look
export const OSM_MAP_STYLE = {
  version: 8,
  sources: {
    'carto-light': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#f2f0eb',
      },
    },
    {
      id: 'carto-light-layer',
      type: 'raster',
      source: 'carto-light',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
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

export const ONBOARDING_KEY = '@barrie_transit_onboarding_seen';
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

// LocationIQ Configuration (Free tier: 5,000 requests/day)
// Get your API key at: https://locationiq.com/
// OpenTripPlanner Configuration
export const OTP_CONFIG = {
  BASE_URL: process.env.EXPO_PUBLIC_OTP_URL || '',
  TIMEOUT_MS: 15000,
  USE_MOCK_IN_DEV: IS_DEV, // Only use mock data in development
};

export const LOCATIONIQ_CONFIG = {
  // Optional direct key (development fallback only; avoid in public client builds)
  API_KEY: process.env.EXPO_PUBLIC_LOCATIONIQ_API_KEY || '',
  BASE_URL: 'https://us1.locationiq.com/v1',
  // Shared API proxy URL for all platforms (web + native)
  PROXY_URL: process.env.EXPO_PUBLIC_API_PROXY_URL || '',
  // Allow direct client->LocationIQ calls (development fallback only)
  ALLOW_DIRECT: process.env.EXPO_PUBLIC_ALLOW_DIRECT_LOCATIONIQ === 'true',
  // Optional auth token for hardened API proxy deployments
  PROXY_TOKEN: process.env.EXPO_PUBLIC_API_PROXY_TOKEN || '',

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
// Bus marker animation configuration
export const ANIMATION = {
  BUS_POSITION_DURATION_MS: 2000,   // interpolation duration
  BUS_BEARING_THRESHOLD_DEG: 2,     // min bearing change to re-render icon (web)
  BUS_PULSE_DURATION_MS: 400,       // scale pulse duration on new position
};

// UI performance budgets for interaction-heavy screens.
export const PERFORMANCE_BUDGETS = {
  MAP_REGION_HANDLER_MS: 12,
  MAP_MAX_VISIBLE_VEHICLES: 110,
  MAP_MAX_VISIBLE_STOPS: 150,
  MAP_MAX_VISIBLE_SHAPES: 120,
};

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
