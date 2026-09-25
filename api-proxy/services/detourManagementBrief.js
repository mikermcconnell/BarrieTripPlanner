'use strict';

const { getDb } = require('../firebaseAdmin');
const { buildDetourEmailInsights, enrichEventStopNames, findExistingNotificationForEvent, makeNotificationId, sendViaResend } = require('./detourEmailMonitor');
const { getStaticData } = require('../gtfsLoader');
const { renderDetourBriefMap } = require('./detourBriefMap');
const { getNoticeRouteColor, getNoticeRouteTextColor } = require('./detourNoticeStyle');

const ACTIVE_COLLECTION = 'activeDetourEventsV2';
const NOTIFICATION_COLLECTION = 'detourEmailNotifications';
const LEASE_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MS = 23 * 60 * 60 * 1000;

function millis(value) {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function timeLabel(value) {
  const ms = millis(value);
  return ms == null ? 'Time unavailable' : new Date(ms).toLocaleString('en-CA', {
    timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
}

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function isConfirmedActive(event) {
  return event && event.alertVisible === true &&
    String(event.state || 'active').toLowerCase() === 'active' &&
    event.baselineDiverged !== true && event.baselineUpdatePending !== true;
}

function groupActiveEvents(docs) {
  const groups = new Map();
  for (const doc of docs) {
    const event = { ...doc.data(), eventId: doc.id, detourEventId: doc.id };
    if (!isConfirmedActive(event)) continue;
    const key = String(event.sharedDetourEventId || event.eventId).trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.values()];
}

function briefIdentity(events) {
  const primary = events[0];
  return {
    ...primary,
    eventType: 'DETOUR_DETECTED',
    sharedRouteIds: [...new Set(events.flatMap((event) => event.sharedRouteIds?.length
      ? event.sharedRouteIds : [event.routeId]).filter(Boolean))].sort(),
    segments: events.flatMap((event) => Array.isArray(event.segments) && event.segments.length
      ? event.segments : [event]),
  };
}

function buildBriefMessage(event, map, routeColors) {
  const insight = buildDetourEmailInsights(event);
  const routes = event.sharedRouteIds.length ? event.sharedRouteIds.join(', ') : (event.routeId || 'Unknown');
  const location = event.eventLocationLabel || insight.bestLocationTitle || 'Location being confirmed';
  const stops = insight.skippedStops.length
    ? insight.skippedStops.join('; ')
    : insight.affectedStops.length
      ? insight.affectedStops.join('; ')
      : 'Stop impacts have not been confirmed.';
  const impactHeadline = insight.skippedStops.length
    ? `${insight.skippedStops.length} skipped stop${insight.skippedStops.length === 1 ? '' : 's'}`
    : insight.affectedStops.length
      ? `${insight.affectedStops.length} affected stop${insight.affectedStops.length === 1 ? '' : 's'}`
      : 'Stop impacts pending';
  const impactDetails = insight.skippedStops.length
    ? insight.skippedStops.join('; ')
    : insight.affectedStops.length
      ? insight.affectedStops.join('; ')
      : 'Stop details have not been confirmed.';
  const affected = insight.closedRoads.length ? insight.closedRoads.join(', ') : location;
  const path = map.pathPending
    ? 'Diversion path pending. The map shows the affected area only.'
    : `Likely diversion: ${insight.likelyRoads.length ? insight.likelyRoads.join(', ') : 'see the solid route-colored line on the map'}.`;
  const confirmed = timeLabel(event.alertConfirmedAt || event.updatedAt || event.detectedAt);
  const mapTime = timeLabel(map.renderedAt);
  const subject = `Confirmed Barrie Transit detour | Route${event.sharedRouteIds.length > 1 ? 's' : ''} ${routes} | ${location}`;
  const summary = `Barrie Transit has confirmed a detour affecting Route${event.sharedRouteIds.length > 1 ? 's' : ''} ${routes} near ${location}.`;
  const text = [summary, '', 'See the attached street map.', '', `Affected section: ${affected}.`, path, stops,
    '', `Confirmed: ${confirmed}`, `Map prepared: ${mapTime}`, '', 'Map data © OpenStreetMap contributors © CARTO.'].join('\n');
  const eventRoutes = event.sharedRouteIds.length ? event.sharedRouteIds : [event.routeId || '?'];
  const routeBadges = eventRoutes.map((routeId) => {
    const color = getNoticeRouteColor(routeId, routeColors);
    return `<span style="display:inline-block;background:${color};color:${getNoticeRouteTextColor(color)};font-size:14px;font-weight:bold;padding:6px 10px;margin:0 5px 5px 0;border-radius:4px">Route ${html(routeId)}</span>`;
  }).join('');
  const body = [
    '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media screen and (max-width:700px){.notice-column{display:block!important;width:100%!important;box-sizing:border-box!important}.notice-side{padding:16px 0 0!important}.notice-title{font-size:28px!important}.notice-wrap{padding:0!important}.notice-header{padding:16px!important}.notice-logo{width:85px!important;font-size:16px!important}.notice-warning{display:none!important}}</style></head><body style="margin:0;padding:0;background:#eef2f5;font-family:Arial,sans-serif;color:#20242a">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5"><tr><td align="center" class="notice-wrap" style="padding:20px 10px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:860px;background:#ffffff;border-collapse:collapse">',
    '<tr><td class="notice-header" style="background:#104A78;padding:22px 25px;color:#ffffff">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="notice-logo" valign="middle" style="width:142px;font-size:22px;font-weight:800;line-height:0.95;color:#ffffff">Barrie<br>Transit</td><td valign="middle">',
    '<div class="notice-title" style="font-size:42px;font-weight:800;line-height:1.05;letter-spacing:0.3px;color:#ffffff">Detour Notice</div>',
    `<div style="font-size:15px;font-weight:bold;line-height:1.4;color:#ffffff;margin-top:5px">Confirmed route${eventRoutes.length > 1 ? 's' : ''} ${html(routes)} &nbsp;|&nbsp; ${html(location)}</div>`,
    '</td><td class="notice-warning" valign="top" align="right" style="width:30px;font-size:27px;font-weight:bold;color:#ffffff">!</td></tr></table></td></tr>',
    '<tr><td style="padding:18px 20px 8px">',
    `<div style="margin-bottom:8px">${routeBadges}</div>`,
    `<div style="font-size:18px;font-weight:bold;line-height:1.35">${html(location)}</div>`,
    `<div style="font-size:14px;line-height:1.5;color:#4f5d6b;margin-top:3px">${html(impactHeadline)}${impactDetails ? ` &middot; ${html(impactDetails)}` : ''}</div>`,
    '</td></tr>',
    '<tr><td style="padding:8px 20px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>',
    '<td class="notice-column" valign="top" width="63%" style="width:63%">',
    `<img src="cid:detour-map" alt="Street map of ${html(location)}${map.pathPending ? '; diversion path pending' : '; affected section and likely diversion'}" width="100%" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid #26313d;box-sizing:border-box;border-radius:5px" />`,
    '</td><td class="notice-column notice-side" valign="top" width="37%" style="width:37%;padding-left:16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #26313d;border-radius:5px;border-collapse:separate"><tr><td style="padding:12px 13px">',
    '<div style="font-size:12px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:#104A78">Current status</div>',
    '<div style="font-size:19px;line-height:1.35;font-weight:bold;margin-top:5px">Confirmed detour</div>',
    `<div style="font-size:13px;line-height:1.45;color:#4f5d6b;margin-top:6px">Confirmed ${html(confirmed)}<br>Active until normal service is confirmed.</div>`,
    '</td></tr></table>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #26313d;border-radius:5px;border-collapse:separate;margin-top:12px"><tr><td style="padding:12px 13px">',
    '<div style="font-size:18px;font-weight:bold;margin-bottom:8px">Details</div>',
    `<div style="font-size:13px;line-height:1.5"><strong>Affected:</strong> ${html(affected)}</div>`,
    `<div style="font-size:13px;line-height:1.5;margin-top:8px"><strong>Stops:</strong> ${html(stops)}</div>`,
    `<div style="font-size:13px;line-height:1.5;margin-top:8px"><strong>Routing:</strong> ${html(path)}</div>`,
    '</td></tr></table>',
    '</td></tr></table></td></tr>',
    `<tr><td style="border-top:1px solid #dce4eb;padding:13px 20px 18px;color:#5e6975;font-size:11px;line-height:1.5">Automated operations notice. Map prepared ${html(mapTime)}. Route colors from Barrie Transit GTFS where available. Map attached for forwarding. &copy; OpenStreetMap contributors &copy; CARTO.</td></tr>`,
    '</table></td></tr></table></body></html>',
  ].join('');
  return {
    subject, text, html: body,
    attachments: [{ filename: 'barrie-detour-map.jpg', content: map.buffer.toString('base64'), content_type: 'image/jpeg', content_id: 'detour-map' }],
  };
}

async function activeStillPresent(db, events) {
  const snapshots = await Promise.all(events.map((event) => db.collection(ACTIVE_COLLECTION).doc(event.eventId).get()));
  return snapshots.every((snapshot) => snapshot.exists && isConfirmedActive(snapshot.data()));
}

async function recordWaitingMap(db, ref, reason, nowMs) {
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data() || {};
    if (snapshot.exists && current.status !== 'waiting_map') return;
    tx.set(ref, { status: 'waiting_map', waitingSince: current.waitingSince || nowMs,
      lastMapAttemptAt: nowMs, mapWaitReason: String(reason).slice(0, 180) }, { merge: true });
  });
}

async function reserveSend(db, ref, message, event, nowMs) {
  let outcome = null;
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const record = snapshot.data() || {};
    if (snapshot.exists && !['waiting_map', 'sending'].includes(record.status)) {
      outcome = { reason: record.status || 'legacy-notification' }; return;
    }
    if (record.status === 'sending' && Number(record.leaseUntil) > nowMs) {
      outcome = { reason: 'send-in-progress' }; return;
    }
    if (record.status === 'sending' && nowMs - Number(record.preparedAt) >= IDEMPOTENCY_MS) {
      tx.set(ref, { status: 'delivery_unknown', deliveryUnknownAt: nowMs,
        failureMessage: 'Provider result was not recorded before idempotency window expired' }, { merge: true });
      outcome = { reason: 'delivery-unknown' }; return;
    }
    const payload = record.message || message;
    const preparedAt = record.preparedAt || nowMs;
    tx.set(ref, {
      status: 'sending', notificationId: ref.id, eventType: 'DETOUR_DETECTED',
      eventId: event.eventId, detourEventId: event.detourEventId,
      sharedDetourEventId: event.sharedDetourEventId || null,
      routeId: event.routeId || null, sharedRouteIds: event.sharedRouteIds,
      confirmedAt: millis(event.alertConfirmedAt) ?? millis(event.updatedAt),
      message: payload, preparedAt, leaseUntil: nowMs + LEASE_MS,
      attempts: Number(record.attempts || 0) + 1,
    }, { merge: true });
    outcome = { message: payload, preparedAt };
  });
  return outcome;
}

async function runDetourManagementBrief({
  env = process.env, db = getDb(), renderMap = renderDetourBriefMap,
  sendEmail = sendViaResend, getGtfsData = getStaticData, now = Date.now,
} = {}) {
  if (env.DETOUR_MANAGEMENT_BRIEF_ENABLED !== 'true') return { skipped: 'disabled' };
  const recipients = String(env.DETOUR_ALERT_RECIPIENT || '').trim();
  if (!recipients || recipients.includes(',')) throw new Error('Configure exactly one DETOUR_ALERT_RECIPIENT');
  if (!env.RESEND_API_KEY || !env.CARTO_BASEMAP_API_KEY || !env.DETOUR_ALERT_FROM) {
    throw new Error('Brief sender requires RESEND_API_KEY, CARTO_BASEMAP_API_KEY, and DETOUR_ALERT_FROM');
  }
  if (!db) throw new Error('Firestore is unavailable');
  const snapshot = await db.collection(ACTIVE_COLLECTION).get();
  const groups = groupActiveEvents(snapshot.docs || []);
  const result = { checked: groups.length, sent: 0, waitingMap: 0, skipped: 0, errors: [] };
  let gtfsData;
  for (const events of groups) {
    const identity = briefIdentity(events);
    const ref = db.collection(NOTIFICATION_COLLECTION).doc(makeNotificationId(identity));
    const existing = await ref.get();
    if (existing.exists && !['waiting_map', 'sending'].includes(existing.data()?.status)) { result.skipped++; continue; }
    if (!existing.exists && await findExistingNotificationForEvent(db, NOTIFICATION_COLLECTION, identity)) {
      result.skipped++; continue;
    }
    let message = existing.data()?.message;
    if (!message) {
      try {
        if (!gtfsData && getGtfsData) {
          try { gtfsData = await getGtfsData(); } catch (error) { console.warn('[detourManagementBrief] GTFS enrichment unavailable:', error.message); }
        }
        const map = await renderMap(events, { cartoKey: env.CARTO_BASEMAP_API_KEY, routeColors: gtfsData?.routeColors });
        message = buildBriefMessage(enrichEventStopNames(identity, gtfsData), map, gtfsData?.routeColors);
      } catch (error) {
        await recordWaitingMap(db, ref, error.message, now());
        result.waitingMap++;
        continue;
      }
    }
    if (!await activeStillPresent(db, events)) { result.skipped++; continue; }
    const reserved = await reserveSend(db, ref, message, identity, now());
    if (!reserved?.message) { result.skipped++; continue; }
    try {
      const provider = await sendEmail({
        apiKey: env.RESEND_API_KEY, from: env.DETOUR_ALERT_FROM,
        recipients: [recipients], message: reserved.message,
        idempotencyKey: `detour-brief-${ref.id}`,
      });
      const sentAt = now();
      await ref.set({ status: 'sent', sentAt, provider: 'resend',
        providerMessageId: provider?.id || null, message: null, leaseUntil: null,
        preparedToSentMs: sentAt - reserved.preparedAt,
      }, { merge: true });
      result.sent++;
    } catch (error) {
      await ref.set({ leaseUntil: 0, lastSendErrorAt: now(),
        failureMessage: String(error.message || error).slice(0, 500) }, { merge: true });
      result.errors.push({ notificationId: ref.id, reason: String(error.message || error) });
    }
  }
  return result;
}

module.exports = { buildBriefMessage, groupActiveEvents, isConfirmedActive, runDetourManagementBrief, reserveSend };
