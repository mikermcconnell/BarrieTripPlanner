'use strict';

const crypto = require('crypto');
const { getDb } = require('../firebaseAdmin');
const { getDetourHistory } = require('../detourPublisher');
const { buildDetourStorageConfig } = require('../detour/storageConfig');

const DEFAULT_ALERT_FROM = 'Barrie Transit Detours <detours@updates.barrietransit.ca>';
const DEFAULT_NOTIFICATION_COLLECTION = 'detourEmailNotifications';
const DEFAULT_LOOKBACK_MINUTES = 30;
const DEFAULT_MAX_EVENTS = 50;

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAlertEventTypes(env = process.env) {
  const configured = parseList(env.DETOUR_ALERT_EVENT_TYPES)
    .map((value) => value.toUpperCase());
  if (configured.length > 0) return configured;

  return parseBoolean(env.DETOUR_ALERT_INCLUDE_CLEARED, false)
    ? ['DETOUR_DETECTED', 'DETOUR_CLEARED']
    : ['DETOUR_DETECTED'];
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') {
    const dateValue = value.toDate();
    return dateValue instanceof Date ? dateValue.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimestamp(value) {
  const millis = toMillis(value);
  if (millis == null) return 'unknown';
  return new Date(millis).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function routeLabel(event) {
  const routeIds = Array.isArray(event.sharedRouteIds) && event.sharedRouteIds.length > 0
    ? event.sharedRouteIds
    : [event.routeId].filter(Boolean);
  return routeIds.length > 0 ? routeIds.join(', ') : 'Unknown route';
}

function eventLabel(eventType) {
  switch (String(eventType || '').toUpperCase()) {
    case 'DETOUR_DETECTED':
      return 'Detour detected';
    case 'DETOUR_CLEARED':
      return 'Detour cleared';
    default:
      return String(eventType || 'Detour event').replace(/_/g, ' ');
  }
}

function collectLikelyRoadNames(event) {
  const names = new Set();
  const addName = (name) => {
    const clean = String(name || '').trim();
    if (clean) names.add(clean);
  };

  if (Array.isArray(event.likelyDetourRoadNames)) {
    event.likelyDetourRoadNames.forEach(addName);
  }

  if (Array.isArray(event.segments)) {
    event.segments.forEach((segment) => {
      if (Array.isArray(segment?.likelyDetourRoadNames)) {
        segment.likelyDetourRoadNames.forEach(addName);
      }
    });
  }

  return [...names];
}

function makeNotificationId(event) {
  const stableParts = [
    event.eventType || '',
    event.eventId || event.detourEventId || event.id || '',
    event.routeId || '',
    event.detectedAt || '',
    event.occurredAt || '',
  ];
  return crypto
    .createHash('sha256')
    .update(stableParts.join('|'))
    .digest('hex');
}

function buildSubject(event) {
  return `Barrie Transit Detour Alert | ${eventLabel(event.eventType)} | Route ${routeLabel(event)}`;
}

function buildEmailMessage(event, { appUrl = '' } = {}) {
  const subject = buildSubject(event);
  const roads = collectLikelyRoadNames(event);
  const location = event.eventLocationLabel || event.detourZone?.label || '';
  const rows = [
    ['Event', eventLabel(event.eventType)],
    ['Route(s)', routeLabel(event)],
    ['Detected at', formatTimestamp(event.detectedAt || event.occurredAt)],
    ['Updated at', formatTimestamp(event.occurredAt)],
    ['Rider visible', event.riderVisible === false ? 'No' : 'Yes'],
    ['Visibility reason', event.riderVisibilityReason || '—'],
    ['Confidence', event.eventConfidence || event.confidence || 'unknown'],
    ['Vehicles', event.uniqueVehicleCount ?? event.vehicleCount ?? 'unknown'],
    ['Location', location || '—'],
    ['Likely detour roads', roads.length > 0 ? roads.join(', ') : '—'],
    ['Event ID', event.detourEventId || event.eventId || event.id || '—'],
  ];

  const htmlRows = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(value)}</td>
      </tr>`)
    .join('');

  const appLink = appUrl
    ? `<p style="margin:16px 0 0"><a href="${escapeHtml(appUrl)}">Open BTTP</a></p>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto">
    <tr>
      <td style="background:#5B2C83;padding:16px 20px;color:#fff;font-size:18px;font-weight:bold">
        BARRIE TRANSIT DETOUR ALERT
      </td>
    </tr>
    <tr>
      <td style="padding:20px">
        <p style="font-size:16px;margin:0 0 12px"><strong>${escapeHtml(eventLabel(event.eventType))}</strong> for route ${escapeHtml(routeLabel(event))}.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${htmlRows}</table>
        ${appLink}
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    appUrl ? `Open BTTP: ${appUrl}` : null,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}

async function sendViaResend({ apiKey, from, recipients, message, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is unavailable; use Node 18+ or provide fetchImpl');
  }

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend API ${response.status}: ${body}`);
  }

  try {
    return JSON.parse(body);
  } catch (_err) {
    return { id: 'unknown' };
  }
}

async function hasNotification(db, collectionName, notificationId) {
  const snapshot = await db.collection(collectionName).doc(notificationId).get();
  return snapshot.exists;
}

async function recordNotification(db, collectionName, notificationId, event, details = {}) {
  await db.collection(collectionName).doc(notificationId).set({
    notificationId,
    eventType: event.eventType || null,
    eventId: event.eventId || event.detourEventId || null,
    detourEventId: event.detourEventId || event.eventId || null,
    historyDocId: event.id || null,
    routeId: event.routeId || null,
    sharedRouteIds: Array.isArray(event.sharedRouteIds) ? event.sharedRouteIds : [],
    occurredAt: toMillis(event.occurredAt),
    detectedAt: toMillis(event.detectedAt),
    sentAt: Date.now(),
    provider: 'resend',
    providerMessageId: details.id || details.messageId || null,
  }, { merge: true });
}

async function runDetourEmailMonitor({
  env = process.env,
  db = null,
  queryDetourHistory = getDetourHistory,
  sendEmail = sendViaResend,
  now = () => Date.now(),
} = {}) {
  if (parseBoolean(env.DETOUR_EMAIL_ALERT_ENABLED, true) === false) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const recipients = parseList(env.DETOUR_ALERT_RECIPIENTS || env.DETOUR_ALERT_RECIPIENT);
  if (recipients.length === 0) {
    return { ok: true, skipped: true, reason: 'no-recipients' };
  }

  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { ok: true, skipped: true, reason: 'resend-not-configured' };
  }

  if (!db) {
    db = getDb();
  }

  if (!db) {
    return { ok: false, skipped: true, reason: 'firestore-not-configured' };
  }

  const storageConfig = buildDetourStorageConfig(env);
  const eventTypes = getAlertEventTypes(env);
  const limit = parsePositiveInteger(env.DETOUR_ALERT_MAX_EVENTS, DEFAULT_MAX_EVENTS);
  const lookbackMinutes = parsePositiveInteger(env.DETOUR_ALERT_LOOKBACK_MIN, DEFAULT_LOOKBACK_MINUTES);
  const startMs = now() - (lookbackMinutes * 60 * 1000);
  const notificationCollection =
    String(env.DETOUR_ALERT_NOTIFICATION_COLLECTION || DEFAULT_NOTIFICATION_COLLECTION).trim();
  const from = String(env.DETOUR_ALERT_FROM || DEFAULT_ALERT_FROM).trim();
  const appUrl = String(env.DETOUR_ALERT_APP_URL || '').trim();

  const logs = await queryDetourHistory({
    limit,
    startMs,
    eventTypes,
    storageConfig,
  });

  const events = [...logs].reverse();
  const sent = [];
  const skipped = [];

  for (const event of events) {
    const notificationId = makeNotificationId(event);
    if (await hasNotification(db, notificationCollection, notificationId)) {
      skipped.push({ id: event.id || event.eventId || null, reason: 'already-notified' });
      continue;
    }

    const message = buildEmailMessage(event, { appUrl });
    const providerResult = await sendEmail({
      apiKey,
      from,
      recipients,
      message,
    });
    await recordNotification(db, notificationCollection, notificationId, event, providerResult || {});
    sent.push({
      id: event.id || event.eventId || null,
      eventType: event.eventType,
      routeId: event.routeId,
      notificationId,
    });
  }

  return {
    ok: true,
    storage: {
      historyCollection: storageConfig.historyCollection,
      notificationCollection,
    },
    eventTypes,
    checked: logs.length,
    sentCount: sent.length,
    skippedCount: skipped.length,
    sent,
    skipped,
  };
}

module.exports = {
  collectLikelyRoadNames,
  buildEmailMessage,
  buildSubject,
  getAlertEventTypes,
  makeNotificationId,
  runDetourEmailMonitor,
  sendViaResend,
};
