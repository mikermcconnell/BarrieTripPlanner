const { runJsonTask } = require('./lib/ai/runJsonTask');

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];
}

function extractStopCodesFromText(text) {
  const input = String(text || '');
  const codes = [];
  const patterns = [
    /\bstops?\s*#?\s*(\d{1,5})\b/gi,
    /\bstops?\s+((?:\d{1,5}\s*(?:,|and|&)?\s*){1,8})\s+(?:will|are|is|to|also)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const matches = String(match[1] || '').match(/\d{1,5}/g) || [];
      codes.push(...matches);
    }
  }

  return uniqueStrings(codes);
}

function looksLikeStopClosure(text) {
  const input = String(text || '').toLowerCase();
  return /\bstops?\b/.test(input) && (
    /\bclosure\b/.test(input) ||
    /\bclosed\b/.test(input) ||
    /\bout[- ]of[- ]service\b/.test(input) ||
    /\bplaced out of service\b/.test(input)
  );
}

const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const MONTH_PATTERN = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept\\.?|Sep\\.?|Oct\\.?|Nov\\.?|Dec\\.?)';

function normalizeMonth(value) {
  return String(value || '').toLowerCase().replace('.', '');
}

function referenceYear(newsItem, now) {
  const published = Number(newsItem?.publishedAt);
  if (Number.isFinite(published)) return new Date(published).getFullYear();
  return now.getFullYear();
}

function parseMonthDate(match, fallbackYear, endOfDay = false) {
  if (!match) return null;
  const month = MONTHS[normalizeMonth(match[1])];
  const day = Number(match[2]);
  const year = match[3] ? Number(match[3]) : fallbackYear;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;

  const date = new Date(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function parseDateWindow(newsItem, now = new Date()) {
  const text = `${newsItem.title || ''}\n${newsItem.body || ''}`;
  const fallbackYear = referenceYear(newsItem, now);
  const datePattern = `${MONTH_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`;

  const fromTo = new RegExp(`\\bfrom\\s+(${datePattern})\\s+(?:to|until|through|-)\\s+(${datePattern})`, 'i').exec(text);
  if (fromTo) {
    return {
      startsAt: parseMonthDate([null, fromTo[2], fromTo[3], fromTo[4]], fallbackYear),
      endsAt: parseMonthDate([null, fromTo[6], fromTo[7], fromTo[8]], fallbackYear, true),
    };
  }

  const fromOpen = new RegExp(`\\bfrom\\s+(${datePattern})\\b`, 'i').exec(text);
  const beginningOpen = new RegExp(`\\bbeginning\\s+(${datePattern})\\b`, 'i').exec(text);
  const startsAt = parseMonthDate(fromOpen
    ? [null, fromOpen[2], fromOpen[3], fromOpen[4]]
    : beginningOpen
      ? [null, beginningOpen[2], beginningOpen[3], beginningOpen[4]]
      : null, fallbackYear);

  return { startsAt, endsAt: null };
}

function statusForDateWindow(window, now = new Date()) {
  const nowMs = now.getTime();
  if (Number.isFinite(window?.startsAt) && nowMs < window.startsAt) return 'upcoming';
  if (Number.isFinite(window?.endsAt) && nowMs > window.endsAt) return 'expired';
  return 'active';
}

function buildRuleStopClosures(newsItem) {
  const text = `${newsItem.title || ''}\n${newsItem.body || ''}`;
  if (!looksLikeStopClosure(text)) return [];

  return extractStopCodesFromText(text).map((stopCode) => ({
    stopCode,
    confidence: 'high',
    parser: 'rules',
    reason: 'Matched stop closure wording in MyRide news item.',
  }));
}

function validateAiPayload(payload) {
  const closures = Array.isArray(payload?.stopClosures) ? payload.stopClosures : [];
  return closures
    .map((item) => ({
      stopCode: String(item?.stopCode || '').trim(),
      confidence: ['high', 'medium', 'low'].includes(item?.confidence) ? item.confidence : 'low',
      reason: String(item?.reason || '').trim(),
    }))
    .filter((item) => /^\d{1,5}$/.test(item.stopCode));
}

async function buildAiStopClosures(newsItem) {
  const result = await runJsonTask({
    taskName: 'news-stop-closure-extraction',
    maxTokens: 500,
    temperature: 0,
    validate: validateAiPayload,
    messages: [
      {
        role: 'system',
        content: [
          'Extract only bus stop closures from Barrie Transit news.',
          'Return JSON only with this shape: {"stopClosures":[{"stopCode":"509","confidence":"high","reason":"..."}]}.',
          'Only include stops explicitly described as closed or out of service.',
          'Do not infer stops from routes, roads, or detours.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          title: newsItem.title,
          summary: newsItem.body,
          routes: newsItem.affectedRoutes || [],
        }),
      },
    ],
  });

  if (!result.ok) return [];
  return result.value.map((item) => ({ ...item, parser: 'local-ai' }));
}

function resolveStop(stopCode, stopIndex = {}) {
  const code = String(stopCode || '').trim();
  return stopIndex.stopsByCode?.get(code) || stopIndex.stopsById?.get(code) || null;
}

function buildMessage(newsItem, stop) {
  return `${stop?.name || `Stop ${stop?.code || ''}`} is reported closed or scheduled to close. Check the linked Barrie Transit news before travelling.`;
}

async function extractStopClosureImpacts(newsItems, stopIndex = {}, options = {}) {
  const impacts = [];
  const now = options.now ? new Date(options.now) : new Date();

  for (const newsItem of newsItems || []) {
    const ruleClosures = buildRuleStopClosures(newsItem);
    const aiClosures = ruleClosures.length > 0 ? [] : await buildAiStopClosures(newsItem);
    const closuresByCode = new Map();

    for (const closure of [...ruleClosures, ...aiClosures]) {
      if (!closuresByCode.has(closure.stopCode)) closuresByCode.set(closure.stopCode, closure);
    }

    const dateWindow = parseDateWindow(newsItem, now);
    const status = statusForDateWindow(dateWindow, now);

    for (const closure of closuresByCode.values()) {
      const stop = resolveStop(closure.stopCode, stopIndex);
      if (!stop) continue;

      const id = `stopClosure_${newsItem.id}_${stop.id}`;
      impacts.push({
        id,
        type: 'stop_closure',
        status,
        stopId: stop.id,
        stopCode: stop.code || closure.stopCode,
        stopName: stop.name || '',
        latitude: Number.isFinite(stop.latitude) ? stop.latitude : null,
        longitude: Number.isFinite(stop.longitude) ? stop.longitude : null,
        affectedRoutes: uniqueStrings(newsItem.affectedRoutes || []),
        source: newsItem.source || 'myridebarrie',
        sourceNewsId: newsItem.id,
        sourceTitle: newsItem.title,
        sourceUrl: newsItem.url,
        message: buildMessage(newsItem, stop),
        confidence: closure.confidence,
        parser: closure.parser,
        reason: closure.reason || null,
        publishedAt: newsItem.publishedAt || null,
        startsAt: dateWindow.startsAt,
        endsAt: dateWindow.endsAt,
      });
    }
  }

  return impacts;
}

module.exports = {
  extractStopCodesFromText,
  parseDateWindow,
  statusForDateWindow,
  buildRuleStopClosures,
  extractStopClosureImpacts,
};
