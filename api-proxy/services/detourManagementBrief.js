'use strict';

const { getDb } = require('../firebaseAdmin');
const { enrichEventStopNames, findExistingNotificationForEvent, makeNotificationId, sendViaResend } = require('./detourEmailMonitor');
const { getStaticData } = require('../gtfsLoader');
const { renderDetourBriefMap } = require('./detourBriefMap');
const { buildBriefMessage } = require('./detourBriefMessage');
const { prepareBriefDisplayEvent } = require('./detourBriefDisplay');

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

function briefIdentity(sourceEvents) {
  const events = sourceEvents.map(prepareBriefDisplayEvent);
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
