const { getDb } = require('./firebaseAdmin');
const { loadUsersWithPushTokens, sendExpoPushMessages, processPendingPushReceipts, pruneNotificationRecords } = require('./pushNotifier');
const { createHash } = require('crypto');

const DEDUPE_COLLECTION = 'detourPushNotifications';
const LEASE_MS = 5 * 60 * 1000;

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
    return { ref, terminalTokenHashes: Array.isArray(existing?.terminalTokenHashes) ? existing.terminalTokenHashes : [] };
  });
}

async function notifyUsersOfDetours(activeDetours, { db = getDb() } = {}) {
  if (!db) return { attempted: 0, accepted: 0, skipped: 0, failed: 0 };
  const summary = { attempted: 0, accepted: 0, skipped: 0, failed: 0 };
  summary.receipts = await processPendingPushReceipts({ db }).catch((error) => ({ error: error.message }));
  await pruneNotificationRecords(db).catch(() => {});
  await pruneDetourNotificationRecords(db).catch(() => {});
  const candidates = Object.entries(activeDetours || {}).filter(([, detour]) => isRiderNotifiable(detour));
  if (candidates.length === 0) return summary;
  const claimed = [];
  for (const [key, detour] of candidates) {
    const routeId = normalizeRouteId(detour.routeId || key);
    const claim = await claimNotification(db, notificationId(detour, routeId));
    if (claim) claimed.push({ detour, routeId, claim });
  }
  if (claimed.length === 0) return summary;
  const users = await loadUsersWithPushTokens(db);

  for (const { detour, routeId, claim } of claimed) {
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
        data: { type: 'detour_alert', routeId, eventId: detour.eventId || null },
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
    await claim.ref.set({
      status: result.failed === 0 ? 'delivered' : 'failed',
      attempted: result.attempted,
      accepted: result.accepted,
      failed: result.failed,
      terminalTokenHashes: [...terminalTokenHashes],
      completedAt: new Date(),
      leaseUntilMs: 0,
    }, { merge: true });
  }
  return summary;
}

async function pruneDetourNotificationRecords(db = getDb(), nowMs = Date.now()) {
  if (!db) return 0;
  const cutoff = new Date(nowMs - 30 * 24 * 60 * 60 * 1000);
  const snapshot = await db.collection(DEDUPE_COLLECTION).where('completedAt', '<', cutoff).limit(500).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  return snapshot.size;
}

module.exports = { notifyUsersOfDetours, resolveDetourRecipients, isRiderNotifiable, notificationId, claimNotification, tokenHash, pruneDetourNotificationRecords };
