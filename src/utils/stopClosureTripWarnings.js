const ACTIVE_STATUSES = new Set(['active']);
const UPCOMING_STATUSES = new Set(['upcoming']);
const TRANSIT_MODES = new Set(['BUS', 'TRANSIT']);

const normalizeKey = (value) => String(value ?? '').trim();
const normalizeRoute = (value) => normalizeKey(value).toUpperCase();

const uniqueById = (items) => {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const key = item?.id || `${item?.stopId || ''}-${item?.stopCode || ''}-${item?.sourceNewsId || ''}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

const isActiveStopClosure = (impact) => (
  impact?.type === 'stop_closure' &&
  ACTIVE_STATUSES.has(impact?.status || 'active') &&
  impact?.archivedAt == null
);

const isUpcomingStopClosure = (impact) => (
  impact?.type === 'stop_closure' &&
  UPCOMING_STATUSES.has(impact?.status || 'active') &&
  impact?.archivedAt == null
);

export const buildActiveStopClosureIndex = (impacts = []) => {
  const byStopId = new Map();
  const byStopCode = new Map();
  const byRoute = new Map();
  const upcomingByStopId = new Map();
  const upcomingByStopCode = new Map();
  const upcomingByRoute = new Map();

  const addToIndexes = (impact, targetByStopId, targetByStopCode, targetByRoute) => {
    const stopId = normalizeKey(impact.stopId);
    const stopCode = normalizeKey(impact.stopCode);
    if (stopId) targetByStopId.set(stopId, impact);
    if (stopCode) targetByStopCode.set(stopCode, impact);

    (impact.affectedRoutes || []).forEach((route) => {
      const routeKey = normalizeRoute(route);
      if (!routeKey) return;
      const routeImpacts = targetByRoute.get(routeKey) || [];
      routeImpacts.push(impact);
      targetByRoute.set(routeKey, uniqueById(routeImpacts));
    });
  };

  impacts.filter(isActiveStopClosure).forEach((impact) => {
    addToIndexes(impact, byStopId, byStopCode, byRoute);
  });

  impacts.filter(isUpcomingStopClosure).forEach((impact) => {
    addToIndexes(impact, upcomingByStopId, upcomingByStopCode, upcomingByRoute);
  });

  return { byStopId, byStopCode, byRoute, upcomingByStopId, upcomingByStopCode, upcomingByRoute };
};

const getStopClosureFromMaps = (stop, byStopId, byStopCode) => {
  const stopId = normalizeKey(stop?.stopId || stop?.id);
  const stopCode = normalizeKey(stop?.stopCode || stop?.code);
  return (stopId && byStopId.get(stopId)) ||
    (stopCode && byStopCode.get(stopCode)) ||
    null;
};

const getActiveStopClosure = (stop, index) => (
  getStopClosureFromMaps(stop, index.byStopId, index.byStopCode)
);

const getUpcomingStopClosure = (stop, index) => (
  getStopClosureFromMaps(stop, index.upcomingByStopId, index.upcomingByStopCode)
);

const addImpactedStop = (map, impact, stop, role, timingStatus = impact?.status || 'active') => {
  if (!impact) return;
  const key = impact.id || `${impact.stopId || stop?.stopId || ''}-${impact.stopCode || stop?.stopCode || ''}`;
  const existing = map.get(key);
  const roles = new Set(existing?.roles || []);
  roles.add(role);

  map.set(key, {
    ...impact,
    stopId: impact.stopId || stop?.stopId || stop?.id || null,
    stopCode: impact.stopCode || stop?.stopCode || stop?.code || null,
    stopName: impact.stopName || stop?.name || '',
    roles: [...roles],
    timingStatus,
  });
};

const collectTransitRoutes = (itinerary) => uniqueById(
  (itinerary?.legs || [])
    .filter((leg) => TRANSIT_MODES.has(leg?.mode))
    .map((leg) => ({
      id: normalizeRoute(leg?.route?.shortName || leg?.route?.id),
      shortName: normalizeRoute(leg?.route?.shortName || leg?.route?.id),
    }))
    .filter((route) => route.id)
);

const toTime = (value) => {
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const getTripWindow = (itinerary) => {
  const legTimes = (itinerary?.legs || [])
    .flatMap((leg) => [toTime(leg?.startTime), toTime(leg?.endTime)])
    .filter(Number.isFinite);
  const start = toTime(itinerary?.startTime) ?? (legTimes.length ? Math.min(...legTimes) : null);
  const end = toTime(itinerary?.endTime) ?? (legTimes.length ? Math.max(...legTimes) : start);
  return { start, end };
};

const tripOverlapsImpactWindow = (itinerary, impact) => {
  const startsAt = toTime(impact?.startsAt);
  if (!Number.isFinite(startsAt)) return false;

  const endsAt = toTime(impact?.endsAt) ?? Number.POSITIVE_INFINITY;
  const { start, end } = getTripWindow(itinerary);
  if (!Number.isFinite(start)) return false;

  const tripEnd = Number.isFinite(end) ? end : start;
  return tripEnd >= startsAt && start <= endsAt;
};

export const getItineraryStopClosureNotices = (itinerary, impacts = []) => {
  const index = buildActiveStopClosureIndex(impacts);
  const impactedById = new Map();
  const upcomingImpactedById = new Map();

  (itinerary?.legs || []).forEach((leg) => {
    if (TRANSIT_MODES.has(leg?.mode)) {
      addImpactedStop(impactedById, getActiveStopClosure(leg.from, index), leg.from, 'boarding');
      addImpactedStop(impactedById, getActiveStopClosure(leg.to, index), leg.to, 'alighting');

      [
        [getUpcomingStopClosure(leg.from, index), leg.from, 'boarding'],
        [getUpcomingStopClosure(leg.to, index), leg.to, 'alighting'],
      ].forEach(([impact, stop, role]) => {
        if (!impact) return;
        if (tripOverlapsImpactWindow(itinerary, impact)) {
          addImpactedStop(impactedById, impact, stop, role, 'applies_to_trip');
        } else {
          addImpactedStop(upcomingImpactedById, impact, stop, role, 'upcoming');
        }
      });
    }
  });

  const impactedStops = [...impactedById.values()];
  const upcomingImpactedStops = [...upcomingImpactedById.values()];
  const impactedIds = new Set(impactedStops.map((impact) => impact.id));
  const upcomingImpactedIds = new Set(upcomingImpactedStops.map((impact) => impact.id));
  const routeNotices = uniqueById(
    collectTransitRoutes(itinerary).flatMap((route) => index.byRoute.get(route.id) || [])
  ).filter((impact) => !impactedIds.has(impact.id));
  const upcomingRouteNotices = uniqueById(
    collectTransitRoutes(itinerary).flatMap((route) => index.upcomingByRoute.get(route.id) || [])
  ).filter((impact) => (
    !impactedIds.has(impact.id) &&
    !upcomingImpactedIds.has(impact.id) &&
    !tripOverlapsImpactWindow(itinerary, impact)
  ));
  const tripApplicableRouteNotices = uniqueById(
    collectTransitRoutes(itinerary).flatMap((route) => index.upcomingByRoute.get(route.id) || [])
  ).filter((impact) => (
    !impactedIds.has(impact.id) &&
    !upcomingImpactedIds.has(impact.id) &&
    tripOverlapsImpactWindow(itinerary, impact)
  )).map((impact) => ({ ...impact, timingStatus: 'applies_to_trip' }));

  return {
    hasTripImpact: impactedStops.length > 0 || tripApplicableRouteNotices.length > 0,
    impactedStops,
    routeNotices: [...routeNotices, ...tripApplicableRouteNotices],
    hasUpcomingImpact: upcomingImpactedStops.length > 0 || upcomingRouteNotices.length > 0,
    upcomingImpactedStops,
    upcomingRouteNotices,
  };
};

export const annotateItinerariesWithStopClosures = (itineraries = [], impacts = []) => (
  (itineraries || []).map((itinerary) => ({
    ...itinerary,
    stopClosureNotices: getItineraryStopClosureNotices(itinerary, impacts),
  }))
);

export default annotateItinerariesWithStopClosures;
