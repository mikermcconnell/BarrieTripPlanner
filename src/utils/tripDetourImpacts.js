import { getMatchingDetourRouteIds, normalizeRouteId } from './routeDetourMatching';

const TRANSIT_MODES = new Set(['BUS', 'TRANSIT']);
const STOP_IMPACT_SEVERITY = 'stop_affected';
const ROUTE_IMPACT_SEVERITY = 'route_detour';

const normalizeKey = (value) => String(value ?? '').trim().toUpperCase();

export const getStopKeys = (stop) => {
  if (!stop) return [];
  return [
    stop.id,
    stop.stopId,
    stop.stop_id,
    stop.gtfsStopId,
    stop.code,
    stop.stopCode,
  ]
    .map(normalizeKey)
    .filter(Boolean);
};

const getStopName = (stop) => (
  stop?.name ||
  stop?.stopName ||
  stop?.stop_name ||
  stop?.stopCode ||
  stop?.stopId ||
  stop?.id ||
  ''
);

const getLegRouteId = (leg) => (
  leg?.route?.id ||
  leg?.routeId ||
  leg?.route?.shortName ||
  leg?.routeShortName ||
  leg?.route
);

const getLegRouteLabel = (leg, routeId) => (
  leg?.route?.shortName ||
  leg?.routeShortName ||
  routeId ||
  'this route'
);

const getMatchingDetourEntry = (routeId, activeDetours = {}) => {
  const routeKey = normalizeRouteId(routeId);
  const exactKey = Object.keys(activeDetours || {}).find(
    (key) => normalizeRouteId(key) === routeKey
  );
  if (exactKey && activeDetours[exactKey]?.state !== 'cleared') {
    return [exactKey, activeDetours[exactKey]];
  }

  const [matchingKey] = getMatchingDetourRouteIds(routeId, activeDetours);
  return matchingKey ? [matchingKey, activeDetours[matchingKey]] : [null, null];
};

const uniqueStops = (stops = []) => {
  const seen = new Set();
  const result = [];

  stops.filter(Boolean).forEach((stop) => {
    const key = getStopKeys(stop)[0] || normalizeKey(getStopName(stop));
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(stop);
  });

  return result;
};

const collectDetourStops = (details = {}) => {
  const segments = Array.isArray(details?.segmentStopDetails)
    ? details.segmentStopDetails
    : [];

  return {
    skippedStops: uniqueStops([
      ...(Array.isArray(details?.skippedStops) ? details.skippedStops : []),
      ...segments.flatMap((segment) => (
        Array.isArray(segment?.skippedStops) ? segment.skippedStops : []
      )),
    ]),
    affectedStops: uniqueStops([
      ...(Array.isArray(details?.affectedStops) ? details.affectedStops : []),
      ...segments.flatMap((segment) => (
        Array.isArray(segment?.affectedStops) ? segment.affectedStops : []
      )),
    ]),
  };
};

const buildStopKeySet = (stops = []) => new Set(
  stops.flatMap(getStopKeys).filter(Boolean)
);

const findMatchingStop = (plannedStop, impactedStops = []) => {
  const plannedKeys = new Set(getStopKeys(plannedStop));
  if (plannedKeys.size === 0) return null;

  return impactedStops.find((stop) => (
    getStopKeys(stop).some((key) => plannedKeys.has(key))
  )) || null;
};

const addRoleImpact = (impactsByKey, plannedStop, matchedStop, role, type) => {
  const keys = getStopKeys(plannedStop);
  const key = keys[0] || normalizeKey(getStopName(plannedStop));
  if (!key) return;

  const existing = impactsByKey.get(key);
  const roles = new Set(existing?.roles || []);
  const types = new Set(existing?.types || []);
  roles.add(role);
  types.add(type);

  impactsByKey.set(key, {
    stopId: plannedStop?.stopId || plannedStop?.id || matchedStop?.stopId || matchedStop?.id || null,
    stopCode: plannedStop?.stopCode || plannedStop?.code || matchedStop?.stopCode || matchedStop?.code || null,
    stopName: getStopName(plannedStop) || getStopName(matchedStop),
    roles: [...roles],
    types: [...types],
  });
};

const getPlannedStops = (leg) => ([
  { role: 'boarding', stop: leg?.from },
  ...((Array.isArray(leg?.intermediateStops) ? leg.intermediateStops : [])
    .map((stop) => ({ role: 'intermediate', stop }))),
  { role: 'alighting', stop: leg?.to },
]);

const buildDetourMessage = ({ routeLabel, severity, impactedStops }) => {
  if (severity === STOP_IMPACT_SEVERITY) {
    const roles = new Set(impactedStops.flatMap((stop) => stop.roles || []));
    if (roles.has('boarding') && roles.has('alighting')) {
      return `Route ${routeLabel} is on detour and your boarding and exit stops may be missed.`;
    }
    if (roles.has('boarding')) {
      return `Route ${routeLabel} is on detour and your boarding stop may be missed.`;
    }
    if (roles.has('alighting')) {
      return `Route ${routeLabel} is on detour and your exit stop may be missed.`;
    }
    return `Route ${routeLabel} is on detour and stops along this ride may be missed.`;
  }

  return `Route ${routeLabel} is currently on detour.`;
};

const getImpactScope = (severity, impactedStops = []) => {
  if (severity !== STOP_IMPACT_SEVERITY) return 'route';

  const roles = new Set(impactedStops.flatMap((stop) => stop.roles || []));
  if (roles.has('boarding') && roles.has('alighting')) return 'boarding_and_exit_stops';
  if (roles.has('boarding')) return 'boarding_stop';
  if (roles.has('alighting')) return 'exit_stop';
  return 'ride_stops';
};

const buildDetourGuidance = (impactScope) => {
  switch (impactScope) {
    case 'boarding_stop':
      return 'Board before the detour starts or use a stop after the route rejoins.';
    case 'exit_stop':
      return 'Get off after the route rejoins, or choose another trip if that stop is important.';
    case 'boarding_and_exit_stops':
      return 'Use open stops before the detour starts or after the route rejoins.';
    case 'ride_stops':
      return 'If you need one of these stops, check the map for an open stop outside the detour area.';
    default:
      return 'Check the map before travelling.';
  }
};

const hasTransitLeg = (itinerary) => (
  (itinerary?.legs || []).some((leg) => TRANSIT_MODES.has(leg?.mode))
);

const addAvoidsDetourLabel = (itinerary) => {
  const labels = Array.isArray(itinerary?.labels) ? itinerary.labels : [];
  const nextLabels = labels.includes('Avoids Detour')
    ? labels
    : [...labels, 'Avoids Detour'];

  return {
    ...itinerary,
    labels: nextLabels,
    detourAlternativeStatus: 'avoids_active_detour',
  };
};

export const getLegDetourImpact = ({
  leg,
  activeDetours = {},
  detourStopDetailsByRouteId = {},
}) => {
  if (!TRANSIT_MODES.has(leg?.mode)) return null;

  const routeId = getLegRouteId(leg);
  const [detourRouteId, detour] = getMatchingDetourEntry(routeId, activeDetours);
  if (!detourRouteId || !detour || detour.state === 'cleared') return null;

  const details =
    detourStopDetailsByRouteId[detourRouteId] ||
    detourStopDetailsByRouteId[normalizeRouteId(detourRouteId)] ||
    detourStopDetailsByRouteId[routeId] ||
    {};
  const { skippedStops, affectedStops } = collectDetourStops(details);
  const skippedStopKeys = buildStopKeySet(skippedStops);
  const affectedStopKeys = buildStopKeySet(affectedStops);
  const impactedByKey = new Map();

  getPlannedStops(leg).forEach(({ role, stop }) => {
    const stopKeys = getStopKeys(stop);
    if (stopKeys.length === 0) return;

    const isSkipped = stopKeys.some((key) => skippedStopKeys.has(key));
    if (isSkipped) {
      addRoleImpact(impactedByKey, stop, findMatchingStop(stop, skippedStops), role, 'skipped');
      return;
    }

    const isAffected = stopKeys.some((key) => affectedStopKeys.has(key));
    if (isAffected) {
      addRoleImpact(impactedByKey, stop, findMatchingStop(stop, affectedStops), role, 'affected');
    }
  });

  const impactedStops = [...impactedByKey.values()];
  const severity = impactedStops.length > 0 ? STOP_IMPACT_SEVERITY : ROUTE_IMPACT_SEVERITY;
  const routeLabel = getLegRouteLabel(leg, routeId);
  const impactScope = getImpactScope(severity, impactedStops);

  return {
    routeId: routeId == null ? null : String(routeId),
    detourRouteId,
    severity,
    impactScope,
    message: buildDetourMessage({ routeLabel, severity, impactedStops }),
    guidance: buildDetourGuidance(impactScope),
    affectedStopRoles: [...new Set(impactedStops.flatMap((stop) => stop.roles || []))],
    affectedStops: impactedStops,
    affectedStopNames: impactedStops.map((stop) => stop.stopName).filter(Boolean),
    skippedStopCount: skippedStops.length,
    affectedStopCount: affectedStops.length,
    detourState: detour.state ?? 'active',
  };
};

export const annotateItinerariesWithDetours = (
  itineraries = [],
  activeDetours = {},
  detourStopDetailsByRouteId = {}
) => {
  const annotated = (itineraries || []).map((itinerary) => {
    const detourImpacts = [];
    const legs = (itinerary?.legs || []).map((leg, legIndex) => {
      const detourImpact = getLegDetourImpact({
        leg,
        activeDetours,
        detourStopDetailsByRouteId,
      });

      if (!detourImpact) return leg;

      const impact = { ...detourImpact, legIndex };
      detourImpacts.push(impact);
      return {
        ...leg,
        detourImpact: impact,
      };
    });

    return {
      ...itinerary,
      legs,
      detourImpacts,
      hasDetour: detourImpacts.length > 0,
      hasStopDetourImpact: detourImpacts.some((impact) => impact.severity === STOP_IMPACT_SEVERITY),
    };
  });

  const hasAffectedTransitTrip = annotated.some((itinerary) => itinerary.hasDetour);
  if (!hasAffectedTransitTrip) return annotated;

  return annotated.map((itinerary) => (
    !itinerary.hasDetour && hasTransitLeg(itinerary)
      ? addAvoidsDetourLabel(itinerary)
      : itinerary
  ));
};

export default annotateItinerariesWithDetours;
