import { findStopClosureImpact, findUpcomingStopClosureImpact, getStopCode } from './stopNoticeUtils';

const normalizeKey = (value) => (
  value == null ? null : String(value).trim().toLowerCase()
);

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const hasCoordinates = (stop) => (
  toNumber(stop?.latitude) != null && toNumber(stop?.longitude) != null
);

const buildStopLookups = (stops = []) => {
  const byId = new Map();
  const byCode = new Map();

  (stops || []).forEach((stop) => {
    const id = normalizeKey(stop?.id ?? stop?.stopId);
    const code = normalizeKey(getStopCode(stop));
    if (id) byId.set(id, stop);
    if (code) byCode.set(code, stop);
  });

  return { byId, byCode };
};

const resolveStopForImpact = (impact, lookups) => {
  const stopId = normalizeKey(impact?.stopId);
  const stopCode = normalizeKey(impact?.stopCode);
  return (
    (stopId && lookups.byId.get(stopId)) ||
    (stopCode && lookups.byCode.get(stopCode)) ||
    null
  );
};

export const deriveMappableStopClosureStops = ({ impacts = [], stops = [] } = {}) => {
  const lookups = buildStopLookups(stops);
  const closuresByKey = new Map();

  (impacts || []).forEach((impact) => {
    if (impact?.type !== 'stop_closure' || impact?.status !== 'active') return;

    const resolvedStop = resolveStopForImpact(impact, lookups);
    const latitude = toNumber(resolvedStop?.latitude ?? impact.latitude);
    const longitude = toNumber(resolvedStop?.longitude ?? impact.longitude);
    if (latitude == null || longitude == null) return;

    const code = getStopCode(resolvedStop) ?? impact.stopCode ?? impact.stopId ?? null;
    const id = resolvedStop?.id ?? impact.stopId ?? code ?? impact.id;
    const key = normalizeKey(id ?? impact.id ?? code);
    if (!key || closuresByKey.has(key)) return;

    closuresByKey.set(key, {
      ...(resolvedStop || {}),
      id: id != null ? String(id) : `closure-${closuresByKey.size}`,
      code: code != null ? String(code) : '',
      name: resolvedStop?.name ?? impact.stopName ?? `Stop ${code ?? id ?? ''}`.trim(),
      latitude,
      longitude,
      closureImpact: impact,
      isClosed: true,
      isNewsClosure: true,
    });
  });

  return Array.from(closuresByKey.values());
};

export const annotateStopsWithClosures = (stops = [], impacts = []) => (
  (stops || []).map((stop) => {
    const closureImpact = findStopClosureImpact(stop, impacts);
    if (closureImpact) return { ...stop, closureImpact, isClosed: true };

    const upcomingClosureImpact = findUpcomingStopClosureImpact(stop, impacts);
    return upcomingClosureImpact ? { ...stop, upcomingClosureImpact } : stop;
  })
);

export const mergeStopClosuresForDetourMap = ({
  displayedStops = [],
  closureStops = [],
  includeClosures = false,
} = {}) => {
  if (!includeClosures) return displayedStops || [];

  const merged = [...(displayedStops || [])];

  (closureStops || []).forEach((stop) => {
    if (!hasCoordinates(stop)) return;
    const idKey = normalizeKey(stop?.id);
    const codeKey = normalizeKey(getStopCode(stop));
    const existingIndex = merged.findIndex((candidate) => {
      const candidateIdKey = normalizeKey(candidate?.id);
      const candidateCodeKey = normalizeKey(getStopCode(candidate));
      return (
        (idKey && candidateIdKey && idKey === candidateIdKey) ||
        (codeKey && candidateCodeKey && codeKey === candidateCodeKey)
      );
    });

    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        closureImpact: stop.closureImpact,
        isClosed: true,
        isNewsClosure: true,
      };
      return;
    }

    merged.push(stop);
  });

  return merged;
};
