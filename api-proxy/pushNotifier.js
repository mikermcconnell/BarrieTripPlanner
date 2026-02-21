const { getDb } = require('./firebaseAdmin');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

/**
 * Send push notifications for new transit news items.
 * Queries users with pushTokens, filters by route subscriptions,
 * and sends via Expo Push API.
 */
async function notifyUsersOfNews(newItems) {
  if (!newItems || newItems.length === 0) return;

  const db = getDb();
  if (!db) return;

  // Get all users with push tokens
  let usersSnapshot;
  try {
    usersSnapshot = await db
      .collection('users')
      .where('pushToken', '!=', null)
      .get();
  } catch (err) {
    console.error('[pushNotifier] Failed to query users:', err.message);
    return;
  }

  if (usersSnapshot.empty) {
    console.log('[pushNotifier] No users with push tokens');
    return;
  }

  for (const newsItem of newItems) {
    const messages = [];

    usersSnapshot.forEach((userDoc) => {
      const user = userDoc.data();
      if (!user.pushToken) return;

      // Route-based filtering:
      // If user has subscribedRoutes AND news has affectedRoutes,
      // only notify if there's overlap. Empty subscriptions = all news.
      const subscribedRoutes = user.subscribedRoutes || [];
      const affectedRoutes = newsItem.affectedRoutes || [];

      if (subscribedRoutes.length > 0 && affectedRoutes.length > 0) {
        const overlap = affectedRoutes.some((r) => subscribedRoutes.includes(r));
        if (!overlap) return;
      }

      messages.push({
        to: user.pushToken,
        sound: 'default',
        title: 'Transit News',
        body: newsItem.title,
        data: {
          type: 'transit_news',
          newsId: newsItem.id,
        },
        channelId: 'news',
      });
    });

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
