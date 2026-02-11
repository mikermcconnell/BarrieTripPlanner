import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const CACHE_KEYS = {
  GTFS_DATA: '@barrie_transit_gtfs_cache',
  GTFS_TIMESTAMP: '@barrie_transit_gtfs_timestamp',
  ROUTES: '@barrie_transit_routes_cache',
  STOPS: '@barrie_transit_stops_cache',
};

// Cache expiry: 24 hours for GTFS static data
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

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
 * If storage is full (SQLITE_FULL), clears old cache and retries once.
 */
export const cacheData = async (key, data) => {
  const json = JSON.stringify({ data, timestamp: Date.now() });

  try {
    await AsyncStorage.setItem(key, json);
    return { success: true };
  } catch (error) {
    // On SQLITE_FULL, clear all transit cache and retry once
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
        // Data too large for AsyncStorage — skip caching silently
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
 * Cache GTFS static data
 */
export const cacheGTFSData = async (data) => {
  try {
    // Cache individual components for more granular access
    await Promise.all([
      cacheData(CACHE_KEYS.ROUTES, data.routes),
      cacheData(CACHE_KEYS.STOPS, data.stops),
      cacheData(CACHE_KEYS.GTFS_DATA, {
        shapes: data.shapes,
        trips: data.trips,
        tripMapping: data.tripMapping,
        routeShapeMapping: data.routeShapeMapping,
        routeStopsMapping: data.routeStopsMapping,
        stopTimes: data.stopTimes,
        calendar: data.calendar,
      }),
    ]);
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
    const [routes, stops, gtfsData] = await Promise.all([
      getCachedData(CACHE_KEYS.ROUTES),
      getCachedData(CACHE_KEYS.STOPS),
      getCachedData(CACHE_KEYS.GTFS_DATA),
    ]);

    if (!routes || !stops || !gtfsData) return null;

    return {
      routes,
      stops,
      ...gtfsData,
    };
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
