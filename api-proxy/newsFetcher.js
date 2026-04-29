const NEWS_PAGE_URL = 'https://www.myridebarrie.ca/News';
const NEWS_API_URL = 'https://www.myridebarrie.ca/News/GetAllNews';

/**
 * Extract route references like "Route 8", "Route 1A" from text.
 */
function extractAffectedRoutes(text) {
  const pattern = /\bRoute\s+(\d+[A-Za-z]?)\b/gi;
  const routes = new Set();
  let match;
  while ((match = pattern.exec(text)) !== null) {
    routes.add(match[1].toUpperCase());
  }
  return [...routes];
}

/**
 * Normalize one MyRide /News/GetAllNews item into the app's Firestore shape.
 */
function normalizeMyRideNewsItem(item) {
  if (!item || item.newsId == null) return null;

  const title = String(item.title || '').trim();
  const body = String(item.summary || '').trim();
  if (!title && !body) return null;

  const routes = Array.isArray(item.routes)
    ? item.routes.map((route) => String(route).trim().toUpperCase()).filter(Boolean)
    : extractAffectedRoutes(`${title} ${body}`);

  const publishedAtMs = item.publishDateUtc
    ? Date.parse(item.publishDateUtc)
    : NaN;
  const friendlyUrl = String(item.friendlyUrl || '').trim();
  const url = friendlyUrl
    ? `${NEWS_PAGE_URL}/${encodeURIComponent(item.newsId)}/${encodeURIComponent(friendlyUrl)}/`
    : NEWS_PAGE_URL;

  return {
    id: String(item.newsId),
    title: title || 'Transit News',
    body,
    date: item.publishDateUtc || null,
    affectedRoutes: item.affectsAllRoutes ? [] : routes,
    affectsAllRoutes: Boolean(item.affectsAllRoutes),
    url,
    publishedAt: Number.isFinite(publishedAtMs) ? publishedAtMs : null,
    source: 'myridebarrie',
    sourceUrl: NEWS_API_URL,
  };
}

/**
 * Fetch news items from MyRide's public JSON endpoint.
 * Returns an array of { id, title, body, date, affectedRoutes, url, publishedAt }.
 */
async function fetchNewsItems() {
  let res;
  try {
    res = await fetch(NEWS_API_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BarrieTransitApp/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error('[newsFetcher] Fetch failed:', err.message);
    return [];
  }

  if (!res.ok) {
    console.error(`[newsFetcher] HTTP ${res.status} from ${NEWS_API_URL}`);
    return [];
  }

  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    console.error('[newsFetcher] Invalid JSON:', err.message);
    return [];
  }

  if (!Array.isArray(payload)) {
    console.error('[newsFetcher] Unexpected news response shape');
    return [];
  }

  return payload.map(normalizeMyRideNewsItem).filter(Boolean);
}

module.exports = {
  fetchNewsItems,
  extractAffectedRoutes,
  normalizeMyRideNewsItem,
  NEWS_API_URL,
  NEWS_PAGE_URL,
};
