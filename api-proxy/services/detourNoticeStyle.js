'use strict';

// Current Barrie GTFS colors are the source of truth. These values keep an
// emailed notice legible if the feed is briefly unavailable.
const FALLBACK_ROUTE_COLORS = {
  '2': '#006838',
  '7': '#F58220',
  '8': '#000000',
  '10': '#681757',
  '11': '#B2D235',
  '12': '#F8A1BE',
  '15': '#2464A2',
  '100': '#910005',
  '101': '#2464A2',
  '400': '#00C4DC',
};

function routeFamily(routeId) {
  return String(routeId || '').trim().toUpperCase().match(/^\d+/)?.[0] || '';
}

function getNoticeRouteColor(routeId, routeColors) {
  const id = String(routeId || '').trim().toUpperCase();
  const fromFeed = routeColors instanceof Map ? routeColors.get(id) : routeColors?.[id];
  if (typeof fromFeed === 'string' && /^#[0-9a-f]{6}$/i.test(fromFeed)) return fromFeed.toUpperCase();
  return FALLBACK_ROUTE_COLORS[routeFamily(id)] || '#146296';
}

function getNoticeRouteTextColor(color) {
  const hex = String(color || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#FFFFFF';
  const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.33 ? '#17212B' : '#FFFFFF';
}

module.exports = { getNoticeRouteColor, getNoticeRouteTextColor };
