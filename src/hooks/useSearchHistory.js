/**
 * useSearchHistory — Persists recent searches to AsyncStorage
 *
 * Stores last 10 items per category (stops, routes, addresses, trips).
 * Both .js and .web.js screens import this same hook.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Persist on history changes (skip initial load)
  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history)).catch((error) => {
      logger.error('Failed to save search history:', error);
    });
  }, [history]);

  const addToHistory = useCallback((type, item) => {
    if (!item || !EMPTY_HISTORY.hasOwnProperty(type)) return;
    setHistory((prev) => {
      const deduped = deduplicateItem(prev[type], item, type);
      return {
        ...prev,
        [type]: [item, ...deduped].slice(0, MAX_ITEMS_PER_TYPE),
      };
    });
  }, []);

  const getHistory = useCallback((type) => {
    return history[type] || [];
  }, [history]);

  const clearHistory = useCallback((type) => {
    if (type) {
      setHistory((prev) => ({ ...prev, [type]: [] }));
    } else {
      setHistory(EMPTY_HISTORY);
    }
  }, []);

  return {
    history,
    isLoaded,
    addToHistory,
    getHistory,
    clearHistory,
  };
};
