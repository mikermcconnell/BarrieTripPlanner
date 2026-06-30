const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const toGtfsDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const normalizeRouteText = (route = {}) => [
  route.id,
  route.shortName,
  route.longName,
  route.desc,
  route.description,
  route.route_long_name,
  route.route_desc,
].filter(Boolean).join(' ').toLowerCase();

export const isSpecialServiceRoute = (route) => {
  const text = normalizeRouteText(route);
  return /\bshuttle\b/.test(text);
};

const isCalendarServiceActiveOnDate = (service, date, gtfsDate) => {
  if (!service) return false;
  if (service.startDate && gtfsDate < service.startDate) return false;
  if (service.endDate && gtfsDate > service.endDate) return false;

  return Boolean(service[WEEKDAY_KEYS[date.getDay()]]);
};

const getServiceIdsForRoute = (routeId, trips = []) => {
  const serviceIds = new Set();
  trips.forEach((trip) => {
    if (trip?.routeId === routeId && trip.serviceId) {
      serviceIds.add(trip.serviceId);
    }
  });
  return serviceIds;
};

export const routeHasServiceOnDate = ({
  routeId,
  trips = [],
  calendar = [],
  calendarDates = [],
  date = new Date(),
}) => {
  const serviceIds = getServiceIdsForRoute(routeId, trips);
  if (serviceIds.size === 0) return true;

  const gtfsDate = toGtfsDate(date);
  const calendarByServiceId = new Map(calendar.map((service) => [service.serviceId, service]));
  const exceptionsByServiceId = new Map();

  calendarDates.forEach((exception) => {
    if (exception?.date === gtfsDate && exception.serviceId) {
      exceptionsByServiceId.set(exception.serviceId, exception.exceptionType);
    }
  });

  for (const serviceId of serviceIds) {
    const exceptionType = exceptionsByServiceId.get(serviceId);
    if (exceptionType === 1) return true;
    if (exceptionType === 2) continue;

    if (isCalendarServiceActiveOnDate(calendarByServiceId.get(serviceId), date, gtfsDate)) {
      return true;
    }
  }

  return false;
};

export const getVisibleRoutesForDate = ({
  routes = [],
  trips = [],
  calendar = [],
  calendarDates = [],
  date = new Date(),
}) => {
  if (!Array.isArray(routes) || routes.length === 0) return [];

  const hasServiceData =
    Array.isArray(trips) && trips.length > 0 &&
    ((Array.isArray(calendar) && calendar.length > 0) ||
      (Array.isArray(calendarDates) && calendarDates.length > 0));

  if (!hasServiceData) {
    return routes.map((route) => ({
      ...route,
      isSpecialService: isSpecialServiceRoute(route),
      isActiveOnServiceDate: true,
    }));
  }

  return routes
    .map((route) => ({
      ...route,
      isSpecialService: isSpecialServiceRoute(route),
      isActiveOnServiceDate: routeHasServiceOnDate({
        routeId: route.id,
        trips,
        calendar,
        calendarDates,
        date,
      }),
    }))
    .filter((route) => route.isActiveOnServiceDate);
};

export const filterRouteMappingToVisibleRoutes = ({ mapping = {}, visibleRoutes = [] }) => {
  const visibleRouteIds = new Set(visibleRoutes.map((route) => route?.id).filter(Boolean));

  return Object.fromEntries(
    Object.entries(mapping || {}).filter(([routeId]) => visibleRouteIds.has(routeId))
  );
};

export default {
  filterRouteMappingToVisibleRoutes,
  getVisibleRoutesForDate,
  isSpecialServiceRoute,
  routeHasServiceOnDate,
};
