const { getDb } = require('./firebaseAdmin');
const { loadUsersWithPushTokens, sendExpoPushMessages, processPendingPushReceipts, pruneNotificationRecords } = require('./pushNotifier');
const { createHash } = require('crypto');

const DEDUPE_COLLECTION = 'detourPushNotifications';
const LEASE_MS = 5 * 60 * 1000;
const RESTORATION_LEASE_MS = 5 * 60 * 1000;
const RESTORATION_CLEAR_REASONS = new Set([
  'normal-route-observed',
  'obsolete-shape-normal-route-observed',
]);

function normalizeRouteId(value) {
  return String(value || '').trim().toUpperCase();
}

function notificationId(detour, routeId) {
  const eventId = String(detour.eventId || detour.detourEventId || detour.detectedAt || routeId);
  return `${routeId}-${eventId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 500);
}

function tokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function isRiderNotifiable(detour) {
  return detour && detour.riderVisible !== false && detour.alertVisible !== false;
}

function resolveDetourRecipients(users, routeId) {
  const normalizedRouteId = normalizeRouteId(routeId);
  return users.filter((user) => (
    user.serviceAlertsEnabled === true &&
    user.subscribedRoutes.includes(normalizedRouteId)
  ));
}

async function claimNotification(db, id, nowMs = Date.now()) {
  const ref = db.collection(DEDUPE_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const existing = snapshot.exists ? snapshot.data() : null;
    const leaseUntilMs = existing?.leaseUntil?.toMillis?.() || Number(existing?.leaseUntilMs || 0);
    if (existing?.status === 'delivered' || (existing?.status === 'processing' && leaseUntilMs > nowMs)) {
      return null;
    }
    tx.set(ref, {
      status: 'processing',
      attempts: Number(existing?.attempts || 0) + 1,
      leaseUntilMs: nowMs + LEASE_MS,
      updatedAt: new Date(nowMs),
    }, { merge: true });
    return {
      ref,
      terminalTokenHashes: Array.isArray(existing?.terminalTokenHashes) ? existing.terminalTokenHashes : [],
      notifiedDevices: Array.isArray(existing?.notifiedDevices) ? existing.notifiedDevices : [],
    };
  });
}

function notifiedDeviceKey(device) {
  return `${device?.uid || ''}|${device?.deviceId || ''}|${device?.tokenHash || ''}`;
}

function mergeNotifiedDevices(existingDevices, recipients, outcomes) {
  const acceptedTokens = new Set((outcomes || [])
    .filter((outcome) => outcome.status === 'accepted')
    .map((outcome) => outcome.token));
  const devices = new Map((existingDevices || []).map((device) => [notifiedDeviceKey(device), device]));
  for (const recipient of recipients || []) {
    if (!acceptedTokens.has(recipient.pushToken)) continue;
    const device = {
      uid: recipient.uid,
      deviceId: recipient.deviceId || null,
      tokenHash: tokenHash(recipient.pushToken),
    };
    devices.set(notifiedDeviceKey(device), device);
  }
  return [...devices.values()];
}

async function notifyUsersOfDetours(activeDetours, { db = getDb() } = {}) {
  if (!db) return { attempted: 0, accepted: 0, skipped: 0, failed: 0 };
  const summary = { attempted: 0, accepted: 0, skipped: 0, failed: 0 };
  const candidates = Object.entries(activeDetours || {}).filter(([, detour]) => isRiderNotifiable(detour));
  const activeNotificationIds = candidates.map(([key, detour]) => {
    const routeId = normalizeRouteId(detour.routeId || key);
    const eventId = detour.eventId || detour.detourEventId || key;
    return notificationId({ ...detour, eventId }, routeId);
  });
  summary.receipts = await processPendingPushReceipts({ db }).catch((error) => ({ error: error.message }));
  await pruneNotificationRecords(db).catch(() => {});
  await pruneDetourNotificationRecords(db, Date.now(), activeNotificationIds).catch(() => {});
  if (candidates.length === 0) return summary;
  const claimed = [];
  for (const [key, detour] of candidates) {
    const routeId = normalizeRouteId(detour.routeId || key);
    const eventId = detour.eventId || detour.detourEventId || key;
    const claim = await claimNotification(db, notificationId({ ...detour, eventId }, routeId));
    if (claim) claimed.push({ detour, routeId, eventId, claim });
  }
  if (claimed.length === 0) return summary;
  const users = await loadUsersWithPushTokens(db);

  for (const { detour, routeId, eventId, claim } of claimed) {
    const recipients = resolveDetourRecipients(users, routeId);
    if (recipients.length === 0) {
      await claim.ref.set({ status: 'delivered', leaseUntilMs: 0, completedAt: new Date() }, { merge: true });
      continue;
    }
    const terminalTokenHashes = new Set(claim.terminalTokenHashes);
    const pendingRecipients = recipients.filter((user) => !terminalTokenHashes.has(tokenHash(user.pushToken)));
    if (pendingRecipients.length === 0) {
      await claim.ref.set({ status: 'delivered', leaseUntilMs: 0, completedAt: new Date() }, { merge: true });
      summary.skipped += recipients.length;
      continue;
    }

    const messages = pendingRecipients.map((user) => ({
      uid: user.uid,
      deviceId: user.deviceId,
      token: user.pushToken,
      message: {
        to: user.pushToken,
        sound: 'default',
        title: `Route ${routeId} Detour`,
        body: `Route ${routeId} is on detour — stops may be affected.`,
        data: { type: 'detour_alert', routeId, eventId },
        channelId: 'alerts',
      },
    }));
    summary.attempted += messages.length;
    const result = await sendExpoPushMessages(messages, { db });
    summary.accepted += result.accepted;
    summary.failed += result.failed;
    for (const outcome of result.outcomes) {
      if (outcome.status === 'accepted' || outcome.status === 'invalid') {
        terminalTokenHashes.add(tokenHash(outcome.token));
      }
    }
    const notifiedDevices = mergeNotifiedDevices(claim.notifiedDevices, pendingRecipients, result.outcomes);
    await claim.ref.set({
      status: result.failed === 0 ? 'delivered' : 'failed',
      attempted: result.attempted,
      accepted: result.accepted,
      failed: result.failed,
      terminalTokenHashes: [...terminalTokenHashes],
      notifiedDevices,
      routeId,
      eventId,
      completedAt: new Date(),
      leaseUntilMs: 0,
    }, { merge: true });
  }
  return summary;
}

function isServiceRestoration(event) {
  return event?.eventType === 'DETOUR_CLEARED' &&
    RESTORATION_CLEAR_REASONS.has(String(event?.clearReason || '')) &&
    event?.clearProof?.evidenceType === 'normal-route-gps';
}

function resolveRestorationRecipients(users, notifiedDevices, terminalTokenHashes = []) {
  const terminal = new Set(terminalTokenHashes);
  const original = new Set((notifiedDevices || []).map(notifiedDeviceKey));
  return (users || []).filter((user) => {
    if (user.serviceAlertsEnabled !== true) return false;
    const hashedToken = tokenHash(user.pushToken);
    if (terminal.has(hashedToken)) return false;
    return original.has(notifiedDeviceKey({
      uid: user.uid,
      deviceId: user.deviceId || null,
      tokenHash: hashedToken,
    }));
  });
}

async function registerServiceRestorationEvents(db, events, nowMs = Date.now()) {
  let registered = 0;
  for (const event of (events || []).filter(isServiceRestoration)) {
    const routeId = normalizeRouteId(event.routeId);
    const ref = db.collection(DEDUPE_COLLECTION).doc(notificationId(event, routeId));
    const didRegister = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return false;
      const existing = snapshot.data() || {};
      if (!Array.isArray(existing.notifiedDevices) || existing.notifiedDevices.length === 0) return false;
      if (existing.restorationStatus === 'delivered') return false;
      tx.set(ref, {
        restorationStatus: 'pending',
        restorationRouteId: routeId,
        restorationEventId: event.eventId || event.detourEventId || null,
        restorationClearReason: event.clearReason,
        restorationClearProof: event.clearProof,
        restorationClearedAt: new Date(event.clearedAt || event.occurredAt || nowMs),
        restorationUpdatedAt: new Date(nowMs),
      }, { merge: true });
      return true;
    });
    if (didRegister) registered += 1;
  }
  return registered;
}

async function claimRestoration(db, doc, nowMs = Date.now()) {
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(doc.ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data() || {};
    const leaseUntilMs = Number(data.restorationLeaseUntilMs || 0);
    if (data.restorationStatus === 'delivered' || (
      data.restorationStatus === 'processing' && leaseUntilMs > nowMs
    )) return null;
    tx.set(doc.ref, {
      restorationStatus: 'processing',
      restorationAttempts: Number(data.restorationAttempts || 0) + 1,
      restorationLeaseUntilMs: nowMs + RESTORATION_LEASE_MS,
      restorationUpdatedAt: new Date(nowMs),
    }, { merge: true });
    return data;
  });
}

async function notifyUsersOfServiceRestorations(events = [], { db = getDb(), nowMs = Date.now() } = {}) {
  const summary = { attempted: 0, accepted: 0, skipped: 0, failed: 0, registered: 0 };
  if (!db) return summary;
  summary.registered = await registerServiceRestorationEvents(db, events, nowMs);

  const snapshot = await db.collection(DEDUPE_COLLECTION)
    .where('restorationStatus', 'in', ['pending', 'processing', 'failed'])
    .limit(100)
    .get();
  if (snapshot.empty) return summary;
  const users = await loadUsersWithPushTokens(db);

  for (const doc of snapshot.docs) {
    const claim = await claimRestoration(db, doc, nowMs);
    if (!claim) {
      summary.skipped += 1;
      continue;
    }
    const terminalTokenHashes = new Set(claim.restorationTerminalTokenHashes || []);
    const recipients = resolveRestorationRecipients(users, claim.notifiedDevices, [...terminalTokenHashes]);
    const routeId = normalizeRouteId(claim.restorationRouteId || claim.routeId);
    const messages = recipients.map((user) => ({
      uid: user.uid,
      deviceId: user.deviceId,
      token: user.pushToken,
      message: {
        to: user.pushToken,
        sound: 'default',
        title: `Route ${routeId} service restored`,
        body: `Route ${routeId} has returned to regular routing.`,
        data: {
          type: 'service_restored',
          routeId,
          eventId: claim.restorationEventId || null,
        },
        channelId: 'alerts',
      },
    }));
    const result = messages.length > 0
      ? await sendExpoPushMessages(messages, { db })
      : { attempted: 0, accepted: 0, failed: 0, outcomes: [] };
    summary.attempted += result.attempted;
    summary.accepted += result.accepted;
    summary.failed += result.failed;
    for (const outcome of result.outcomes) {
      if (outcome.status === 'accepted' || outcome.status === 'invalid') {
        terminalTokenHashes.add(tokenHash(outcome.token));
      }
    }
    await doc.ref.set({
      restorationStatus: result.failed === 0 ? 'delivered' : 'failed',
      restorationAttempted: result.attempted,
      restorationAccepted: result.accepted,
      restorationFailed: result.failed,
      restorationTerminalTokenHashes: [...terminalTokenHashes],
      restorationCompletedAt: new Date(nowMs),
      restorationLeaseUntilMs: 0,
      restorationUpdatedAt: new Date(nowMs),
    }, { merge: true });
  }
  return summary;
}

async function pruneDetourNotificationRecords(db = getDb(), nowMs = Date.now(), activeNotificationIds = []) {
  if (!db) return 0;
  const cutoff = new Date(nowMs - 30 * 24 * 60 * 60 * 1000);
  const cutoffMs = cutoff.getTime();
  const activeIds = new Set(activeNotificationIds);
  const snapshot = await db.collection(DEDUPE_COLLECTION).where('completedAt', '<', cutoff).limit(500).get();
  const deletable = snapshot.docs.filter((doc) => {
    if (activeIds.has(doc.id)) return false;
    const data = doc.data() || {};
    if (['pending', 'processing', 'failed'].includes(data.restorationStatus)) return false;
    const restorationCompletedAt = data.restorationCompletedAt?.toMillis?.()
      || new Date(data.restorationCompletedAt || 0).getTime();
    return !Number.isFinite(restorationCompletedAt) || restorationCompletedAt < cutoffMs;
  });
  await Promise.all(deletable.map((doc) => doc.ref.delete()));
  return deletable.length;
}

module.exports = {
  notifyUsersOfDetours,
  notifyUsersOfServiceRestorations,
  resolveDetourRecipients,
  resolveRestorationRecipients,
  isRiderNotifiable,
  isServiceRestoration,
  notificationId,
  claimNotification,
  registerServiceRestorationEvents,
  mergeNotifiedDevices,
  tokenHash,
  pruneDetourNotificationRecords,
};
