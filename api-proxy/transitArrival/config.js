'use strict';

// Single source for user-facing branding so a rename is a one-line change.
const APP_NAME = 'Transit Arrival';
const APP_SLUG = 'transit-arrival';
const APP_VERSION = '0.1.0';

const AGENCY = {
  name: 'Barrie Transit',
  timeZone: 'America/Toronto',
  center: [44.3894, -79.6903],
  tripUpdatesUrl: 'https://www.myridebarrie.ca/gtfs/GTFS_TripUpdates.pb',
};

const REALTIME_CACHE_MS = 15 * 1000;

module.exports = { APP_NAME, APP_SLUG, APP_VERSION, AGENCY, REALTIME_CACHE_MS };
