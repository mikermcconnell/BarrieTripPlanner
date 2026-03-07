import { LOCATIONIQ_CONFIG } from '../config/constants';
import { retryFetch } from '../utils/retryFetch';
import { getApiProxyRequestOptions } from './proxyAuth';

export const PROXY_HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

export class BackendHealthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackendHealthError';
    this.code = code;
  }
}

export const fetchProxyHealth = async () => {
  const proxyUrl = LOCATIONIQ_CONFIG.PROXY_URL;
  const proxyToken = LOCATIONIQ_CONFIG.PROXY_TOKEN || '';

  if (!proxyUrl) {
    throw new BackendHealthError(
      'PROXY_UNCONFIGURED',
      'API proxy URL is not configured'
    );
  }

  const requestOptions = await getApiProxyRequestOptions(proxyToken);
  const response = await retryFetch(`${proxyUrl}/api/health`, {
    ...requestOptions,
    maxRetries: 1,
    baseDelayMs: 500,
  });

  if (!response.ok) {
    throw new BackendHealthError(
      'PROXY_UNAVAILABLE',
      `API proxy health check failed (${response.status})`
    );
  }

  const data = await response.json();
  return {
    ok: data?.status === 'ok',
    status: data?.status || 'unknown',
    backendTimestamp: data?.timestamp || null,
    checkedAt: Date.now(),
  };
};

export default fetchProxyHealth;
