const MONTHS = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const MONTH_PATTERN = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept\\.?|Sep\\.?|Oct\\.?|Nov\\.?|Dec\\.?)';

export const toNoticeTimestamp = (value) => {
  if (value == null) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatNoticeDate = (value) => {
  const timestamp = toNoticeTimestamp(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const getNoticeEndText = (notice, fallback = 'End date not listed') => {
  const formatted = formatNoticeDate(notice?.endsAt ?? notice?.endAt ?? notice?.until);
  return formatted ? `Expected end date: ${formatted}` : fallback;
};

export const getNoticeStartText = (notice, fallback = 'Start date not listed') => {
  const formatted = formatNoticeDate(notice?.startsAt ?? notice?.startAt ?? notice?.from);
  return formatted ? `Starts ${formatted}` : fallback;
};

const normalizeRoute = (value) => String(value || '').trim().toLowerCase();

export const looksLikeDetourNotice = (item) => {
  const text = `${item?.title || ''} ${item?.body || ''}`.toLowerCase();
  return /\bdetour\b/.test(text);
};

export const looksLikeStopClosureNotice = (item) => {
  const text = `${item?.title || ''} ${item?.body || ''}`.toLowerCase();
  return /\bstops?\b/.test(text) && /(closure|closed|out[- ]of[- ]service|placed out of service)/.test(text);
};

const normalizeMonth = (value) => String(value || '').toLowerCase().replace('.', '');

const parseMonthDate = (match, fallbackYear, endOfDay = false) => {
  if (!match) return null;
  const month = MONTHS[normalizeMonth(match[1])];
  const day = Number(match[2]);
  const year = match[3] ? Number(match[3]) : fallbackYear;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;
  const date = new Date(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
};

export const parseNoticeDateWindow = (item) => {
  const text = `${item?.title || ''}\n${item?.body || ''}`;
  const published = toNoticeTimestamp(item?.publishedAt);
  const fallbackYear = Number.isFinite(published) ? new Date(published).getFullYear() : new Date().getFullYear();
  const datePattern = `${MONTH_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`;

  const fromTo = new RegExp(`\\bfrom\\s+(${datePattern})\\s+(?:to|until|through|-)\\s+(${datePattern})`, 'i').exec(text);
  if (fromTo) {
    return {
      startsAt: parseMonthDate([null, fromTo[2], fromTo[3], fromTo[4]], fallbackYear),
      endsAt: parseMonthDate([null, fromTo[6], fromTo[7], fromTo[8]], fallbackYear, true),
    };
  }

  const untilOnly = new RegExp(`\\b(?:until|through|to)\\s+(${datePattern})\\b`, 'i').exec(text);
  const fromOpen = new RegExp(`\\bfrom\\s+(${datePattern})\\b`, 'i').exec(text);
  const beginningOpen = new RegExp(`\\bbeginning\\s+(${datePattern})\\b`, 'i').exec(text);
  const onSingleDay = new RegExp(`\\bon\\s+(${datePattern})\\b`, 'i').exec(text);
  if (onSingleDay) {
    return {
      startsAt: parseMonthDate([null, onSingleDay[2], onSingleDay[3], onSingleDay[4]], fallbackYear),
      endsAt: parseMonthDate([null, onSingleDay[2], onSingleDay[3], onSingleDay[4]], fallbackYear, true),
    };
  }

  const firstDate = untilOnly ? null : new RegExp(datePattern, 'i').exec(text);
  const chosen = fromOpen || beginningOpen || firstDate;
  return {
    startsAt: chosen ? parseMonthDate([null, chosen[2], chosen[3], chosen[4]], fallbackYear) : null,
    endsAt: untilOnly ? parseMonthDate([null, untilOnly[2], untilOnly[3], untilOnly[4]], fallbackYear, true) : null,
  };
};

export const noticeWindowStatus = (window, now = Date.now()) => {
  const nowMs = toNoticeTimestamp(now) ?? Date.now();
  if (Number.isFinite(window?.startsAt) && nowMs < window.startsAt) return 'upcoming';
  if (Number.isFinite(window?.endsAt) && nowMs > window.endsAt) return 'expired';
  return 'active';
};

export const findRouteDetourNotice = (routeId, transitNews = [], now = Date.now()) => {
  const routeKey = normalizeRoute(routeId);
  if (!routeKey) return null;

  return (transitNews || [])
    .map((item) => {
      const window = {
        ...parseNoticeDateWindow(item),
        startsAt: toNoticeTimestamp(item?.startsAt) ?? parseNoticeDateWindow(item).startsAt,
        endsAt: toNoticeTimestamp(item?.endsAt) ?? parseNoticeDateWindow(item).endsAt,
      };
      return { ...item, window, status: noticeWindowStatus(window, now) };
    })
    .find((item) => {
      if (item.archivedAt != null || item.status === 'expired' || !looksLikeDetourNotice(item)) return false;
      const routeMatch = (item.affectedRoutes || []).some((route) => normalizeRoute(route) === routeKey);
      const text = `${item.title || ''} ${item.body || ''}`.toLowerCase();
      return routeMatch || new RegExp(`\\broute\\s+${routeKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
    }) || null;
};
