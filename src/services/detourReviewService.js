import { Platform, Share } from 'react-native';
import runtimeConfig from '../config/runtimeConfig';
import { getApiProxyRequestOptions } from './proxyAuth';

function getBaseUrl() {
  return String(runtimeConfig.proxy.apiBaseUrl || '').replace(/\/$/, '');
}

async function request(path, options = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('API proxy URL is not configured');
  const authOptions = await getApiProxyRequestOptions('', {
    forceRefresh: options.forceRefreshAuth === true,
  });
  const { forceRefreshAuth: _forceRefreshAuth, ...fetchOptions } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    ...fetchOptions,
    headers: {
      ...authOptions.headers,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function buildQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value != null) params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function getAccess() {
  return request('/api/detour-reviews/access', { forceRefreshAuth: true });
}

async function listCases(filters = {}) {
  return request(`/api/detour-reviews/cases${buildQuery(filters)}`);
}

async function getCase(caseId) {
  const result = await request(`/api/detour-reviews/cases/${encodeURIComponent(caseId)}`);
  return result.case;
}

async function saveReview(caseId, review) {
  const result = await request(`/api/detour-reviews/cases/${encodeURIComponent(caseId)}/review`, {
    method: 'PUT',
    body: JSON.stringify(review),
  });
  return result.review;
}

async function exportCase(caseId) {
  const bundle = await request(`/api/detour-reviews/cases/${encodeURIComponent(caseId)}/export`);
  const serialized = JSON.stringify(bundle, null, 2);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${caseId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  } else {
    await Share.share({ title: 'Detour review case', message: serialized });
  }
  return bundle;
}

export const detourReviewService = { getAccess, listCases, getCase, saveReview, exportCase };
