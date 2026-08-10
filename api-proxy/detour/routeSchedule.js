const { SERVICE_START_HOUR, SERVICE_TIMEZONE } = require('./detectionConfig');
const { getRouteFamilyId, normalizeRouteId } = require('./routeFamily');

const SECONDS_PER_DAY = 24 * 60 * 60;
const DEFAULT_LOOKAROUND_SECONDS = 3 * 60 * 60;
const MAX_ACTIVE_SERVICE_RANGE_DAYS = 3700;

function normalizeDirectionId(value) {
  if (value == null || value === '') return null;
  return String(value).trim() || null;
}

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

function getServiceActivity(serviceId, scheduleIndex, serviceDay) {
  if (!serviceId || !scheduleIndex || !serviceDay?.dateKey) {
    return { known: false, active: false, source: 'missing-service-calendar' };
  }

  const calendarDates = scheduleIndex.calendarDatesByServiceId?.get(serviceId);
  const exceptionType = calendarDates?.get(serviceDay.dateKey);
  if (exceptionType === 1) {
    return { known: true, active: true, source: 'calendar-date-added' };
  }
  if (exceptionType === 2) {
    return { known: true, active: false, source: 'calendar-date-removed' };
  }

  const calendar = scheduleIndex.calendarByServiceId?.get(serviceId);
  if (calendar) {
    if (!dateKeyInRange(serviceDay.dateKey, calendar.startDate, calendar.endDate)) {
      return { known: true, active: false, source: 'calendar-out-of-range' };
    }
    return {
      known: true,
      active: calendar[serviceDay.weekday] === true,
      source: 'calendar',
    };
  }

  if (calendarDates) {
    return { known: true, active: false, source: 'calendar-dates-only' };
  }

  return { known: false, active: false, source: 'missing-service-calendar' };
}

function getCandidateTrips(
  routeId,
  scheduleIndex,
  serviceDay,
  { includeFamily = false, directionId = null } = {}
) {
  const routeKey = normalizeRouteId(routeId);
  if (!routeKey || !scheduleIndex?.tripsByRouteId) return [];
  const normalizedDirectionId = normalizeDirectionId(directionId);

  const routesToCheck = includeFamily
    ? Array.from(scheduleIndex.tripsByRouteId.keys()).filter((id) => getRouteFamilyId(id) === getRouteFamilyId(routeKey))
    : [routeKey];

  return routesToCheck
    .flatMap((id) => scheduleIndex.tripsByRouteId.get(id) || [])
    .filter((trip) =>
      Number.isFinite(trip.startTimeSeconds) &&
      isServiceActive(trip.serviceId, scheduleIndex, serviceDay) &&
      (
        normalizedDirectionId == null ||
        normalizeDirectionId(trip.directionId) === normalizedDirectionId
      )
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

function estimateWholeDayHeadwayMs(trips = []) {
  const starts = [...new Set(
    trips
      .map((trip) => Number(trip.startTimeSeconds))
      .filter(Number.isFinite)
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

function estimateExactRouteHeadwayMs(
  routeId,
  scheduleIndex,
  nowMs = Date.now(),
  { directionId = null } = {}
) {
  if (!scheduleIndex?.tripsByRouteId) return null;
  const serviceDay = getServiceDay(nowMs, scheduleIndex.timeZone || SERVICE_TIMEZONE);
  const routeKey = normalizeRouteId(routeId);
  const normalizedDirectionId = normalizeDirectionId(directionId);
  const allRouteTrips = scheduleIndex.tripsByRouteId.get(routeKey) || [];
  const directionTrips = allRouteTrips.filter((trip) => (
    normalizedDirectionId == null ||
    normalizeDirectionId(trip.directionId) === normalizedDirectionId
  ));
  if (directionTrips.length === 0) {
    return {
      headwayMs: null,
      source: 'no-exact-route-direction-schedule',
      scheduledTripCount: 0,
      serviceDate: serviceDay.dateKey,
    };
  }

  let calendarKnown = true;
  const exactTrips = directionTrips.filter((trip) => {
    const activity = getServiceActivity(trip.serviceId, scheduleIndex, serviceDay);
    if (!activity.known) calendarKnown = false;
    return activity.known && activity.active && Number.isFinite(trip.startTimeSeconds);
  });
  if (!calendarKnown) {
    return {
      headwayMs: null,
      source: 'incomplete-service-calendar',
      scheduledTripCount: exactTrips.length,
      serviceDate: serviceDay.dateKey,
    };
  }

  const nearbyHeadway = estimateHeadwayFromTrips(
    exactTrips,
    serviceDay.secondsSinceServiceDayStart
  );
  const headwayMs = nearbyHeadway ?? estimateWholeDayHeadwayMs(exactTrips);
  return {
    headwayMs,
    source: headwayMs == null
      ? (exactTrips.length > 0 ? 'insufficient-exact-route-direction-trips' : 'no-scheduled-service')
      : 'exact-route-direction',
    scheduledTripCount: exactTrips.length,
    serviceDate: serviceDay.dateKey,
  };
}

function dateKeyToUtcDate(dateKey) {
  const text = String(dateKey || '');
  if (!/^\d{8}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDaysToDateKey(dateKey, days) {
  const date = dateKeyToUtcDate(dateKey);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromDate(date);
}

function serviceDayForDateKey(dateKey) {
  const date = dateKeyToUtcDate(dateKey);
  if (!date) return null;
  return {
    dateKey,
    weekday: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getUTCDay()],
  };
}

function getExactRouteServiceWindow(
  routeId,
  scheduleIndex,
  serviceDay,
  { directionId = null } = {}
) {
  const routeKey = normalizeRouteId(routeId);
  const normalizedDirectionId = normalizeDirectionId(directionId);
  const allRouteTrips = scheduleIndex?.tripsByRouteId?.get(routeKey);
  if (!Array.isArray(allRouteTrips)) {
    return { available: false, reason: 'missing-exact-route-schedule' };
  }

  const directionTrips = allRouteTrips.filter((trip) => (
    normalizedDirectionId == null ||
    normalizeDirectionId(trip.directionId) === normalizedDirectionId
  ));
  if (directionTrips.length === 0) {
    return { available: false, reason: 'missing-exact-route-direction-schedule' };
  }

  let calendarKnown = true;
  const activeTrips = directionTrips.filter((trip) => {
    const activity = getServiceActivity(trip.serviceId, scheduleIndex, serviceDay);
    if (!activity.known) calendarKnown = false;
    return activity.known && activity.active && Number.isFinite(trip.startTimeSeconds);
  });
  if (!calendarKnown) {
    return { available: false, reason: 'incomplete-service-calendar' };
  }
  if (activeTrips.length === 0) {
    return {
      available: true,
      startTimeSeconds: null,
      endTimeSeconds: null,
      scheduledTripCount: 0,
    };
  }

  const endTimes = [];
  for (const trip of activeTrips) {
    const start = Number(trip.startTimeSeconds);
    const end = Number(trip.endTimeSeconds);
    if (Number.isFinite(end) && end > start) {
      endTimes.push(end);
    } else {
      return { available: false, reason: 'missing-trip-end-times' };
    }
  }

  return {
    available: true,
    startTimeSeconds: Math.min(...activeTrips.map((trip) => Number(trip.startTimeSeconds))),
    endTimeSeconds: Math.max(...endTimes),
    scheduledTripCount: activeTrips.length,
    inferredTripDuration: false,
  };
}

function calculateActiveServiceTimeMs(
  routeId,
  scheduleIndex,
  startMs,
  endMs,
  { directionId = null } = {}
) {
  if (
    !scheduleIndex?.tripsByRouteId ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs)
  ) {
    return { available: false, activeServiceMs: 0, reason: 'missing-schedule-or-time' };
  }
  if (endMs <= startMs) {
    return { available: true, activeServiceMs: 0, serviceDayCount: 0, activeServiceDayCount: 0 };
  }

  const timeZone = scheduleIndex.timeZone || SERVICE_TIMEZONE;
  const startServiceDay = getServiceDay(startMs, timeZone);
  const endServiceDay = getServiceDay(endMs, timeZone);
  let dateKey = startServiceDay.dateKey;
  let activeServiceSeconds = 0;
  let serviceDayCount = 0;
  let activeServiceDayCount = 0;

  while (dateKey && dateKey <= endServiceDay.dateKey) {
    serviceDayCount += 1;
    if (serviceDayCount > MAX_ACTIVE_SERVICE_RANGE_DAYS) {
      return { available: false, activeServiceMs: 0, reason: 'service-range-too-large' };
    }
    const serviceDay = serviceDayForDateKey(dateKey);
    const window = getExactRouteServiceWindow(routeId, scheduleIndex, serviceDay, { directionId });
    if (!window.available) {
      return { available: false, activeServiceMs: 0, reason: window.reason };
    }
    if (
      Number.isFinite(window.startTimeSeconds) &&
      Number.isFinite(window.endTimeSeconds) &&
      window.endTimeSeconds > window.startTimeSeconds
    ) {
      const rangeStart = dateKey === startServiceDay.dateKey
        ? startServiceDay.secondsSinceServiceDayStart
        : -Infinity;
      const rangeEnd = dateKey === endServiceDay.dateKey
        ? endServiceDay.secondsSinceServiceDayStart
        : Infinity;
      const overlapSeconds = Math.max(
        0,
        Math.min(rangeEnd, window.endTimeSeconds) - Math.max(rangeStart, window.startTimeSeconds)
      );
      if (overlapSeconds > 0) activeServiceDayCount += 1;
      activeServiceSeconds += overlapSeconds;
    }
    dateKey = addDaysToDateKey(dateKey, 1);
  }

  return {
    available: true,
    activeServiceMs: activeServiceSeconds * 1000,
    serviceDayCount,
    activeServiceDayCount,
    directionId: normalizeDirectionId(directionId),
  };
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
  getServiceActivity,
  getCandidateTrips,
  estimateHeadwayFromTrips,
  estimateConservativeHeadwayMs,
  estimateExactRouteHeadwayMs,
  estimateRouteHeadwayMs,
  getExactRouteServiceWindow,
  calculateActiveServiceTimeMs,
};
