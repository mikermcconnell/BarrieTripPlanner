const JSZip = require('jszip');

const GTFS_URL = 'https://www.myridebarrie.ca/gtfs/Google_transit.zip';
const CACHE_TTL = 6 * 60 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000];

let cache = { shapes: null, tripMapping: null, routeShapeMapping: null, lastRefresh: null };
let refreshPromise = null;

const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else { current += char; }
  }
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
};

const parseCSV = (csvText) => {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xfeff) headerLine = headerLine.slice(1);
  const headers = headerLine.split(',').map((h) => h.trim().replace(/"/g, ''));
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length === headers.length) {
      const obj = {};
      headers.forEach((header, index) => { obj[header] = values[index]; });
      data.push(obj);
    }
  }
  return data;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry() {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(GTFS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.error(`[gtfsLoader] Fetch attempt ${attempt + 1}/${MAX_RETRIES} failed:`, err.message);
      if (attempt < MAX_RETRIES - 1) await sleep(RETRY_DELAYS[attempt]);
    }
  }
  throw new Error('All fetch attempts failed');
}

function buildDataStructures(shapesCSV, tripsCSV) {
  const shapesRaw = parseCSV(shapesCSV);
  const tripsRaw = parseCSV(tripsCSV);

  const shapes = new Map();
  for (const row of shapesRaw) {
    const id = row.shape_id;
    if (!shapes.has(id)) shapes.set(id, []);
    shapes.get(id).push({
      latitude: parseFloat(row.shape_pt_lat),
      longitude: parseFloat(row.shape_pt_lon),
      sequence: parseInt(row.shape_pt_sequence, 10),
    });
  }
  for (const pts of shapes.values()) pts.sort((a, b) => a.sequence - b.sequence);

  const tripMapping = new Map();
  const routeShapeSets = new Map();
  for (const row of tripsRaw) {
    tripMapping.set(row.trip_id, {
      routeId: row.route_id,
      shapeId: row.shape_id,
      headsign: row.trip_headsign,
      directionId: parseInt(row.direction_id, 10),
    });
    if (!routeShapeSets.has(row.route_id)) routeShapeSets.set(row.route_id, new Set());
    if (row.shape_id) routeShapeSets.get(row.route_id).add(row.shape_id);
  }

  const routeShapeMapping = new Map();
  for (const [routeId, shapeSet] of routeShapeSets) {
    routeShapeMapping.set(routeId, Array.from(shapeSet));
  }

  return { shapes, tripMapping, routeShapeMapping };
}

async function refreshData() {
  try {
    const zipBuffer = await fetchWithRetry();
    const zip = await JSZip.loadAsync(zipBuffer);
    const shapesFile = zip.file('shapes.txt');
    const tripsFile = zip.file('trips.txt');
    if (!shapesFile || !tripsFile) {
      throw new Error('ZIP missing shapes.txt or trips.txt');
    }
    const [shapesCSV, tripsCSV] = await Promise.all([
      shapesFile.async('string'),
      tripsFile.async('string'),
    ]);
    const data = buildDataStructures(shapesCSV, tripsCSV);
    const prevShapeCount = cache.shapes ? cache.shapes.size : 0;
    const prevTripCount = cache.tripMapping ? cache.tripMapping.size : 0;
    const dataChanged = data.shapes.size !== prevShapeCount || data.tripMapping.size !== prevTripCount;
    cache = { ...data, lastRefresh: Date.now() };
    console.log(`[gtfsLoader] Refreshed: ${data.shapes.size} shapes, ${data.tripMapping.size} trips, ${data.routeShapeMapping.size} routes`);
    return dataChanged;
  } catch (err) {
    console.error('[gtfsLoader] Refresh failed:', err.message);
    if (cache.shapes) {
      console.warn('[gtfsLoader] Keeping previously cached data');
      return false;
    }
    throw err;
  }
}

async function ensureLoaded() {
  if (cache.shapes && (Date.now() - cache.lastRefresh) < CACHE_TTL) return;
  if (!refreshPromise) refreshPromise = refreshData().finally(() => { refreshPromise = null; });
  await refreshPromise;
}

async function getStaticData() {
  await ensureLoaded();
  return { shapes: cache.shapes, tripMapping: cache.tripMapping, routeShapeMapping: cache.routeShapeMapping, lastRefresh: cache.lastRefresh };
}

async function forceRefresh() {
  cache.lastRefresh = null;
  if (!refreshPromise) refreshPromise = refreshData().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

module.exports = { getStaticData, forceRefresh };
