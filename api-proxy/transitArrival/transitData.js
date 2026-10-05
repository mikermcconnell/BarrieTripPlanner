'use strict';

const { isServiceActive } = require('../detour/routeSchedule');
const { parseTripUpdates } = require('./tripUpdatesParser');
const { AGENCY, REALTIME_CACHE_MS } = require('./config');

const DEFAULT_ARRIVAL_LIMIT = 5;
const DEFAULT_STOP_LIMIT = 5;
const PAST_ARRIVAL_GRACE_SECONDS = 30;
const SCHEDULE_LOOKAHEAD_SECONDS = 90 * 60;
const NEXT_SERVICE_SEARCH_SECONDS = 36 * 60 * 60;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// "2:34 p.m." already ends a sentence; avoid "p.m..".
const endSentence = (text) => (text.endsWith('.') ? text : `${text}.`);

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

async function fetchTripUpdatesFeed() {
  const res = await fetch(AGENCY.tripUpdatesUrl);
  if (!res.ok) throw new Error(`TripUpdates HTTP ${res.status}`);
  return parseTripUpdates(await res.arrayBuffer());
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildStaticIndex(staticData) {
  const stopRouteIds = new Map();
  for (const [routeId, sequences] of Object.entries(staticData.routeStopSequencesMapping || {})) {
    for (const stopIds of Object.values(sequences)) {
      for (const stopId of stopIds) {
        if (!stopRouteIds.has(stopId)) stopRouteIds.set(stopId, new Set());
        stopRouteIds.get(stopId).add(routeId);
      }
    }
  }

  const headsignsByRoute = new Map();
  for (const trip of staticData.tripMapping.values()) {
    const headsign = String(trip.headsign || '').trim();
    if (!headsign) continue;
    if (!headsignsByRoute.has(trip.routeId)) headsignsByRoute.set(trip.routeId, new Set());
    headsignsByRoute.get(trip.routeId).add(headsign);
  }

  const stops = [...staticData.stopsById.values()]
    .filter((stop) => stop.locationType === 0 && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
    .map((stop) => ({ ...stop, searchName: normalizeText(stop.name) }));

  const routeIdByShape = new Map();
  for (const [routeId, shapeIds] of staticData.routeShapeMapping || []) {
    for (const shapeId of shapeIds) routeIdByShape.set(shapeId, routeId);
  }

  const tripServiceId = new Map();
  for (const trips of staticData.scheduleIndex?.tripsByRouteId?.values() || []) {
    for (const trip of trips) tripServiceId.set(trip.tripId, trip.serviceId);
  }

  return {
    lastRefresh: staticData.lastRefresh,
    stopRouteIds,
    headsignsByRoute,
    stops,
    routeIdByShape,
    tripServiceId,
    shapePoints: new Map(),
  };
}

function createTransitData({
  getStaticData = require('../gtfsLoader').getStaticData,
  fetchVehicles = require('../vehicleFetcher').fetchVehicles,
  fetchTripUpdates = fetchTripUpdatesFeed,
  now = () => Date.now(),
  realtimeCacheMs = REALTIME_CACHE_MS,
} = {}) {
  let staticIndex = null;
  let realtime = null;
  let realtimePromise = null;

  async function loadStatic() {
    const data = await getStaticData();
    if (!staticIndex || staticIndex.lastRefresh !== data.lastRefresh) {
      staticIndex = buildStaticIndex(data);
    }
    return { data, index: staticIndex };
  }

  async function refreshRealtime(tripMapping) {
    const [tripUpdatesResult, vehiclesResult] = await Promise.allSettled([
      fetchTripUpdates(),
      fetchVehicles(tripMapping),
    ]);
    return {
      fetchedAt: now(),
      tripUpdates: tripUpdatesResult.status === 'fulfilled'
        ? tripUpdatesResult.value
        : { updates: [], status: 'unavailable', ageMs: null, error: tripUpdatesResult.reason?.message },
      vehicles: vehiclesResult.status === 'fulfilled' ? vehiclesResult.value : [],
      vehiclesError: vehiclesResult.status === 'rejected' ? vehiclesResult.reason?.message : null,
    };
  }

  async function loadRealtime(tripMapping) {
    if (realtime && now() - realtime.fetchedAt < realtimeCacheMs) return realtime;
    if (!realtimePromise) {
      realtimePromise = refreshRealtime(tripMapping)
        .then((result) => { realtime = result; return result; })
        .finally(() => { realtimePromise = null; });
    }
    return realtimePromise;
  }

  function describeRoute(data, index, routeId) {
    const route = data.routesById?.get(routeId);
    return {
      routeId,
      name: route?.shortName || routeId,
      longName: route?.longName || '',
      color: data.routeColors?.get(routeId) || null,
      headsigns: [...(index.headsignsByRoute.get(routeId) || [])].sort(),
    };
  }

  // "8", "Route 8", "8a", "red", "rvh yonge" -> matching route ids.
  // A bare number matches its lettered variants (8 -> 8A, 8B) but not 80.
  function resolveRoutes(data, query) {
    const allIds = [...(data.routesById?.keys() || [])];
    const cleaned = String(query || '').trim().replace(/^route\s+/i, '').toUpperCase();
    if (!cleaned) return [];
    if (allIds.includes(cleaned)) return [cleaned];

    const variants = allIds.filter((id) => id.startsWith(cleaned) && /^[A-Z]+$/.test(id.slice(cleaned.length)));
    if (variants.length > 0) return variants.sort();

    const wanted = normalizeText(cleaned);
    return allIds.filter((id) => {
      const route = data.routesById.get(id);
      return normalizeText(route.shortName) === wanted || normalizeText(route.longName).includes(wanted);
    }).sort();
  }

  function toStopResult(stop, index) {
    return {
      stopId: stop.id,
      stopCode: stop.code,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      routes: [...(index.stopRouteIds.get(stop.id) || [])].sort(),
    };
  }

  async function listRoutes() {
    const { data, index } = await loadStatic();
    return [...data.routesById.keys()]
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map((routeId) => describeRoute(data, index, routeId));
  }

  async function findStops({ query, route, limit = DEFAULT_STOP_LIMIT } = {}) {
    const { data, index } = await loadStatic();
    const routeIds = route ? resolveRoutes(data, route) : null;
    let candidates = index.stops;
    if (routeIds) {
      candidates = candidates.filter((stop) => routeIds.some((id) => index.stopRouteIds.get(stop.id)?.has(id)));
    }

    const raw = String(query || '').trim();
    if (!raw) return [];
    const exact = candidates.find((stop) => stop.code === raw || stop.id === raw);
    if (exact) return [toStopResult(exact, index)];

    const tokens = normalizeText(raw).split(' ').filter((token) => token && token !== 'at' && token !== 'and');
    if (tokens.length === 0) return [];
    return candidates
      .filter((stop) => tokens.every((token) => stop.searchName.includes(token)))
      .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((stop) => toStopResult(stop, index));
  }

  function formatClock(epochSeconds) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: AGENCY.timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(epochSeconds * 1000));
  }

  // "5:45 a.m." today, "5:45 a.m. tomorrow", or "5:45 a.m. Monday".
  function formatWhen(epochSeconds) {
    const dayNumber = (ms) => {
      const p = zonedParts(ms, AGENCY.timeZone);
      return Date.UTC(p.year, p.month - 1, p.day) / 86400000;
    };
    const diff = dayNumber(epochSeconds * 1000) - dayNumber(now());
    if (diff <= 0) return formatClock(epochSeconds);
    if (diff === 1) return `${formatClock(epochSeconds)} tomorrow`;
    const weekday = new Intl.DateTimeFormat('en-CA', { timeZone: AGENCY.timeZone, weekday: 'long' })
      .format(new Date(epochSeconds * 1000));
    return `${formatClock(epochSeconds)} ${weekday}`;
  }

  // Timetable arrivals at the given stops within [fromEpoch, toEpoch], for trips
  // whose service runs that day. Trips with live predictions are excluded so the
  // live time always wins.
  function scheduledArrivals(data, index, stopIds, { fromEpoch, toEpoch, routeIds, direction, excludeTripIds }) {
    const arrivals = [];
    for (const serviceDay of serviceDaysAround(now(), AGENCY.timeZone)) {
      for (const stopId of stopIds) {
        for (const { tripId, seconds } of data.stopTimesByStop?.get(stopId) || []) {
          const epoch = serviceDay.zeroEpoch + seconds;
          if (epoch < fromEpoch || epoch > toEpoch || excludeTripIds.has(tripId)) continue;
          const trip = data.tripMapping.get(tripId);
          if (!trip || (routeIds && !routeIds.includes(trip.routeId))) continue;
          if (!matchesDirection(trip.headsign, direction)) continue;
          if (!isServiceActive(index.tripServiceId.get(tripId), data.scheduleIndex, serviceDay)) continue;
          arrivals.push({ tripId, routeId: trip.routeId, headsign: trip.headsign || null, stopId, epoch });
        }
      }
    }
    return arrivals.sort((a, b) => a.epoch - b.epoch);
  }

  // Next scheduled trip start on any of the routes, searching up to ~36h ahead.
  function nextRouteTrip(data, index, routeIds, direction, nowSeconds) {
    let best = null;
    for (const serviceDay of serviceDaysAround(now(), AGENCY.timeZone)) {
      for (const routeId of routeIds) {
        for (const trip of data.scheduleIndex?.tripsByRouteId?.get(routeId) || []) {
          const epoch = serviceDay.zeroEpoch + trip.startTimeSeconds;
          if (epoch < nowSeconds || epoch > nowSeconds + NEXT_SERVICE_SEARCH_SECONDS) continue;
          if (best && epoch >= best.epoch) continue;
          const headsign = data.tripMapping.get(trip.tripId)?.headsign || '';
          if (!matchesDirection(headsign, direction)) continue;
          if (!isServiceActive(trip.serviceId, data.scheduleIndex, serviceDay)) continue;
          best = { routeId, headsign, epoch };
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

  function nextStopForUpdate(update, nowSeconds, data) {
    const upcoming = update?.stopTimeUpdates.find((stu) => {
      const time = stu.arrival?.time || stu.departure?.time;
      return stu.scheduleRelationship !== 'SKIPPED' && time && time >= nowSeconds - PAST_ARRIVAL_GRACE_SECONDS;
    });
    if (!upcoming) return null;
    const time = upcoming.arrival?.time || upcoming.departure?.time;
    return {
      stopId: upcoming.stopId,
      name: data.stopsById.get(upcoming.stopId)?.name || upcoming.stopId,
      minutes: Math.max(0, Math.round((time - nowSeconds) / 60)),
      time: formatClock(time),
      epoch: time,
    };
  }

  function toVehicleResult(vehicle, data, update, nowSeconds) {
    const trip = data.tripMapping.get(vehicle.tripId);
    return {
      vehicleId: vehicle.id,
      tripId: vehicle.tripId || null,
      routeId: vehicle.routeId,
      headsign: trip?.headsign || null,
      latitude: vehicle.coordinate.latitude,
      longitude: vehicle.coordinate.longitude,
      lastUpdateSecondsAgo: Math.max(0, nowSeconds - Number(vehicle.timestamp)),
      nextStop: update ? nextStopForUpdate(update, nowSeconds, data) : null,
    };
  }

  function matchesDirection(headsign, direction) {
    if (!direction) return true;
    return normalizeText(headsign).includes(normalizeText(direction));
  }

  // Live status for a stop (next arrivals) and/or a route (where its vehicles are).
  async function getStatus({ route, stop, direction, limit = DEFAULT_ARRIVAL_LIMIT } = {}) {
    const { data, index } = await loadStatic();
    const rt = await loadRealtime(data.tripMapping);
    const nowSeconds = Math.floor(now() / 1000);
    const result = { agency: AGENCY.name, feed: feedSummary(rt), routes: [], stop: null, arrivals: [], vehicles: [], notes: [] };

    let routeIds = null;
    if (route) {
      routeIds = resolveRoutes(data, route);
      if (routeIds.length === 0) {
        result.notes.push(`No route matches "${route}". Call list_routes to see valid routes.`);
        return result;
      }
      result.routes = routeIds.map((id) => describeRoute(data, index, id));
    }

    // Stops sharing a name (e.g. both sides of the street) are treated as one
    // place so riders aren't asked to pick between identical names.
    let selectedStops = null;
    if (stop) {
      const found = await findStops({ query: stop, route, limit: 10 });
      const exactName = found.filter((m) => normalizeText(m.name) === normalizeText(stop));
      const matches = exactName.length > 0 ? exactName : found;
      const names = new Set(matches.map((m) => normalizeText(m.name)));
      if (matches.length === 0 || names.size > 1) {
        result.notes.push(matches.length === 0
          ? `No stop matches "${stop}". Try a stop number or a nearby street name.`
          : `"${stop}" matches several places. Ask the rider which one, or pass its stopCode.`);
        result.stopCandidates = matches;
        return result;
      }
      selectedStops = matches;
      result.stop = {
        ...matches[0],
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
        const trip = data.tripMapping.get(update.tripId);
        const routeId = update.routeId || trip?.routeId;
        if (routeIds && !routeIds.includes(routeId)) continue;
        if (!matchesDirection(trip?.headsign, direction)) continue;

        const stu = update.stopTimeUpdates.find((s) => selectedStopIds.has(s.stopId) && s.scheduleRelationship !== 'SKIPPED');
        const time = stu && (stu.arrival?.time || stu.departure?.time);
        if (!time || time < nowSeconds - PAST_ARRIVAL_GRACE_SECONDS) continue;

        const vehicle = vehiclesByTrip.get(update.tripId);
        result.arrivals.push({
          tripId: update.tripId,
          routeId,
          headsign: trip?.headsign || null,
          stopCode: data.stopsById.get(stu.stopId)?.code || stu.stopId,
          minutes: Math.max(0, Math.round((time - nowSeconds) / 60)),
          arrivalTime: formatClock(time),
          arrivalEpoch: time,
          delayMinutes: Number.isFinite(stu.arrival?.delay) ? Math.round(stu.arrival.delay / 60) : null,
          realtime: true,
          vehicle: vehicle ? toVehicleResult(vehicle, data, update, nowSeconds) : null,
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
          headsign: s.headsign,
          stopCode: data.stopsById.get(s.stopId)?.code || s.stopId,
          minutes: Math.max(0, Math.round((s.epoch - nowSeconds) / 60)),
          arrivalTime: formatWhen(s.epoch),
          arrivalEpoch: s.epoch,
          delayMinutes: null,
          realtime: false,
          vehicle: vehicle ? toVehicleResult(vehicle, data, null, nowSeconds) : null,
        };
      };
      const scheduled = scheduledArrivals(data, index, selectedStopIds, {
        ...scheduleQuery,
        fromEpoch: nowSeconds - PAST_ARRIVAL_GRACE_SECONDS,
        toEpoch: nowSeconds + SCHEDULE_LOOKAHEAD_SECONDS,
      });
      result.arrivals = [...result.arrivals, ...scheduled.map(toArrival)]
        .sort((a, b) => a.arrivalEpoch - b.arrivalEpoch)
        .slice(0, limit);

      if (result.arrivals.length === 0) {
        const [next] = scheduledArrivals(data, index, selectedStopIds, {
          ...scheduleQuery,
          fromEpoch: nowSeconds,
          toEpoch: nowSeconds + NEXT_SERVICE_SEARCH_SECONDS,
        });
        result.nextScheduled = next ? toArrival(next) : null;
        result.notes.push(next
          ? `Nothing is due here in the next ${SCHEDULE_LOOKAHEAD_SECONDS / 60} minutes. Next scheduled: Route ${next.routeId}` +
            `${next.headsign ? ` ${next.headsign}` : ''} at ${endSentence(formatWhen(next.epoch))}`
          : 'No service is scheduled at this stop in the next day and a half.');
      }
    }

    if (routeIds) {
      result.vehicles = rt.vehicles
        .filter((v) => routeIds.includes(v.routeId))
        .filter((v) => matchesDirection(data.tripMapping.get(v.tripId)?.headsign, direction))
        .map((v) => toVehicleResult(v, data, predictionsUsable ? updatesByTrip.get(v.tripId) : null, nowSeconds));
      if (result.vehicles.length === 0 && !selectedStops) {
        const next = nextRouteTrip(data, index, routeIds, direction, nowSeconds);
        result.notes.push(next
          ? `No vehicles on this route are running right now. The next trip (Route ${next.routeId}` +
            `${next.headsign ? ` ${next.headsign}` : ''}) is scheduled to start at ${endSentence(formatWhen(next.epoch))}`
          : 'No vehicles on this route are running right now, and no trips are scheduled in the next day and a half.');
      }
    } else {
      result.vehicles = result.arrivals.map((a) => a.vehicle).filter(Boolean);
    }

    result.map = buildMapData(data, index, result, routeIds);
    return result;
  }

  // Widget-only geometry: shapes of the trips shown, or the whole route when
  // nothing is running. Kept out of the model-visible payload by the MCP layer.
  function buildMapData(data, index, result, routeIds) {
    const shapeIds = new Set();
    for (const tripId of [...result.arrivals, ...result.vehicles].map((item) => item.tripId)) {
      const shapeId = data.tripMapping.get(tripId)?.shapeId;
      if (shapeId) shapeIds.add(shapeId);
    }
    if (shapeIds.size === 0 && routeIds) {
      for (const routeId of routeIds) {
        for (const shapeId of data.routeShapeMapping.get(routeId) || []) shapeIds.add(shapeId);
      }
    }

    const shapes = [];
    for (const shapeId of shapeIds) {
      if (!index.shapePoints.has(shapeId)) {
        const points = (data.shapes.get(shapeId) || []).map((p) => [
          Math.round(p.latitude * 1e5) / 1e5,
          Math.round(p.longitude * 1e5) / 1e5,
        ]);
        index.shapePoints.set(shapeId, points);
      }
      const routeId = index.routeIdByShape.get(shapeId);
      shapes.push({ routeId, color: data.routeColors?.get(routeId) || null, points: index.shapePoints.get(shapeId) });
    }
    return { shapes };
  }

  return { listRoutes, findStops, getStatus };
}

module.exports = { createTransitData };
