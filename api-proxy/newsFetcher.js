const crypto = require('crypto');

const NEWS_URL = 'https://www.myridebarrie.ca/News';

/**
 * Generate a stable ID from title + body so we can detect duplicates across fetches.
 */
function generateId(title, body) {
  return crypto.createHash('md5').update(`${title}|${body}`).digest('hex');
}

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
 * Fetch and parse news items from myridebarrie.ca/News.
 * Returns an array of { id, title, body, date, affectedRoutes, url }.
 *
 * Uses cheerio to parse the HTML. The page is built on Knockout.js
 * and may render "No News" when empty — we handle that gracefully.
 */
async function fetchNewsItems() {
  let cheerio;
  try {
    cheerio = require('cheerio');
  } catch {
    console.error('[newsFetcher] cheerio not installed — run npm install');
    return [];
  }

  let html;
  try {
    const res = await fetch(NEWS_URL, {
      headers: { 'User-Agent': 'BarrieTransitApp/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[newsFetcher] HTTP ${res.status} from ${NEWS_URL}`);
      return [];
    }
    html = await res.text();
  } catch (err) {
    console.error('[newsFetcher] Fetch failed:', err.message);
    return [];
  }

  const $ = cheerio.load(html);
  const items = [];

  // The page structure may vary — try common selectors for news articles.
  // TripSpark typically uses .news-item, .newsItem, article, or similar.
  const selectors = [
    '.news-item',
    '.newsItem',
    '.news-list-item',
    'article',
    '.panel',
    '[data-bind*="news"]',
  ];

  let elements = $([]);
  for (const sel of selectors) {
    elements = $(sel);
    if (elements.length > 0) break;
  }

  elements.each((_i, el) => {
    const $el = $(el);
    const title = ($el.find('h2, h3, h4, .title, .news-title').first().text() || '').trim();
    const body = ($el.find('.body, .content, .description, p').first().text() || '').trim();
    const dateText = ($el.find('.date, time, .news-date').first().text() || '').trim();

    if (!title && !body) return;

    const combinedText = `${title} ${body}`;
    const affectedRoutes = extractAffectedRoutes(combinedText);

    items.push({
      id: generateId(title, body),
      title: title || 'Untitled',
      body,
      date: dateText || null,
      affectedRoutes,
      url: NEWS_URL,
    });
  });

  return items;
}

module.exports = { fetchNewsItems, extractAffectedRoutes, generateId };
