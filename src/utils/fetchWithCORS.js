/**
 * Fetch Utility with CORS Proxy Support
 *
 * This utility handles the CORS (Cross-Origin Resource Sharing) issue
 * that occurs when running the app in web/browser mode.
 *
 * HOW IT WORKS:
 * - On mobile (iOS/Android): Fetches directly (no CORS restrictions)
 * - On web: Routes through a public CORS proxy for development
 *
 * WHY THIS IS NEEDED:
 * Browsers block requests to external APIs that don't include CORS headers.
 * The Barrie Transit GTFS feeds don't have CORS headers, so web browsers
 * will block the requests. Mobile apps don't have this restriction.
 *
 * CORS PROXY OPTIONS (for web development):
 * - corsproxy.io (used here) - Free, no rate limits mentioned
 * - allorigins.win - Alternative free proxy
 * - Your own backend server (recommended for production)
 *
 * IMPORTANT:
 * For production, you should either:
 * 1. Only support mobile (no web version)
 * 2. Set up your own backend to proxy GTFS requests
 * 3. Use a paid CORS proxy service
 */

import { Platform } from 'react-native';
import logger from './logger';

// Local CORS proxy for web development (run: node proxy-server.js)
const LOCAL_PROXY = 'http://localhost:3001/proxy?url=';

// Public CORS proxies (fallback if local proxy not running)
const PUBLIC_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
];

// Use local proxy for development - most reliable option
const CORS_PROXY = LOCAL_PROXY;

/**
 * Check if we're running on web platform
 * @returns {boolean} True if running in web browser
 */
export const isWeb = () => Platform.OS === 'web';

/**
 * Wrap a URL with CORS proxy if running on web
 *
 * @param {string} url - The original URL to fetch
 * @returns {string} The URL (possibly wrapped with CORS proxy)
 *
 * EXAMPLE:
 * wrapWithCORSProxy('http://example.com/data')
 * - On mobile: returns 'http://example.com/data'
 * - On web: returns 'https://corsproxy.io/?http://example.com/data'
 */
export const wrapWithCORSProxy = (url) => {
  if (isWeb()) {
    // Encode the URL to handle special characters
    return `${CORS_PROXY}${encodeURIComponent(url)}`;
  }
  return url;
};

/**
 * Fetch with automatic CORS proxy handling
 *
 * Use this instead of regular fetch() for external APIs that
 * don't have CORS headers (like the Barrie Transit GTFS feeds).
 *
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options (optional)
 * @returns {Promise<Response>} Fetch response
 *
 * EXAMPLE:
 * const response = await fetchWithCORS('http://example.com/api/data');
 * const data = await response.json();
 */
export const fetchWithCORS = async (url, options = {}) => {
  const finalUrl = wrapWithCORSProxy(url);

  // Add a timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(finalUrl, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    // Provide helpful error messages
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your internet connection.');
    }

    if (isWeb() && error.message.includes('Failed to fetch')) {
      logger.warn(
        'CORS error on web. The CORS proxy may be down or rate-limited.',
        'Try testing on a mobile device instead, or use a different CORS proxy.'
      );
    }

    throw error;
  }
};

/**
 * Fetch binary data (like Protocol Buffers) with CORS handling
 *
 * @param {string} url - The URL to fetch
 * @returns {Promise<ArrayBuffer>} The binary data
 */
export const fetchBinaryWithCORS = async (url) => {
  const response = await fetchWithCORS(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.arrayBuffer();
};

/**
 * Fetch JSON data with CORS handling
 *
 * @param {string} url - The URL to fetch
 * @returns {Promise<Object>} The parsed JSON
 */
export const fetchJSONWithCORS = async (url) => {
  const response = await fetchWithCORS(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
};

export default fetchWithCORS;
