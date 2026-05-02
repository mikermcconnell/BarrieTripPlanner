const ACTIVE_STATUSES = new Set(['active', 'upcoming']);
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

export const buildActiveStopClosureIndex = (impacts = []) => {
  const byStopId = new Map();
  const byStopCode = new Map();
  const byRoute = new Map();

  impacts.filter(isActiveStopClosure).forEach((impact) => {
    const stopId = normalizeKey(impact.stopId);
    const stopCode = normalizeKey(impact.stopCode);
    if (stopId) byStopId.set(stopId, impact);
    if (stopCode) byStopCode.set(stopCode, impact);

    (impact.affectedRoutes || []).forEach((route) => {
      const routeKey = normalizeRoute(route);
      if (!routeKey) return;
      const routeImpacts = byRoute.get(routeKey) || [];
      routeImpacts.push(impact);
      byRoute.set(routeKey, uniqueById(routeImpacts));
    });
  });

  return { byStopId, byStopCode, byRoute };
};

const getStopClosure = (stop, index) => {
  const stopId = normalizeKey(stop?.stopId || stop?.id);
  const stopCode = normalizeKey(stop?.stopCode || stop?.code);
  return (stopId && index.byStopId.get(stopId)) ||
    (stopCode && index.byStopCode.get(stopCode)) ||
    null;
};

const addImpactedStop = (map, impact, stop, role) => {
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

export const getItineraryStopClosureNotices = (itinerary, impacts = []) => {
  const index = buildActiveStopClosureIndex(impacts);
  const impactedById = new Map();

  (itinerary?.legs || []).forEach((leg) => {
    if (TRANSIT_MODES.has(leg?.mode)) {
      addImpactedStop(impactedById, getStopClosure(leg.from, index), leg.from, 'boarding');
      addImpactedStop(impactedById, getStopClosure(leg.to, index), leg.to, 'alighting');
    }
  });

  const impactedStops = [...impactedById.values()];
  const impactedIds = new Set(impactedStops.map((impact) => impact.id));
  const routeNotices = uniqueById(
    collectTransitRoutes(itinerary).flatMap((route) => index.byRoute.get(route.id) || [])
  ).filter((impact) => !impactedIds.has(impact.id));

  return {
    hasTripImpact: impactedStops.length > 0,
    impactedStops,
    routeNotices,
  };
};

export const annotateItinerariesWithStopClosures = (itineraries = [], impacts = []) => (
  (itineraries || []).map((itinerary) => ({
    ...itinerary,
    stopClosureNotices: getItineraryStopClosureNotices(itinerary, impacts),
  }))
);

export default annotateItinerariesWithStopClosures;
