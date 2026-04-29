const { SERVICE_START_HOUR, SERVICE_TIMEZONE } = require('./detectionConfig');
const { getRouteFamilyId, normalizeRouteId } = require('./routeFamily');

const SECONDS_PER_DAY = 24 * 60 * 60;
const DEFAULT_LOOKAROUND_SECONDS = 3 * 60 * 60;

function getLocalParts(nowMs, timeZone = SERVICE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: String(values.weekday || '').toLowerCase(),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function dateKeyFromDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function getServiceDay(nowMs, timeZone = SERVICE_TIMEZONE) {
  const local = getLocalParts(nowMs, timeZone);
  const utcDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const beforeServiceStart = local.hour < SERVICE_START_HOUR;
  if (beforeServiceStart) {
    utcDate.setUTCDate(utcDate.getUTCDate() - 1);
  }

  return {
    dateKey: dateKeyFromDate(utcDate),
    weekday: beforeServiceStart
      ? ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][utcDate.getUTCDay()]
      : local.weekday,
    secondsSinceServiceDayStart:
      (beforeServiceStart ? SECONDS_PER_DAY : 0) +
      local.hour * 3600 +
      local.minute * 60 +
      local.second,
  };
}

function dateKeyInRange(dateKey, startDate, endDate) {
  if (!dateKey) return false;
  if (startDate && dateKey < String(startDate)) return false;
  if (endDate && dateKey > String(endDate)) return false;
  return true;
}

function isServiceActive(serviceId, scheduleIndex, serviceDay) {
  if (!serviceId) return true;

  const exceptionType = scheduleIndex?.calendarDatesByServiceId?.get(serviceId)?.get(serviceDay.dateKey);
  if (exceptionType === 1) return true;
  if (exceptionType === 2) return false;

  const calendar = scheduleIndex?.calendarByServiceId?.get(serviceId);
  if (!calendar) return true;
  if (!dateKeyInRange(serviceDay.dateKey, calendar.startDate, calendar.endDate)) return false;
  return calendar[serviceDay.weekday] === true;
}

function getCandidateTrips(routeId, scheduleIndex, serviceDay, { includeFamily = false } = {}) {
  const routeKey = normalizeRouteId(routeId);
  if (!routeKey || !scheduleIndex?.tripsByRouteId) return [];

  const routesToCheck = includeFamily
    ? Array.from(scheduleIndex.tripsByRouteId.keys()).filter((id) => getRouteFamilyId(id) === getRouteFamilyId(routeKey))
    : [routeKey];

  return routesToCheck
    .flatMap((id) => scheduleIndex.tripsByRouteId.get(id) || [])
    .filter((trip) =>
      Number.isFinite(trip.startTimeSeconds) &&
      isServiceActive(trip.serviceId, scheduleIndex, serviceDay)
    )
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
}

function estimateHeadwayFromTrips(trips, nowSeconds, lookaroundSeconds = DEFAULT_LOOKAROUND_SECONDS) {
  const starts = [...new Set(
    trips
      .map((trip) => trip.startTimeSeconds)
      .filter((seconds) => Math.abs(seconds - nowSeconds) <= lookaroundSeconds)
  )].sort((a, b) => a - b);

  if (starts.length < 2) return null;

  const gaps = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;

  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] * 1000;
}

function estimateConservativeHeadwayMs(trips, nowSeconds) {
  const groups = new Map();
  for (const trip of trips) {
    const key = trip.directionId == null || trip.directionId === '' ? 'all' : String(trip.directionId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trip);
  }

  const headways = Array.from(groups.values())
    .map((groupTrips) => estimateHeadwayFromTrips(groupTrips, nowSeconds))
    .filter((headway) => Number.isFinite(headway) && headway > 0);

  if (headways.length === 0) {
    return estimateHeadwayFromTrips(trips, nowSeconds);
  }

  return Math.max(...headways);
}

function estimateRouteHeadwayMs(routeId, scheduleIndex, nowMs = Date.now()) {
  if (!scheduleIndex) return null;
  const serviceDay = getServiceDay(nowMs, scheduleIndex.timeZone || SERVICE_TIMEZONE);

  const exactTrips = getCandidateTrips(routeId, scheduleIndex, serviceDay, { includeFamily: false });
  const exactHeadway = estimateConservativeHeadwayMs(exactTrips, serviceDay.secondsSinceServiceDayStart);
  if (exactHeadway != null) {
    return {
      headwayMs: exactHeadway,
      source: 'exact-route',
      scheduledTripCount: exactTrips.length,
      serviceDate: serviceDay.dateKey,
    };
  }

  const familyTrips = getCandidateTrips(routeId, scheduleIndex, serviceDay, { includeFamily: true });
  const familyHeadway = estimateConservativeHeadwayMs(familyTrips, serviceDay.secondsSinceServiceDayStart);
  if (familyHeadway != null) {
    return {
      headwayMs: familyHeadway,
      source: 'route-family',
      scheduledTripCount: familyTrips.length,
      serviceDate: serviceDay.dateKey,
    };
  }

  return {
    headwayMs: null,
    source: exactTrips.length > 0 || familyTrips.length > 0 ? 'insufficient-nearby-trips' : 'no-scheduled-service',
    scheduledTripCount: Math.max(exactTrips.length, familyTrips.length),
    serviceDate: serviceDay.dateKey,
  };
}

module.exports = {
  getServiceDay,
  isServiceActive,
  estimateHeadwayFromTrips,
  estimateConservativeHeadwayMs,
  estimateRouteHeadwayMs,
};
