'use strict';

const fs = require('fs');
const path = require('path');
const { APP_NAME, APP_SLUG, APP_VERSION, AGENCY } = require('./config');

// Bump the version segment when the widget changes; hosts cache by URI.
const WIDGET_URI = `ui://${APP_SLUG}/map-v2.html`;
const WIDGET_MIME_TYPE = 'text/html;profile=mcp-app';
const WIDGET_REFRESH_MS = 20 * 1000;

const TILE_ORIGINS = ['a', 'b', 'c'].map((s) => `https://${s}.basemaps.cartocdn.com`);

function tileConfig(env) {
  const key = String(env.CARTO_BASEMAP_API_KEY || env.EXPO_PUBLIC_CARTO_BASEMAP_KEY || '').trim();
  const query = key ? `?key=${encodeURIComponent(key)}` : '';
  return {
    light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png${query}`,
    dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png${query}`,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  };
}

// Inline JSON/JS safely inside a <script> element.
const scriptSafe = (text) => text.replace(/<\/script/gi, '<\\/script');

function buildWidgetHtml({ env = process.env } = {}) {
  const leafletDir = path.dirname(require.resolve('leaflet/dist/leaflet.js'));
  const template = fs.readFileSync(path.join(__dirname, 'widget', 'map.html'), 'utf8');
  const config = {
    appName: APP_NAME,
    appSlug: APP_SLUG,
    version: APP_VERSION,
    center: AGENCY.center,
    refreshMs: WIDGET_REFRESH_MS,
    tiles: tileConfig(env),
  };
  // Function replacers: the inlined sources contain `$` sequences that string
  // replacement patterns would otherwise interpret.
  return template
    .replace('/*__LEAFLET_CSS__*/', () => fs.readFileSync(path.join(leafletDir, 'leaflet.css'), 'utf8'))
    .replace('/*__LEAFLET_JS__*/', () => scriptSafe(fs.readFileSync(path.join(leafletDir, 'leaflet.js'), 'utf8')))
    .replace('/*__CONFIG__*/', () => scriptSafe(JSON.stringify(config)));
}

const WIDGET_RESOURCE_META = {
  ui: {
    csp: { connectDomains: [], resourceDomains: TILE_ORIGINS },
    prefersBorder: true,
  },
  // ChatGPT's pre-MCP-Apps keys, kept for hosts that still read them.
  'openai/widgetCSP': { connect_domains: [], resource_domains: TILE_ORIGINS },
  'openai/widgetPrefersBorder': true,
  'openai/widgetDescription': 'Live map of transit vehicles with real-time arrival minutes for the requested stop or route.',
};

const WIDGET_TOOL_META = {
  ui: { resourceUri: WIDGET_URI },
  'ui/resourceUri': WIDGET_URI,
  'openai/outputTemplate': WIDGET_URI,
  'openai/widgetAccessible': true,
  'openai/toolInvocation/invoking': 'Checking live transit…',
  'openai/toolInvocation/invoked': 'Live transit',
};

module.exports = {
  WIDGET_URI,
  WIDGET_MIME_TYPE,
  WIDGET_RESOURCE_META,
  WIDGET_TOOL_META,
  buildWidgetHtml,
};
