const hasValues = (values) => Array.isArray(values) && values.length > 0;

const getStopCode = (stop) => {
  if (stop == null) return '';
  if (typeof stop === 'object') {
    return String(
      stop.code ??
      stop.stopCode ??
      stop.stop_code ??
      stop.id ??
      stop.stopId ??
      stop.stop_id ??
      ''
    ).trim();
  }
  return String(stop).trim();
};

const uniqueCodes = (values = []) => {
  const seen = new Set();
  return values
    .map(getStopCode)
    .filter((code) => {
      const key = code.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const getSectionStops = (section, field) => (
  Array.isArray(section?.[field]) ? section[field] : []
);

const getSections = (detailsByRouteId, routeId) => (
  Array.isArray(detailsByRouteId?.[routeId]?.segmentStopDetails)
    ? detailsByRouteId[routeId].segmentStopDetails
    : []
);

const fillStopImpactFields = (target = {}, skippedStops = [], affectedStops = []) => ({
  ...target,
  skippedStops: hasValues(target?.skippedStops) ? target.skippedStops : skippedStops,
  skippedStopCodes: hasValues(target?.skippedStopCodes) ? target.skippedStopCodes : uniqueCodes(skippedStops),
  affectedStops: hasValues(target?.affectedStops) ? target.affectedStops : affectedStops,
  affectedStopCodes: hasValues(target?.affectedStopCodes) ? target.affectedStopCodes : uniqueCodes(affectedStops),
});

export const enrichDetoursWithDerivedStopCodes = (activeDetours = {}, detailsByRouteId = {}) => {
  if (!activeDetours || typeof activeDetours !== 'object') return {};

  return Object.fromEntries(
    Object.entries(activeDetours).map(([routeId, detour]) => {
      const sections = getSections(detailsByRouteId, routeId);
      if (sections.length === 0) return [routeId, detour];

      const allSkippedStops = sections.flatMap((section) => getSectionStops(section, 'skippedStops'));
      const allAffectedStops = sections.flatMap((section) => getSectionStops(section, 'affectedStops'));
      const hasDerivedCodes =
        uniqueCodes(allSkippedStops).length > 0 ||
        uniqueCodes(allAffectedStops).length > 0;

      if (!hasDerivedCodes) return [routeId, detour];

      const sourceSegments = Array.isArray(detour?.segments) && detour.segments.length > 0
        ? detour.segments
        : [{}];
      const segments = sourceSegments.map((segment, index) => {
        const section = sections[index] || (sections.length === 1 ? sections[0] : null);
        if (!section) return segment;
        return fillStopImpactFields(
          segment,
          getSectionStops(section, 'skippedStops'),
          getSectionStops(section, 'affectedStops')
        );
      });

      return [routeId, {
        ...fillStopImpactFields(detour, allSkippedStops, allAffectedStops),
        segments,
      }];
    })
  );
};
