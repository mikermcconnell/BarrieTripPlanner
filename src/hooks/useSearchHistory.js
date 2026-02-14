/**
 * useSearchHistory — Persists recent searches to AsyncStorage
 *
 * Stores last 10 items per category (stops, routes, addresses, trips).
 * Both .js and .web.js screens import this same hook.
 */
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from '../utils/logger';

const STORAGE_KEY = '@barrie_transit_search_history';
const MAX_ITEMS_PER_TYPE = 10;

const EMPTY_HISTORY = { stops: [], routes: [], addresses: [], trips: [] };

/**
 * Deduplicate by comparing item IDs (stops/routes) or coordinates (addresses/trips).
 */
const deduplicateItem = (list, newItem, type) => {
  if (type === 'stops' || type === 'routes') {
    return list.filter((item) => item.id !== newItem.id);
  }
  if (type === 'addresses') {
    return list.filter(
      (item) => item.displayName !== newItem.displayName
    );
  }
  if (type === 'trips') {
    // Deduplicate by matching from+to text
    return list.filter(
      (item) => !(item.fromText === newItem.fromText && item.toText === newItem.toText)
    );
  }
  return list;
};

export const useSearchHistory = () => {
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setHistory({ ...EMPTY_HISTORY, ...parsed });
        }
      } catch (error) {
        logger.error('Failed to load search history:', error);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  // Persist helper
  const persist = useCallback(async (updated) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      logger.error('Failed to save search history:', error);
    }
  }, []);

  /**
   * Add an item to search history.
   * @param {'stops'|'routes'|'addresses'|'trips'} type
   * @param {object} item — the item data to store
   */
  const addToHistory = useCallback((type, item) => {
    if (!item || !EMPTY_HISTORY.hasOwnProperty(type)) return;

    setHistory((prev) => {
      const deduped = deduplicateItem(prev[type], item, type);
      const updated = {
        ...prev,
        [type]: [item, ...deduped].slice(0, MAX_ITEMS_PER_TYPE),
      };
      persist(updated);
      return updated;
    });
  }, [persist]);

  /**
   * Get history for a specific type.
   * @param {'stops'|'routes'|'addresses'|'trips'} type
   * @returns {Array}
   */
  const getHistory = useCallback((type) => {
    return history[type] || [];
  }, [history]);

  /**
   * Clear history for a specific type, or all if no type given.
   * @param {'stops'|'routes'|'addresses'|'trips'} [type]
   */
  const clearHistory = useCallback(async (type) => {
    if (type) {
      setHistory((prev) => {
        const updated = { ...prev, [type]: [] };
        persist(updated);
        return updated;
      });
    } else {
      setHistory(EMPTY_HISTORY);
      persist(EMPTY_HISTORY);
    }
  }, [persist]);

  return {
    history,
    isLoaded,
    addToHistory,
    getHistory,
    clearHistory,
  };
};
