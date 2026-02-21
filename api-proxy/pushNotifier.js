const { getDb } = require('./firebaseAdmin');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;
const USER_PAGE_SIZE = 500;

async function loadUsersWithPushTokens(db) {
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
        pushToken: data.pushToken,
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

  return users;
}

function buildSubscriberIndex(users) {
  const index = new Map();
  const allNewsTokens = new Set();

  for (const user of users) {
    if (!user.pushToken) continue;
    const routeList = user.subscribedRoutes || [];
    if (routeList.length === 0) {
      allNewsTokens.add(user.pushToken);
      continue;
    }
    for (const routeId of routeList) {
      if (!index.has(routeId)) index.set(routeId, new Set());
      index.get(routeId).add(user.pushToken);
    }
  }

  return { allNewsTokens, index };
}

function resolveRecipients(newsItem, allNewsTokens, routeIndex) {
  const recipients = new Set(allNewsTokens);
  const affectedRoutes = Array.isArray(newsItem.affectedRoutes)
    ? newsItem.affectedRoutes.map((route) => String(route).toUpperCase())
    : [];

  // If no route scoping exists, notify all token-bearing users.
  if (affectedRoutes.length === 0) {
    for (const tokenSet of routeIndex.values()) {
      for (const token of tokenSet) recipients.add(token);
    }
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

  const { allNewsTokens, index: routeIndex } = buildSubscriberIndex(users);

  for (const newsItem of newItems) {
    const recipients = resolveRecipients(newsItem, allNewsTokens, routeIndex);
    const messages = [...recipients].map((token) => ({
      to: token,
      sound: 'default',
      title: 'Transit News',
      body: newsItem.title,
      data: {
        type: 'transit_news',
        newsId: newsItem.id,
      },
      channelId: 'news',
    }));

    if (messages.length === 0) continue;

    // Send in batches of 100 (Expo recommended)
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        });

        if (!res.ok) {
          console.error(`[pushNotifier] Expo API returned ${res.status}`);
        } else {
          console.log(`[pushNotifier] Sent ${batch.length} notifications for "${newsItem.title}"`);
        }
      } catch (err) {
        console.error('[pushNotifier] Failed to send batch:', err.message);
      }
    }
  }
}

module.exports = { notifyUsersOfNews };
