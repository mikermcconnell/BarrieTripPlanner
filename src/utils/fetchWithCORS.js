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

const REQUEST_TIMEOUT_MS = 30000;
const PROXY_COOLDOWN_MS = 90 * 1000;
const ENABLE_PUBLIC_PROXY_FALLBACKS = process.env.EXPO_PUBLIC_ENABLE_PUBLIC_CORS_PROXIES === 'true';
const CORS_PROXY_TOKEN = process.env.EXPO_PUBLIC_CORS_PROXY_TOKEN || '';
const proxyFailureTimestamps = new Map();

const buildProxyUrl = (proxyBase, targetUrl) => `${proxyBase}${encodeURIComponent(targetUrl)}`;

const normalizeProxyBase = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'string') return null;

  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (trimmed.includes('?url=')) return trimmed;
  return `${trimmed.replace(/\/+$/, '')}/proxy?url=`;
};

const getConfiguredProxyBase = () =>
  normalizeProxyBase(process.env.EXPO_PUBLIC_CORS_PROXY_URL || process.env.EXPO_PUBLIC_API_PROXY_URL);

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const isLocalWebHost = () => {
  if (!isWeb()) return false;
  if (typeof window === 'undefined' || !window.location) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
};

const getProxyCandidates = () => {
  const configuredProxy = getConfiguredProxyBase();
  const localProxy = isLocalWebHost() ? LOCAL_PROXY : null;
  const baseCandidates = unique([configuredProxy, localProxy]);
  return ENABLE_PUBLIC_PROXY_FALLBACKS
    ? [...baseCandidates, ...PUBLIC_PROXIES]
    : baseCandidates;
};

const isPublicProxy = (proxyBase) => PUBLIC_PROXIES.includes(proxyBase);

const withProxyAuthHeaders = (proxyBase, options = {}) => {
  if (!CORS_PROXY_TOKEN || isPublicProxy(proxyBase)) return options;
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-api-token': CORS_PROXY_TOKEN,
      'x-client-id': 'barrie-transit-web',
    },
  };
};

const shouldTryFallbackProxy = (response) => {
  if (response.status === 429 || response.status >= 500) return true;
  // Proxy services often return these when blocked/rate-limited/misconfigured.
  return [401, 403, 404, 408].includes(response.status);
};

const markProxyFailure = (proxyBase) => {
  proxyFailureTimestamps.set(proxyBase, Date.now());
};

const shouldSkipProxy = (proxyBase) => {
  const failedAt = proxyFailureTimestamps.get(proxyBase);
  if (!failedAt) return false;
  return Date.now() - failedAt < PROXY_COOLDOWN_MS;
};

const buildWebProxyError = (attemptedCount, lastError, lastResponse) => {
  const statusInfo = lastResponse ? ` Last proxy status: ${lastResponse.status}.` : '';
  const causeInfo = lastError?.message ? ` Cause: ${lastError.message}` : '';
  return new Error(
    `Unable to fetch web data: no working CORS proxy (${attemptedCount} attempted). ` +
      `Start the local proxy with "npm run web:dev" or set EXPO_PUBLIC_CORS_PROXY_URL.${statusInfo}${causeInfo}`
  );
};

const fetchWithTimeout = async (targetUrl, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your internet connection.');
    }
    throw error;
  }
};

/**
 * Check if we're running on web platform
 * @returns {boolean} True if running in web browser
 */
export const isWeb = () => Platform.OS === 'web';

/**
 * Wrap a URL with CORS proxy if running on web
 *
 * @param {string} url - The original URL to fetch
 * @param {string} proxyBase - Optional proxy base URL override
 * @returns {string} The URL (possibly wrapped with CORS proxy)
 *
 * EXAMPLE:
 * wrapWithCORSProxy('http://example.com/data')
 * - On mobile: returns 'http://example.com/data'
 * - On web: returns 'https://corsproxy.io/?http://example.com/data'
 */
export const wrapWithCORSProxy = (url, proxyBase = LOCAL_PROXY) => {
  if (isWeb()) {
    return buildProxyUrl(proxyBase, url);
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
  if (!isWeb()) {
    return fetchWithTimeout(url, options);
  }

  const proxyCandidates = getProxyCandidates();
  if (proxyCandidates.length === 0) {
    throw new Error(
      'Web data proxy is not configured. Set EXPO_PUBLIC_CORS_PROXY_URL for hosted web deployments.'
    );
  }
  let lastError = null;
  let lastResponse = null;
  let attemptedCount = 0;

  for (let i = 0; i < proxyCandidates.length; i += 1) {
    const proxyBase = proxyCandidates[i];
    if (shouldSkipProxy(proxyBase)) {
      continue;
    }

    const finalUrl = wrapWithCORSProxy(url, proxyBase);
    attemptedCount += 1;

    try {
      const response = await fetchWithTimeout(finalUrl, withProxyAuthHeaders(proxyBase, options));

      // Keep non-server errors as-is (e.g., 400/404 from upstream),
      // but fallback when proxy is unavailable/rate-limited.
      if (!shouldTryFallbackProxy(response) || i === proxyCandidates.length - 1) {
        return response;
      }

      lastResponse = response;
      markProxyFailure(proxyBase);
      logger.warn(
        `CORS proxy returned ${response.status}; trying fallback proxy (${i + 2}/${proxyCandidates.length})`
      );
    } catch (error) {
      lastError = error;
      markProxyFailure(proxyBase);
      if (i < proxyCandidates.length - 1) {
        logger.warn(
          `CORS proxy request failed; trying fallback proxy (${i + 2}/${proxyCandidates.length})`
        );
      }
    }
  }

  if (attemptedCount === 0 && proxyCandidates.length > 0) {
    proxyFailureTimestamps.clear();
    return fetchWithCORS(url, options);
  }

  if (lastResponse) {
    return lastResponse;
  }

  if (lastError && isWeb() && lastError.message?.includes('Failed to fetch')) {
    logger.warn(
      'All CORS proxies failed on web.',
      'Start the local proxy with "npm run web:dev" or configure EXPO_PUBLIC_CORS_PROXY_URL.'
    );
  }

  if (isWeb()) {
    throw buildWebProxyError(attemptedCount, lastError, lastResponse);
  }

  throw lastError || new Error('Unable to fetch resource through available CORS proxies');
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
