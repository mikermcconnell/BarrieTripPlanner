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
  };

  function filterFreshSamples(vehicles) {
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
};
