'use strict';

// Static GTFS lives on disk as one SQLite file per agency, so memory stays flat
// as agencies are added. Each file is built from the agency's zip, then opened
// read-only; queries pull only the rows a request needs.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const readline = require('readline');
const JSZip = require('jszip');
const { DatabaseSync } = require('node:sqlite');
const { parseGtfsTimeToSeconds } = require('../gtfsLoader');

const SCHEMA_VERSION = '4';
const SHAPE_TOLERANCE_METERS = 5;
const PAGE_CACHE_KIB = 1024;
const SHAPE_CACHE_LIMIT = 200;
const FETCH_TIMEOUT_MS = 120 * 1000;
const RETRY_DELAYS_MS = [2000, 5000];

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE routes (route_id TEXT PRIMARY KEY, short_name TEXT, long_name TEXT, color TEXT, sort_order INTEGER);
CREATE TABLE stops (stop_id TEXT PRIMARY KEY, code TEXT, name TEXT, search_name TEXT, lat REAL, lon REAL, parent TEXT);
CREATE INDEX stops_code ON stops(code);
CREATE INDEX stops_parent ON stops(parent);
CREATE TABLE stations (stop_id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE trips (trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT, headsign TEXT, shape_id TEXT, start_seconds INTEGER);
CREATE INDEX trips_route ON trips(route_id, start_seconds);
CREATE TABLE stop_times (stop_id TEXT, seconds INTEGER, trip_id TEXT, seq INTEGER, PRIMARY KEY (stop_id, seconds, trip_id)) WITHOUT ROWID;
CREATE TABLE stop_routes (stop_id TEXT, route_id TEXT, PRIMARY KEY (stop_id, route_id)) WITHOUT ROWID;
CREATE TABLE route_shapes (route_id TEXT, shape_id TEXT, PRIMARY KEY (route_id, shape_id)) WITHOUT ROWID;
CREATE TABLE shapes (shape_id TEXT PRIMARY KEY, points TEXT);
CREATE TABLE calendar (service_id TEXT PRIMARY KEY, days TEXT, start_date TEXT, end_date TEXT);
CREATE TABLE calendar_dates (service_id TEXT, date TEXT, exception_type INTEGER, PRIMARY KEY (service_id, date)) WITHOUT ROWID;
CREATE TEMP TABLE shape_points (shape_id TEXT, seq INTEGER, lat REAL, lon REAL);
`;

const WEEKDAY_COLUMNS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

// Streams rows so large files (stop_times, shapes) are never held in memory whole.
async function forEachRow(zip, name, onRow) {
  const file = zip.file(name);
  if (!file) return;
  const lines = readline.createInterface({ input: file.nodeStream('nodebuffer'), crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    if (!header) {
      header = values.map((h) => h.replace(/^﻿/, ''));
      continue;
    }
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = values[i] ?? '';
    onRow(row);
  }
}

// Douglas-Peucker on an equirectangular projection; plenty for city-scale lines.
function simplify(points, toleranceMeters = SHAPE_TOLERANCE_METERS) {
  if (points.length <= 2) return points;
  const lat0 = (points[0][0] * Math.PI) / 180;
  const xy = points.map(([lat, lon]) => [lon * 111320 * Math.cos(lat0), lat * 110540]);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxDist = -1;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (dist > maxDist) { maxDist = dist; index = i; }
    }
    if (maxDist > toleranceMeters) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

async function buildAgencyDb(zipBuffer, outPath) {
  fs.rmSync(outPath, { force: true });
  const zip = await JSZip.loadAsync(zipBuffer);
  if (!zip.file('stops.txt') || !zip.file('trips.txt') || !zip.file('stop_times.txt')) {
    throw new Error('GTFS zip is missing stops.txt, trips.txt or stop_times.txt');
  }

  const db = new DatabaseSync(outPath);
  try {
    db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    db.exec(SCHEMA);
    db.exec('BEGIN');

    const insertRoute = db.prepare('INSERT OR REPLACE INTO routes VALUES (?, ?, ?, ?, ?)');
    await forEachRow(zip, 'routes.txt', (r) => {
      if (!r.route_id) return;
      const color = /^[0-9a-fA-F]{6}$/.test(r.route_color) ? `#${r.route_color.toUpperCase()}` : null;
      const sortOrder = Number.parseInt(r.route_sort_order, 10);
      insertRoute.run(r.route_id, r.route_short_name || r.route_id, r.route_long_name || '', color,
        Number.isFinite(sortOrder) ? sortOrder : null);
    });

    // search_name also carries the parent station's name, so "Bramalea Terminal"
    // finds stops named "Route 8 Stop" inside it.
    const insertStop = db.prepare('INSERT OR REPLACE INTO stops VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertStation = db.prepare('INSERT OR REPLACE INTO stations VALUES (?, ?)');
    await forEachRow(zip, 'stops.txt', (r) => {
      const lat = Number.parseFloat(r.stop_lat);
      const lon = Number.parseFloat(r.stop_lon);
      if (!r.stop_id) return;
      if (r.location_type === '1') { insertStation.run(r.stop_id, r.stop_name); return; }
      if ((r.location_type && r.location_type !== '0') || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
      insertStop.run(r.stop_id, r.stop_code || r.stop_id, r.stop_name, normalizeText(r.stop_name), lat, lon, r.parent_station || null);
    });
    db.exec('UPDATE stops SET parent = NULL WHERE parent NOT IN (SELECT stop_id FROM stations)');
    const setSearch = db.prepare("UPDATE stops SET search_name = search_name || ' ' || ? WHERE parent = ?");
    for (const st of db.prepare('SELECT stop_id, name FROM stations').all()) setSearch.run(normalizeText(st.name), st.stop_id);

    // Some agencies prefix headsigns with the route ("109 S Express ..."); the route is shown separately.
    const shortNames = new Map(db.prepare('SELECT route_id, short_name FROM routes').all().map((r) => [r.route_id, r.short_name]));
    const cleanHeadsign = (routeId, headsign) => {
      if (/^auto generated/i.test(headsign || '')) return null; // placeholder text in some exports
      const prefix = shortNames.get(routeId);
      if (!headsign || !prefix || !headsign.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) return headsign || null;
      return headsign.slice(prefix.length).trim() || headsign;
    };
    const insertTrip = db.prepare('INSERT OR REPLACE INTO trips VALUES (?, ?, ?, ?, ?, NULL)');
    await forEachRow(zip, 'trips.txt', (r) => {
      if (!r.trip_id || !r.route_id) return;
      insertTrip.run(r.trip_id, r.route_id, r.service_id || null, cleanHeadsign(r.route_id, r.trip_headsign), r.shape_id || null);
    });

    const insertCalendar = db.prepare('INSERT OR REPLACE INTO calendar VALUES (?, ?, ?, ?)');
    await forEachRow(zip, 'calendar.txt', (r) => {
      if (!r.service_id) return;
      insertCalendar.run(r.service_id, WEEKDAY_COLUMNS.map((d) => (r[d] === '1' ? '1' : '0')).join(''), r.start_date, r.end_date);
    });

    const insertCalendarDate = db.prepare('INSERT OR REPLACE INTO calendar_dates VALUES (?, ?, ?)');
    await forEachRow(zip, 'calendar_dates.txt', (r) => {
      if (!r.service_id || !r.date) return;
      insertCalendarDate.run(r.service_id, r.date, Number.parseInt(r.exception_type, 10));
    });

    const insertStopTime = db.prepare('INSERT OR IGNORE INTO stop_times VALUES (?, ?, ?, ?)');
    const tripStart = new Map();
    const tripLastStop = new Map();
    await forEachRow(zip, 'stop_times.txt', (r) => {
      const seconds = parseGtfsTimeToSeconds(r.arrival_time || r.departure_time);
      if (!r.stop_id || !r.trip_id || !Number.isFinite(seconds)) return;
      const sequence = Number(r.stop_sequence);
      insertStopTime.run(r.stop_id, seconds, r.trip_id, Number.isFinite(sequence) ? sequence : null);
      const departure = parseGtfsTimeToSeconds(r.departure_time || r.arrival_time);
      const start = tripStart.get(r.trip_id);
      if (Number.isFinite(departure) && (start == null || departure < start)) tripStart.set(r.trip_id, departure);
      const last = tripLastStop.get(r.trip_id);
      if (!last || sequence > last[0]) tripLastStop.set(r.trip_id, [sequence, r.stop_id]);
    });
    const setStart = db.prepare('UPDATE trips SET start_seconds = ? WHERE trip_id = ?');
    for (const [tripId, seconds] of tripStart) setStart.run(seconds, tripId);
    tripStart.clear();
    // Trips without a usable headsign are labelled with their final stop.
    const setHeadsign = db.prepare(
      'UPDATE trips SET headsign = (SELECT name FROM stops WHERE stop_id = ?) WHERE trip_id = ? AND headsign IS NULL'
    );
    for (const [tripId, [, stopId]] of tripLastStop) setHeadsign.run(stopId, tripId);
    tripLastStop.clear();

    const insertPoint = db.prepare('INSERT INTO shape_points VALUES (?, ?, ?, ?)');
    await forEachRow(zip, 'shapes.txt', (r) => {
      const lat = Number.parseFloat(r.shape_pt_lat);
      const lon = Number.parseFloat(r.shape_pt_lon);
      if (!r.shape_id || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
      insertPoint.run(r.shape_id, Number.parseInt(r.shape_pt_sequence, 10) || 0, lat, lon);
    });
    const insertShape = db.prepare('INSERT INTO shapes VALUES (?, ?)');
    let currentId = null;
    let points = [];
    const flush = () => {
      if (currentId != null) {
        insertShape.run(currentId, JSON.stringify(simplify(points).map(([la, lo]) => [round5(la), round5(lo)])));
      }
    };
    for (const p of db.prepare('SELECT shape_id, lat, lon FROM shape_points ORDER BY shape_id, seq').iterate()) {
      if (p.shape_id !== currentId) { flush(); currentId = p.shape_id; points = []; }
      points.push([p.lat, p.lon]);
    }
    flush();
    db.exec('DROP TABLE shape_points');

    db.exec(`
      INSERT INTO stop_routes SELECT DISTINCT st.stop_id, t.route_id FROM stop_times st JOIN trips t USING (trip_id);
      INSERT INTO route_shapes SELECT DISTINCT route_id, shape_id FROM trips WHERE shape_id IS NOT NULL;
      CREATE INDEX stop_times_trip ON stop_times(trip_id, seq);
    `);
    const insertMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    insertMeta.run('schema_version', SCHEMA_VERSION);
    insertMeta.run('built_at', new Date().toISOString());
    db.exec('COMMIT');
    db.exec('VACUUM');
    return {
      routes: db.prepare('SELECT COUNT(*) AS n FROM routes').get().n,
      stops: db.prepare('SELECT COUNT(*) AS n FROM stops').get().n,
      trips: db.prepare('SELECT COUNT(*) AS n FROM trips').get().n,
    };
  } finally {
    db.close();
  }
}

// Read-only query interface over one agency's database.
function openStore(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  db.exec(`PRAGMA cache_size = -${PAGE_CACHE_KIB}`);
  if (db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value !== SCHEMA_VERSION) {
    db.close();
    throw new Error(`Feed database ${dbPath} has an old schema`);
  }

  const headsigns = new Map();
  for (const row of db.prepare('SELECT DISTINCT route_id, headsign FROM trips WHERE headsign IS NOT NULL').iterate()) {
    if (!headsigns.has(row.route_id)) headsigns.set(row.route_id, []);
    headsigns.get(row.route_id).push(row.headsign);
  }
  const routes = db.prepare('SELECT * FROM routes').all().map((r) => ({
    routeId: r.route_id,
    shortName: r.short_name,
    longName: r.long_name,
    color: r.color,
    sortOrder: r.sort_order,
    headsigns: (headsigns.get(r.route_id) || []).sort(),
  }));

  const calendarByServiceId = new Map();
  for (const row of db.prepare('SELECT * FROM calendar').iterate()) {
    const entry = { startDate: row.start_date, endDate: row.end_date };
    WEEKDAY_COLUMNS.forEach((day, i) => { entry[day] = row.days[i] === '1'; });
    calendarByServiceId.set(row.service_id, entry);
  }
  const calendarDatesByServiceId = new Map();
  for (const row of db.prepare('SELECT * FROM calendar_dates').iterate()) {
    if (!calendarDatesByServiceId.has(row.service_id)) calendarDatesByServiceId.set(row.service_id, new Map());
    calendarDatesByServiceId.get(row.service_id).set(row.date, row.exception_type);
  }

  const toStop = (r) => r && ({
    id: r.stop_id, code: r.code, name: r.name, latitude: r.lat, longitude: r.lon,
    parentId: r.parent || null, parentName: r.parent_name || null,
  });
  const STOP_SELECT = 'SELECT s.*, st.name AS parent_name FROM stops s LEFT JOIN stations st ON st.stop_id = s.parent';
  const toTrip = (r) => r && ({
    tripId: r.trip_id, routeId: r.route_id, serviceId: r.service_id, headsign: r.headsign, shapeId: r.shape_id,
    startSeconds: r.start_seconds,
  });
  const q = {
    stop: db.prepare(`${STOP_SELECT} WHERE s.stop_id = ?`),
    stopByCode: db.prepare(`${STOP_SELECT} WHERE s.code = ? OR s.stop_id = ? ORDER BY s.code = ? DESC`),
    children: db.prepare(`${STOP_SELECT} WHERE s.parent = ? ORDER BY s.code`),
    stopRoutes: db.prepare('SELECT route_id FROM stop_routes WHERE stop_id = ?'),
    trip: db.prepare('SELECT * FROM trips WHERE trip_id = ?'),
    stopTimes: db.prepare('SELECT trip_id, seconds, seq FROM stop_times WHERE stop_id = ? AND seconds BETWEEN ? AND ?'),
    stopAtSequence: db.prepare('SELECT stop_id FROM stop_times WHERE trip_id = ? AND seq = ?'),
    tripsStarting: db.prepare(
      'SELECT * FROM trips WHERE route_id = ? AND start_seconds BETWEEN ? AND ? ORDER BY start_seconds'
    ),
    routeShapes: db.prepare('SELECT shape_id FROM route_shapes WHERE route_id = ?'),
    shape: db.prepare('SELECT points FROM shapes WHERE shape_id = ?'),
    allStops: db.prepare('SELECT stop_id, code, name, search_name FROM stops'),
  };
  const shapeCache = new Map();

  return {
    routes,
    routesById: new Map(routes.map((r) => [r.routeId, r])),
    scheduleIndex: { calendarByServiceId, calendarDatesByServiceId },
    getStop: (stopId) => toStop(q.stop.get(stopId)),
    childStops: (parentId) => q.children.all(parentId).map(toStop),
    stopByCode: (code) => toStop(q.stopByCode.get(code, code, code)),
    stopRouteIds: (stopId) => q.stopRoutes.all(stopId).map((r) => r.route_id),
    getTrip: (tripId) => toTrip(q.trip.get(tripId)),
    // Every token must start a word of the stop name ("milton" doesn't match "hamilton"); shortest names first.
    searchStops(tokens, { routeIds = null, limit = 5 } = {}) {
      const where = tokens.map(() => "(' ' || s.search_name) LIKE ?");
      const params = tokens.map((t) => `% ${t}%`);
      if (routeIds) {
        where.push(`s.stop_id IN (SELECT stop_id FROM stop_routes WHERE route_id IN (${routeIds.map(() => '?').join(',')}))`);
        params.push(...routeIds);
      }
      const sql = `${STOP_SELECT} WHERE ${where.join(' AND ')} ORDER BY length(s.name), s.name LIMIT ?`;
      return db.prepare(sql).all(...params, limit).map(toStop);
    },
    stopTimes: (stopId, fromSeconds, toSeconds) => q.stopTimes.all(stopId, fromSeconds, toSeconds),
    stopAtSequence: (tripId, seq) => q.stopAtSequence.get(tripId, seq)?.stop_id ?? null,
    tripsStarting: (routeId, fromSeconds, toSeconds) => q.tripsStarting.all(routeId, fromSeconds, toSeconds).map(toTrip),
    routeShapeIds: (routeId) => q.routeShapes.all(routeId).map((r) => r.shape_id),
    shapePoints(shapeId) {
      if (!shapeCache.has(shapeId)) {
        if (shapeCache.size >= SHAPE_CACHE_LIMIT) shapeCache.delete(shapeCache.keys().next().value);
        shapeCache.set(shapeId, JSON.parse(q.shape.get(shapeId)?.points || '[]'));
      }
      return shapeCache.get(shapeId);
    },
    iterateStops: () => q.allStops.iterate(),
    close: () => db.close(),
  };
}

// Cross-agency stop index, used to work out which agency a rider means when
// they don't say. Trigram FTS makes substring LIKE searches indexed.
function openStopIndex(indexPath) {
  const db = new DatabaseSync(indexPath);
  db.exec(`
    PRAGMA cache_size = -${PAGE_CACHE_KIB};
    CREATE TABLE IF NOT EXISTS stops (agency_id TEXT, stop_id TEXT, code TEXT, search_name TEXT);
    CREATE INDEX IF NOT EXISTS stops_code ON stops(code);
    CREATE INDEX IF NOT EXISTS stops_agency ON stops(agency_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS stop_search USING fts5(search_name, content='stops', content_rowid='rowid', tokenize='trigram');
  `);
  const hasAgency = db.prepare('SELECT 1 FROM stops WHERE agency_id = ? LIMIT 1');
  const byCode = db.prepare('SELECT DISTINCT agency_id FROM stops WHERE code = ? OR stop_id = ?');
  return {
    has: (agencyId) => Boolean(hasAgency.get(agencyId)),
    replaceAgency(agencyId, store) {
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM stops WHERE agency_id = ?').run(agencyId);
        const insert = db.prepare('INSERT INTO stops VALUES (?, ?, ?, ?)');
        for (const s of store.iterateStops()) insert.run(agencyId, s.stop_id, s.code, s.search_name);
        db.exec("INSERT INTO stop_search(stop_search) VALUES ('rebuild')");
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    agenciesForStop(query) {
      const raw = String(query || '').trim();
      const ids = new Set(byCode.all(raw, raw).map((r) => r.agency_id));
      const tokens = /^\d+$/.test(raw) ? [] : searchTokens(raw);
      if (tokens.length > 0) {
        // The trigram index narrows by substring; then require each token to start a word.
        const sql = 'SELECT s.agency_id, s.search_name FROM stop_search f JOIN stops s ON s.rowid = f.rowid WHERE ' +
          tokens.map(() => 'f.search_name LIKE ?').join(' AND ');
        for (const r of db.prepare(sql).iterate(...tokens.map((t) => `%${t}%`))) {
          const words = ` ${r.search_name}`;
          if (tokens.every((t) => words.includes(` ${t}`))) ids.add(r.agency_id);
        }
      }
      return [...ids];
    },
    close: () => db.close(),
  };
}

// True if any service in the feed runs on today's local date.
function servesToday(dbFile, timeZone, nowMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
  }).formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  const date = `${parts.year}${parts.month}${parts.day}`;
  const dayIndex = WEEKDAY_COLUMNS.indexOf(parts.weekday.toLowerCase()) + 1;
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    return Boolean(db.prepare(`
      SELECT 1 FROM calendar_dates WHERE date = ? AND exception_type = 1
      UNION ALL
      SELECT 1 FROM calendar c
      WHERE ? BETWEEN c.start_date AND c.end_date AND substr(c.days, ?, 1) = '1'
        AND NOT EXISTS (SELECT 1 FROM calendar_dates d WHERE d.service_id = c.service_id AND d.date = ? AND d.exception_type = 2)
      LIMIT 1
    `).get(date, date, dayIndex, date));
  } finally {
    db.close();
  }
}

function searchTokens(query) {
  return normalizeText(query).split(' ').filter((t) => t && t !== 'at' && t !== 'and');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Builds feeds on demand and refreshes them when the published zip changes.
// Agencies are processed one at a time to keep peak memory low.
function createFeedManager({
  agencies,
  dataDir,
  fetchImpl = (...args) => fetch(...args),
  // Base URL of databases built by the transit-feeds GitHub Actions workflow. When set, the
  // server downloads finished files instead of parsing GTFS itself (no CPU/memory spikes).
  prebuiltUrl = null,
  maxAgeMs = prebuiltUrl ? 2 * 60 * 60 * 1000 : 20 * 60 * 60 * 1000,
  now = () => Date.now(),
  log = console,
}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const byId = new Map(agencies.map((a) => [a.id, a]));
  const stores = new Map();
  const pending = new Map();
  const index = openStopIndex(path.join(dataDir, 'stops-index.sqlite'));
  let queue = Promise.resolve();
  let timer = null;

  const dbPath = (id) => path.join(dataDir, `${id}.sqlite`);
  const statePath = (id) => path.join(dataDir, `${id}.json`);
  const readState = (id) => {
    try { return JSON.parse(fs.readFileSync(statePath(id), 'utf8')); } catch { return {}; }
  };
  const writeState = (id, state) => fs.writeFileSync(statePath(id), JSON.stringify(state, null, 2));

  function open(id) {
    const store = openStore(dbPath(id));
    stores.set(id, store);
    if (!index.has(id)) index.replaceAgency(id, store);
    return store;
  }

  async function download(agency, state) {
    const headers = {};
    if (state.etag) headers['If-None-Match'] = state.etag;
    if (state.lastModified) headers['If-Modified-Since'] = state.lastModified;
    let lastError;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await fetchImpl(agency.staticUrl, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (res.status === 304) return { notModified: true };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return {
          buffer: Buffer.from(await res.arrayBuffer()),
          etag: res.headers.get('etag'),
          lastModified: res.headers.get('last-modified'),
        };
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    throw new Error(`${agency.id} GTFS download failed: ${lastError.message}`);
  }

  // Swaps a finished database into place and reindexes its stops.
  function install(id, tmp, state) {
    stores.get(id)?.close();
    stores.delete(id);
    fs.renameSync(tmp, dbPath(id));
    const store = openStore(dbPath(id));
    stores.set(id, store);
    index.replaceAgency(id, store);
    writeState(id, state);
  }

  let manifestCache = null;
  async function prebuiltManifest() {
    if (manifestCache && now() - manifestCache.fetchedAt < 10 * 60 * 1000) return manifestCache.manifest;
    const res = await fetchImpl(`${prebuiltUrl}/manifest.json`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`prebuilt manifest HTTP ${res.status}`);
    manifestCache = { fetchedAt: now(), manifest: await res.json() };
    return manifestCache.manifest;
  }

  async function refreshPrebuilt(id, { force = false } = {}) {
    const manifest = await prebuiltManifest();
    const entry = manifest.agencies?.[id];
    if (manifest.schemaVersion !== SCHEMA_VERSION || !entry) {
      throw new Error(`${id} isn't in the prebuilt feeds yet (schema ${manifest.schemaVersion}, need ${SCHEMA_VERSION})`);
    }
    const hasDb = fs.existsSync(dbPath(id));
    const state = readState(id);
    const checkedAt = new Date(now()).toISOString();
    if (hasDb && !force && entry.sha256 === state.sha256) {
      writeState(id, { ...state, checkedAt });
      return { id, changed: false };
    }
    const res = await fetchImpl(`${prebuiltUrl}/${entry.file}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${id} prebuilt download HTTP ${res.status}`);
    const tmp = `${dbPath(id)}.download`;
    await pipeline(Readable.fromWeb(res.body), zlib.createGunzip(), fs.createWriteStream(tmp));
    openStore(tmp).close(); // verify before swapping in
    install(id, tmp, { checkedAt, sha256: entry.sha256, builtAt: entry.builtAt, source: 'prebuilt', ...entry.counts });
    log.log(`[transitArrival] installed prebuilt ${id} (built ${entry.builtAt})`);
    return { id, changed: true };
  }

  async function refreshNow(id, options = {}) {
    return prebuiltUrl ? refreshPrebuilt(id, options) : buildLocally(id, options);
  }

  async function buildLocally(id, { force = false } = {}) {
    const agency = byId.get(id);
    const hasDb = fs.existsSync(dbPath(id));
    const state = hasDb && !force ? readState(id) : {};
    const result = await download(agency, state);
    const checkedAt = new Date(now()).toISOString();
    if (result.notModified) {
      writeState(id, { ...state, checkedAt });
      return { id, changed: false };
    }
    const sha256 = crypto.createHash('sha256').update(result.buffer).digest('hex');
    if (hasDb && !force && sha256 === state.sha256) {
      writeState(id, { ...state, checkedAt, etag: result.etag, lastModified: result.lastModified });
      return { id, changed: false };
    }
    const tmp = `${dbPath(id)}.building`;
    const counts = await buildAgencyDb(result.buffer, tmp);
    // Some agencies publish next season's timetable before it starts. Keep the
    // current one until the new file actually covers today (re-checked daily).
    if (hasDb && !force && !servesToday(tmp, agency.timeZone, now()) && servesToday(dbPath(id), agency.timeZone, now())) {
      fs.rmSync(tmp, { force: true });
      writeState(id, { ...state, checkedAt });
      log.log(`[transitArrival] ${id}: new timetable doesn't start yet; keeping the current one`);
      return { id, changed: false, deferred: true };
    }
    install(id, tmp, { checkedAt, sha256, etag: result.etag, lastModified: result.lastModified, builtAt: checkedAt, ...counts });
    log.log(`[transitArrival] built ${id}: ${counts.routes} routes, ${counts.stops} stops, ${counts.trips} trips`);
    return { id, changed: true, ...counts };
  }

  // Serialised so two builds never run at once.
  function refresh(id, options) {
    if (!byId.has(id)) return Promise.reject(new Error(`Unknown agency ${id}`));
    if (!pending.has(id)) {
      const job = queue.then(() => refreshNow(id, options)).finally(() => pending.delete(id));
      queue = job.catch(() => {});
      pending.set(id, job);
    }
    return pending.get(id);
  }

  async function getStore(id) {
    if (stores.has(id)) return stores.get(id);
    if (fs.existsSync(dbPath(id)) && !pending.has(id)) {
      try {
        return open(id);
      } catch (err) {
        log.warn(`[transitArrival] rebuilding ${id}: ${err.message}`);
      }
    }
    await refresh(id, { force: true });
    return stores.get(id);
  }

  async function refreshStale() {
    for (const agency of agencies) {
      const checkedAt = Date.parse(readState(agency.id).checkedAt || '') || 0;
      let unreadable = false;
      if (fs.existsSync(dbPath(agency.id)) && !stores.has(agency.id)) {
        try { open(agency.id); } catch { unreadable = true; } // old schema or corrupt
      }
      if (!unreadable && stores.has(agency.id) && now() - checkedAt < maxAgeMs) continue;
      try {
        await refresh(agency.id, { force: unreadable });
      } catch (err) {
        log.error(`[transitArrival] refresh ${agency.id} failed: ${err.message}`);
      }
    }
  }

  return {
    getStore,
    refresh,
    refreshStale,
    agenciesForStop: (query) => index.agenciesForStop(query),
    startScheduler(intervalMs = 60 * 60 * 1000) {
      timer = setInterval(() => refreshStale(), intervalMs);
      timer.unref();
    },
    close() {
      if (timer) clearInterval(timer);
      for (const store of stores.values()) store.close();
      stores.clear();
      index.close();
    },
  };
}

module.exports = {
  SCHEMA_VERSION, buildAgencyDb, openStore, servesToday, createFeedManager, normalizeText, searchTokens, simplify,
};
