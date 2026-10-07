'use strict';

const { decodeGTFSRT, hasUsablePosition, isFreshVehicle, mapVehicleEntity } = require('../vehicleFetcher');
const { parseTripUpdates } = require('./tripUpdatesParser');

const FETCH_TIMEOUT_MS = 10 * 1000;

async function fetchFeed(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.arrayBuffer();
}

async function fetchTripUpdates(url) {
  return parseTripUpdates(await fetchFeed(url));
}

async function fetchVehicles(url) {
  const entities = decodeGTFSRT(await fetchFeed(url));
  const nowSeconds = Math.floor(Date.now() / 1000);
  return entities
    .filter(hasUsablePosition)
    .filter((entity) => isFreshVehicle(entity, nowSeconds))
    .map((entity) => mapVehicleEntity(entity));
}

module.exports = { fetchTripUpdates, fetchVehicles };
