/**
 * analyticsService — Thin wrapper around Firebase Analytics (web-only).
 *
 * firebase/analytics is web-only. On native, all exports are no-ops.
 * Uses dynamic import() to avoid crashing native bundles.
 *
 * IMPORTANT: This file must NOT import from contexts (AuthContext, TransitContext)
 * to avoid circular dependencies. Contexts call trackEvent() — not the other way around.
 */
import { Platform } from 'react-native';
import logger from '../utils/logger';

let analyticsInstance = null;
let logEventFn = null;
let setUserPropertiesFn = null;
let initPromise = null;

/**
 * Lazily initialize analytics (web only, one-time).
 */
const ensureInitialized = () => {
  if (Platform.OS !== 'web') return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { getAnalytics, logEvent, setUserProperties } = await import('firebase/analytics');
      const { app } = await import('../config/firebase');
      analyticsInstance = getAnalytics(app);
      logEventFn = logEvent;
      setUserPropertiesFn = setUserProperties;
    } catch (error) {
      logger.warn('Analytics initialization failed:', error.message);
    }
  })();

  return initPromise;
};

/**
 * Track an event. Fire-and-forget — never blocks UI.
 * @param {string} eventName — e.g. 'trip_planned', 'navigation_started'
 * @param {object} [params] — optional event parameters
 */
export const trackEvent = (eventName, params) => {
  if (Platform.OS !== 'web') return;

  ensureInitialized().then(() => {
    if (analyticsInstance && logEventFn) {
      try {
        logEventFn(analyticsInstance, eventName, params);
      } catch {
        // Silent — never block UI
      }
    }
  });
};

/**
 * Set user properties for segmentation.
 * @param {object} properties — e.g. { has_account: 'true', favorite_count: '5' }
 */
export const setAnalyticsUserProperties = (properties) => {
  if (Platform.OS !== 'web') return;

  ensureInitialized().then(() => {
    if (analyticsInstance && setUserPropertiesFn) {
      try {
        setUserPropertiesFn(analyticsInstance, properties);
      } catch {
        // Silent
      }
    }
  });
};
