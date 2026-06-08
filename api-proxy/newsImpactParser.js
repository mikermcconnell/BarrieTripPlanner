const { runJsonTask } = require('./lib/ai/runJsonTask');

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];
}

function extractStopCodesFromText(text) {
  const input = String(text || '');
  const codes = [];
  const patterns = [
    /\bstops?\s+(.{0,220}?)(?=\b(?:will|are|is|to|also|closure|notice|out[- ]of[- ]service)\b|$)/gi,
    /\bstops?\s*#?\s*(\d{1,5})\b/gi,
    /\bstops?\s+((?:\d{1,5}\s*(?:,|and|&)?\s*){1,8})\s+(?:will|are|is|to|also)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const stopText = String(match[1] || '').replace(/\bRoutes?\s+\d+[A-Za-z]?\b/gi, '');
      const matches = stopText.match(/\d{1,5}/g) || [];
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
const SERVICE_TIME_ZONE = 'America/Toronto';

function normalizeMonth(value) {
  return String(value || '').toLowerCase().replace('.', '');
}

function referenceYear(newsItem, now) {
  const published = Number(newsItem?.publishedAt);
  if (Number.isFinite(published)) return new Date(published).getFullYear();
  return now.getFullYear();
}

function getTimeZoneOffsetMs(utcMs, timeZone = SERVICE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const millisecond = ((utcMs % 1000) + 1000) % 1000;
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
    millisecond
  );
  return zonedAsUtc - utcMs;
}

function zonedDateTimeMs(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  const utcGuess = Date.UTC(year, month, day, hour, minute, second, millisecond);
  const firstPass = utcGuess - getTimeZoneOffsetMs(utcGuess);
  return utcGuess - getTimeZoneOffsetMs(firstPass);
}

function parseMonthDate(match, fallbackYear, endOfDay = false) {
  if (!match) return null;
  const month = MONTHS[normalizeMonth(match[1])];
  const day = Number(match[2]);
  const year = match[3] ? Number(match[3]) : fallbackYear;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;

  const time = zonedDateTimeMs(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isFinite(time) ? time : null;
}

const WEEKDAY_PATTERN = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\s*,?\\s*';

function parseTimeParts(hourValue, minuteValue, periodValue) {
  let hour = Number(hourValue);
  const minute = minuteValue == null ? 0 : Number(minuteValue);
  const period = String(periodValue || '').toLowerCase().replace(/\./g, '');
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function parseMonthDateWithTime(monthValue, dayValue, yearValue, fallbackYear, timeParts, endOfDay = false) {
  const month = MONTHS[normalizeMonth(monthValue)];
  const day = Number(dayValue);
  const year = yearValue ? Number(yearValue) : fallbackYear;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) return null;

  const hour = timeParts?.hour ?? (endOfDay ? 23 : 0);
  const minute = timeParts?.minute ?? (endOfDay ? 59 : 0);
  const time = zonedDateTimeMs(year, month, day, hour, minute, endOfDay && !timeParts ? 59 : 0, endOfDay && !timeParts ? 999 : 0);
  return Number.isFinite(time) ? time : null;
}

function parseDateWindow(newsItem, now = new Date()) {
  const text = `${newsItem.title || ''}\n${newsItem.body || ''}`;
  const fallbackYear = referenceYear(newsItem, now);
  const datePattern = `${MONTH_PATTERN}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`;
  const timePattern = '(\\d{1,2})(?::(\\d{2}))?\\s*([ap]\\.?m\\.?)';

  const timedSingleDay = new RegExp(
    `\\bfrom\\s+${timePattern}\\s+(?:to|until|-)\\s+${timePattern}\\s+on\\s+(?:${WEEKDAY_PATTERN})?(${datePattern})\\b`,
    'i'
  ).exec(text);
  if (timedSingleDay) {
    const startTime = parseTimeParts(timedSingleDay[1], timedSingleDay[2], timedSingleDay[3]);
    const endTime = parseTimeParts(timedSingleDay[4], timedSingleDay[5], timedSingleDay[6]);
    const startsAt = parseMonthDateWithTime(timedSingleDay[8], timedSingleDay[9], timedSingleDay[10], fallbackYear, startTime);
    const endsAt = parseMonthDateWithTime(timedSingleDay[8], timedSingleDay[9], timedSingleDay[10], fallbackYear, endTime, true);
    if (startsAt != null || endsAt != null) {
      return { startsAt, endsAt };
    }
  }

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
  const onSingleDay = new RegExp(`\\bon\\s+(?:${WEEKDAY_PATTERN})?(${datePattern})\\b`, 'i').exec(text);
  if (onSingleDay) {
    return {
      startsAt: parseMonthDate([null, onSingleDay[2], onSingleDay[3], onSingleDay[4]], fallbackYear),
      endsAt: parseMonthDate([null, onSingleDay[2], onSingleDay[3], onSingleDay[4]], fallbackYear, true),
    };
  }

  const startsAt = parseMonthDate(fromOpen
    ? [null, fromOpen[2], fromOpen[3], fromOpen[4]]
    : beginningOpen
      ? [null, beginningOpen[2], beginningOpen[3], beginningOpen[4]]
      : null, fallbackYear);

  return {
    startsAt,
    endsAt: untilOnly ? parseMonthDate([null, untilOnly[2], untilOnly[3], untilOnly[4]], fallbackYear, true) : null,
  };
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

function normalizeStopCode(value) {
  return String(value || '').trim();
}

function extractNoticeLineStopCodes(line, pattern) {
  const match = pattern.exec(String(line || ''));
  if (!match) return [];
  const stopText = String(match[1] || '').trim();
  if (!/^\d/.test(stopText)) return [];
  const leadingCodes = stopText.match(
    /^\d{1,5}(?:\s*(?:\/|,|&|\+|\band\b)\s*\d{1,5})*/i
  );
  return uniqueStrings((leadingCodes?.[0].match(/\d{1,5}/g) || []).map(normalizeStopCode));
}

function buildNoticeStopImpactsFromText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const stopClosureCandidates = [];
  const temporaryStops = [];
  const seenClosure = new Set();
  const seenTemporary = new Set();
  const firstStopIndex = lines.findIndex((line) => /^stop\s+\d{1,5}\b/i.test(line));
  const firstLegendIndex = lines.findIndex((line) => /^legend$/i.test(line));
  const headingAt = (index, first, second) => (
    index >= 0 &&
    new RegExp(`^${first}$`, 'i').test(lines[index] || '') &&
    new RegExp(`^${second}$`, 'i').test(lines[index + 1] || '')
  );
  const isOutOfServiceStopsHeading = (index) => (
    /^out[- ]of[- ]service\s+stops$/i.test(lines[index] || '') ||
    headingAt(index, 'out[- ]of[- ]service', 'stops')
  );
  const isActiveStopsHeading = (index) => (
    /^active\s+stops$/i.test(lines[index] || '') ||
    headingAt(index, 'active', 'stops')
  );
  const isTemporaryStopsHeading = (index) => (
    /^temporary\s+stops$/i.test(lines[index] || '') ||
    headingAt(index, 'temporary', 'stops')
  );
  const firstOutOfServiceHeadingIndex = lines.findIndex((_line, index) => isOutOfServiceStopsHeading(index));
  const legendBeforeOutOfServiceHeading =
    firstLegendIndex >= 0 &&
    firstOutOfServiceHeadingIndex >= 0 &&
    firstLegendIndex < firstOutOfServiceHeadingIndex;
  const activeHeadingBeforeFirstStop =
    !legendBeforeOutOfServiceHeading &&
    firstOutOfServiceHeadingIndex >= 0 &&
    firstStopIndex > firstOutOfServiceHeadingIndex &&
    lines.some((_line, index) => (
      index > firstOutOfServiceHeadingIndex &&
      index < firstStopIndex &&
      isActiveStopsHeading(index)
    ));
  const shouldParseMapLabels = firstStopIndex >= 0 && !activeHeadingBeforeFirstStop;
  let section = activeHeadingBeforeFirstStop
    ? null
    : shouldParseMapLabels
      ? 'closure'
      : null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (legendBeforeOutOfServiceHeading && firstStopIndex >= 0 && index < firstStopIndex) {
      continue;
    }
    if (/^legend$/i.test(line)) {
      section = null;
      continue;
    }
    if (isOutOfServiceStopsHeading(index)) {
      section = activeHeadingBeforeFirstStop ? null : 'closure';
      continue;
    }
    if (isActiveStopsHeading(index)) {
      section = null;
      continue;
    }
    if (isTemporaryStopsHeading(index)) {
      section = 'temporary';
      continue;
    }

    const tempStopCodes = extractNoticeLineStopCodes(line, /^temp(?:orary)?\s+stop\s+(.+)$/i);
    if (tempStopCodes.length > 0) {
      if (section !== 'temporary' && !shouldParseMapLabels) continue;
      for (const stopCode of tempStopCodes) {
        if (!seenTemporary.has(stopCode)) {
          seenTemporary.add(stopCode);
          temporaryStops.push({
            stopCode,
            label: line,
            name: lines[index + 1] && !/^stop\b|^temp/i.test(lines[index + 1]) ? lines[index + 1] : '',
            source: 'official-notice',
          });
        }
      }
      continue;
    }

    const stopCodes = extractNoticeLineStopCodes(line, /^stop\s+(.+)$/i);
    if (stopCodes.length > 0) {
      if (section !== 'closure') continue;
      for (const stopCode of stopCodes) {
        if (!seenClosure.has(stopCode)) {
          seenClosure.add(stopCode);
          stopClosureCandidates.push({
            stopCode,
            label: line,
            name: lines[index + 1] && !/^stop\b|^temp/i.test(lines[index + 1]) ? lines[index + 1] : '',
            source: 'official-notice',
          });
        }
      }
    }
  }

  return {
    stopClosureCandidates,
    temporaryStops,
  };
}

function isLikelyRouteDetourNotice(newsItem) {
  const text = `${newsItem?.title || ''}\n${newsItem?.body || ''}`.toLowerCase();
  return text.includes('detour') && /\broute\s+\d+/i.test(text);
}

function extractPdfLinksFromHtml(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const pattern = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = pattern.exec(String(html || ''))) !== null) {
    try {
      const url = new URL(match[1], baseUrl).toString();
      if (!seen.has(url)) {
        seen.add(url);
        links.push(url);
      }
    } catch (_error) {
      // Ignore malformed notice links.
    }
  }
  return links.slice(0, 3);
}

async function extractPdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const document = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join('\n'));
  }
  return pages.join('\n');
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/pdf',
      'User-Agent': 'BarrieTransitApp/1.0',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchPdfText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/pdf',
      'User-Agent': 'BarrieTransitApp/1.0',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return extractPdfText(await response.arrayBuffer());
}

function resolveNoticeStop(stopInfo, stopIndex = {}) {
  const stopCode = normalizeStopCode(stopInfo?.stopCode);
  const resolved = resolveStop(stopCode, stopIndex);
  return {
    stopCode,
    stopId: resolved?.id || null,
    code: resolved?.code || stopCode,
    name: resolved?.name || stopInfo?.name || '',
    latitude: Number.isFinite(resolved?.latitude) ? resolved.latitude : null,
    longitude: Number.isFinite(resolved?.longitude) ? resolved.longitude : null,
    mappable: Boolean(resolved),
  };
}

async function buildOfficialNoticeStopImpacts(newsItem, stopIndex = {}, options = {}) {
  if (!isLikelyRouteDetourNotice(newsItem)) return [];
  const fetchImpl = options.fetchImpl || global.fetch;
  if (options.fetchOfficialNotices !== true || typeof fetchImpl !== 'function' || !newsItem?.url) return [];

  let html;
  try {
    html = await fetchText(newsItem.url, fetchImpl);
  } catch (error) {
    console.warn(`[newsImpactParser] Failed to fetch notice page ${newsItem.url}:`, error.message);
    return [];
  }

  const pdfLinks = extractPdfLinksFromHtml(html, newsItem.url);
  const impacts = [];
  const dateWindow = parseDateWindow(newsItem, options.now ? new Date(options.now) : new Date());
  const status = statusForDateWindow(dateWindow, options.now ? new Date(options.now) : new Date());

  for (const pdfUrl of pdfLinks) {
    let pdfText;
    try {
      pdfText = await fetchPdfText(pdfUrl, fetchImpl);
    } catch (error) {
      console.warn(`[newsImpactParser] Failed to fetch/parse notice PDF ${pdfUrl}:`, error.message);
      continue;
    }

    const parsed = buildNoticeStopImpactsFromText(pdfText);
    if (parsed.stopClosureCandidates.length === 0 && parsed.temporaryStops.length === 0) continue;

    impacts.push({
      id: `routeDetourStopImpacts_${newsItem.id}_${Math.abs(pdfUrl.split('').reduce(
        (hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0,
        0
      ))}`,
      type: 'route_detour_stop_impacts',
      status,
      affectedRoutes: uniqueStrings(newsItem.affectedRoutes || []),
      source: newsItem.source || 'myridebarrie',
      sourceNewsId: newsItem.id,
      sourceTitle: newsItem.title,
      sourceUrl: newsItem.url,
      officialNoticeUrl: pdfUrl,
      stopClosureCandidates: parsed.stopClosureCandidates.map((stop) => resolveNoticeStop(stop, stopIndex)),
      temporaryStops: parsed.temporaryStops.map((stop) => resolveNoticeStop(stop, stopIndex)),
      parser: 'official-pdf',
      confidence: 'high',
      reason: 'Parsed stop labels from linked official detour notice PDF.',
      publishedAt: newsItem.publishedAt || null,
      startsAt: dateWindow.startsAt,
      endsAt: dateWindow.endsAt,
    });
  }

  return impacts;
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

function buildUnmatchedStop(stopCode) {
  return {
    id: null,
    code: stopCode,
    name: '',
    latitude: null,
    longitude: null,
  };
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
      const resolvedStop = resolveStop(closure.stopCode, stopIndex);
      const stop = resolvedStop || buildUnmatchedStop(closure.stopCode);

      const id = resolvedStop
        ? `stopClosure_${newsItem.id}_${stop.id}`
        : `stopClosure_${newsItem.id}_unmatched_${closure.stopCode}`;
      impacts.push({
        id,
        type: 'stop_closure',
        status,
        stopId: resolvedStop ? stop.id : null,
        stopCode: stop.code || closure.stopCode,
        stopName: stop.name || '',
        latitude: Number.isFinite(stop.latitude) ? stop.latitude : null,
        longitude: Number.isFinite(stop.longitude) ? stop.longitude : null,
        mappable: Boolean(resolvedStop),
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

    impacts.push(...await buildOfficialNoticeStopImpacts(newsItem, stopIndex, options));
  }

  return impacts;
}

module.exports = {
  buildNoticeStopImpactsFromText,
  buildOfficialNoticeStopImpacts,
  extractStopCodesFromText,
  extractPdfLinksFromHtml,
  parseDateWindow,
  statusForDateWindow,
  buildRuleStopClosures,
  extractStopClosureImpacts,
};
