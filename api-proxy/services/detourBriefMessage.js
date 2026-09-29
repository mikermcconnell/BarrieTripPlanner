'use strict';

const { buildDetourEmailInsights } = require('./detourEmailMonitor');
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

function buildBriefMessage(sourceEvent, map, routeColors, { preview = false, clearance = null } = {}) {
  const event = prepareBriefDisplayEvent(sourceEvent);
  const isClearance = Boolean(clearance);
  const insight = buildDetourEmailInsights(event);
  const eventRoutes = [...new Set((Array.isArray(event.sharedRouteIds) && event.sharedRouteIds.length
    ? event.sharedRouteIds : [event.routeId || 'Unknown']).map(String))];
  const routes = eventRoutes.join(', ');
  const routeLabel = `Route${eventRoutes.length > 1 ? 's' : ''} ${routes}`;
  const location = event.eventLocationLabel || insight.bestLocationTitle || 'Location being confirmed';
  const affected = insight.closedRoads.length ? insight.closedRoads.join(', ') : location;
  const stopLabels = (insight.skippedStops.length ? insight.skippedStops : insight.affectedStops)
    .map((label) => label.replace(/^#(\S+)\s+(.+)$/, '$2 (#$1)'));
  const stopType = insight.skippedStops.length ? 'skipped' : 'affected';
  const stopHeadline = stopLabels.length
    ? `${stopLabels.length} ${stopType} stop${stopLabels.length === 1 ? '' : 's'}`
    : 'Stop impacts pending';
  const stopDetails = isClearance ? 'Stops from the earlier notice are served again on the regular route.'
    : stopLabels.length ? `${stopHeadline}: ${stopLabels.join('; ')}`
      : 'Stop impacts have not been confirmed.';
  const routing = isClearance ? 'The detour has ended. Transit GPS confirmed buses have returned to their regular route.'
    : map?.pathPending ? 'Diversion path pending. The map shows the affected area.'
    : insight.likelyRoads.length ? `Via ${insight.likelyRoads.join(' and ')}.`
      : 'Follow the solid route-colored line for the likely diversion.';
  const timedField = [['Confirmed', event.alertConfirmedAt], ['First detected', event.detectedAt], ['Last updated', event.updatedAt]]
    .find(([, value]) => timestamp(value) != null);
  const eventTime = timedField ? `${timedField[0]} ${timeLabel(timedField[1])}` : 'Time unavailable';
  const mapTime = timeLabel(map?.renderedAt ?? clearance?.clearedAt);
  const status = isClearance ? 'DETOUR OVER' : preview ? 'Map preview' : 'Confirmed detour';
  const statusDetail = isClearance
    ? `Cleared ${timeLabel(clearance.clearedAt)}. Normal route service has resumed for this detour.`
    : preview ? 'Example route map; current service status is not verified.' : eventTime;
  const subject = isClearance ? `DETOUR OVER | ${routeLabel} | ${location}`
    : preview ? `[TEST PREVIEW] ${routeLabel} | ${location} detour map`
      : `Confirmed Barrie Transit detour | ${routeLabel} | ${location}`;
  const summary = isClearance ? `THE DETOUR IS OVER. ${routeLabel} near ${location} has returned to its regular route.`
    : preview ? `Test preview of ${routeLabel} near ${location}. No live service notice.`
      : `A detour is affecting ${routeLabel} near ${location}.`;
  const text = [summary, '', routing, `Affected section: ${affected}.`, stopDetails,
    '', `${status}: ${statusDetail}`, map?.buffer ? 'See the included street map and legend.' : '',
    map?.buffer ? `Map prepared: ${mapTime}` : '', preview ? '' : 'Status is a snapshot at the time of this notice.',
    '', 'Map data © OpenStreetMap contributors © CARTO.'].filter((line) => line !== undefined).join('\n');
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
    ].join('');
  const detailRow = (label, content) => `<tr><td class="detail-label" valign="top" width="104" style="width:104px;padding:12px 12px 12px 0;border-bottom:1px solid #e3e9ef;${FONT};font-size:15px;line-height:23px;font-weight:bold;color:#263347">${label}</td><td valign="top" style="padding:12px 0;border-bottom:1px solid #e3e9ef;${FONT};font-size:15px;line-height:23px;color:#263347;overflow-wrap:anywhere;word-break:break-word">${content}</td></tr>`;
  const alt = isClearance
    ? `Historical map of the earlier ${routeLabel} detour near ${location}. The detour has ended and buses returned to regular routing.`
    : `${routeLabel} near ${location}. ${routing} Affected section: ${affected}. ${stopDetails}`;
  const image = Buffer.isBuffer(map?.buffer) ?
    `<tr><td class="notice-pad" style="padding:0 24px;${FONT}"><img src="cid:detour-map" alt="${escapeHtml(alt)}" width="${MAP_WIDTH}" style="display:block;width:100%;max-width:${MAP_WIDTH}px;height:auto;border:1px solid #c5d0db;box-sizing:border-box;border-radius:4px;color:#263347;${FONT};font-size:15px;line-height:23px" /></td></tr><tr><td class="notice-pad" style="padding:8px 24px 12px;${FONT};font-size:14px;line-height:23px;color:#33485a">${legend}</td></tr>`
    : `<tr><td class="notice-pad" bgcolor="#f5f7fa" style="padding:16px 24px;${FONT};font-size:15px;line-height:23px;color:#263347"><strong>Detour location map unavailable.</strong> ${isClearance ? 'Service has returned to the regular route.' : 'See the affected section details below.'}</td></tr>`;
  const body = [
    '<!doctype html><html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>',
    escapeHtml(subject), '</title>',
    '<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->',
    '<style>table{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic}body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}@media screen and (max-width:600px){.notice-outer{padding:0!important}.notice-pad{padding-left:16px!important;padding-right:16px!important}.notice-title{font-size:28px!important;line-height:34px!important}.notice-logo{width:80px!important;font-size:18px!important}.detail-label{width:98px!important}}</style></head>',
    `<body style="margin:0;padding:0;background:#eef2f5;${FONT};color:#202c38">`,
    `<div style="display:none;font-size:1px;line-height:1px;color:#eef2f5;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(`${summary} ${routing} ${stopHeadline}.`)}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef2f5"><tr><td align="center" class="notice-outer" style="padding:24px 12px">',
    `<!--[if mso]><table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:${WIDTH}px;table-layout:fixed;border-collapse:collapse">`,
    `<tr><td class="notice-pad" bgcolor="#104A78" style="padding:24px;color:#ffffff;${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`,
    `<td class="notice-logo" width="112" valign="middle" style="width:112px;${FONT};font-size:22px;line-height:23px;font-weight:bold;color:#ffffff">Barrie<br>Transit</td>`,
    `<td valign="middle" style="${FONT};color:#ffffff"><h1 class="notice-title" style="margin:0;${FONT};font-size:36px;line-height:42px;font-weight:bold;color:#ffffff">${isClearance ? 'Detour Ended' : 'Detected Detour'}</h1><p style="margin:6px 0 0;${FONT};font-size:15px;line-height:22px;color:#ffffff">${escapeHtml(routeLabel)}</p></td>`,
    '</tr></table></td></tr>',
    preview ? `<tr><td class="notice-pad" bgcolor="#fff3cd" style="padding:12px 24px;${FONT};font-size:14px;line-height:21px;color:#634900"><strong>TEST PREVIEW</strong> &middot; Example route map. No live service notice.</td></tr>` : '',
    isClearance ? `<tr><td class="notice-pad" bgcolor="#e3f5eb" style="padding:14px 24px;${FONT};font-size:17px;line-height:25px;color:#075b35"><strong>THE DETOUR IS OVER</strong> &middot; Buses have returned to their regular route.</td></tr>` : '',
    `<tr><td class="notice-pad" style="padding:22px 24px 16px;${FONT}">${badges}<h2 style="margin:5px 0 8px;${FONT};font-size:22px;line-height:29px;color:#202c38">${escapeHtml(location)}</h2><p style="margin:0;${FONT};font-size:16px;line-height:25px;color:#33485a">${escapeHtml(routing)}</p></td></tr>`,
    image,
    `<tr><td class="notice-pad" style="padding:0 24px 22px;${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;border-collapse:collapse">`,
    detailRow('Status', `<strong>${status}</strong><br>${escapeHtml(statusDetail)}`),
    isClearance ? detailRow('Original alert', `Detected ${escapeHtml(timeLabel(event.detectedAt))}`) : '',
    detailRow('Affected section', escapeHtml(affected)),
    detailRow('Stops', escapeHtml(stopDetails)),
    '</table></td></tr>',
    `<tr><td class="notice-pad" bgcolor="#f5f7fa" style="padding:16px 24px;${FONT};font-size:12px;line-height:19px;color:#536477">${map?.buffer ? (isClearance ? `Map from the original notice, prepared ${escapeHtml(mapTime)}. This image shows the earlier detour location; the detour has since ended.` : `Map prepared ${escapeHtml(mapTime)}. ${preview ? 'Test preview.' : 'Automatically detected service notice. Status is a snapshot at the time of sending.'} Map image included for forwarding.`) : (isClearance ? 'The detour has ended. The map from the original notice is unavailable.' : `Map prepared ${escapeHtml(mapTime)}. ${preview ? 'Test preview.' : 'Automatically detected service notice. Status is a snapshot at the time of sending.'}`)}<br>&copy; OpenStreetMap contributors &copy; CARTO.</td></tr>`,
    '</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>',
  ].join('');
  return { subject, text, html: body,
    attachments: map?.buffer ? [{ filename: 'barrie-detour-map.jpg', content: map.buffer.toString('base64'), content_type: 'image/jpeg', content_id: 'detour-map' }] : [],
  };
}
module.exports = { buildBriefMessage };
