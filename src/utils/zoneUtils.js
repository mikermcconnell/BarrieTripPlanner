/**
 * Zone Utilities
 *
 * Helpers for on-demand zone containment checks, operating hours,
 * hub stop lookup, and display formatting.
 */

import { pointInPolygon } from './geometryUtils';
import { safeHaversineDistance } from './geometryUtils';

/**
 * Find the on-demand zone containing a given point.
 * @param {number} lat
 * @param {number} lon
 * @param {Object} zonesMap - { zoneId: zoneObject }
 * @returns {Object|null} zone object or null
 */
export const findContainingZone = (lat, lon, zonesMap) => {
  if (!zonesMap || !lat || !lon) return null;

  const zones = Object.values(zonesMap);
  for (const zone of zones) {
    if (!zone.geometry?.coordinates) continue;
    if (pointInPolygon(lat, lon, zone.geometry.coordinates)) {
      return zone;
    }
  }
  return null;
};

/**
 * Check if a zone is currently operating at a given time.
 * @param {Object} zone
 * @param {Date} [when] - defaults to now
 * @returns {boolean}
 */
export const isZoneOperating = (zone, when) => {
  if (!zone?.serviceHours) return false;

  const date = when ? new Date(when) : new Date();
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  let dayKey;
  if (day === 0) dayKey = 'sunday';
  else if (day === 6) dayKey = 'saturday';
  else dayKey = 'weekday';

  const hours = zone.serviceHours[dayKey];
  if (!hours) return false;

  const { start, end } = hours;
  if (!start || !end) return false;

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
};

/**
 * Find the nearest hub stop to a coordinate from a list of hub stop IDs.
 * @param {number} lat
 * @param {number} lon
 * @param {string[]} hubStopIds
 * @param {Array} allStops - full stops array from TransitContext
 * @returns {Object|null} stop object or null
 */
export const findNearestHubStop = (lat, lon, hubStopIds, allStops) => {
  if (!hubStopIds?.length || !allStops?.length) return null;

  const hubStopSet = new Set(hubStopIds);
  let nearest = null;
  let minDist = Infinity;

  for (const stop of allStops) {
    if (!hubStopSet.has(stop.id)) continue;
    const dist = safeHaversineDistance(lat, lon, stop.latitude, stop.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = stop;
    }
  }

  return nearest;
};

/**
 * Format zone service hours for display.
 * @param {Object} serviceHours - { weekday, saturday, sunday }
 * @returns {Array<{day: string, hours: string}>}
 */
export const formatZoneHours = (serviceHours) => {
  if (!serviceHours) return [];

  const result = [];
  const dayOrder = [
    { key: 'weekday', label: 'Mon-Fri' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' },
  ];

  for (const { key, label } of dayOrder) {
    const hours = serviceHours[key];
    if (!hours) {
      result.push({ day: label, hours: 'No service' });
    } else {
      result.push({ day: label, hours: `${hours.start} - ${hours.end}` });
    }
  }

  return result;
};
