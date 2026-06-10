const toArray = (value) => (Array.isArray(value) ? value : []);

const cleanString = (value) => String(value || '').trim();

export const PLANNED_DETOUR_NOTICE_LABEL = 'Planned detour notice';

const normalizeKey = (value) => cleanString(value).toUpperCase();

const normalizeLookupKey = (value) => cleanString(value).toLowerCase();

const getRouteRoot = (routeId) => {
  const routeKey = normalizeKey(routeId);
  const match = routeKey.match(/^(\d+)/);
  return match ? match[1] : routeKey;
};

const normalizeRoutes = (impact = {}) => {
  const routes = toArray(impact.affectedRoutes).length > 0
    ? toArray(impact.affectedRoutes)
    : toArray(impact.routes).length > 0
      ? toArray(impact.routes)
      : impact.routeId
        ? [impact.routeId]
        : [];

  return [...new Set(routes.map((route) => cleanString(route).toUpperCase()).filter(Boolean))];
};

const getImpactRoutes = (impact = {}) => normalizeRoutes(impact);

const normalizeRouteList = (routes = []) => (
  toArray(routes)
    .map((route) => cleanString(route).toUpperCase())
    .filter(Boolean)
);

const uniqueRoutes = (...routeLists) => {
  const seen = new Set();
  const routes = [];
  routeLists.flat().forEach((route) => {
    const routeKey = cleanString(route).toUpperCase();
    if (!routeKey || seen.has(routeKey)) return;
    seen.add(routeKey);
    routes.push(routeKey);
  });
  return routes;
};

const routeMatches = (routeId, impact = {}) => {
  const routeKey = normalizeKey(routeId);
  if (!routeKey) return false;

  const impactRoutes = getImpactRoutes(impact);
  if (impactRoutes.length === 0) return false;
  if (impactRoutes.includes(routeKey)) return true;

  const routeRoot = getRouteRoot(routeKey);
  return Boolean(routeRoot) && impactRoutes.some((impactRoute) => getRouteRoot(impactRoute) === routeRoot);
};

const getStopKeys = (stop = {}) => ([
  stop.id,
  stop.stopId,
  stop.stop_id,
  stop.gtfsStopId,
  stop.code,
  stop.stopCode,
])
  .map(normalizeLookupKey)
  .filter(Boolean);

const getStopName = (stop = {}) => (
  cleanString(stop.name || stop.stopName || stop.stop_name)
);

const getRemovedStops = (impact = {}) => (
  toArray(impact.removedStops).length > 0
    ? toArray(impact.removedStops)
    : toArray(impact.removedStopDetails)
);

const stopMatches = (stop, removedStop) => {
  const stopKeys = new Set(getStopKeys(stop));
  const removedKeys = getStopKeys(removedStop);

  if (removedKeys.some((key) => stopKeys.has(key))) return true;

  const stopName = normalizeLookupKey(getStopName(stop));
  const removedStopName = normalizeLookupKey(getStopName(removedStop));
  return Boolean(stopName && removedStopName && stopName === removedStopName);
};

export const normalizeOfficialServiceImpact = (id, data = {}) => {
  const affectedRoutes = normalizeRoutes(data);
  const message = cleanString(data.message || data.summary || data.body);

  return {
    ...data,
    id: cleanString(data.id || id),
    type: cleanString(data.type || 'baseline_detour'),
    status: cleanString(data.status || 'active'),
    routeId: cleanString(data.routeId || affectedRoutes[0] || ''),
    routes: affectedRoutes,
    affectedRoutes,
    removedStops: toArray(data.removedStops),
    replacementRoutes: toArray(data.replacementRoutes)
      .map((route) => cleanString(route).toUpperCase())
      .filter(Boolean),
    title: cleanString(data.title || 'Official service notice'),
    message,
    summary: cleanString(data.summary || message),
    sourceUrl: data.sourceUrl || data.url || null,
    sourceLabel: PLANNED_DETOUR_NOTICE_LABEL,
    sourceType: data.sourceType || 'official_gtfs_change',
    archivedAt: data.archivedAt ?? null,
    publishedAt: data.publishedAt ?? data.promotedAt ?? null,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    isOfficial: true,
  };
};

export const getOfficialImpactRouteIds = (impact = {}) => (
  uniqueRoutes(getImpactRoutes(impact), normalizeRouteList(impact.replacementRoutes))
);

export const getActiveOfficialServiceImpacts = (impacts = []) => (
  toArray(impacts)
    .filter((impact) => (
      impact?.archivedAt == null &&
      impact?.status !== 'archived' &&
      impact?.status !== 'expired' &&
      impact?.status !== 'candidate' &&
      (impact?.status || 'active') === 'active'
    ))
);

export const buildOfficialImpactBody = (impact = {}) => {
  const message = cleanString(impact.message || impact.summary);
  const replacementRoutes = toArray(impact.replacementRoutes)
    .map((route) => cleanString(route).toUpperCase())
    .filter(Boolean);

  if (message && replacementRoutes.length === 0) return message;

  const shuttleText = replacementRoutes.length > 0
    ? `Use Route ${replacementRoutes.join('/')} shuttle.`
    : '';

  if (!message) return shuttleText;
  if (message.toLowerCase().includes(shuttleText.toLowerCase())) return message;
  return `${message} ${shuttleText}`.trim();
};

export const findOfficialImpactsForRoute = (routeId, impacts = []) => (
  getActiveOfficialServiceImpacts(impacts).filter((impact) => routeMatches(routeId, impact))
);

export const findOfficialImpactsForStop = (stop, impacts = [], routeId = null) => {
  if (!stop) return [];

  const scopedImpacts = routeId
    ? findOfficialImpactsForRoute(routeId, impacts)
    : getActiveOfficialServiceImpacts(impacts);

  return scopedImpacts.filter((impact) => (
    getRemovedStops(impact).some((removedStop) => stopMatches(stop, removedStop))
  ));
};

export const buildOfficialStopNotice = ({ stop, routeId, impact }) => {
  if (!stop || !impact) return null;

  const affectedRoutes = getImpactRoutes(impact);
  const displayRouteId = cleanString(routeId || impact.routeId || affectedRoutes[0]);
  const stopLabel = getStopName(stop) || (stop.code || stop.stopCode ? `Stop ${stop.code || stop.stopCode}` : 'This stop');

  return {
    type: 'official_baseline_stop',
    routeId: displayRouteId || null,
    affectedRouteIds: affectedRoutes,
    servedRouteIds: [],
    impactScope: 'official_baseline_change',
    title: `${PLANNED_DETOUR_NOTICE_LABEL}: ${stopLabel} is not served by ${displayRouteId ? `Route ${displayRouteId}` : 'this route'}`,
    status: 'Official',
    message: buildOfficialImpactBody(impact),
    sourceLabel: PLANNED_DETOUR_NOTICE_LABEL,
    isOfficial: true,
    sourceTitle: impact.title || 'Official service notice',
    sourceUrl: impact.sourceUrl || null,
    startsAt: impact.startsAt ?? null,
    endsAt: impact.endsAt ?? null,
  };
};
