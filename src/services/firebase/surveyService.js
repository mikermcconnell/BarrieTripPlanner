/**
 * Survey Service — Client-side Firebase/API service for rider feedback surveys.
 *
 * Follows the tripHistoryFirestoreService pattern:
 * - Direct Firestore reads for config + aggregates (public collections)
 * - API proxy calls for writes (submissions go through backend for dedup + aggregation)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getFirestore, collection, query, where, limit, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { LOCATIONIQ_CONFIG } from '../../config/constants';

const DEVICE_ID_KEY = '@barrie_transit_device_id';
const SURVEY_SUBMITTED_PREFIX = '@barrie_transit_survey_submitted_';

function getProxyUrl() {
  return LOCATIONIQ_CONFIG.PROXY_URL || '';
}

function getProxyToken() {
  return LOCATIONIQ_CONFIG.PROXY_TOKEN || '';
}

async function getDeviceId() {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const auth = getAuth();
  const user = auth.currentUser;

  if (user) {
    try {
      const token = await user.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // Fall back to shared token
      const proxyToken = getProxyToken();
      if (proxyToken) headers['x-api-token'] = proxyToken;
    }
  } else {
    const proxyToken = getProxyToken();
    if (proxyToken) headers['x-api-token'] = proxyToken;
  }

  const deviceId = await getDeviceId();
  headers['x-device-id'] = deviceId;

  return headers;
}

/**
 * Fetch the currently active survey config from Firestore (direct read).
 * Returns null if no active survey.
 */
async function getActiveSurvey() {
  try {
    const db = getFirestore();
    const q = query(
      collection(db, 'surveyConfig'),
      where('isActive', '==', true),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  } catch (err) {
    console.warn('[surveyService] Failed to load active survey:', err.message);
    return null;
  }
}

/**
 * Submit a survey response via the API proxy.
 * Backend handles dedup + aggregate updates.
 */
async function submitResponse({ surveyId, surveyVersion, answers, trigger }) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) throw new Error('API proxy URL not configured');

  const headers = await getAuthHeaders();
  const response = await fetch(`${proxyUrl}/api/survey/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      surveyId,
      surveyVersion,
      answers,
      trigger: trigger || 'profile',
      platform: Platform.OS,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    if (data.alreadySubmitted) {
      // Mark locally so we don't re-check
      await AsyncStorage.setItem(`${SURVEY_SUBMITTED_PREFIX}${surveyId}`, 'true');
    }
    throw new Error(data.error || `Submit failed (${response.status})`);
  }

  // Cache submitted state locally
  await AsyncStorage.setItem(`${SURVEY_SUBMITTED_PREFIX}${surveyId}`, 'true');
  return data;
}

/**
 * Check if the current user/device has already submitted this survey.
 * Checks local cache first, then server if unknown.
 */
async function checkAlreadySubmitted(surveyId) {
  // Fast path: check local cache
  const cached = await AsyncStorage.getItem(`${SURVEY_SUBMITTED_PREFIX}${surveyId}`);
  if (cached === 'true') return true;

  // Slow path: ask the server
  try {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) return false;

    const headers = await getAuthHeaders();
    const response = await fetch(
      `${proxyUrl}/api/survey/check-submitted?surveyId=${encodeURIComponent(surveyId)}`,
      { headers }
    );

    if (!response.ok) return false;
    const data = await response.json();

    if (data.submitted) {
      await AsyncStorage.setItem(`${SURVEY_SUBMITTED_PREFIX}${surveyId}`, 'true');
    }
    return data.submitted;
  } catch {
    return false;
  }
}

/**
 * Subscribe to real-time aggregate updates for a survey.
 * Returns an unsubscribe function.
 */
function subscribeToAggregates(surveyId, onUpdate, onError) {
  const db = getFirestore();
  const docRef = doc(db, 'surveyAggregates', surveyId);

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data());
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.warn('[surveyService] Aggregates subscription error:', err.message);
      if (onError) onError(err);
    }
  );
}

export const surveyService = {
  getActiveSurvey,
  submitResponse,
  checkAlreadySubmitted,
  subscribeToAggregates,
  getDeviceId,
};
