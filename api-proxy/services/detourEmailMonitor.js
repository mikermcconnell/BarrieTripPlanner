'use strict';

const crypto = require('crypto');
const { getDb } = require('../firebaseAdmin');
const { getDetourHistory } = require('../detourPublisher');
const { buildDetourStorageConfig } = require('../detour/storageConfig');
const { getStaticData } = require('../gtfsLoader');

const DEFAULT_ALERT_FROM = 'BTTP Detour Alerts <onboarding@resend.dev>';
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

function stopCodeValue(stop) {
  if (!stop) return '';
  if (typeof stop === 'string' || typeof stop === 'number') {
    return String(stop).replace(/^#/, '').trim();
  }
  return String(
    stop.stopCode ||
    stop.stop_code ||
    stop.code ||
    stop.id ||
    stop.stopId ||
    stop.stop_id ||
    ''
  ).replace(/^#/, '').trim();
}

function stopNameValue(stop) {
  if (!stop || typeof stop !== 'object') return '';
  return String(stop.name || stop.stopName || stop.stop_name || stop.label || '').trim();
}

function resolveStopFromGtfs(stop, gtfsData = {}) {
  const code = stopCodeValue(stop);
  if (!code) return null;
  return gtfsData.stopsByCode?.get(code) || gtfsData.stopsById?.get(code) || null;
}

function enrichStopWithName(stop, gtfsData = {}) {
  const code = stopCodeValue(stop);
  const explicitName = stopNameValue(stop);
  const resolved = resolveStopFromGtfs(stop, gtfsData);
  const resolvedName = String(resolved?.name || '').trim();
  const resolvedCode = String(resolved?.code || resolved?.id || '').trim();
  if (!code && !explicitName && !resolvedName) return stop;
  return {
    ...(typeof stop === 'object' && stop != null ? stop : {}),
    stopCode: code || resolvedCode || '',
    name: explicitName || resolvedName || '',
  };
}

function enrichEventStopNames(event, gtfsData = {}) {
  if (!event || !gtfsData) return event;
  const stopFields = [
    'skippedStops',
    'skippedStopCodes',
    'skippedStopIds',
    'affectedStops',
    'affectedStopCodes',
    'affectedStopIds',
  ];
  const enrichSource = (source) => {
    if (!source) return source;
    const next = { ...source };
    stopFields.forEach((fieldName) => {
      if (Array.isArray(next[fieldName])) {
        next[fieldName] = next[fieldName].map((stop) => enrichStopWithName(stop, gtfsData));
      }
    });
    return next;
  };

  const enriched = enrichSource(event);
  if (Array.isArray(enriched.segments)) {
    enriched.segments = enriched.segments.map(enrichSource);
  }
  return enriched;
}

function stopLabel(stop) {
  const code = stopCodeValue(stop);
  const name = stopNameValue(stop);
  if (code && name) return `#${code} ${name}`;
  if (code) return `#${code}`;
  return name;
}

function collectStopsFromFields(event, fields = []) {
  const labels = new Set();
  const addStops = (source) => {
    if (!source) return;
    fields.forEach((fieldName) => {
      if (!Array.isArray(source[fieldName])) return;
      source[fieldName].forEach((stop) => {
        const label = stopLabel(stop);
        if (label) labels.add(label);
      });
    });
  };

  addStops(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addStops);
  }
  return [...labels];
}

function collectSkippedStops(event) {
  return collectStopsFromFields(event, [
    'skippedStops',
    'skippedStopCodes',
    'skippedStopIds',
  ]);
}

function collectAffectedStops(event) {
  return collectStopsFromFields(event, [
    'affectedStops',
    'affectedStopCodes',
    'affectedStopIds',
  ]);
}

function cleanLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[.:-]+$/g, '')
    .trim();
}

function cleanRoadName(value) {
  return cleanLabel(value)
    .replace(/\b(Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Crescent|Cres\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCompactList(items = []) {
  const cleaned = [...new Set(items.map(cleanLabel).filter(Boolean))];
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} & ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')} & ${cleaned[cleaned.length - 1]}`;
}

function collectLabelFields(event, fields = []) {
  const labels = [];
  const addLabels = (source) => {
    if (!source) return;
    fields.forEach((fieldName) => {
      const label = cleanLabel(source[fieldName]);
      if (label) labels.push(label);
    });
  };
  addLabels(event);
  if (Array.isArray(event?.segments)) {
    event.segments.forEach(addLabels);
  }
  return [...new Set(labels)];
}

function buildBestLocationTitle(event, { closedRoads = [], skippedStops = [], affectedStops = [] } = {}) {
  const explicitLabels = collectLabelFields(event, [
    'configuredCorridorLabel',
    'closedSegmentLabel',
    'eventLocationLabel',
    'locationText',
    'title',
    'description',
  ]).filter((label) => !/^route\s+\w+\s+detour$/i.test(label));

  const roadTitle = formatCompactList(closedRoads.map(cleanRoadName).filter(Boolean));
  const stopTitle = formatCompactList(skippedStops.length > 0 ? skippedStops : affectedStops);

  const locationTitle = explicitLabels[0] || roadTitle;
  if (locationTitle && stopTitle && !stopTitle.split(/\s*&\s*|\s*,\s*/).some((part) => locationTitle.includes(part))) {
    return `${locationTitle} · ${stopTitle.startsWith('#') ? `Stops ${stopTitle}` : stopTitle}`;
  }
  return locationTitle || stopTitle || '';
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
  const affectedStops = collectAffectedStops(event);
  const bestLocationTitle = buildBestLocationTitle(event, {
    closedRoads,
    skippedStops,
    affectedStops,
  });

  const closedBase = closedRoads.length > 0
    ? closedRoads.join(', ')
    : (bestLocationTitle || location || '');
  const closedSectionText = location && closedRoads.length > 0
    ? `Likely closed section: ${closedBase} near ${location}`
    : (closedBase ? `Likely closed section: ${closedBase}` : 'Likely closed section: not enough detail yet');
  const detourPathText = likelyRoads.length > 0
    ? `Likely detour path: ${likelyRoads.join(' -> ')}`
    : 'Likely detour path: open BTTP to view the map';
  const skippedStopsText = skippedStops.length > 0
    ? `Stops likely not served by this route: ${skippedStops.join('; ')}`
    : (affectedStops.length > 0
      ? `Stops affected: ${affectedStops.join('; ')}`
      : 'Stops affected: not listed yet');

  return {
    location,
    bestLocationTitle,
    closedRoads,
    likelyRoads,
    skippedStops,
    affectedStops,
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


function normalizeIdentityValue(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeIdentityList(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeIdentityValue).filter(Boolean))].sort();
}

function makeNotificationIdentityKey(event = {}) {
  const eventType = normalizeIdentityValue(event.eventType || 'DETOUR_EVENT').toUpperCase();
  const sharedDetourEventId = normalizeIdentityValue(event.sharedDetourEventId);
  if (sharedDetourEventId) return `${eventType}|shared:${sharedDetourEventId}`;

  const detourEventId = normalizeIdentityValue(event.detourEventId || event.eventId);
  if (detourEventId) return `${eventType}|detour:${detourEventId}`;

  const signatureParts = [
    `routes:${normalizeIdentityList(event.sharedRouteIds).join(',') || normalizeIdentityValue(event.routeId)}`,
    `location:${cleanLabel(event.eventLocationLabel || event.detourZone?.label || event.locationText || event.title || '')}`,
    `closed:${normalizeIdentityList(collectRoadNamesFromFields(event, [
      'closedSegmentRoadNames',
      'skippedSegmentRoadNames',
      'closedRoadNames',
    ])).join(',')}`,
    `detour:${normalizeIdentityList(collectLikelyRoadNames(event)).join(',')}`,
    `stops:${normalizeIdentityList([...collectSkippedStops(event), ...collectAffectedStops(event)]).join(',')}`,
  ].filter((part) => !part.endsWith(':'));

  if (signatureParts.length > 0) return `${eventType}|${signatureParts.join('|')}`;

  const routeId = normalizeIdentityValue(event.routeId);
  if (routeId) return `${eventType}|route:${routeId}`;

  return `${eventType}|history:${normalizeIdentityValue(event.id) || 'unknown'}`;
}

function makeNotificationId(event) {
  const stableParts = [makeNotificationIdentityKey(event)];
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

function eventIdentifierValues(event = {}) {
  return [
    event.detourEventId,
    event.eventId,
    event.sharedDetourEventId,
    event.id,
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function activeDocMatchesEvent(active = {}, event = {}) {
  const eventIds = new Set(eventIdentifierValues(event));
  const activeIds = eventIdentifierValues(active);
  if (eventIds.size > 0 && activeIds.some((id) => eventIds.has(id))) return true;
  const eventRouteId = String(event.routeId || '').trim();
  return eventRouteId && String(active.routeId || '').trim() === eventRouteId;
}

function rankActiveDetourCandidate(active = {}, event = {}) {
  let score = 0;
  if (active.riderVisible === true) score += 100;
  if (activeDocMatchesEvent(active, event)) score += 50;
  if (String(active.detourEventId || '') && String(active.detourEventId || '') === String(event.detourEventId || event.eventId || '')) score += 30;
  if (String(active.routeId || '') && String(active.routeId || '') === String(event.routeId || '')) score += 10;
  if (buildDetourEmailInsights(active).bestLocationTitle) score += 6;
  if (collectSkippedStops(active).length > 0) score += 5;
  if (collectLikelyRoadNames(active).length > 0) score += 4;
  if (chooseClosedPath(active).length >= 2 && chooseDetourPath(active).length >= 2) score += 4;
  return score;
}

async function queryActiveDetourCandidates(db, collectionName, event) {
  const collection = db.collection(collectionName);
  const candidates = [];
  const addSnapshot = (snapshot, id = '') => {
    if (!snapshot?.exists) return;
    candidates.push({
      id: id || snapshot.id || null,
      ...(typeof snapshot.data === 'function' ? snapshot.data() : {}),
    });
  };
  const addQuerySnapshot = (snapshot) => {
    if (!snapshot?.docs) return;
    snapshot.docs.forEach((doc) => addSnapshot(doc, doc.id));
  };

  const routeId = String(event?.routeId || '').trim();
  if (routeId && typeof collection.doc === 'function') {
    try {
      addSnapshot(await collection.doc(routeId).get(), routeId);
    } catch (_err) {
      // Non-fatal. V2 active detour docs are not keyed only by routeId.
    }
  }

  if (routeId && typeof collection.where === 'function') {
    try {
      addQuerySnapshot(await collection.where('routeId', '==', routeId).limit(10).get());
    } catch (_err) {
      // Non-fatal. Some test doubles or deployments may not support this query.
    }
  }

  const deduped = new Map();
  candidates.forEach((candidate, index) => {
    const key = candidate.id || `${candidate.routeId || 'candidate'}:${candidate.detourEventId || index}`;
    deduped.set(key, candidate);
  });
  return [...deduped.values()];
}

async function enrichEventFromActiveDetour(db, storageConfig, event) {
  if (!db || !storageConfig?.activeCollection || !event?.routeId) return event;
  const candidates = await queryActiveDetourCandidates(db, storageConfig.activeCollection, event);
  const best = candidates
    .filter((candidate) => candidate.riderVisible === true && activeDocMatchesEvent(candidate, event))
    .sort((a, b) => rankActiveDetourCandidate(b, event) - rankActiveDetourCandidate(a, event))[0];

  if (!best) return event;
  return {
    ...event,
    ...best,
    id: event.id || best.id || null,
    eventType: event.eventType,
    eventId: event.eventId || best.eventId || best.detourEventId || null,
    detourEventId: event.detourEventId || best.detourEventId || best.eventId || null,
    occurredAt: event.occurredAt || best.occurredAt || best.updatedAt || null,
    detectedAt: event.detectedAt || best.detectedAt || null,
  };
}

function buildEmailMessage(event, { appUrl = '' } = {}) {
  const subject = buildSubject(event);
  const roads = collectLikelyRoadNames(event);
  const insights = buildDetourEmailInsights(event);
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
    ['Location', insights.bestLocationTitle || location || '—'],
    ['Likely closed section', insights.closedSectionText.replace(/^Likely closed section:\s*/, '')],
    ['Likely detour roads', roads.length > 0 ? roads.join(', ') : '—'],
    ['Likely path summary', insights.detourPathText.replace(/^Likely detour path:\s*/, '')],
    ['Skipped/affected stops', insights.skippedStops.length > 0
      ? insights.skippedStops.join('; ')
      : (insights.affectedStops.length > 0 ? insights.affectedStops.join('; ') : '—')],
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
        <p style="font-size:16px;margin:0 0 12px"><strong>Confirmed public detour</strong> for route ${escapeHtml(routeLabel(event))}.</p>
        ${insights.bestLocationTitle ? `<p style="font-size:18px;margin:0 0 12px"><strong>${escapeHtml(insights.bestLocationTitle)}</strong></p>` : ''}
        <p style="margin:0 0 12px">${escapeHtml(insights.closedSectionText)}<br>${escapeHtml(insights.detourPathText)}<br>${escapeHtml(insights.skippedStopsText)}</p>
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
    insights.bestLocationTitle ? `Area: ${insights.bestLocationTitle}` : null,
    insights.closedSectionText,
    insights.detourPathText,
    insights.skippedStopsText,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    appUrl ? `Open BTTP: ${appUrl}` : null,
  ].filter(Boolean).join('\n');

  return {
    subject,
    html,
    text,
    attachments: [],
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

function isAlreadyExistsError(err) {
  return err?.code === 6 ||
    err?.code === 'already-exists' ||
    err?.code === 'ALREADY_EXISTS' ||
    /already exists/i.test(String(err?.message || ''));
}

function notificationRecordMatchesEvent(record = {}, event = {}) {
  if (!record || typeof record !== 'object') return false;
  const recordType = normalizeIdentityValue(record.eventType).toUpperCase();
  const eventType = normalizeIdentityValue(event.eventType).toUpperCase();
  if (recordType && eventType && recordType !== eventType) return false;

  const identityKey = makeNotificationIdentityKey(event);
  if (normalizeIdentityValue(record.notificationIdentityKey) === identityKey) return true;

  const sharedDetourEventId = normalizeIdentityValue(event.sharedDetourEventId);
  if (sharedDetourEventId && normalizeIdentityValue(record.sharedDetourEventId) === sharedDetourEventId) {
    return true;
  }

  const detourEventId = normalizeIdentityValue(event.detourEventId || event.eventId);
  if (detourEventId && (
    normalizeIdentityValue(record.detourEventId) === detourEventId ||
    normalizeIdentityValue(record.eventId) === detourEventId
  )) {
    return true;
  }

  return false;
}

async function findExistingNotificationForEvent(db, collectionName, event) {
  const collection = db.collection(collectionName);
  if (typeof collection.where !== 'function') return false;

  const probes = [
    ['notificationIdentityKey', makeNotificationIdentityKey(event)],
    ['sharedDetourEventId', event.sharedDetourEventId],
    ['detourEventId', event.detourEventId || event.eventId],
    ['eventId', event.eventId || event.detourEventId],
  ];
  const seen = new Set();

  for (const [fieldName, rawValue] of probes) {
    const value = normalizeIdentityValue(rawValue);
    const probeKey = `${fieldName}:${value}`;
    if (!value || seen.has(probeKey)) continue;
    seen.add(probeKey);
    try {
      const snapshot = await collection.where(fieldName, '==', value).limit(10).get();
      const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
      if (docs.some((doc) => notificationRecordMatchesEvent(
        typeof doc.data === 'function' ? doc.data() : {},
        event
      ))) {
        return true;
      }
    } catch (_err) {
      // Non-fatal. Some test doubles/deployments may not support this query.
    }
  }

  return false;
}

async function reserveNotification(db, collectionName, notificationId, event) {
  const ref = db.collection(collectionName).doc(notificationId);
  const reservation = {
    notificationId,
    notificationIdentityKey: makeNotificationIdentityKey(event),
    status: 'pending',
    eventType: event.eventType || null,
    eventId: event.eventId || event.detourEventId || null,
    detourEventId: event.detourEventId || event.eventId || null,
    sharedDetourEventId: event.sharedDetourEventId || null,
    historyDocId: event.id || null,
    routeId: event.routeId || null,
    sharedRouteIds: Array.isArray(event.sharedRouteIds) ? event.sharedRouteIds : [],
    reservedAt: Date.now(),
  };

  if (typeof ref.create === 'function') {
    try {
      await ref.create(reservation);
      return true;
    } catch (err) {
      if (isAlreadyExistsError(err)) return false;
      throw err;
    }
  }

  const snapshot = typeof ref.get === 'function' ? await ref.get() : null;
  if (snapshot?.exists) return false;
  await ref.set(reservation, { merge: false });
  return true;
}

async function releaseNotificationReservation(db, collectionName, notificationId, err) {
  const ref = db.collection(collectionName).doc(notificationId);
  if (typeof ref.delete === 'function') {
    await ref.delete();
    return;
  }
  if (typeof ref.set === 'function') {
    await ref.set({
      status: 'failed',
      failedAt: Date.now(),
      failureMessage: String(err?.message || err || 'email-send-failed').slice(0, 500),
    }, { merge: true });
  }
}

async function recordNotification(db, collectionName, notificationId, event, details = {}) {
  await db.collection(collectionName).doc(notificationId).set({
    notificationId,
    notificationIdentityKey: makeNotificationIdentityKey(event),
    status: 'sent',
    eventType: event.eventType || null,
    eventId: event.eventId || event.detourEventId || null,
    detourEventId: event.detourEventId || event.eventId || null,
    sharedDetourEventId: event.sharedDetourEventId || null,
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
  getGtfsData = getStaticData,
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
  let gtfsData = null;
  let gtfsDataLoaded = false;
  const getGtfsDataOnce = async () => {
    if (gtfsDataLoaded || typeof getGtfsData !== 'function') return gtfsData;
    gtfsDataLoaded = true;
    try {
      gtfsData = await getGtfsData();
    } catch (err) {
      console.warn('[detourEmailMonitor] Stop-name enrichment unavailable:', err.message);
    }
    return gtfsData;
  };

  for (const event of events) {
    const activeEvent = await enrichEventFromActiveDetour(db, storageConfig, event);

    if (!shouldSendDetourEmailEvent(activeEvent)) {
      skipped.push({
        id: event.id || event.eventId || null,
        reason: 'not-rider-visible',
        riderVisible: activeEvent.riderVisible ?? null,
        riderVisibilityReason: activeEvent.riderVisibilityReason || null,
      });
      continue;
    }

    const notificationId = makeNotificationId(activeEvent);
    if (
      await hasNotification(db, notificationCollection, notificationId) ||
      await findExistingNotificationForEvent(db, notificationCollection, activeEvent)
    ) {
      skipped.push({ id: event.id || event.eventId || null, reason: 'already-notified' });
      continue;
    }

    if (!await reserveNotification(db, notificationCollection, notificationId, activeEvent)) {
      skipped.push({ id: event.id || event.eventId || null, reason: 'already-notified' });
      continue;
    }

    const emailEvent = enrichEventStopNames(activeEvent, await getGtfsDataOnce());
    const message = buildEmailMessage(emailEvent, { appUrl });
    let providerResult;
    try {
      providerResult = await sendEmail({
        apiKey,
        from,
        recipients,
        message,
      });
    } catch (err) {
      await releaseNotificationReservation(db, notificationCollection, notificationId, err);
      throw err;
    }
    await recordNotification(db, notificationCollection, notificationId, emailEvent, providerResult || {});
    sent.push({
      id: event.id || event.eventId || null,
      eventType: emailEvent.eventType,
      routeId: emailEvent.routeId,
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
  collectLikelyRoadNames,
  enrichEventStopNames,
  enrichEventFromActiveDetour,
  buildEmailMessage,
  buildSubject,
  getAlertEventTypes,
  makeNotificationId,
  runDetourEmailMonitor,
  shouldSendDetourEmailEvent,
  sendViaResend,
};
