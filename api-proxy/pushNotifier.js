const { getDb } = require('./firebaseAdmin');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const BATCH_SIZE = 100;
const USER_PAGE_SIZE = 500;

async function loadUsersWithPushTokens(db) {
  let modernUsers = [];
  if (typeof db.collectionGroup === 'function' && typeof db.getAll === 'function') {
    const tokenDocs = [];
    let tokenQuery = db.collectionGroup('pushTokens').where('token', '!=', null).orderBy('token').limit(USER_PAGE_SIZE);
    while (true) {
      const snapshot = await tokenQuery.get();
      tokenDocs.push(...snapshot.docs);
      if (snapshot.size < USER_PAGE_SIZE) break;
      tokenQuery = db.collectionGroup('pushTokens').where('token', '!=', null).orderBy('token')
        .startAfter(snapshot.docs[snapshot.docs.length - 1]).limit(USER_PAGE_SIZE);
    }
    if (tokenDocs.length > 0) {
      const refsByUid = new Map(tokenDocs.map((tokenDoc) => {
        const userRef = tokenDoc.ref.parent.parent;
        return [userRef.id, userRef];
      }));
      const userSnapshots = [];
      const refs = [...refsByUid.values()];
      for (let index = 0; index < refs.length; index += USER_PAGE_SIZE) {
        userSnapshots.push(...await db.getAll(...refs.slice(index, index + USER_PAGE_SIZE)));
      }
      const dataByUid = new Map(userSnapshots.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data()]));
      modernUsers = tokenDocs.flatMap((tokenDoc) => {
        const uid = tokenDoc.ref.parent.parent.id;
        const user = dataByUid.get(uid);
        const token = tokenDoc.data()?.token;
        if (!user || !token) return [];
        return [{
          uid,
          deviceId: tokenDoc.id,
          pushToken: token,
          serviceAlertsEnabled: user.settings?.notifications?.serviceAlerts === true,
          transitNewsEnabled: user.settings?.notifications?.transitNews === true,
          subscribedRoutes: Array.isArray(user.subscribedRoutes)
            ? user.subscribedRoutes.map((route) => String(route).toUpperCase()) : [],
        }];
      });
    }
  }

  const users = [];
  let query = db
    .collection('users')
    .where('pushToken', '!=', null)
    .orderBy('pushToken')
    .limit(USER_PAGE_SIZE);

  while (true) {
    const snapshot = await query.get();
    if (snapshot.empty) break;

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.pushToken) return;
      users.push({
        uid: doc.id,
        pushToken: data.pushToken,
        serviceAlertsEnabled: data.settings?.notifications?.serviceAlerts === true,
        transitNewsEnabled: data.settings?.notifications?.transitNews === true,
        subscribedRoutes: Array.isArray(data.subscribedRoutes)
          ? data.subscribedRoutes.map((route) => String(route).toUpperCase())
          : [],
      });
    });

    if (snapshot.size < USER_PAGE_SIZE) break;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    query = db
      .collection('users')
      .where('pushToken', '!=', null)
      .orderBy('pushToken')
      .startAfter(lastDoc)
      .limit(USER_PAGE_SIZE);
  }

  const seenTokens = new Set();
  return [...modernUsers, ...users].filter((user) => {
    if (seenTokens.has(user.pushToken)) return false;
    seenTokens.add(user.pushToken);
    return true;
  });
}

function isExpoPushToken(token) {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(String(token || ''));
}

async function clearInvalidToken(db, uid, token, deviceId = null) {
  if (!db || !uid) return;
  if (deviceId) {
    const ref = db.collection('users').doc(uid).collection('pushTokens').doc(deviceId);
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists && snapshot.data()?.token === token) tx.delete(ref);
    });
    return;
  }
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists && snapshot.data()?.pushToken === token) {
      tx.update(ref, { pushToken: null, pushTokenInvalidatedAt: new Date() });
    }
  });
}

async function sendExpoPushMessages(entries, { db = getDb(), fetchImpl = fetch } = {}) {
  const valid = entries.filter((entry) => isExpoPushToken(entry.token));
  const invalid = entries.filter((entry) => !isExpoPushToken(entry.token));
  await Promise.allSettled(invalid.map((entry) => clearInvalidToken(db, entry.uid, entry.token, entry.deviceId)));
  const result = {
    attempted: entries.length,
    accepted: 0,
    failed: invalid.length,
    invalidated: invalid.length,
    outcomes: invalid.map((entry) => ({ uid: entry.uid, token: entry.token, status: 'invalid' })),
  };

  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((entry) => entry.message)),
      });
      if (!response.ok) {
        result.failed += batch.length;
        result.outcomes.push(...batch.map((entry) => ({ uid: entry.uid, token: entry.token, status: 'failed' })));
        continue;
      }
      const payload = await response.json();
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      for (let index = 0; index < batch.length; index += 1) {
        const ticket = tickets[index];
        if (ticket?.status === 'ok') {
          result.accepted += 1;
          result.outcomes.push({ uid: batch[index].uid, token: batch[index].token, status: 'accepted' });
          if (db && ticket.id) {
            try {
              await db.collection('pushNotificationReceipts').doc(ticket.id).set({
                status: 'pending', uid: batch[index].uid, deviceId: batch[index].deviceId || null,
                token: batch[index].token, createdAt: new Date(), updatedAt: new Date(),
              });
            } catch (error) {
              console.error('[pushNotifier] Failed to persist receipt ticket:', error.message);
            }
          }
        }
        else {
          result.failed += 1;
          result.outcomes.push({ uid: batch[index].uid, token: batch[index].token, status: 'failed' });
          if (ticket?.details?.error === 'DeviceNotRegistered') {
            await clearInvalidToken(db, batch[index].uid, batch[index].token, batch[index].deviceId).catch((error) => {
              console.error('[pushNotifier] Failed to invalidate token:', error.message);
            });
            result.invalidated += 1;
          }
        }
      }
    } catch (error) {
      result.failed += batch.length;
      result.outcomes.push(...batch.map((entry) => ({ uid: entry.uid, token: entry.token, status: 'failed' })));
      console.error('[pushNotifier] Expo request failed:', error.message);
    }
  }
  return result;
}

async function processPendingPushReceipts({ db = getDb(), fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (!db) return { checked: 0, delivered: 0, failed: 0, invalidated: 0 };
  const cutoff = new Date(nowMs - 15_000);
  const snapshot = await db.collection('pushNotificationReceipts')
    .where('status', '==', 'pending').where('createdAt', '<=', cutoff).limit(1000).get();
  if (snapshot.empty) return { checked: 0, delivered: 0, failed: 0, invalidated: 0 };
  const ids = snapshot.docs.map((doc) => doc.id);
  const response = await fetchImpl(EXPO_RECEIPTS_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error(`Expo receipts API returned ${response.status}`);
  const receipts = (await response.json())?.data || {};
  const summary = { checked: ids.length, delivered: 0, failed: 0, invalidated: 0 };
  await Promise.all(snapshot.docs.map(async (doc) => {
    const receipt = receipts[doc.id];
    const data = doc.data();
    if (!receipt) {
      const createdAtMs = data.createdAt?.toMillis?.() || new Date(data.createdAt || 0).getTime();
      const expired = Number.isFinite(createdAtMs) && nowMs - createdAtMs > 24 * 60 * 60 * 1000;
      await doc.ref.set(expired ? {
        status: 'expired', completedAt: new Date(nowMs), updatedAt: new Date(nowMs), token: null,
      } : {
        checkAttempts: Number(data.checkAttempts || 0) + 1, lastCheckedAt: new Date(nowMs), updatedAt: new Date(nowMs),
      }, { merge: true });
      if (expired) summary.failed += 1;
      return;
    }
    const delivered = receipt.status === 'ok';
    if (delivered) summary.delivered += 1;
    else summary.failed += 1;
    if (receipt?.details?.error === 'DeviceNotRegistered') {
      await clearInvalidToken(db, data.uid, data.token, data.deviceId);
      summary.invalidated += 1;
    }
    await doc.ref.set({
      status: delivered ? 'delivered' : 'failed',
      error: receipt?.details?.error || receipt?.message || null,
      completedAt: new Date(nowMs), updatedAt: new Date(nowMs), token: null,
    }, { merge: true });
  }));
  return summary;
}

async function pruneNotificationRecords(db = getDb(), nowMs = Date.now()) {
  if (!db) return 0;
  const cutoff = new Date(nowMs - 30 * 24 * 60 * 60 * 1000);
  const snapshot = await db.collection('pushNotificationReceipts')
    .where('completedAt', '<', cutoff).limit(500).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  return snapshot.size;
}

function buildSubscriberIndex(users) {
  const index = new Map();
  const allTransitNewsTokens = new Set();

  for (const user of users) {
    if (!user.pushToken || user.transitNewsEnabled !== true) continue;
    allTransitNewsTokens.add(user.pushToken);

    const routeList = user.subscribedRoutes || [];
    for (const routeId of routeList) {
      if (!index.has(routeId)) index.set(routeId, new Set());
      index.get(routeId).add(user.pushToken);
    }
  }

  return { allTransitNewsTokens, routeIndex: index };
}

function resolveRecipients(newsItem, subscriberIndex) {
  const recipients = new Set();
  const { allTransitNewsTokens = new Set(), routeIndex = new Map() } = subscriberIndex || {};
  const affectedRoutes = Array.isArray(newsItem.affectedRoutes)
    ? newsItem.affectedRoutes.map((route) => String(route).toUpperCase())
    : [];

  // Only true system-wide items are broad enough for a push to all opted-in users.
  if (newsItem.affectsAllRoutes === true) {
    for (const token of allTransitNewsTokens) recipients.add(token);
    return recipients;
  }

  // General news belongs in-app unless it is explicitly system-wide.
  if (affectedRoutes.length === 0) {
    return recipients;
  }

  for (const routeId of affectedRoutes) {
    const tokenSet = routeIndex.get(routeId);
    if (!tokenSet) continue;
    for (const token of tokenSet) recipients.add(token);
  }

  return recipients;
}

/**
 * Send push notifications for new transit news items.
 * Queries users with pushTokens, filters by route subscriptions,
 * and sends via Expo Push API.
 */
async function notifyUsersOfNews(newItems) {
  if (!newItems || newItems.length === 0) return;

  const db = getDb();
  if (!db) return;
  await processPendingPushReceipts({ db }).catch((error) => console.error('[pushNotifier] Receipt check failed:', error.message));
  await pruneNotificationRecords(db).catch((error) => console.error('[pushNotifier] Receipt cleanup failed:', error.message));

  // Get users with push tokens (paginated)
  let users;
  try {
    users = await loadUsersWithPushTokens(db);
  } catch (err) {
    console.error('[pushNotifier] Failed to query users:', err.message);
    return;
  }

  if (!users || users.length === 0) {
    console.log('[pushNotifier] No users with push tokens');
    return;
  }

  const subscriberIndex = buildSubscriberIndex(users);

  for (const newsItem of newItems) {
    const recipients = resolveRecipients(newsItem, subscriberIndex);
    const messages = users.filter((user) => recipients.has(user.pushToken)).map((user) => ({
      uid: user.uid,
      deviceId: user.deviceId,
      token: user.pushToken,
      message: { to: user.pushToken,
      sound: 'default',
      title: 'Transit News',
      body: newsItem.title,
      data: {
        type: 'transit_news',
        newsId: newsItem.id,
      },
      channelId: 'news' },
    }));

    if (messages.length === 0) continue;

    // Send in batches of 100 (Expo recommended)
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const result = await sendExpoPushMessages(batch, { db });
      console.log(`[pushNotifier] News push accepted=${result.accepted} failed=${result.failed}`);
    }
  }
}

module.exports = {
  notifyUsersOfNews,
  buildSubscriberIndex,
  resolveRecipients,
  loadUsersWithPushTokens,
  sendExpoPushMessages,
  isExpoPushToken,
  processPendingPushReceipts,
  pruneNotificationRecords,
};
