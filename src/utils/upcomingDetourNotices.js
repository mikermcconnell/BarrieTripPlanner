import {
  formatNoticeDate,
  looksLikeDetourNotice,
  looksLikeStopClosureNotice,
  noticeWindowStatus,
  parseNoticeDateWindow,
  toNoticeTimestamp,
} from './noticeTimingUtils';

const ROUTE_DIRECTION_SUFFIX = /-(?:NB|SB|EB|WB)$/i;

const cleanText = (value) => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeRoute = (value) => String(value || '')
  .trim()
  .replace(ROUTE_DIRECTION_SUFFIX, '')
  .replace(/[^\dA-Za-z]/g, '')
  .toUpperCase();

const unique = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalizeRoute(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const extractDetourNoticeRoutes = (item) => {
  const explicit = unique(item?.affectedRoutes || item?.routes || []);
  if (explicit.length > 0) return explicit.map(normalizeRoute);

  const text = item?.title || item?.body || '';
  const routeChunk = /\broutes?\s+([A-Za-z0-9,\s/&-]+)/i.exec(text)?.[1] || '';
  if (!routeChunk) return [];

  return unique(
    routeChunk
      .replace(/\band\b/gi, ',')
      .replace(/&/g, ',')
      .split(/[,\s/]+/)
      .map(normalizeRoute)
      .filter((route) => /^[0-9]{1,3}[A-Z]?$/.test(route))
  );
};

export const getDetourNoticeLocationText = (item) => {
  const direct = cleanText(item?.locationText || item?.location || item?.locationDescription);
  if (direct) return direct;

  const body = cleanText(item?.body);
  if (!body) return null;

  const candidates = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanText)
    .filter(Boolean);

  const locationSentence = candidates.find((sentence) => (
    /\b(?:closed|closure|detour|between|from|on|at|around|along)\b/i.test(sentence) &&
    /\b(?:road|rd|street|st|avenue|ave|drive|dr|boulevard|blvd|lane|ln|crescent|cres|highway|hwy|downtown|lakeshore)\b/i.test(sentence)
  ));

  if (!locationSentence) return null;
  return locationSentence.length > 140 ? `${locationSentence.slice(0, 137).trim()}...` : locationSentence;
};

export const normalizeDetourNotice = (item, now = Date.now()) => {
  const parsedWindow = parseNoticeDateWindow(item);
  const window = {
    startsAt: toNoticeTimestamp(item?.startsAt) ?? parsedWindow.startsAt,
    endsAt: toNoticeTimestamp(item?.endsAt) ?? parsedWindow.endsAt,
  };
  const routes = extractDetourNoticeRoutes(item);

  return {
    ...item,
    id: item?.id ?? item?.newsId ?? item?.url ?? item?.title,
    routes,
    affectedRoutes: routes.length > 0 ? routes : (item?.affectedRoutes || []),
    window,
    status: noticeWindowStatus(window, now),
    startsText: formatNoticeDate(window.startsAt),
    endsText: formatNoticeDate(window.endsAt),
    locationText: getDetourNoticeLocationText(item),
  };
};

export const getUpcomingDetourNotices = (transitNews = [], now = Date.now()) => (
  (transitNews || [])
    .filter((item) => (
      item?.archivedAt == null &&
      looksLikeDetourNotice(item) &&
      !looksLikeStopClosureNotice(item)
    ))
    .map((item) => normalizeDetourNotice(item, now))
    .filter((item) => item.status === 'upcoming')
    .sort((a, b) => {
      const aStart = Number.isFinite(a.window?.startsAt) ? a.window.startsAt : Number.POSITIVE_INFINITY;
      const bStart = Number.isFinite(b.window?.startsAt) ? b.window.startsAt : Number.POSITIVE_INFINITY;
      return aStart - bStart;
    })
);
