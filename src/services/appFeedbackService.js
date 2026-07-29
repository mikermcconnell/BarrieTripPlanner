import { Platform } from 'react-native';
import { APP_CONFIG } from '../config/constants';
import runtimeConfig from '../config/runtimeConfig';
import { getApiProxyRequestOptions } from './proxyAuth';

function getBaseUrl() {
  return String(runtimeConfig.proxy.apiBaseUrl || '').replace(/\/$/, '');
}

function createSubmissionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const randomPart = () => Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${randomPart()}-${randomPart()}`;
}

async function request(path, options = {}) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('Feedback service is not configured');

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

async function submit({ category, message, source = 'profile', submissionId }) {
  return request('/api/app-feedback', {
    method: 'POST',
    body: JSON.stringify({
      category,
      message,
      source,
      platform: Platform.OS,
      appVersion: APP_CONFIG.VERSION,
      submissionId,
    }),
  });
}

async function getAccess() {
  return request('/api/app-feedback/access', { forceRefreshAuth: true });
}

async function list({ limit = 50, status = 'open', cursor = null } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    status,
  });
  if (cursor) params.set('cursor', cursor);
  return request(`/api/app-feedback?${params.toString()}`);
}

async function updateStatus(feedbackId, status) {
  return request(`/api/app-feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

async function remove(feedbackId) {
  return request(`/api/app-feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'DELETE',
  });
}

export const appFeedbackService = {
  createSubmissionId,
  submit,
  getAccess,
  list,
  updateStatus,
  remove,
};
