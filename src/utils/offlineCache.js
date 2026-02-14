import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const CACHE_KEYS = {
  GTFS_DATA: '@barrie_transit_gtfs_cache',
  GTFS_TIMESTAMP: '@barrie_transit_gtfs_timestamp',
  ROUTES: '@barrie_transit_routes_cache',
  STOPS: '@barrie_transit_stops_cache',
  SHAPES: '@barrie_transit_shapes_cache',
  MAPPINGS: '@barrie_transit_mappings_cache',
};

// Cache expiry: 24 hours for GTFS static data
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Max size per cache key (2 MB) — AsyncStorage/SQLite has a ~6 MB total DB limit
const MAX_ITEM_BYTES = 2 * 1024 * 1024;

/**
 * Check if device is online
 */
export const isOnline = async () => {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable;
  } catch (error) {
    console.error('Error checking network status:', error);
    return true; // Assume online if check fails
  }
};

/**
 * Save data to cache.
 * Skips if serialized data exceeds MAX_ITEM_BYTES to avoid SQLITE_FULL.
 * If storage is still full, clears old cache and retries once.
 */
export const cacheData = async (key, data) => {
  const json = JSON.stringify({ data, timestamp: Date.now() });

  // Guard: skip items that are too large for AsyncStorage
  if (json.length > MAX_ITEM_BYTES) {
    console.warn(
      `Cache skip: ${key} is ${formatBytes(json.length)} (limit ${formatBytes(MAX_ITEM_BYTES)})`
    );
    return { success: false, error: 'Item too large for cache' };
  }

  try {
    await AsyncStorage.setItem(key, json);
    return { success: true };
  } catch (error) {
    // On SQLITE_FULL, clear old transit cache and retry once
    if (error?.message?.includes('SQLITE_FULL') || error?.code === 13) {
      console.warn(`Cache full, clearing old data and retrying (${key})`);
      try {
        const keys = await AsyncStorage.getAllKeys();
        const transitKeys = keys.filter((k) => k.startsWith('@barrie_transit'));
        if (transitKeys.length > 0) {
          await AsyncStorage.multiRemove(transitKeys);
        }
        await AsyncStorage.setItem(key, json);
        return { success: true };
      } catch (retryError) {
        console.warn(`Cache retry failed for ${key}, skipping:`, retryError.message);
        return { success: false, error: retryError.message };
      }
    }
    console.warn('Error caching data:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get data from cache
 */
export const getCachedData = async (key, maxAge = CACHE_EXPIRY_MS) => {
  try {
    const cachedJson = await AsyncStorage.getItem(key);
    if (!cachedJson) return null;

    const cacheItem = JSON.parse(cachedJson);
    const age = Date.now() - cacheItem.timestamp;

    if (age > maxAge) {
      // Cache expired
      await AsyncStorage.removeItem(key);
      return null;
    }

    return cacheItem.data;
  } catch (error) {
    console.error('Error getting cached data:', error);
    return null;
  }
};

/**
 * Cache GTFS static data.
 *
 * Strategy: split into small, independent keys so no single write
 * exceeds the SQLite row limit.  stopTimes (66k+ rows) is intentionally
 * excluded — it's too large for AsyncStorage and re-downloads in seconds.
 */
export const cacheGTFSData = async (data) => {
  try {
    // 1. Small essentials — routes, stops (~50 KB each)
    await Promise.all([
      cacheData(CACHE_KEYS.ROUTES, data.routes),
      cacheData(CACHE_KEYS.STOPS, data.stops),
    ]);

    // 2. Mappings — routeShapeMapping, routeStopsMapping, trips, tripMapping, calendar
    //    These are moderate-size lookup tables (~100-300 KB total)
    await cacheData(CACHE_KEYS.MAPPINGS, {
      trips: data.trips,
      tripMapping: data.tripMapping,
      routeShapeMapping: data.routeShapeMapping,
      routeStopsMapping: data.routeStopsMapping,
      calendar: data.calendar,
    });

    // 3. Shapes — 38 polylines, moderate (~1-2 MB).
    //    Cached separately so the size guard can skip it independently.
    await cacheData(CACHE_KEYS.SHAPES, data.shapes);

    // stopTimes intentionally NOT cached — 66k+ entries would exceed
    // AsyncStorage limits.  Offline mode will still show routes/stops
    // on the map; local trip routing requires a fresh GTFS download.

    return { success: true };
  } catch (error) {
    console.error('Error caching GTFS data:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get cached GTFS data
 */
export const getCachedGTFSData = async () => {
  try {
    const [routes, stops, mappings, shapes] = await Promise.all([
      getCachedData(CACHE_KEYS.ROUTES),
      getCachedData(CACHE_KEYS.STOPS),
      getCachedData(CACHE_KEYS.MAPPINGS),
      getCachedData(CACHE_KEYS.SHAPES),
    ]);

    // Also try the legacy GTFS_DATA key for backwards compatibility
    if (!routes || !stops) return null;

    if (mappings) {
      return {
        routes,
        stops,
        shapes: shapes || {},
        ...mappings,
        // stopTimes not cached — offline routing unavailable
      };
    }

    // Fallback: try reading old single-blob key from before the split
    const legacyData = await getCachedData(CACHE_KEYS.GTFS_DATA);
    if (legacyData) {
      return { routes, stops, ...legacyData };
    }

    return null;
  } catch (error) {
    console.error('Error getting cached GTFS data:', error);
    return null;
  }
};

/**
 * Clear all cached data
 */
export const clearCache = async () => {
  try {
    await AsyncStorage.multiRemove([
      CACHE_KEYS.GTFS_DATA,
      CACHE_KEYS.GTFS_TIMESTAMP,
      CACHE_KEYS.ROUTES,
      CACHE_KEYS.STOPS,
      CACHE_KEYS.SHAPES,
      CACHE_KEYS.MAPPINGS,
    ]);
    return { success: true };
  } catch (error) {
    console.error('Error clearing cache:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get cache size (approximate)
 */
export const getCacheSize = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const transitKeys = keys.filter((k) => k.startsWith('@barrie_transit'));
    let totalSize = 0;

    for (const key of transitKeys) {
      const value = await AsyncStorage.getItem(key);
      if (value) {
        totalSize += value.length;
      }
    }

    return {
      keys: transitKeys.length,
      sizeBytes: totalSize,
      sizeFormatted: formatBytes(totalSize),
    };
  } catch (error) {
    console.error('Error getting cache size:', error);
    return { keys: 0, sizeBytes: 0, sizeFormatted: '0 B' };
  }
};

/**
 * Format bytes to human readable string
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Network change listener
 */
export const addNetworkListener = (callback) => {
  return NetInfo.addEventListener((state) => {
    callback({
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    });
  });
};
