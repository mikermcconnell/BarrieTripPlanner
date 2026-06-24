'use strict';

const crypto = require('crypto');
const { createCanvas } = require('@napi-rs/canvas');
const { getDb } = require('../firebaseAdmin');
const { getDetourHistory } = require('../detourPublisher');
const { buildDetourStorageConfig } = require('../detour/storageConfig');

const DEFAULT_ALERT_FROM = 'Barrie Transit Detours <detours@updates.barrietransit.ca>';
const DEFAULT_NOTIFICATION_COLLECTION = 'detourEmailNotifications';
const DEFAULT_LOOKBACK_MINUTES = 30;
const DEFAULT_MAX_EVENTS = 50;
const SCHEMATIC_CONTENT_ID = 'detour-schematic@bttp.local';

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

function collectRoadNamesFromFields(event, fieldNames = []) {
  const names = new Set();
  const addNames = (source) => {
    if (!source) return;
    fieldNames.forEach((fieldName) => {
      if (Array.isArray(source[fieldName])) {
        source[fieldName].forEach((name) => {
          const clean = String(name || '').trim();
          if (clean) names.add(clean);
        });
      }
    });
  };

  addNames(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addNames);
  }
  return [...names];
}

function stopLabel(stop) {
  if (!stop) return '';
  const code = String(stop.stopCode || stop.code || stop.id || stop.stopId || '').trim();
  const name = String(stop.name || stop.stopName || stop.label || '').trim();
  if (code && name) return `#${code} ${name}`;
  if (code) return `#${code}`;
  return name;
}

function collectSkippedStops(event) {
  const labels = new Set();
  const addStops = (source) => {
    if (!source || !Array.isArray(source.skippedStops)) return;
    source.skippedStops.forEach((stop) => {
      const label = stopLabel(stop);
      if (label) labels.add(label);
    });
  };

  addStops(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addStops);
  }
  return [...labels];
}

function buildDetourEmailInsights(event) {
  const location = String(event?.eventLocationLabel || event?.detourZone?.label || event?.locationText || '').trim();
  const closedRoads = collectRoadNamesFromFields(event, [
    'closedSegmentRoadNames',
    'skippedSegmentRoadNames',
    'closedRoadNames',
  ]);
  const likelyRoads = collectLikelyRoadNames(event);
  const skippedStops = collectSkippedStops(event);

  const closedBase = closedRoads.length > 0
    ? closedRoads.join(', ')
    : (location || 'unknown road section');
  const closedSectionText = location && closedRoads.length > 0
    ? `Likely closed section: ${closedBase} near ${location}`
    : `Likely closed section: ${closedBase}`;
  const detourPathText = likelyRoads.length > 0
    ? `Likely detour path: ${likelyRoads.join(' -> ')}`
    : 'Likely detour path: not enough road-name evidence yet';
  const skippedStopsText = skippedStops.length > 0
    ? `Stops likely not served by this route: ${skippedStops.join('; ')}`
    : 'Stops likely not served by this route: none listed yet';

  return {
    location,
    closedRoads,
    likelyRoads,
    skippedStops,
    closedSectionText,
    detourPathText,
    skippedStopsText,
  };
}

function normalizePoint(point) {
  if (!point) return null;
  const latitude = Number(point.latitude ?? point.lat);
  const longitude = Number(point.longitude ?? point.lon ?? point.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizePolyline(polyline) {
  if (!Array.isArray(polyline)) return [];
  return polyline.map(normalizePoint).filter(Boolean);
}

function chooseDetourPath(event) {
  const candidates = [];
  const addCandidate = (source) => {
    if (!source) return;
    if (source.canShowDetourPath === false) return;
    candidates.push(source.likelyDetourPolyline);
    candidates.push(source.inferredDetourPolyline);
  };

  addCandidate(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addCandidate);
  }

  for (const candidate of candidates) {
    const polyline = normalizePolyline(candidate);
    if (polyline.length >= 2) return polyline;
  }
  return [];
}

function chooseClosedPath(event) {
  const candidates = [event?.skippedSegmentPolyline];
  if (Array.isArray(event?.segments)) {
    event.segments.forEach((segment) => candidates.push(segment?.skippedSegmentPolyline));
  }

  for (const candidate of candidates) {
    const polyline = normalizePolyline(candidate);
    if (polyline.length >= 2) return polyline;
  }
  return [];
}

function pathBounds(paths) {
  const points = paths.flat();
  if (points.length === 0) return null;
  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
}

function drawPolyline(ctx, points, project, options = {}) {
  if (!Array.isArray(points) || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = options.strokeStyle || '#5B2C83';
  ctx.lineWidth = options.lineWidth || 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (Array.isArray(options.dash)) ctx.setLineDash(options.dash);
  ctx.beginPath();
  points.forEach((point, index) => {
    const projected = project(point);
    if (index === 0) ctx.moveTo(projected.x, projected.y);
    else ctx.lineTo(projected.x, projected.y);
  });
  ctx.stroke();
  ctx.restore();
}

function buildDetourSchematicAttachment(event) {
  const closedPath = chooseClosedPath(event);
  const detourPath = chooseDetourPath(event);
  if (closedPath.length < 2 && detourPath.length < 2) return null;

  const width = 640;
  const height = 360;
  const margin = 46;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const bounds = pathBounds([closedPath, detourPath].filter((path) => path.length >= 2));
  if (!bounds) return null;

  const latRange = Math.max(bounds.maxLat - bounds.minLat, 0.0005);
  const lonRange = Math.max(bounds.maxLon - bounds.minLon, 0.0005);
  const project = (point) => ({
    x: margin + ((point.longitude - bounds.minLon) / lonRange) * (width - margin * 2),
    y: height - margin - ((point.latitude - bounds.minLat) / latRange) * (height - margin * 2),
  });

  ctx.fillStyle = '#F8F7FB';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#E7E1EF';
  ctx.lineWidth = 1;
  for (let x = margin; x <= width - margin; x += 58) {
    ctx.beginPath();
    ctx.moveTo(x, margin);
    ctx.lineTo(x, height - margin);
    ctx.stroke();
  }
  for (let y = margin; y <= height - margin; y += 46) {
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();
  }

  drawPolyline(ctx, closedPath, project, {
    strokeStyle: '#D64545',
    lineWidth: 10,
    dash: [12, 10],
  });
  drawPolyline(ctx, detourPath, project, {
    strokeStyle: '#5B2C83',
    lineWidth: 8,
  });

  const start = detourPath[0] || closedPath[0];
  const end = detourPath[detourPath.length - 1] || closedPath[closedPath.length - 1];
  [start, end].filter(Boolean).forEach((point, index) => {
    const { x, y } = project(point);
    ctx.fillStyle = index === 0 ? '#0B7A75' : '#2F5597';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = '#2B2430';
  ctx.font = 'bold 18px Arial';
  ctx.fillText(`Route ${routeLabel(event)} detour schematic`, 22, 28);
  ctx.font = '13px Arial';
  ctx.fillText('Not to scale - GPS-derived approximate path', 22, height - 18);

  ctx.fillStyle = '#D64545';
  ctx.fillRect(width - 226, 18, 28, 6);
  ctx.fillStyle = '#2B2430';
  ctx.fillText('likely closed route section', width - 190, 25);
  ctx.fillStyle = '#5B2C83';
  ctx.fillRect(width - 226, 42, 28, 6);
  ctx.fillStyle = '#2B2430';
  ctx.fillText('likely detour path', width - 190, 49);

  return {
    content: canvas.toBuffer('image/png').toString('base64'),
    filename: 'detour-schematic-inline.png',
    content_type: 'image/png',
    content_id: SCHEMATIC_CONTENT_ID,
  };
}

function buildDetourSchematicFallbackAttachment(inlineAttachment) {
  if (!inlineAttachment?.content) return null;
  return {
    content: inlineAttachment.content,
    filename: 'detour-schematic.png',
    content_type: 'image/png',
  };
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

function shouldSendDetourEmailEvent(event) {
  return event?.riderVisible === true;
}

function buildEmailMessage(event, { appUrl = '' } = {}) {
  const subject = buildSubject(event);
  const roads = collectLikelyRoadNames(event);
  const insights = buildDetourEmailInsights(event);
  const schematicAttachment = buildDetourSchematicAttachment(event);
  const schematicFallbackAttachment = buildDetourSchematicFallbackAttachment(schematicAttachment);
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
    ['Likely closed section', insights.closedSectionText.replace(/^Likely closed section:\s*/, '')],
    ['Likely detour roads', roads.length > 0 ? roads.join(', ') : '—'],
    ['Likely path summary', insights.detourPathText.replace(/^Likely detour path:\s*/, '')],
    ['Skipped stops', insights.skippedStops.length > 0 ? insights.skippedStops.join('; ') : '—'],
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
  const schematic = schematicAttachment
    ? `
        <div style="margin:18px 0">
          <p style="margin:0 0 8px;font-weight:bold">Approximate detour schematic</p>
          <img src="cid:${SCHEMATIC_CONTENT_ID}" alt="Approximate detour schematic" width="640" style="width:100%;max-width:640px;border:1px solid #ddd;border-radius:8px">
          <p style="margin:8px 0 0;color:#555;font-size:12px">If this image does not display in Outlook, open the attached detour-schematic.png.</p>
        </div>`
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
        <p style="margin:0 0 12px">${escapeHtml(insights.closedSectionText)}<br>${escapeHtml(insights.detourPathText)}<br>${escapeHtml(insights.skippedStopsText)}</p>
        ${schematic}
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
    insights.closedSectionText,
    insights.detourPathText,
    insights.skippedStopsText,
    schematicFallbackAttachment
      ? 'If the schematic image does not display, open the attached detour-schematic.png.'
      : null,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    appUrl ? `Open BTTP: ${appUrl}` : null,
  ].filter(Boolean).join('\n');

  return {
    subject,
    html,
    text,
    attachments: [
      schematicAttachment,
      schematicFallbackAttachment,
    ].filter(Boolean),
  };
}

function normalizeResendAttachment(attachment) {
  const normalized = {};
  const copyStringField = (fieldName) => {
    if (attachment[fieldName] != null) {
      normalized[fieldName] = attachment[fieldName];
    }
  };

  copyStringField('content');
  copyStringField('filename');
  copyStringField('path');
  normalized.content_type = attachment.content_type || attachment.contentType;
  normalized.content_id = attachment.content_id || attachment.contentId;

  Object.keys(normalized).forEach((fieldName) => {
    if (normalized[fieldName] == null || normalized[fieldName] === '') {
      delete normalized[fieldName];
    }
  });

  return normalized;
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
      attachments: Array.isArray(message.attachments) && message.attachments.length > 0
        ? message.attachments.map(normalizeResendAttachment)
        : undefined,
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
    if (!shouldSendDetourEmailEvent(event)) {
      skipped.push({
        id: event.id || event.eventId || null,
        reason: 'not-rider-visible',
        riderVisible: event.riderVisible ?? null,
        riderVisibilityReason: event.riderVisibilityReason || null,
      });
      continue;
    }

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
  buildDetourEmailInsights,
  buildDetourSchematicAttachment,
  collectLikelyRoadNames,
  buildEmailMessage,
  buildSubject,
  getAlertEventTypes,
  makeNotificationId,
  runDetourEmailMonitor,
  shouldSendDetourEmailEvent,
  sendViaResend,
};
