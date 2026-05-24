const normalizeKey = (value) => (
  value == null ? null : String(value).trim().toLowerCase()
);

export const getStopCode = (stop) => (
  stop?.code ?? stop?.stopCode ?? stop?.stop_id ?? stop?.stopId ?? null
);

const findStopClosureImpactByStatus = (stop, impacts = [], status) => {
  const stopId = normalizeKey(stop?.id ?? stop?.stopId);
  const stopCode = normalizeKey(getStopCode(stop));

  return (impacts || []).find((impact) => {
    if (impact?.type !== 'stop_closure' || impact?.status !== status) return false;
    const impactStopId = normalizeKey(impact.stopId);
    const impactStopCode = normalizeKey(impact.stopCode);
    return (
      (stopId && impactStopId && stopId === impactStopId) ||
      (stopCode && impactStopCode && stopCode === impactStopCode)
    );
  }) || null;
};

export const findStopClosureImpact = (stop, impacts = []) => (
  findStopClosureImpactByStatus(stop, impacts, 'active')
);

export const findUpcomingStopClosureImpact = (stop, impacts = []) => (
  findStopClosureImpactByStatus(stop, impacts, 'upcoming')
);

export const buildDetourStopNotice = ({ stop, routeId, detour, transitNewsImpacts = [] }) => {
  if (!stop) return null;

  const closureImpact = stop.closureImpact || findStopClosureImpact(stop, transitNewsImpacts);
  const upcomingClosureImpact = stop.upcomingClosureImpact || findUpcomingStopClosureImpact(stop, transitNewsImpacts);
  const detourNotice = routeId
    ? {
      type: 'detour_stop',
      routeId,
      title: `Route ${routeId} detour`,
      status: detour?.state === 'clear-pending' ? 'Clearing' : 'Active',
      confidence: detour?.confidence ?? null,
      message: 'This stop is shown as not serviced by the active detour.',
      sourceTitle: closureImpact?.sourceTitle ?? null,
      sourceUrl: closureImpact?.sourceUrl ?? null,
      startsAt: closureImpact?.startsAt ?? null,
      endsAt: closureImpact?.endsAt ?? null,
    }
    : null;

  return {
    ...stop,
    ...(closureImpact ? { closureImpact, isClosed: true } : {}),
    ...(upcomingClosureImpact && !closureImpact ? { upcomingClosureImpact } : {}),
    ...(detourNotice ? { detourNotice, isClosed: true } : {}),
  };
};
