const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const pad2 = (value) => String(value).padStart(2, '0');

export const formatHolidayDateKey = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) return null;
  return `${value.getFullYear()}${pad2(value.getMonth() + 1)}${pad2(value.getDate())}`;
};

const parseDateKey = (dateKey) => {
  if (!dateKey || String(dateKey).length !== 8) return null;
  const text = String(dateKey);
  return new Date(
    Number.parseInt(text.slice(0, 4), 10),
    Number.parseInt(text.slice(4, 6), 10) - 1,
    Number.parseInt(text.slice(6, 8), 10)
  );
};

const inCalendarRange = (dateKey, entry) => (
  (!entry.startDate || dateKey >= entry.startDate) &&
  (!entry.endDate || dateKey <= entry.endDate)
);

export const getActiveServiceIdsForGtfsDate = ({ date, calendar = [], calendarDates = [] }) => {
  const dateValue = date instanceof Date ? date : new Date(date);
  const dateKey = formatHolidayDateKey(dateValue);
  if (!dateKey) return new Set();

  const dayName = WEEKDAYS[dateValue.getDay()];
  const active = new Set();

  calendar.forEach((entry) => {
    if (entry?.serviceId && inCalendarRange(dateKey, entry) && entry[dayName]) {
      active.add(entry.serviceId);
    }
  });

  calendarDates
    .filter((entry) => entry?.date === dateKey)
    .forEach((entry) => {
      if (entry.exceptionType === 1) active.add(entry.serviceId);
      if (entry.exceptionType === 2) active.delete(entry.serviceId);
    });

  return active;
};

const getCalendarDateExceptions = (calendarDates = [], dateKey) => (
  calendarDates.filter((entry) => entry?.date === dateKey)
);

const getNthWeekdayOfMonth = (year, monthIndex, weekday, nth) => {
  const date = new Date(year, monthIndex, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (nth - 1) * 7);
  return date;
};

const getLastWeekdayBefore = (year, monthIndex, day, weekday) => {
  const date = new Date(year, monthIndex, day);
  while (date.getDay() !== weekday) date.setDate(date.getDate() - 1);
  return date;
};

const getEasterSunday = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
};

const dateKeyFor = (date) => formatHolidayDateKey(date);

export const getHolidayNameForDate = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) return 'Holiday';

  const year = value.getFullYear();
  const key = dateKeyFor(value);
  const easterSunday = getEasterSunday(year);
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(easterSunday.getDate() - 2);

  const knownDates = new Map([
    [dateKeyFor(new Date(year, 0, 1)), "New Year's Day"],
    [dateKeyFor(getNthWeekdayOfMonth(year, 1, 1, 3)), 'Family Day'],
    [dateKeyFor(goodFriday), 'Good Friday'],
    [dateKeyFor(easterSunday), 'Easter Sunday'],
    [dateKeyFor(getLastWeekdayBefore(year, 4, 24, 1)), 'Victoria Day'],
    [dateKeyFor(new Date(year, 6, 1)), 'Canada Day'],
    [dateKeyFor(getNthWeekdayOfMonth(year, 7, 1, 1)), 'Civic Holiday'],
    [dateKeyFor(getNthWeekdayOfMonth(year, 8, 1, 1)), 'Labour Day'],
    [dateKeyFor(getNthWeekdayOfMonth(year, 9, 1, 2)), 'Thanksgiving'],
    [dateKeyFor(new Date(year, 11, 25)), 'Christmas Day'],
    [dateKeyFor(new Date(year, 11, 26)), 'Boxing Day'],
    [dateKeyFor(new Date(year, 11, 31)), "New Year's Eve"],
  ]);

  return knownDates.get(key) || 'Holiday';
};

const formatDisplayDate = (date) => (
  date.toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
);

const formatTimeLabel = (seconds) => {
  if (!Number.isFinite(seconds)) return null;
  const normalizedSeconds = ((Math.round(seconds) % 86400) + 86400) % 86400;
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  return new Date(2000, 0, 1, hours, minutes, 0).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const buildRouteSummaries = ({ activeServices, trips = [], routes = [], stopTimes = [] }) => {
  const activeTripsById = new Map();
  const routeIds = new Set();

  trips.forEach((trip) => {
    if (activeServices.has(trip.serviceId)) {
      activeTripsById.set(trip.tripId, trip);
      routeIds.add(trip.routeId);
    }
  });

  const routeById = new Map(routes.map((route, index) => [route.id, { ...route, index }]));
  const routeTimes = new Map();

  stopTimes.forEach((stopTime) => {
    const trip = activeTripsById.get(stopTime.tripId);
    if (!trip) return;

    const candidateFirst = Number.isFinite(stopTime.departureTime) ? stopTime.departureTime : stopTime.arrivalTime;
    const candidateLast = Number.isFinite(stopTime.arrivalTime) ? stopTime.arrivalTime : stopTime.departureTime;
    if (!Number.isFinite(candidateFirst) && !Number.isFinite(candidateLast)) return;

    const current = routeTimes.get(trip.routeId) || { first: null, last: null };
    if (Number.isFinite(candidateFirst)) {
      current.first = current.first === null ? candidateFirst : Math.min(current.first, candidateFirst);
    }
    if (Number.isFinite(candidateLast)) {
      current.last = current.last === null ? candidateLast : Math.max(current.last, candidateLast);
    }
    routeTimes.set(trip.routeId, current);
  });

  return [...routeIds]
    .map((routeId) => {
      const route = routeById.get(routeId) || { id: routeId, shortName: routeId, longName: '' };
      const times = routeTimes.get(routeId) || {};
      return {
        routeId,
        routeShortName: route.shortName || routeId,
        routeLongName: route.longName || route.name || '',
        routeColor: route.color || null,
        firstTripLabel: formatTimeLabel(times.first),
        lastTripLabel: formatTimeLabel(times.last),
        sortIndex: Number.isFinite(route.index) ? route.index : 9999,
      };
    })
    .sort((a, b) => {
      if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
      return String(a.routeShortName).localeCompare(String(b.routeShortName), undefined, { numeric: true });
    });
};

export const getHolidayServiceInfo = ({
  date,
  calendar = [],
  calendarDates = [],
  trips = [],
  routes = [],
  stopTimes = [],
} = {}) => {
  const value = date instanceof Date ? date : new Date(date);
  const dateKey = formatHolidayDateKey(value);
  if (!dateKey) return null;

  const exceptions = getCalendarDateExceptions(calendarDates, dateKey);
  if (exceptions.length === 0) return null;

  const activeServices = getActiveServiceIdsForGtfsDate({ date: value, calendar, calendarDates });
  const routeSummaries = buildRouteSummaries({ activeServices, trips, routes, stopTimes });
  const holidayName = getHolidayNameForDate(value);
  const isNoService = activeServices.size === 0 || routeSummaries.length === 0;
  const status = isNoService ? 'no_service' : 'holiday_service';
  const displayDate = formatDisplayDate(value);

  return {
    date: value,
    dateKey,
    holidayName,
    status,
    title: `${holidayName} service`,
    badgeLabel: isNoService ? 'No service' : 'Holiday service',
    shortMessage: isNoService
      ? `No Barrie Transit service is scheduled for ${displayDate}.`
      : `Holiday service is scheduled for ${displayDate}.`,
    detailsMessage: isNoService
      ? 'GTFS calendar_dates removes scheduled service for this date.'
      : `Barrie Transit is running ${routeSummaries.length} route${routeSummaries.length === 1 ? '' : 's'} on this holiday schedule.`,
    activeServiceIds: [...activeServices],
    exceptions,
    activeRouteCount: routeSummaries.length,
    routes: routeSummaries,
  };
};

export const getUpcomingHolidayServiceInfo = ({
  calendar = [],
  calendarDates = [],
  trips = [],
  routes = [],
  now = new Date(),
  daysAhead = 1,
} = {}) => {
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const info = getHolidayServiceInfo({ date, calendar, calendarDates, trips, routes });
    if (info) {
      return {
        ...info,
        relativeLabel: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : null,
      };
    }
  }
  return null;
};
