'use strict';

function normalizeRouteId(value) {
  return value == null ? '' : String(value).trim().toUpperCase();
}

function routeRoot(routeId) {
  return normalizeRouteId(routeId).match(/^\d+/)?.[0] || normalizeRouteId(routeId);
}

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textIncludesStopName(text, stopName) {
  const cleanStopName = normalizeText(stopName);
  if (!cleanStopName) return false;

  const lowerText = normalizeText(text).toLowerCase();
  const lowerStopName = cleanStopName.toLowerCase();
  if (lowerText.includes(lowerStopName)) return true;

  // MyRide often says "Barrie South GO Station" while GTFS says "Barrie South GO".
  if (/\bgo\b/i.test(cleanStopName)) {
    return lowerText.includes(`${lowerStopName} station`);
  }

  return false;
}

function noticeRoutes(newsItem) {
  return [...new Set((newsItem?.affectedRoutes || newsItem?.routes || [])
    .map(normalizeRouteId)
    .filter(Boolean))];
}

function noticeMatchesRoute(newsItem, routeId) {
  const route = normalizeRouteId(routeId);
  if (!route) return false;
  const routes = noticeRoutes(newsItem);
  if (routes.includes(route)) return true;

  const root = routeRoot(route);
  if (routes.some((noticeRoute) => routeRoot(noticeRoute) === root)) return true;

  const text = `${newsItem?.title || ''} ${newsItem?.body || ''}`;
  return new RegExp(`\\broute\\s+${root}\\b`, 'i').test(text);
}

function looksLikeDetourNotice(newsItem) {
  const text = `${newsItem?.title || ''} ${newsItem?.body || ''}`.toLowerCase();
  return /\bdetour\b/.test(text) || /\bclosure\b/.test(text);
}

function extractReplacementRoutes(newsItem, impactedRouteId) {
  const impactedRoot = routeRoot(impactedRouteId);
  const text = `${newsItem?.title || ''} ${newsItem?.body || ''}`;
  if (!/\bshuttle\b/i.test(text)) return [];

  const routes = new Set();
  const pattern = /\broute\s+(\d+[A-Za-z]?)\b/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const route = normalizeRouteId(match[1]);
    if (route && routeRoot(route) !== impactedRoot) {
      routes.add(route);
    }
  }
  return [...routes].sort();
}

function matchNewsToChange(change, newsItem) {
  const reasons = [];
  const text = `${newsItem?.title || ''} ${newsItem?.body || ''}`;

  if (noticeMatchesRoute(newsItem, change.routeId)) reasons.push('route_match');
  if (looksLikeDetourNotice(newsItem)) reasons.push('detour_notice');
  if ((change.removedStops || []).some((stop) => textIncludesStopName(text, stop.name))) {
    reasons.push('removed_stop_name_match');
  }
  if (/\bshuttle\b/i.test(text)) reasons.push('shuttle_notice');

  const required = reasons.includes('route_match') && reasons.includes('detour_notice');
  const corroborated = reasons.includes('removed_stop_name_match') || reasons.includes('shuttle_notice');
  return {
    matched: Boolean(required && corroborated),
    reasons,
  };
}

function buildSummary(change, replacementRoutes) {
  const removedMajorStop = (change.removedStops || []).find((stop) => stop.isMajor) ||
    (change.removedStops || [])[0];
  const routeLabel = `Route ${change.routeId}`;
  const stopText = removedMajorStop?.name
    ? ` no longer directly serves ${removedMajorStop.name}`
    : ' has a long-term routing change';
  const replacementText = replacementRoutes.length > 0
    ? ` Use Route ${replacementRoutes.join('/')} shuttle.`
    : '';
  return `${routeLabel}${stopText}.${replacementText}`.trim();
}

function buildCandidate(change, newsItem, match) {
  const replacementRoutes = extractReplacementRoutes(newsItem, change.routeId);
  const routeId = normalizeRouteId(change.routeId);
  return {
    id: `baseline-detour-${routeId.toLowerCase()}-${newsItem.id}`,
    type: 'baseline_detour',
    status: 'active',
    sourceType: 'official_gtfs_change',
    confidence: match.reasons.includes('removed_stop_name_match') ? 'high' : 'medium',
    routeId,
    routes: [routeId],
    replacementRoutes,
    title: normalizeText(newsItem.title) || `${routeId} service change`,
    summary: buildSummary(change, replacementRoutes),
    removedStops: change.removedStops || [],
    addedStops: change.addedStops || [],
    changeReasons: change.reasons || [],
    matchReasons: match.reasons,
    sourceNewsId: String(newsItem.id),
    sourceUrl: newsItem.url || newsItem.sourceUrl || null,
    sourcePublishedAt: newsItem.publishedAt || null,
  };
}

function buildOfficialBaselineImpactCandidates({ changes = [], newsItems = [] } = {}) {
  const candidates = [];

  for (const change of changes) {
    if (!change?.significant) continue;

    for (const newsItem of newsItems) {
      if (newsItem?.archivedAt != null) continue;
      const match = matchNewsToChange(change, newsItem);
      if (!match.matched) continue;
      candidates.push(buildCandidate(change, newsItem, match));
      break;
    }
  }

  return candidates;
}

module.exports = {
  buildOfficialBaselineImpactCandidates,
  matchNewsToChange,
};
