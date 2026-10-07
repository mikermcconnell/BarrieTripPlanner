'use strict';

const path = require('path');

// Single source for user-facing branding so a rename is a one-line change.
const APP_NAME = 'Transit Arrival';
const APP_SLUG = 'transit-arrival';
const APP_VERSION = '0.1.0';
const APP_TAGLINE = 'Live bus arrivals and a real-time map, right in ChatGPT';

// Shown on the public site, privacy policy, and terms. Set before submission.
const OPERATOR = {
  name: process.env.TRANSIT_ARRIVAL_OPERATOR_NAME || 'OPERATOR NAME',
  email: process.env.TRANSIT_ARRIVAL_SUPPORT_EMAIL || 'support@example.com',
  jurisdiction: 'Ontario, Canada',
  policiesUpdated: '2026-10-05',
};

const AGENCIES = require('./agencies.json');
const DATA_DIR = process.env.TRANSIT_ARRIVAL_DATA_DIR || path.join(__dirname, '.data');
// Release assets published by .github/workflows/transit-feeds.yml; unset means build feeds locally.
const PREBUILT_FEEDS_URL = process.env.TRANSIT_ARRIVAL_PREBUILT_URL || null;

// Initial map view before results arrive; the map then fits to what's shown.
const MAP_DEFAULT_VIEW = { center: [44.1, -79.55], zoom: 9 };

const REALTIME_CACHE_MS = 15 * 1000;

module.exports = {
  APP_NAME, APP_SLUG, APP_VERSION, APP_TAGLINE, OPERATOR, AGENCIES, DATA_DIR, PREBUILT_FEEDS_URL, MAP_DEFAULT_VIEW, REALTIME_CACHE_MS,
};
