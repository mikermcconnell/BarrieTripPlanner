'use strict';

const { isServiceActive } = require('../detour/routeSchedule');
const { normalizeText, searchTokens } = require('./feedStore');
const realtimeFeeds = require('./realtime');
const { REALTIME_CACHE_MS } = require('./config');

const DEFAULT_ARRIVAL_LIMIT = 5;
const DEFAULT_STOP_LIMIT = 5;
const PAST_ARRIVAL_GRACE_SECONDS = 30;
const SCHEDULE_LOOKAHEAD_SECONDS = 90 * 60;
const NEXT_SERVICE_SEARCH_SECONDS = 36 * 60 * 60;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// "2:34 p.m." already ends a sentence; avoid "p.m..".
const endSentence = (text) => (text.endsWith('.') ? text : `${text}.`);

// "001" -> "1", "098|099" -> "98|99"; riders don't say the padding.
const displayRouteName = (shortName) => String(shortName || '').replace(/(^|\|)0+(?=\d)/g, '$1');
const routeKey = (text) => normalizeText(text).replace(/(^| )0+(?=\d)/g, '$1');

// Platforms and bays of one terminal are one place to a rider.
const placeKey = (name) => normalizeText(name).replace(/ (platform|bay) [a-z0-9]+$/, '');

function zonedParts(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
  return { year: v.year, month: v.month, day: v.day, hour: v.hour, minute: v.minute, second: v.second };
}

// Service days around "now" (yesterday for after-midnight trips, today, tomorrow),
// each with the epoch of GTFS time zero ("noon minus 12h" local time).
function serviceDaysAround(nowMs, timeZone) {
  const local = zonedParts(nowMs, timeZone);
  return [-1, 0, 1].map((offset) => {
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    const noonUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12);
    const noonLocal = zonedParts(noonUtc, timeZone);
    const offsetMs = Date.UTC(noonLocal.year, noonLocal.month - 1, noonLocal.day, noonLocal.hour, noonLocal.minute) - noonUtc;
    return {
      dateKey: date.toISOString().slice(0, 10).replace(/-/g, ''),
      weekday: WEEKDAYS[date.getUTCDay()],
      zeroEpoch: (noonUtc - offsetMs) / 1000 - 12 * 3600,
    };
  });
}

const toRad = (deg) => (deg * Math.PI) / 180;
const compass = (dx, dy) => (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
const angleBetween = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const SEGMENT_TIE_METERS = 25;

// Heading for feeds that don't report one: the direction of the trip's shape
// where the vehicle is. Out-and-back shapes overlap themselves, so among
// near-equal segments prefer the one pointing toward the next stop.
function shapeBearing(points, latitude, longitude, toward) {
  if (!points || points.length < 2) return null;
  const kx = 111320 * Math.cos(toRad(latitude));
  const ky = 110540;
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = [(points[i][1] - longitude) * kx, (points[i][0] - latitude) * ky];
    const [bx, by] = [(points[i + 1][1] - longitude) * kx, (points[i + 1][0] - latitude) * ky];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    segments.push({ dist: Math.hypot(ax + t * dx, ay + t * dy), bearing: compass(dx, dy) });
  }
  if (segments.length === 0) return null;
  const nearest = Math.min(...segments.map((s) => s.dist));
  const close = segments.filter((s) => s.dist <= nearest + SEGMENT_TIE_METERS);
  let best = close.find((s) => s.dist === nearest);
  if (toward && close.length > 1) {
    const target = compass((toward.longitude - longitude) * kx, (toward.latitude - latitude) * ky);
    best = close.reduce((a, b) => (angleBetween(b.bearing, target) < angleBetween(a.bearing, target) ? b : a));
  }
  return Math.round(best.bearing);
}

function matchesDirection(headsign, direction) {
  if (!direction) return true;
  return normalizeText(headsign).includes(normalizeText(direction));
}

// "8", "Route 8", "8a", "blue", "viva blue" -> matching route ids.
// A bare name matches its single-letter variants (8 -> 8A, 8B) but not 80.
function resolveRoutes(store, query) {
  const cleaned = String(query || '').trim().replace(/^route\s+/i, '');
  const wanted = routeKey(cleaned);
  if (!wanted) return [];
  const sorted = (routes) => routes
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      displayRouteName(a.shortName).localeCompare(displayRouteName(b.shortName), 'en', { numeric: true }))
    .map((r) => r.routeId);

  const exact = store.routes.filter((r) => routeKey(r.shortName) === wanted);
  if (exact.length > 0) return sorted(exact);
  const byId = store.routes.filter((r) => r.routeId.toLowerCase() === cleaned.toLowerCase());
  if (byId.length > 0) return sorted(byId);
  const variants = store.routes.filter((r) => {
    const key = routeKey(r.shortName);
    return key.startsWith(wanted) && /^ ?[a-z]$/.test(key.slice(wanted.length));
  });
  if (variants.length > 0) return sorted(variants);
  return sorted(store.routes.filter((r) => routeKey(r.longName).includes(wanted)));
}

// One agency's arrivals, vehicles and stops, read from its feed store.
function createTransitData({
  agency,
  getStore,
  fetchTripUpdates = () => realtimeFeeds.fetchTripUpdates(agency.tripUpdatesUrl),
  fetchVehicles = () => realtimeFeeds.fetchVehicles(agency.vehiclePositionsUrl),
  now = () => Date.now(),
  realtimeCacheMs = REALTIME_CACHE_MS,
}) {
  const timeZone = agency.timeZone;
  const agencyInfo = { id: agency.id, name: agency.name };
  let realtime = null;
  let realtimePromise = null;

  async function refreshRealtime() {
    const [tripUpdatesResult, vehiclesResult] = await Promise.allSettled([fetchTripUpdates(), fetchVehicles()]);
    return {
      fetchedAt: now(),
      tripUpdates: tripUpdatesResult.status === 'fulfilled'
        ? tripUpdatesResult.value
        : { updates: [], status: 'unavailable', ageMs: null, error: tripUpdatesResult.reason?.message },
      vehicles: vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : [],
      vehiclesError: vehiclesResult.status === 'rejected' ? vehiclesResult.reason?.message : null,
    };
  }

  // Fetched only while riders are asking about this agency; idle agencies cost nothing.
  async function loadRealtime() {
    if (realtime && now() - realtime.fetchedAt < realtimeCacheMs) return realtime;
    if (!realtimePromise) {
      realtimePromise = refreshRealtime()
        .then((result) => { realtime = result; return result; })
        .finally(() => { realtimePromise = null; });
    }
    return realtimePromise;
  }

  const routeName = (store, routeId) => displayRouteName(store.routesById.get(routeId)?.shortName || routeId);

  function describeRoute(store, routeId) {
    const route = store.routesById.get(routeId);
    return {
      routeId,
      name: routeName(store, routeId),
      longName: route?.longName || '',
      color: route?.color || null,
      headsigns: route?.headsigns || [],
    };
  }

  function toStopResult(store, stop) {
    return {
      agencyId: agency.id,
      stopId: stop.id,
      stopCode: stop.code,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      routes: store.stopRouteIds(stop.id).map((id) => routeName(store, id))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
    };
  }

  async function listRoutes() {
    const store = await getStore();
    return [...store.routes]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        displayRouteName(a.shortName).localeCompare(displayRouteName(b.shortName), 'en', { numeric: true }))
      .map((r) => describeRoute(store, r.routeId));
  }

  async function hasRoute(route) {
    return resolveRoutes(await getStore(), route).length > 0;
  }

  async function findStops({ query, route, limit = DEFAULT_STOP_LIMIT } = {}) {
    const store = await getStore();
    const raw = String(query || '').trim();
    if (!raw) return [];
    const routeIds = route ? resolveRoutes(store, route) : null;
    if (routeIds && routeIds.length === 0) return [];

    const exact = store.stopByCode(raw);
    if (exact && (!routeIds || store.stopRouteIds(exact.id).some((id) => routeIds.includes(id)))) {
      return [toStopResult(store, exact)];
    }
    // A bare number is a stop number; don't fall back to names containing it.
    if (/^\d+$/.test(raw)) return [];
    const tokens = searchTokens(raw);
    if (tokens.length === 0) return [];
    return store.searchStops(tokens, { routeIds, limit }).map((stop) => toStopResult(store, stop));
  }

  function formatClock(epochSeconds) {
    return new Intl.DateTimeFormat('en-CA', { timeZone, hour: 'numeric', minute: '2-digit' })
      .format(new Date(epochSeconds * 1000));
  }

  // "5:45 a.m." today, "5:45 a.m. tomorrow", or "5:45 a.m. Monday".
  function formatWhen(epochSeconds) {
    const dayNumber = (ms) => {
      const p = zonedParts(ms, timeZone);
      return Date.UTC(p.year, p.month - 1, p.day) / 86400000;
    };
    const diff = dayNumber(epochSeconds * 1000) - dayNumber(now());
    if (diff <= 0) return formatClock(epochSeconds);
    if (diff === 1) return `${formatClock(epochSeconds)} tomorrow`;
    const weekday = new Intl.DateTimeFormat('en-CA', { timeZone, weekday: 'long' }).format(new Date(epochSeconds * 1000));
    return `${formatClock(epochSeconds)} ${weekday}`;
  }

  // Timetable arrivals at the given stops within [fromEpoch, toEpoch], for trips
  // whose service runs that day. Trips with live predictions are excluded so the
  // live time always wins.
  function scheduledArrivals(store, tripOf, stopIds, { fromEpoch, toEpoch, routeIds, direction, excludeTripIds }) {
    const arrivals = [];
    for (const serviceDay of serviceDaysAround(now(), timeZone)) {
      for (const stopId of stopIds) {
        for (const row of store.stopTimes(stopId, fromEpoch - serviceDay.zeroEpoch, toEpoch - serviceDay.zeroEpoch)) {
          if (excludeTripIds.has(row.trip_id)) continue;
          const trip = tripOf(row.trip_id);
          if (!trip || (routeIds && !routeIds.includes(trip.routeId))) continue;
          if (!matchesDirection(trip.headsign, direction)) continue;
          if (!isServiceActive(trip.serviceId, store.scheduleIndex, serviceDay)) continue;
          arrivals.push({
            tripId: row.trip_id, routeId: trip.routeId, headsign: trip.headsign || null, stopId,
            epoch: serviceDay.zeroEpoch + row.seconds,
          });
        }
      }
    }
    return arrivals.sort((a, b) => a.epoch - b.epoch);
  }

  // Next scheduled trip start on any of the routes, searching up to ~36h ahead.
  function nextRouteTrip(store, routeIds, direction, nowSeconds) {
    let best = null;
    for (const serviceDay of serviceDaysAround(now(), timeZone)) {
      const from = nowSeconds - serviceDay.zeroEpoch;
      for (const routeId of routeIds) {
        for (const trip of store.tripsStarting(routeId, from, from + NEXT_SERVICE_SEARCH_SECONDS)) {
          const epoch = serviceDay.zeroEpoch + trip.startSeconds;
          if (best && epoch >= best.epoch) break;
          if (!matchesDirection(trip.headsign, direction)) continue;
          if (!isServiceActive(trip.serviceId, store.scheduleIndex, serviceDay)) continue;
          best = { routeId, headsign: trip.headsign || '', epoch };
          break;
        }
      }
    }
    return best;
  }

  function feedSummary(rt) {
    const { status, ageMs } = rt.tripUpdates;
    return {
      predictions: status,
      predictionsAgeSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null,
      vehiclesTracked: rt.vehicles.length,
      fetchedAt: new Date(rt.fetchedAt).toISOString(),
    };
  }

  // Live status for a stop (next arrivals) and/or a route (where its vehicles are).
  async function getStatus({ route, stop, direction, limit = DEFAULT_ARRIVAL_LIMIT } = {}) {
    const store = await getStore();
    const rt = await loadRealtime();
    const nowSeconds = Math.floor(now() / 1000);
    const trips = new Map();
    const tripOf = (tripId) => {
      if (!tripId) return null;
      if (!trips.has(tripId)) trips.set(tripId, store.getTrip(tripId));
      return trips.get(tripId);
    };
    const stopName = (stopId) => store.getStop(stopId)?.name || stopId;
    const stopCode = (stopId) => store.getStop(stopId)?.code || stopId;

    function nextStopForUpdate(update) {
      const upcoming = update?.stopTimeUpdates.find((stu) => {
        const time = stu.arrival?.time || stu.departure?.time;
        return stu.scheduleRelationship !== 'SKIPPED' && time && time >= nowSeconds - PAST_ARRIVAL_GRACE_SECONDS;
      });
      if (!upcoming) return null;
      const time = upcoming.arrival?.time || upcoming.departure?.time;
      return {
        stopId: upcoming.stopId,
        name: stopName(upcoming.stopId),
        minutes: Math.max(0, Math.round((time - nowSeconds) / 60)),
        time: formatClock(time),
        epoch: time,
      };
    }

    function vehicleBearing(vehicle, trip, nextStop) {
      if (Number.isFinite(vehicle.bearing)) return Math.round(vehicle.bearing) % 360;
      if (!trip?.shapeId) return null;
      const toward = nextStop ? store.getStop(nextStop.stopId) : null;
      return shapeBearing(store.shapePoints(trip.shapeId), vehicle.coordinate.latitude, vehicle.coordinate.longitude, toward);
    }

    function toVehicleResult(vehicle, update) {
      const trip = tripOf(vehicle.tripId);
      const routeId = trip?.routeId || vehicle.routeId;
      const nextStop = update ? nextStopForUpdate(update) : null;
      return {
        vehicleId: vehicle.id,
        tripId: vehicle.tripId || null,
        routeId,
        routeName: routeName(store, routeId),
        headsign: trip?.headsign || null,
        latitude: vehicle.coordinate.latitude,
        longitude: vehicle.coordinate.longitude,
        bearing: vehicleBearing(vehicle, trip, nextStop),
        lastUpdateSecondsAgo: Math.max(0, nowSeconds - Number(vehicle.timestamp)),
        nextStop,
      };
    }

    const result = {
      agency: agencyInfo, feed: feedSummary(rt), routes: [], stop: null, arrivals: [], vehicles: [], notes: [],
    };

    let routeIds = null;
    if (route) {
      routeIds = resolveRoutes(store, route);
      if (routeIds.length === 0) {
        result.notes.push(`No ${agency.name} route matches "${route}". Call list_routes to see valid routes.`);
        return result;
      }
      result.routes = routeIds.map((id) => describeRoute(store, id));
    }

    // Stops sharing a name (both sides of the street, terminal platforms) are
    // treated as one place so riders aren't asked to pick between them.
    let selectedStops = null;
    if (stop) {
      const found = await findStops({ query: stop, route, limit: 10 });
      const exactName = found.filter((m) => placeKey(m.name) === placeKey(stop));
      const matches = exactName.length > 0 ? exactName : found;
      const places = new Set(matches.map((m) => placeKey(m.name)));
      if (matches.length === 0 || places.size > 1) {
        result.notes.push(matches.length === 0
          ? `No ${agency.name} stop matches "${stop}". Try a stop number or a nearby street name.`
          : `"${stop}" matches several places. Ask the rider which one, or pass its stopCode.`);
        result.stopCandidates = matches;
        return result;
      }
      selectedStops = matches;
      result.stop = {
        ...matches[0],
        name: matches.length > 1 ? matches[0].name.replace(/\s+(platform|bay)\s+\S+$/i, '') : matches[0].name,
        stopCodes: matches.map((m) => m.stopCode),
        locations: matches.map((m) => ({ stopCode: m.stopCode, latitude: m.latitude, longitude: m.longitude })),
      };
    }
    const selectedStopIds = new Set((selectedStops || []).map((s) => s.stopId));

    const predictionsUsable = rt.tripUpdates.status === 'fresh';
    if (!predictionsUsable) {
      const age = feedSummary(rt).predictionsAgeSeconds;
      const reason = rt.tripUpdates.status === 'stale' && age != null
        ? `Live predictions are ${Math.round(age / 60)} minutes old`
        : 'Live predictions are unavailable right now';
      result.notes.push(`${reason}, so times shown are from the timetable. Vehicle positions may still be accurate.`);
    }

    const updatesByTrip = new Map(rt.tripUpdates.updates.map((u) => [u.tripId, u]));
    const vehiclesByTrip = new Map(rt.vehicles.filter((v) => v.tripId).map((v) => [v.tripId, v]));

    if (selectedStops && predictionsUsable) {
      for (const update of rt.tripUpdates.updates) {
        if (update.scheduleRelationship === 'CANCELED' || update.scheduleRelationship === 'DELETED') continue;
        const stu = update.stopTimeUpdates.find((s) => selectedStopIds.has(s.stopId) && s.scheduleRelationship !== 'SKIPPED');
        const time = stu && (stu.arrival?.time || stu.departure?.time);
        if (!time || time < nowSeconds - PAST_ARRIVAL_GRACE_SECONDS) continue;
        const trip = tripOf(update.tripId);
        const routeId = trip?.routeId || update.routeId;
        if (routeIds && !routeIds.includes(routeId)) continue;
        if (!matchesDirection(trip?.headsign, direction)) continue;

        const vehicle = vehiclesByTrip.get(update.tripId);
        result.arrivals.push({
          tripId: update.tripId,
          routeId,
          routeName: routeName(store, routeId),
          headsign: trip?.headsign || null,
          stopCode: stopCode(stu.stopId),
          minutes: Math.max(0, Math.round((time - nowSeconds) / 60)),
          arrivalTime: formatClock(time),
          arrivalEpoch: time,
          delayMinutes: Number.isFinite(stu.arrival?.delay) ? Math.round(stu.arrival.delay / 60) : null,
          realtime: true,
          vehicle: vehicle ? toVehicleResult(vehicle, update) : null,
        });
      }
    }

    if (selectedStops) {
      // Fill in from the timetable for trips without a live prediction (not yet
      // started, or the live feed is down). Live trips, including cancelled ones,
      // are excluded so a timetable time never contradicts the live feed.
      const excludeTripIds = new Set(predictionsUsable ? rt.tripUpdates.updates.map((u) => u.tripId) : []);
      const scheduleQuery = { routeIds, direction, excludeTripIds };
      const toArrival = (s) => {
        const vehicle = vehiclesByTrip.get(s.tripId);
        return {
          tripId: s.tripId,
          routeId: s.routeId,
          routeName: routeName(store, s.routeId),
          headsign: s.headsign,
          stopCode: stopCode(s.stopId),
          minutes: Math.max(0, Math.round((s.epoch - nowSeconds) / 60)),
          arrivalTime: formatWhen(s.epoch),
          arrivalEpoch: s.epoch,
          delayMinutes: null,
          realtime: false,
          vehicle: vehicle ? toVehicleResult(vehicle, null) : null,
        };
      };
      const scheduled = scheduledArrivals(store, tripOf, selectedStopIds, {
        ...scheduleQuery,
        fromEpoch: nowSeconds - PAST_ARRIVAL_GRACE_SECONDS,
        toEpoch: nowSeconds + SCHEDULE_LOOKAHEAD_SECONDS,
      });
      result.arrivals = [...result.arrivals, ...scheduled.map(toArrival)]
        .sort((a, b) => a.arrivalEpoch - b.arrivalEpoch)
        .slice(0, limit);

      if (result.arrivals.length === 0) {
        const [next] = scheduledArrivals(store, tripOf, selectedStopIds, {
          ...scheduleQuery,
          fromEpoch: nowSeconds,
          toEpoch: nowSeconds + NEXT_SERVICE_SEARCH_SECONDS,
        });
        result.nextScheduled = next ? toArrival(next) : null;
        result.notes.push(next
          ? `Nothing is due here in the next ${SCHEDULE_LOOKAHEAD_SECONDS / 60} minutes. Next scheduled: Route ` +
            `${routeName(store, next.routeId)}${next.headsign ? ` ${next.headsign}` : ''} at ${endSentence(formatWhen(next.epoch))}`
          : 'No service is scheduled at this stop in the next day and a half.');
      }
    }

    if (routeIds) {
      result.vehicles = rt.vehicles
        .filter((v) => routeIds.includes(tripOf(v.tripId)?.routeId || v.routeId))
        .filter((v) => matchesDirection(tripOf(v.tripId)?.headsign, direction))
        .map((v) => toVehicleResult(v, predictionsUsable ? updatesByTrip.get(v.tripId) : null));
      if (result.vehicles.length === 0 && !selectedStops) {
        const next = nextRouteTrip(store, routeIds, direction, nowSeconds);
        result.notes.push(next
          ? `No vehicles on this route are running right now. The next trip (Route ${routeName(store, next.routeId)}` +
            `${next.headsign ? ` ${next.headsign}` : ''}) is scheduled to start at ${endSentence(formatWhen(next.epoch))}`
          : 'No vehicles on this route are running right now, and no trips are scheduled in the next day and a half.');
      }
    } else {
      result.vehicles = result.arrivals.map((a) => a.vehicle).filter(Boolean);
    }

    result.map = buildMapData(store, tripOf, result, routeIds);
    return result;
  }

  // Widget-only geometry: shapes of the trips shown, or the whole route when
  // nothing is running. Kept out of the model-visible payload by the MCP layer.
  function buildMapData(store, tripOf, result, routeIds) {
    const routeByShape = new Map();
    for (const item of [...result.arrivals, ...result.vehicles]) {
      const trip = tripOf(item.tripId);
      if (trip?.shapeId) routeByShape.set(trip.shapeId, trip.routeId);
    }
    if (routeByShape.size === 0 && routeIds) {
      for (const routeId of routeIds) {
        for (const shapeId of store.routeShapeIds(routeId)) routeByShape.set(shapeId, routeId);
      }
    }
    const shapes = [...routeByShape].map(([shapeId, routeId]) => ({
      routeId,
      color: store.routesById.get(routeId)?.color || null,
      points: store.shapePoints(shapeId),
    }));
    return { shapes };
  }

  return { agency: agencyInfo, listRoutes, findStops, getStatus, hasRoute };
}

module.exports = { createTransitData, resolveRoutes, displayRouteName, shapeBearing };
