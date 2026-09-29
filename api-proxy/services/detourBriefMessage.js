'use strict';

const { buildDetourEmailInsights, classifyDetourStopImpacts } = require('./detourEmailMonitor');
const { getNoticeRouteColor, getNoticeRouteTextColor } = require('./detourNoticeStyle');
const { prepareBriefDisplayEvent } = require('./detourBriefDisplay');

const FONT = 'font-family:Arial,Helvetica,sans-serif';
const WIDTH = 800;
const MAP_WIDTH = WIDTH - 48;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function timestamp(value) {
  if (value == null || value === '') return null;
  const ms = typeof value?.toMillis === 'function' ? value.toMillis()
    : value instanceof Date ? value.getTime()
      : typeof value === 'number' ? value
        : Number.isFinite(value?._seconds) ? value._seconds * 1000
          : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function timeLabel(value) {
  const ms = timestamp(value);
  return ms == null ? 'Time unavailable' : new Date(ms).toLocaleString('en-CA', {
    timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
}

function stripTrailingRoadCount(value) {
  return String(value || '').replace(/\s+\+\d+\s*$/, '').trim();
}

function collectDirectionSteps(event, insight) {
  const topLevel = Array.isArray(event.likelyDetourDirections) ? event.likelyDetourDirections : [];
  const segmented = (Array.isArray(event.segments) ? event.segments : [])
    .flatMap((segment) => Array.isArray(segment?.likelyDetourDirections) ? segment.likelyDetourDirections : []);
  const source = topLevel.length ? topLevel : segmented;
  if (source.length) return source.filter((step) => String(step?.roadName || step?.name || '').trim());
  return insight.likelyRoads.map((roadName) => ({
    roadName, maneuverType: '', modifier: '', turnDetailsUnavailable: true,
  }));
}

function formatDirectionSteps(steps) {
  const normalized = steps.map((step) => ({
    ...step,
    roadName: String(step.roadName || step.name || '').trim(),
  })).filter((step) => step.roadName);
  if (normalized.length && normalized.every((step) => step.turnDetailsUnavailable)) {
    return normalized.filter((step, index) => index === 0 ||
      step.roadName.toLowerCase() !== normalized[index - 1].roadName.toLowerCase())
      .map((step, index) => index === 0 ? `Begin on ${step.roadName}.` : `Then follow ${step.roadName}.`);
  }
  const rows = [];
  for (let index = 0; index < normalized.length; index++) {
    const step = normalized[index];
    const roadName = step.roadName;
    if (index > 0 && roadName.toLowerCase() === normalized[index - 1].roadName.toLowerCase()) continue;
    if (index === 0) {
      rows.push(`Start on ${roadName}.`);
      continue;
    }
    const previousRoad = [...normalized.slice(0, index)].reverse()
      .map((previous) => previous.roadName)
      .find((name) => name.toLowerCase() !== roadName.toLowerCase());
    const maneuverType = String(step.maneuverType || step.type || '').toLowerCase();
    const modifier = String(step.modifier || '').toLowerCase();
    const turn = ({
      left: 'turn left', right: 'turn right',
      'slight left': 'bear left', 'slight right': 'bear right',
      'sharp left': 'turn sharply left', 'sharp right': 'turn sharply right',
      straight: 'continue straight', uturn: 'make a U-turn',
    })[modifier];
    if (maneuverType === 'roundabout' || maneuverType === 'rotary') {
      rows.push(`From ${previousRoad || 'this road'}, take the roundabout onto ${roadName}.`);
    } else if (maneuverType === 'merge') {
      rows.push(`From ${previousRoad || 'this road'}, merge onto ${roadName}.`);
    } else if (turn) {
      rows.push(`From ${previousRoad || 'this road'}, ${turn} onto ${roadName}.`);
    } else if (maneuverType === 'fork') {
      rows.push(`At the fork, continue onto ${roadName}.`);
    } else if (maneuverType === 'turn' || maneuverType === 'end of road') {
      rows.push(`Turn onto ${roadName}.`);
    } else {
      rows.push(`Continue onto ${roadName}.`);
    }
  }
  return rows;
}

const STOP_CLASSIFICATIONS = [
  ['not-served', 'Not served (skipped by this route)'],
  ['served-on-detour', 'Served on the detour'],
  ['served-on-regular-route', 'Served on the regular route'],
  ['detour-boundary', 'Served at detour boundaries'],
  ['service-uncertain', 'Service status uncertain'],
  ['impact-unconfirmed', 'Impact not confirmed'],
];

function formatStopImpact(stop) {
  const name = String(stop.name || '').trim() || 'Stop name unavailable';
  const code = String(stop.code || '').trim();
  return `${name}${code ? ` (#${code})` : ''}`;
}

function buildBriefMessage(sourceEvent, map, routeColors, { preview = false, clearance = null } = {}) {
  const event = prepareBriefDisplayEvent(sourceEvent);
  const isClearance = Boolean(clearance);
  const insight = buildDetourEmailInsights(event);
  const eventRoutes = [...new Set((Array.isArray(event.sharedRouteIds) && event.sharedRouteIds.length
    ? event.sharedRouteIds : [event.routeId || 'Unknown']).map(String))];
  const routes = eventRoutes.join(', ');
  const routeLabel = `Route${eventRoutes.length > 1 ? 's' : ''} ${routes}`;
  const shortRouteLabel = routes || 'Route being confirmed';
  const location = stripTrailingRoadCount(event.eventLocationLabel || insight.bestLocationTitle || 'Location being confirmed');
  const affected = insight.closedRoads.length ? insight.closedRoads.join(', ') : location;
  const stopImpacts = isClearance ? [] : classifyDetourStopImpacts(event);
  const directionSteps = isClearance ? [] : formatDirectionSteps(collectDirectionSteps(event, insight));
  const turnDetailsAvailable = !isClearance && directionSteps.length > 0 &&
    collectDirectionSteps(event, insight).some((step) => !step.turnDetailsUnavailable);
  const routing = isClearance ? 'The detour has ended. Transit GPS confirmed buses have returned to their regular route.'
    : map?.pathPending ? 'The map shows the affected area. A verified detour route is pending.'
      : 'The map shows the likely detour route. Turn-by-turn directions follow the map.';
  const timedField = [['Confirmed', event.alertConfirmedAt], ['First detected', event.detectedAt], ['Last updated', event.updatedAt]]
    .find(([, value]) => timestamp(value) != null);
  const eventTime = timedField ? `${timedField[0]} ${timeLabel(timedField[1])}` : 'Time unavailable';
  const mapTime = timeLabel(map?.renderedAt ?? clearance?.clearedAt);
  const status = isClearance ? 'DETOUR OVER' : preview ? 'Map preview' : 'Confirmed detour';
  const statusDetail = isClearance
    ? `Cleared ${timeLabel(clearance.clearedAt)}. Normal route service has resumed for this detour.`
    : preview ? 'Example route map; current service status is not verified.' : eventTime;
  const subject = isClearance ? `DETOUR OVER | ${shortRouteLabel}`
    : preview ? `[TEST] Confirmed Detour | ${shortRouteLabel}`
      : `Confirmed Detour | ${shortRouteLabel}`;
  const summary = isClearance ? `THE DETOUR IS OVER. ${shortRouteLabel} near ${location} has returned to its regular route.`
    : preview ? `Test preview of Confirmed Detour for ${shortRouteLabel}. No live service notice.`
      : `Confirmed Detour | ${shortRouteLabel} | ${location}.`;
  const stopText = isClearance ? 'All listed stops are served again on the regular route.'
    : stopImpacts.length
      ? STOP_CLASSIFICATIONS.flatMap(([classification, title]) => {
        const matching = stopImpacts.filter((stop) => stop.classification === classification);
        return matching.length ? [`${title}:`, ...matching.map((stop) => `- ${formatStopImpact(stop)}`)] : [];
      }).join('\n')
      : event.briefStopImpactsPending ? 'Stop impacts are not confirmed for this notice.'
        : 'No individual stop impacts are confirmed for this notice.';
  const directionHeading = turnDetailsAvailable ? 'Detour directions:' : 'Street sequence (turn details unavailable):';
  const routeText = directionSteps.length
    ? [directionHeading, ...directionSteps.map((step, index) => `${index + 1}. ${step}`)].join('\n')
    : 'Turn-by-turn directions are not available for this notice.';
  const stopGroups = STOP_CLASSIFICATIONS.map(([classification, title]) => ({
    title,
    stops: stopImpacts.filter((stop) => stop.classification === classification),
  })).filter((group) => group.stops.length);
  const text = [summary, '', isClearance ? routing : '', `Affected section: ${affected}.`,
    '', `${status}: ${statusDetail}`, map?.buffer ? 'See the included street map and legend.' : '',
    map?.buffer ? `Map prepared: ${mapTime}` : '', isClearance ? stopText : routeText,
    isClearance || !stopGroups.length ? (isClearance ? '' : stopText)
      : stopGroups.flatMap((group) => [group.title, ...group.stops.map((stop) => `- ${formatStopImpact(stop)}`)]).join('\n'),
    preview ? '' : 'Status is a snapshot at the time of this notice.',
    '', 'Map data © OpenStreetMap contributors © CARTO.'].filter(Boolean).join('\n');
  const badges = eventRoutes.map((routeId) => {
    const color = getNoticeRouteColor(routeId, routeColors);
    return `<span style="display:inline-block;background:${color};color:${getNoticeRouteTextColor(color)};${FONT};font-size:14px;line-height:22px;font-weight:bold;padding:4px 10px;margin:0 6px 6px 0;border-radius:4px">Route ${escapeHtml(routeId)}</span>`;
  }).join('');
  const color = getNoticeRouteColor(eventRoutes[0], routeColors);
  const legendItem = (label, dashed) => `<span style="display:inline-block;margin:4px 18px 4px 0;white-space:nowrap"><span aria-hidden="true" style="display:inline-block;width:24px;border-top:4px ${dashed ? 'dashed' : 'solid'} ${color};vertical-align:middle;margin-right:7px"></span>${label}</span>`;
  const legend = isClearance ? '<span style="display:inline-block;margin:4px 18px 4px 0">Historical location from the earlier detour notice</span>'
    : [
      map?.pathPending ? '<span style="display:inline-block;margin:4px 18px 4px 0">Diversion path pending</span>' : legendItem('Likely diversion', false),
      map?.geometry?.closures?.length ? legendItem('Out of service', true)
        : map?.geometry?.anchors?.length ? '<span style="display:inline-block;margin:4px 18px 4px 0">&#9675; Affected area</span>' : '',
      map?.geometry?.skippedStops?.length ? '<span style="display:inline-block;margin:4px 0">&#8856; Skipped stop</span>' : '',
      map?.geometry?.uncertainStops?.length ? '<span style="display:inline-block;margin:4px 18px;color:#946000">? Stop service unconfirmed</span>' : '',
      map?.geometry?.servedStops?.length ? '<span style="display:inline-block;margin:4px 18px;color:#087f5b">&#10003; Served / boundary stop</span>' : '',
      map?.geometry?.unmappedSkippedStops?.length ? `<span style="display:inline-block;margin:4px 0">${map.geometry.unmappedSkippedStops.length} skipped stop location(s) unavailable</span>` : '',
    ].join('');
  const detailRow = (label, content) => `<tr><td class="detail-label" valign="top" width="104" style="width:104px;padding:12px 12px 12px 0;border-bottom:1px solid #e3e9ef;${FONT};font-size:15px;line-height:23px;font-weight:bold;color:#263347">${label}</td><td valign="top" style="padding:12px 0;border-bottom:1px solid #e3e9ef;${FONT};font-size:15px;line-height:23px;color:#263347;overflow-wrap:anywhere;word-break:break-word">${content}</td></tr>`;
  const directionSection = !isClearance
    ? `<tr><td class="notice-pad" style="padding:0 24px 18px;${FONT}"><h3 style="margin:0 0 8px;${FONT};font-size:18px;line-height:24px;color:#202c38">${turnDetailsAvailable ? 'Detour directions' : 'Street sequence (turn details unavailable)'}</h3>${directionSteps.length
      ? `<ol style="margin:0;padding-left:24px;${FONT};font-size:15px;line-height:24px;color:#263347">${directionSteps.map((step) => `<li style="padding:2px 0">${escapeHtml(step)}</li>`).join('')}</ol>`
      : '<p style="margin:0;color:#536477;font-size:14px;line-height:22px">Turn-by-turn directions are not available for this notice.</p>'}</td></tr>`
    : '';
  const stopSection = isClearance
    ? `<tr><td class="notice-pad" style="padding:0 24px 22px;${FONT}"><h3 style="margin:0 0 8px;${FONT};font-size:18px;line-height:24px;color:#202c38">Stop impacts</h3><p style="margin:0;color:#075b35;font-size:15px;line-height:23px">All listed stops are served again on the regular route.</p></td></tr>`
    : `<tr><td class="notice-pad" style="padding:0 24px 22px;${FONT}"><h3 style="margin:0 0 8px;${FONT};font-size:18px;line-height:24px;color:#202c38">Stop impacts</h3>${stopGroups.length
      ? stopGroups.map((group) => `<h4 style="margin:14px 0 4px;${FONT};font-size:14px;line-height:20px;color:#33485a">${escapeHtml(group.title)}</h4><ul style="margin:0;padding-left:22px;${FONT};font-size:14px;line-height:22px;color:#263347">${group.stops.map((stop) => `<li style="padding:1px 0">${escapeHtml(formatStopImpact(stop))}</li>`).join('')}</ul>`).join('')
      : `<p style="margin:0;color:#536477;font-size:14px;line-height:22px">${escapeHtml(stopText)}</p>`}</td></tr>`;
  const alt = isClearance
    ? `Historical map of the earlier ${routeLabel} detour near ${location}. The detour has ended and buses returned to regular routing.`
    : `${routeLabel} near ${location}. ${routing} Affected section: ${affected}.`;
  const image = Buffer.isBuffer(map?.buffer) ?
    `<tr><td class="notice-pad" style="padding:0 24px;${FONT}"><img src="cid:detour-map" alt="${escapeHtml(alt)}" width="${MAP_WIDTH}" style="display:block;width:100%;max-width:${MAP_WIDTH}px;height:auto;border:1px solid #c5d0db;box-sizing:border-box;border-radius:4px;color:#263347;${FONT};font-size:15px;line-height:23px" /></td></tr><tr><td class="notice-pad" style="padding:8px 24px 12px;${FONT};font-size:14px;line-height:23px;color:#33485a">${legend}</td></tr>`
    : `<tr><td class="notice-pad" bgcolor="#f5f7fa" style="padding:16px 24px;${FONT};font-size:15px;line-height:23px;color:#263347"><strong>Detour location map unavailable.</strong> ${isClearance ? 'Service has returned to the regular route.' : 'See the affected section details below.'}</td></tr>`;
  const body = [
    '<!doctype html><html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>',
    escapeHtml(subject), '</title>',
    '<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->',
    '<style>table{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic}body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}@media screen and (max-width:600px){.notice-outer{padding:0!important}.notice-pad{padding-left:16px!important;padding-right:16px!important}.notice-title{font-size:28px!important;line-height:34px!important}.notice-logo{width:80px!important;font-size:18px!important}.detail-label{width:98px!important}}</style></head>',
    `<body style="margin:0;padding:0;background:#eef2f5;${FONT};color:#202c38">`,
    `<div style="display:none;font-size:1px;line-height:1px;color:#eef2f5;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(`${summary} ${isClearance ? routing : routeText}`)}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef2f5"><tr><td align="center" class="notice-outer" style="padding:24px 12px">',
    `<!--[if mso]><table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:${WIDTH}px;table-layout:fixed;border-collapse:collapse">`,
    `<tr><td class="notice-pad" bgcolor="#104A78" style="padding:24px;color:#ffffff;${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`,
    `<td class="notice-logo" width="112" valign="middle" style="width:112px;${FONT};font-size:22px;line-height:23px;font-weight:bold;color:#ffffff">Barrie<br>Transit</td>`,
    `<td valign="middle" style="${FONT};color:#ffffff"><h1 class="notice-title" style="margin:0;${FONT};font-size:36px;line-height:42px;font-weight:bold;color:#ffffff">${isClearance ? 'Detour Ended' : 'Confirmed Detour'}</h1><p style="margin:6px 0 0;${FONT};font-size:15px;line-height:22px;color:#ffffff">${escapeHtml(shortRouteLabel)}</p></td>`,
    '</tr></table></td></tr>',
    preview ? `<tr><td class="notice-pad" bgcolor="#fff3cd" style="padding:12px 24px;${FONT};font-size:14px;line-height:21px;color:#634900"><strong>TEST PREVIEW</strong> &middot; Example route map. No live service notice.</td></tr>` : '',
    isClearance ? `<tr><td class="notice-pad" bgcolor="#e3f5eb" style="padding:14px 24px;${FONT};font-size:17px;line-height:25px;color:#075b35"><strong>THE DETOUR IS OVER</strong> &middot; Buses have returned to their regular route.</td></tr>` : '',
    `<tr><td class="notice-pad" style="padding:22px 24px 16px;${FONT}">${badges}<h2 style="margin:5px 0 8px;${FONT};font-size:22px;line-height:29px;color:#202c38">${escapeHtml(location)}</h2><p style="margin:0;${FONT};font-size:16px;line-height:25px;color:#33485a">${escapeHtml(routing)}</p></td></tr>`,
    image,
    directionSection,
    stopSection,
    `<tr><td class="notice-pad" style="padding:0 24px 22px;${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;border-collapse:collapse">`,
    detailRow('Status', `<strong>${status}</strong><br>${escapeHtml(statusDetail)}`),
    isClearance ? detailRow('Original alert', `Detected ${escapeHtml(timeLabel(event.detectedAt))}`) : '',
    detailRow('Affected section', escapeHtml(affected)),
    '</table></td></tr>',
    `<tr><td class="notice-pad" bgcolor="#f5f7fa" style="padding:16px 24px;${FONT};font-size:12px;line-height:19px;color:#536477">${map?.buffer ? (isClearance ? `Map from the original notice, prepared ${escapeHtml(mapTime)}. This image shows the earlier detour location; the detour has since ended.` : `Map prepared ${escapeHtml(mapTime)}. ${preview ? 'Test preview.' : 'Automatically detected service notice. Status is a snapshot at the time of sending.'} Map image included for forwarding.`) : (isClearance ? 'The detour has ended. The map from the original notice is unavailable.' : `Map prepared ${escapeHtml(mapTime)}. ${preview ? 'Test preview.' : 'Automatically detected service notice. Status is a snapshot at the time of sending.'}`)}<br>&copy; OpenStreetMap contributors &copy; CARTO.</td></tr>`,
    '</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>',
  ].join('');
  return { subject, text, html: body,
    attachments: map?.buffer ? [{ filename: 'barrie-detour-map.jpg', content: map.buffer.toString('base64'), content_type: 'image/jpeg', content_id: 'detour-map' }] : [],
  };
}
module.exports = { buildBriefMessage };
