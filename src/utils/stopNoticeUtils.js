const normalizeKey = (value) => (
  value == null ? null : String(value).trim().toLowerCase()
);

const normalizeRouteKey = (value) => (
  value == null ? null : String(value).trim().toUpperCase()
);

export const getStopCode = (stop) => (
  stop?.code ?? stop?.stopCode ?? stop?.stop_id ?? stop?.stopId ?? null
);

const getRouteList = (value) => (
  Array.isArray(value)
    ? value.map(normalizeRouteKey).filter(Boolean)
    : []
);

const impactAppliesToRoute = (impact, routeId = null) => {
  const affectedRoutes = getRouteList(impact?.affectedRoutes);
  if (affectedRoutes.length === 0) return true;

  const routeKey = normalizeRouteKey(routeId);
  if (!routeKey) return false;
  return affectedRoutes.includes(routeKey);
};

const isRouteScopedImpact = (impact) => (
  getRouteList(impact?.affectedRoutes).length > 0
);

const getApplicableImpact = (impact, routeId = null) => (
  impact && impactAppliesToRoute(impact, routeId) ? impact : null
);

const uniqueRoutes = (...routeLists) => {
  const seen = new Set();
  const routes = [];
  routeLists.flat().forEach((route) => {
    const routeKey = normalizeRouteKey(route);
    if (!routeKey || seen.has(routeKey)) return;
    seen.add(routeKey);
    routes.push(routeKey);
  });
  return routes;
};

const formatRouteList = (routes = []) => {
  const normalizedRoutes = uniqueRoutes(routes);
  if (normalizedRoutes.length === 0) return '';
  if (normalizedRoutes.length === 1) return `Route ${normalizedRoutes[0]}`;
  if (normalizedRoutes.length === 2) return `Routes ${normalizedRoutes[0]} and ${normalizedRoutes[1]}`;
  return `Routes ${normalizedRoutes.slice(0, -1).join(', ')}, and ${normalizedRoutes[normalizedRoutes.length - 1]}`;
};

const getPrimaryStopLabel = (stop) => {
  const code = getStopCode(stop);
  return code ? `Stop ${code}` : (stop?.name || 'This stop');
};

const buildRouteScopedDetourMessage = ({ stop, routeId, affectedRouteIds, servedRouteIds }) => {
  const affectedLabel = formatRouteList(affectedRouteIds.length > 0 ? affectedRouteIds : [routeId]) || 'this route';
  const servedLabel = formatRouteList(servedRouteIds);
  const baseMessage = `Use another ${affectedLabel} stop before the detour or after the route rejoins.`;
  if (!servedLabel) return baseMessage;

  return `${baseMessage} ${getPrimaryStopLabel(stop)} may still be served by ${servedLabel}.`;
};

const findStopClosureImpactByStatus = (stop, impacts = [], status, routeId = null) => {
  const stopId = normalizeKey(stop?.id ?? stop?.stopId);
  const stopCode = normalizeKey(getStopCode(stop));

  return (impacts || []).find((impact) => {
    if (impact?.type !== 'stop_closure' || impact?.status !== status) return false;
    if (!impactAppliesToRoute(impact, routeId)) return false;
    const impactStopId = normalizeKey(impact.stopId);
    const impactStopCode = normalizeKey(impact.stopCode);
    return (
      (stopId && impactStopId && stopId === impactStopId) ||
      (stopCode && impactStopCode && stopCode === impactStopCode)
    );
  }) || null;
};

export const findStopClosureImpact = (stop, impacts = [], routeId = null) => (
  findStopClosureImpactByStatus(stop, impacts, 'active', routeId)
);

export const findUpcomingStopClosureImpact = (stop, impacts = [], routeId = null) => (
  findStopClosureImpactByStatus(stop, impacts, 'upcoming', routeId)
);

export const buildDetourStopNotice = ({ stop, routeId, detour, transitNewsImpacts = [] }) => {
  if (!stop) return null;

  const activeImpact = getApplicableImpact(stop.closureImpact, routeId) ||
    getApplicableImpact(stop.routeScopedClosureImpact, routeId) ||
    findStopClosureImpact(stop, transitNewsImpacts, routeId);
  const upcomingImpact = getApplicableImpact(stop.upcomingClosureImpact, routeId) ||
    findUpcomingStopClosureImpact(stop, transitNewsImpacts, routeId);
  const standaloneRouteScopedImpact = !routeId && stop.routeScopedClosureImpact
    ? stop.routeScopedClosureImpact
    : null;
  const closureImpact = (activeImpact && !isRouteScopedImpact(activeImpact) ? activeImpact : null) ||
    standaloneRouteScopedImpact;
  const routeScopedClosureImpact = (activeImpact && isRouteScopedImpact(activeImpact) ? activeImpact : null) ||
    standaloneRouteScopedImpact;
  const upcomingClosureImpact = upcomingImpact && !isRouteScopedImpact(upcomingImpact) ? upcomingImpact : null;
  const sourceImpact = closureImpact || routeScopedClosureImpact;
  const affectedRouteIds = uniqueRoutes(stop.affectedRouteIds, stop.routeIds, routeId ? [routeId] : []);
  const servedRouteIds = uniqueRoutes(stop.servedRouteIds);
  const primaryAffectedRouteId = affectedRouteIds[0] || routeId;
  const affectedRouteLabel = formatRouteList(affectedRouteIds.length > 0 ? affectedRouteIds : [routeId]);
  const stopLabel = getPrimaryStopLabel(stop);
  const detourNotice = routeId
    ? {
      type: 'detour_stop',
      routeId,
      affectedRouteIds,
      servedRouteIds,
      impactScope: stop.impactScope || (servedRouteIds.length > 0 ? 'partial' : 'route'),
      title: `${stopLabel} is not served by ${formatRouteList([primaryAffectedRouteId]) || 'this route'}`,
      status: detour?.state === 'clear-pending' ? 'Clearing' : 'Active',
      confidence: detour?.confidence ?? null,
      message: buildRouteScopedDetourMessage({
        stop,
        routeId,
        affectedRouteIds,
        servedRouteIds,
      }),
      sourceTitle: sourceImpact?.sourceTitle ?? null,
      sourceUrl: sourceImpact?.sourceUrl ?? null,
      startsAt: sourceImpact?.startsAt ?? null,
      endsAt: sourceImpact?.endsAt ?? null,
      affectedRouteLabel,
    }
    : null;

  return {
    ...stop,
    ...(closureImpact ? { closureImpact, isClosed: true } : {}),
    ...(routeScopedClosureImpact ? { routeScopedClosureImpact } : {}),
    ...(upcomingClosureImpact && !closureImpact ? { upcomingClosureImpact } : {}),
    ...(detourNotice ? {
      detourNotice,
      isDetourAffected: true,
      detourAffectedRouteIds: affectedRouteIds,
      detourServedRouteIds: servedRouteIds,
    } : {}),
  };
};
