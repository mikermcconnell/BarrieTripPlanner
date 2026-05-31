'use strict';

function normalizeCoordinatePart(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(6) : '';
}

function normalizeTextPart(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeTimestampPart(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.trunc(n)) : '';
}

function toVehicleTimestampMs(vehicle) {
  const raw = vehicle?.timestampMs ?? vehicle?.timestamp;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

function summarizeVehicleFeedFreshness(
  vehicles,
  {
    now = Date.now(),
    staleThresholdMs = 5 * 60 * 1000,
  } = {}
) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const timestamps = list
    .map(toVehicleTimestampMs)
    .filter((value) => Number.isFinite(value));
  const newestTimestampMs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const oldestTimestampMs = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const newestAgeMs = Number.isFinite(newestTimestampMs) ? Math.max(0, now - newestTimestampMs) : null;
  const stale = list.length > 0 && Number.isFinite(newestAgeMs) && newestAgeMs > staleThresholdMs;
  let status = 'empty';
  if (list.length > 0 && timestamps.length === 0) {
    status = 'unknown';
  } else if (stale) {
    status = 'stale';
  } else if (list.length > 0) {
    status = 'fresh';
  }

  return {
    vehicleCount: list.length,
    timestampedVehicleCount: timestamps.length,
    newestTimestampMs,
    oldestTimestampMs,
    newestAgeMs,
    staleThresholdMs,
    stale,
    status,
  };
}

function makeVehicleSampleKey(vehicle) {
  if (!vehicle) return null;

  const id = normalizeTextPart(vehicle.id || vehicle.vehicleId);
  if (!id) return null;

  const latitude = normalizeCoordinatePart(vehicle.coordinate?.latitude ?? vehicle.latitude);
  const longitude = normalizeCoordinatePart(vehicle.coordinate?.longitude ?? vehicle.longitude);

  return [
    id,
    normalizeTextPart(vehicle.routeId),
    normalizeTextPart(vehicle.tripId),
    normalizeTimestampPart(vehicle.timestamp),
    latitude,
    longitude,
  ].join('|');
}

function createVehicleSampleFreshnessTracker() {
  const lastSampleKeyByVehicle = new Map();
  let lastStats = {
    inputCount: 0,
    freshCount: 0,
    duplicateCount: 0,
    feedFreshness: summarizeVehicleFeedFreshness([]),
  };

  function filterFreshSamples(vehicles, options = {}) {
    const fresh = [];
    const list = Array.isArray(vehicles) ? vehicles : [];

    for (const vehicle of list) {
      const key = makeVehicleSampleKey(vehicle);
      const vehicleId = normalizeTextPart(vehicle?.id || vehicle?.vehicleId);

      if (!key || !vehicleId) {
        fresh.push(vehicle);
        continue;
      }

      if (lastSampleKeyByVehicle.get(vehicleId) === key) {
        continue;
      }

      lastSampleKeyByVehicle.set(vehicleId, key);
      fresh.push(vehicle);
    }

    lastStats = {
      inputCount: list.length,
      freshCount: fresh.length,
      duplicateCount: Math.max(0, list.length - fresh.length),
      feedFreshness: summarizeVehicleFeedFreshness(list, options),
    };

    return fresh;
  }

  function getStats() {
    return { ...lastStats };
  }

  function reset() {
    lastSampleKeyByVehicle.clear();
    lastStats = {
      inputCount: 0,
      freshCount: 0,
      duplicateCount: 0,
      feedFreshness: summarizeVehicleFeedFreshness([]),
    };
  }

  return {
    filterFreshSamples,
    getStats,
    reset,
  };
}

module.exports = {
  createVehicleSampleFreshnessTracker,
  makeVehicleSampleKey,
  summarizeVehicleFeedFreshness,
  toVehicleTimestampMs,
};
