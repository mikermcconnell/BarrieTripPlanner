/**
 * Retry-capable fetch wrapper with exponential backoff.
 *
 * Features:
 * - Configurable max retries (default 3)
 * - Exponential backoff: 1s, 2s, 4s
 * - Only retries on 5xx server errors and network failures
 * - Does NOT retry on 4xx client errors (bad request, not found, etc.)
 * - Forwards AbortController signals for cancellation
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

/**
 * @param {string} url - The URL to fetch
 * @param {Object} [options] - Standard fetch options + retry config
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.baseDelayMs=1000] - Base delay for exponential backoff
 * @param {AbortSignal} [options.signal] - AbortController signal
 * @returns {Promise<Response>}
 */
export const retryFetch = async (url, options = {}) => {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    ...fetchOptions
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Don't retry client errors (4xx) — the request itself is wrong
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry server errors (5xx)
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`Server error: ${response.status}`);
        await delay(baseDelayMs * Math.pow(2, attempt));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      // Don't retry if the request was explicitly aborted
      if (error.name === 'AbortError') {
        throw error;
      }

      // Retry on network errors if we have attempts left
      if (attempt < maxRetries) {
        await delay(baseDelayMs * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError;
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
