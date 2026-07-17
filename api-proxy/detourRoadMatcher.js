const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_POINTS = 100;
const DEFAULT_RADIUS_METERS = 75;
const ROAD_MATCH_SOURCE = 'osrm-match';
const ROAD_ROUTE_SOURCE = 'osrm-route';
const DETOUR_PATH_LABEL = 'Likely detour path';
const {
  DISPLAY_GEOMETRY_FIELDS,
  copyRefinedDisplayGeometry,
} = require('./detour/displayGeometry');
const {
  dedupeConsecutivePoints,
  haversineDistance,
  normalizeCoordinate,
  normalizePolyline,
  pointToPolylineDistance,
  toRadians,
} = require('./detour/roadGeometry');
const {
  buildBoundaryRefinedDisplayGeometry,
  doesPathUseBlockedSegment,
  trimNormalRouteEndpointOverlap,
} = require('./detour/boundaryRefinement');
const ROAD_MATCH_FIELDS = [
  'likelyDetourPolyline',
  'entryConnectorPolyline',
  'exitConnectorPolyline',
  'likelyDetourRoadNames',
  'roadMatchConfidence',
  'roadMatchRawConfidence',
  'roadMatchSource',
  'endpointMismatchMeters',
  'endpointMismatchAcceptedReason',
  'displayDetourPolyline',
  ...DISPLAY_GEOMETRY_FIELDS,
];
const DEFAULT_BACKTRACK_PROXIMITY_METERS = 12;
const DEFAULT_BACKTRACK_MIN_SEGMENT_METERS = 20;
const DEFAULT_BACKTRACK_MIN_TURN_DEGREES = 150;
const DEFAULT_BACKTRACK_MAX_WINDOW_POINTS = 30;
const DEFAULT_MIN_MATCH_CONFIDENCE = 0.45;
const DEFAULT_ENDPOINT_MAX_MISMATCH_METERS = 45;
const DEFAULT_REJOIN_CORRIDOR_MAX_MISMATCH_METERS = 125;
const DEFAULT_REJOIN_CORRIDOR_PROXIMITY_METERS = 45;
const MAX_RECENT_ROAD_MATCH_EVENTS = 20;

const roadMatcherStats = {
  requests: 0,
  skipped: 0,
  matchAttempts: 0,
  routeAttempts: 0,
  successes: 0,
  failures: 0,
  rejections: 0,
  fallbackSuccesses: 0,
  lastFailureAt: null,
  lastSuccessAt: null,
  recentEvents: [],
};

function recordRoadMatcherEvent(type, details = {}) {
  if (type === 'request') roadMatcherStats.requests += 1;
  if (type === 'skipped') roadMatcherStats.skipped += 1;
  if (type === 'match-attempt') roadMatcherStats.matchAttempts += 1;
  if (type === 'route-attempt') roadMatcherStats.routeAttempts += 1;
  if (type === 'success') {
    roadMatcherStats.successes += 1;
    roadMatcherStats.lastSuccessAt = new Date().toISOString();
  }
  if (type === 'fallback-success') {
    roadMatcherStats.fallbackSuccesses += 1;
    roadMatcherStats.successes += 1;
    roadMatcherStats.lastSuccessAt = new Date().toISOString();
  }
  if (type === 'failure') {
    roadMatcherStats.failures += 1;
    roadMatcherStats.lastFailureAt = new Date().toISOString();
  }
  if (type === 'rejection') roadMatcherStats.rejections += 1;

  roadMatcherStats.recentEvents.push({
    at: new Date().toISOString(),
    type,
    ...details,
  });
  while (roadMatcherStats.recentEvents.length > MAX_RECENT_ROAD_MATCH_EVENTS) {
    roadMatcherStats.recentEvents.shift();
  }
}

function getRoadMatcherStats() {
  return {
    ...roadMatcherStats,
    recentEvents: roadMatcherStats.recentEvents.slice(),
  };
}

function resetRoadMatcherStats() {
  roadMatcherStats.requests = 0;
  roadMatcherStats.skipped = 0;
  roadMatcherStats.matchAttempts = 0;
  roadMatcherStats.routeAttempts = 0;
  roadMatcherStats.successes = 0;
  roadMatcherStats.failures = 0;
  roadMatcherStats.rejections = 0;
  roadMatcherStats.fallbackSuccesses = 0;
  roadMatcherStats.lastFailureAt = null;
  roadMatcherStats.lastSuccessAt = null;
  roadMatcherStats.recentEvents = [];
}

function logRoadMatchEvent(event, fields = {}) {
  console.warn(JSON.stringify({
    event,
    ...fields,
  }));
}

function compactString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, 160) : null;
}

function buildRoadMatchLogContext(options = {}) {
  const source = options.logContext || {};
  return {
    routeId: compactString(source.routeId || options.routeId),
    publishId: compactString(source.publishId || options.publishId),
    eventId: compactString(source.eventId || options.eventId),
    segmentEventId: compactString(source.segmentEventId || options.segmentEventId),
  };
}

function withRoadMatchContext(details = {}, context = {}) {
  return {
    ...Object.fromEntries(Object.entries(context).filter(([, value]) => value != null)),
    ...details,
  };
}

function isTruthy(value) {
  return ['true', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isRoadMatchingEnabled(env = process.env) {
  return isTruthy(env.DETOUR_ROAD_MATCHING_ENABLED);
}

function getBaseUrl(env = process.env) {
  return String(env.DETOUR_ROAD_MATCHING_BASE_URL || '').trim().replace(/\/+$/, '');
}

function parsePositiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseNonNegativeFloat(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function bearingDegrees(start, end) {
  if (!start || !end) return null;

  const lat1 = toRadians(Number(start.latitude));
  const lat2 = toRadians(Number(end.latitude));
  const dLon = toRadians(Number(end.longitude) - Number(start.longitude));
  if (![lat1, lat2, dLon].every(Number.isFinite)) return null;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function turnDegrees(incomingBearing, outgoingBearing) {
  if (!Number.isFinite(incomingBearing) || !Number.isFinite(outgoingBearing)) {
    return 0;
  }

  const delta = Math.abs(incomingBearing - outgoingBearing) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function getBacktrackOptions(env = process.env) {
  return {
    proximityMeters: parsePositiveInt(
      env.DETOUR_ROAD_MATCHING_BACKTRACK_PROXIMITY_METERS,
      DEFAULT_BACKTRACK_PROXIMITY_METERS,
      1,
      60
    ),
    minSegmentMeters: parsePositiveInt(
      env.DETOUR_ROAD_MATCHING_BACKTRACK_MIN_SEGMENT_METERS,
      DEFAULT_BACKTRACK_MIN_SEGMENT_METERS,
      5,
      250
    ),
    minTurnDegrees: parseNonNegativeFloat(
      env.DETOUR_ROAD_MATCHING_BACKTRACK_MIN_TURN_DEGREES,
      DEFAULT_BACKTRACK_MIN_TURN_DEGREES,
      90,
      180
    ),
    maxWindowPoints: parsePositiveInt(
      env.DETOUR_ROAD_MATCHING_BACKTRACK_MAX_WINDOW_POINTS,
      DEFAULT_BACKTRACK_MAX_WINDOW_POINTS,
      1,
      100
    ),
  };
}

function isAvoidableBacktrackApex(points, index, options) {
  const previous = points[index - 1];
  const current = points[index];
  const next = points[index + 1];
  if (!previous || !current || !next) return false;

  const incomingDistance = haversineDistance(previous, current);
  const outgoingDistance = haversineDistance(current, next);
  if (
    incomingDistance < options.minSegmentMeters ||
    outgoingDistance < options.minSegmentMeters
  ) {
    return false;
  }

  if (haversineDistance(previous, next) > options.proximityMeters) {
    return false;
  }

  const incomingBearing = bearingDegrees(previous, current);
  const outgoingBearing = bearingDegrees(current, next);
  return turnDegrees(incomingBearing, outgoingBearing) >= options.minTurnDegrees;
}

function getAvoidableBacktrackWindow(points, index, options) {
  let radius = 1;
  while (
    radius < options.maxWindowPoints &&
    index - radius - 1 >= 0 &&
    index + radius + 1 < points.length &&
    haversineDistance(points[index - radius - 1], points[index + radius + 1]) <= options.proximityMeters
  ) {
    radius += 1;
  }

  const start = index - radius;
  const end = index + radius;
  if (start <= 0 || end >= points.length - 1) {
    return null;
  }

  return { start, end };
}

function stripLeadingOutAndBack(points, options) {
  let cleaned = normalizePolyline(points);
  let guard = 0;

  while (cleaned.length >= 4 && guard < 5) {
    guard += 1;

    const maxReturnIndex = Math.min(cleaned.length - 2, options.maxWindowPoints);
    let returnIndex = -1;
    let travelledMeters = 0;

    for (let i = 1; i <= maxReturnIndex; i += 1) {
      travelledMeters += haversineDistance(cleaned[i - 1], cleaned[i]);
      if (
        travelledMeters >= options.minSegmentMeters &&
        haversineDistance(cleaned[0], cleaned[i]) <= options.proximityMeters
      ) {
        returnIndex = i;
      }
    }

    if (returnIndex < 1) {
      break;
    }

    cleaned.splice(1, returnIndex);
    cleaned = normalizePolyline(cleaned);
  }

  return cleaned;
}

function stripEndpointOutAndBacks(points, options) {
  const withoutLeading = stripLeadingOutAndBack(points, options);
  const reversed = [...withoutLeading].reverse();
  return normalizePolyline(stripLeadingOutAndBack(reversed, options).reverse());
}

function removeAvoidableBacktracksFromPolyline(polyline, env = process.env) {
  let cleaned = normalizePolyline(polyline);
  if (cleaned.length < 3) return cleaned;

  const options = getBacktrackOptions(env);
  cleaned = stripEndpointOutAndBacks(cleaned, options);
  let index = 1;
  let guard = 0;

  while (index < cleaned.length - 1 && guard < cleaned.length * 2) {
    guard += 1;

    if (!isAvoidableBacktrackApex(cleaned, index, options)) {
      index += 1;
      continue;
    }

    const window = getAvoidableBacktrackWindow(cleaned, index, options);
    if (!window) {
      index += 1;
      continue;
    }

    cleaned.splice(window.start + 1, window.end - window.start);
    cleaned = normalizePolyline(cleaned);
    index = Math.max(1, window.start - 2);
  }

  cleaned = stripEndpointOutAndBacks(cleaned, options);
  return cleaned;
}

function stitchRenderableDetourPolyline(path, entryConnectorPolyline, exitConnectorPolyline) {
  const stitched = dedupeConsecutivePoints([
    ...(Array.isArray(entryConnectorPolyline) ? entryConnectorPolyline : []),
    ...(Array.isArray(path) ? path : []),
    ...(Array.isArray(exitConnectorPolyline) ? exitConnectorPolyline : []),
  ]);
  return stitched.length >= 2 ? stitched : [];
}

function samplePolyline(points, maxPoints = DEFAULT_MAX_POINTS) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];

  const sampled = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const ratio = maxPoints === 1 ? 0 : i / (maxPoints - 1);
    const index = Math.min(points.length - 1, Math.round(ratio * (points.length - 1)));
    sampled.push(points[index]);
  }

  return normalizePolyline(sampled);
}

function confidenceLabel(rawConfidence) {
  if (rawConfidence == null || rawConfidence === '') return null;
  const confidence = Number(rawConfidence);
  if (!Number.isFinite(confidence)) return null;
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.45) return 'medium';
  return 'low';
}

function getRoadMatchRadiusMeters(env = process.env) {
  return parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_RADIUS_METERS,
    DEFAULT_RADIUS_METERS,
    5,
    500
  );
}

function getMinimumMatchConfidence(env = process.env) {
  return parseNonNegativeFloat(
    env.DETOUR_ROAD_MATCHING_MIN_CONFIDENCE,
    DEFAULT_MIN_MATCH_CONFIDENCE,
    0,
    1
  );
}

function getEndpointMaxMismatchMeters(env = process.env) {
  return parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_ENDPOINT_MAX_MISMATCH_METERS,
    DEFAULT_ENDPOINT_MAX_MISMATCH_METERS,
    5,
    500
  );
}

function getRejoinCorridorMaxMismatchMeters(env = process.env) {
  return parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_REJOIN_CORRIDOR_MAX_MISMATCH_METERS,
    DEFAULT_REJOIN_CORRIDOR_MAX_MISMATCH_METERS,
    5,
    500
  );
}

function getRejoinCorridorProximityMeters(env = process.env) {
  return parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_REJOIN_CORRIDOR_PROXIMITY_METERS,
    DEFAULT_REJOIN_CORRIDOR_PROXIMITY_METERS,
    5,
    200
  );
}

function buildEndpointMismatchAssessment(path, referencePath) {
  const matched = normalizePolyline(path);
  const reference = normalizePolyline(referencePath);
  if (matched.length < 2 || reference.length < 2) return null;

  const matchedStart = matched[0];
  const matchedEnd = matched[matched.length - 1];
  const referenceStart = reference[0];
  const referenceEnd = reference[reference.length - 1];
  const direct = Math.max(
    haversineDistance(matchedStart, referenceStart),
    haversineDistance(matchedEnd, referenceEnd)
  );
  const reversed = Math.max(
    haversineDistance(matchedStart, referenceEnd),
    haversineDistance(matchedEnd, referenceStart)
  );
  const directAssessment = {
    orientation: 'direct',
    startMismatchMeters: haversineDistance(matchedStart, referenceStart),
    endMismatchMeters: haversineDistance(matchedEnd, referenceEnd),
    mismatchMeters: direct,
    matchedStart,
    matchedEnd,
    referenceStart,
    referenceEnd,
  };
  const reversedAssessment = {
    orientation: 'reversed',
    startMismatchMeters: haversineDistance(matchedStart, referenceEnd),
    endMismatchMeters: haversineDistance(matchedEnd, referenceStart),
    mismatchMeters: reversed,
    matchedStart,
    matchedEnd,
    referenceStart: referenceEnd,
    referenceEnd: referenceStart,
  };

  return direct <= reversed ? directAssessment : reversedAssessment;
}

function endpointMismatchMeters(path, referencePath) {
  return buildEndpointMismatchAssessment(path, referencePath)?.mismatchMeters ?? null;
}

function getEndpointRejoinAcceptance(assessment, options = {}) {
  if (!assessment) return { accepted: true, mismatchMeters: null };

  const strictMaxMeters = getEndpointMaxMismatchMeters(options.env);
  if (assessment.mismatchMeters <= strictMaxMeters) {
    return {
      accepted: true,
      mismatchMeters: assessment.mismatchMeters,
      endpointMismatchAcceptedReason: null,
    };
  }

  const routeShapePolyline = normalizePolyline(options.routeShapePolyline);
  if (routeShapePolyline.length < 2) {
    return {
      accepted: false,
      mismatchMeters: assessment.mismatchMeters,
      endpointMismatchAcceptedReason: null,
    };
  }
  if (assessment.orientation !== 'direct') {
    return {
      accepted: false,
      mismatchMeters: assessment.mismatchMeters,
      endpointMismatchAcceptedReason: null,
    };
  }

  const corridorMaxMeters = Math.max(
    strictMaxMeters,
    getRejoinCorridorMaxMismatchMeters(options.env)
  );
  const corridorProximityMeters = getRejoinCorridorProximityMeters(options.env);
  const startStrict = assessment.startMismatchMeters <= strictMaxMeters;
  const endStrict = assessment.endMismatchMeters <= strictMaxMeters;
  const matchedStartCorridor =
    assessment.startMismatchMeters <= corridorMaxMeters &&
    pointToPolylineDistance(assessment.matchedStart, routeShapePolyline) <= corridorProximityMeters;
  const matchedEndCorridor =
    assessment.endMismatchMeters <= corridorMaxMeters &&
    pointToPolylineDistance(assessment.matchedEnd, routeShapePolyline) <= corridorProximityMeters;
  const anchoredStartCorridor =
    assessment.startMismatchMeters <= corridorMaxMeters &&
    pointToPolylineDistance(assessment.referenceStart, routeShapePolyline) <= corridorProximityMeters;
  const anchoredEndCorridor =
    assessment.endMismatchMeters <= corridorMaxMeters &&
    pointToPolylineDistance(assessment.referenceEnd, routeShapePolyline) <= corridorProximityMeters;
  const serviceRejoinPoint = normalizeCoordinate(options.serviceRejoinPoint);
  const anchoredEndServiceRejoin =
    serviceRejoinPoint &&
    assessment.endMismatchMeters <= corridorMaxMeters &&
    haversineDistance(assessment.referenceEnd, serviceRejoinPoint) <= strictMaxMeters;

  const startsAtServiceCorridor = (matchedStartCorridor || anchoredStartCorridor) && endStrict;
  const rejoinsServiceCorridor = (matchedEndCorridor || anchoredEndCorridor || anchoredEndServiceRejoin) && startStrict;
  const matchesServiceCorridorAnchors = anchoredStartCorridor && (anchoredEndCorridor || anchoredEndServiceRejoin);

  if (startsAtServiceCorridor || rejoinsServiceCorridor || matchesServiceCorridorAnchors) {
    return {
      accepted: true,
      mismatchMeters: assessment.mismatchMeters,
      endpointMismatchAcceptedReason: anchoredEndServiceRejoin
        ? 'matched-explicit-service-rejoin'
        : matchesServiceCorridorAnchors
        ? 'matched-regular-route-corridor-anchors'
        : startsAtServiceCorridor
          ? 'started-on-regular-route-corridor'
          : 'rejoined-regular-route-corridor',
    };
  }

  return {
    accepted: false,
    mismatchMeters: assessment.mismatchMeters,
    endpointMismatchAcceptedReason: null,
  };
}

function addRejectionReason(options, reason, details = {}) {
  if (Array.isArray(options?.rejectionReasons)) {
    options.rejectionReasons.push({ reason, ...details });
  }
}

function buildOsrmMatchUrl(baseUrl, points, env = process.env) {
  const coordinateList = points
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');
  const radiusMeters = getRoadMatchRadiusMeters(env);
  const query = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    tidy: 'true',
    gaps: 'ignore',
    radiuses: points.map(() => radiusMeters).join(';'),
  });
  return `${baseUrl}/match/v1/driving/${coordinateList}?${query.toString()}`;
}

function getAdaptiveMatchRadii(env = process.env) {
  const configuredRadius = getRoadMatchRadiusMeters(env);
  return [configuredRadius, 25, 15, 10]
    .filter((radius, index, radii) => radius > 0 && radii.indexOf(radius) === index)
    .filter((radius, index) => index === 0 || radius < configuredRadius);
}

function buildOsrmRouteUrl(baseUrl, points) {
  const coordinateList = points
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');
  const query = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    continue_straight: 'false',
  });
  return `${baseUrl}/route/v1/driving/${coordinateList}?${query.toString()}`;
}

function dedupeRoadNames(roadNames) {
  const seen = new Set();
  return (roadNames || [])
    .map((roadName) => String(roadName || '').trim())
    .filter((roadName) => {
      if (!roadName) return false;
      const key = roadName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function extractRoadNames(matching) {
  const names = [];
  (matching?.legs || []).forEach((leg) => {
    (leg?.steps || []).forEach((step) => {
      if (step?.name) names.push(step.name);
    });
  });
  return dedupeRoadNames(names);
}

function parseMatchedPolyline(matching) {
  const coordinates = matching?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];

  return normalizePolyline(coordinates.map((coordinate) => ({
    longitude: coordinate?.[0],
    latitude: coordinate?.[1],
  })));
}

async function fetchOsrmJson(url, fetchImpl, controller) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    signal: controller?.signal,
  });

  if (!response?.ok) {
    throw new Error(`Road matching failed with HTTP ${response?.status || 'unknown'}`);
  }

  return response.json();
}

async function fetchOsrmJsonWithTimeout(url, fetchImpl, timeoutMs) {
  const controller = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    return await fetchOsrmJson(url, fetchImpl, controller);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildRoadMatchedResult(matchable, source, options = {}) {
  const rawConfidence = Number(matchable?.confidence);
  if (
    source === ROAD_MATCH_SOURCE &&
    Number.isFinite(rawConfidence) &&
    rawConfidence < getMinimumMatchConfidence(options.env)
  ) {
    addRejectionReason(options, 'low-confidence', { rawConfidence });
    return null;
  }

  let matchedPolyline = removeAvoidableBacktracksFromPolyline(
    parseMatchedPolyline(matchable),
    options.env
  );
  if (matchedPolyline.length < 2) return null;

  const endpointAssessment = getEndpointRejoinAcceptance(
    buildEndpointMismatchAssessment(matchedPolyline, options.candidatePolyline),
    options
  );
  if (!endpointAssessment.accepted) {
    addRejectionReason(options, 'endpoint-mismatch', {
      mismatchMeters: endpointAssessment.mismatchMeters,
    });
    return null;
  }

  const routeTrim = trimNormalRouteEndpointOverlap(
    matchedPolyline,
    options.routeShapePolyline,
    options.env
  );
  if (routeTrim.prefixTrimmed || routeTrim.suffixTrimmed) {
    matchedPolyline = routeTrim.path;
    if (matchedPolyline.length < 2) {
      addRejectionReason(options, 'normal-route-overlap', {
        prefixOverlapMeters: routeTrim.prefixOverlapMeters,
        suffixOverlapMeters: routeTrim.suffixOverlapMeters,
      });
      return null;
    }
  }

  if (doesPathUseBlockedSegment(matchedPolyline, options.blockedPolyline, options.env)) {
    addRejectionReason(options, 'blocked-overlap');
    return null;
  }

  const renderablePolyline = stitchRenderableDetourPolyline(
    matchedPolyline,
    routeTrim.entryConnectorPolyline,
    routeTrim.exitConnectorPolyline
  );
  if (renderablePolyline.length < 2) return null;
  if (doesPathUseBlockedSegment(renderablePolyline, options.blockedPolyline, options.env)) {
    const refinedDisplayGeometry = buildBoundaryRefinedDisplayGeometry(
      matchedPolyline,
      routeTrim,
      options
    );
    if (!refinedDisplayGeometry) {
      addRejectionReason(options, 'published-blocked-overlap');
      return null;
    }
    return {
      likelyDetourPolyline: refinedDisplayGeometry.displayDetourPolyline,
      entryConnectorPolyline: null,
      exitConnectorPolyline: null,
      likelyDetourRoadNames: extractRoadNames(matchable),
      roadMatchConfidence: confidenceLabel(matchable.confidence),
      roadMatchRawConfidence: Number.isFinite(Number(matchable.confidence))
        ? Number(matchable.confidence)
        : null,
      roadMatchSource: source,
      endpointMismatchMeters: endpointAssessment.mismatchMeters != null
        ? Math.round(endpointAssessment.mismatchMeters)
        : null,
      endpointMismatchAcceptedReason: endpointAssessment.endpointMismatchAcceptedReason,
      detourPathLabel: DETOUR_PATH_LABEL,
      ...refinedDisplayGeometry,
    };
  }

  return {
    likelyDetourPolyline: renderablePolyline,
    entryConnectorPolyline: null,
    exitConnectorPolyline: null,
    likelyDetourRoadNames: extractRoadNames(matchable),
    roadMatchConfidence: confidenceLabel(matchable.confidence),
    roadMatchRawConfidence: Number.isFinite(Number(matchable.confidence))
      ? Number(matchable.confidence)
      : null,
    roadMatchSource: source,
    endpointMismatchMeters: endpointAssessment.mismatchMeters != null
      ? Math.round(endpointAssessment.mismatchMeters)
      : null,
    endpointMismatchAcceptedReason: endpointAssessment.endpointMismatchAcceptedReason,
    detourPathLabel: DETOUR_PATH_LABEL,
  };
}

function isRouteFallbackEnabled(env = process.env, options = {}) {
  if (options.allowRouteFallback === false) return false;
  return env.DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED == null
    ? true
    : isTruthy(env.DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED);
}

function prefersRouteMatching(options = {}, env = process.env) {
  return options.preferRouteMatching === true || isTruthy(env.DETOUR_ROAD_MATCHING_PREFER_ROUTE);
}

async function routePolylineToRoads(points, {
  baseUrl,
  fetchImpl,
  timeoutMs,
  options = {},
  recordRejectionReasons = () => {},
} = {}) {
  const routePayload = await fetchOsrmJsonWithTimeout(
    buildOsrmRouteUrl(baseUrl, points),
    fetchImpl,
    timeoutMs
  );
  const route = Array.isArray(routePayload?.routes) ? routePayload.routes[0] : null;
  if (!route) return null;

  const routeRejectionReasons = [];
  const routeResult = buildRoadMatchedResult(route, ROAD_ROUTE_SOURCE, {
      ...options,
      candidatePolyline: points,
      rejectionReasons: routeRejectionReasons,
    });
  if (!routeResult) recordRejectionReasons(routeRejectionReasons);
  return routeResult;
}

async function matchPolylineToRoads(polyline, options = {}) {
  const env = options.env || process.env;
  const logContext = buildRoadMatchLogContext(options);
  recordRoadMatcherEvent('request', withRoadMatchContext({}, logContext));
  if (!isRoadMatchingEnabled(env)) {
    recordRoadMatcherEvent('skipped', withRoadMatchContext({ reason: 'disabled' }, logContext));
    return null;
  }

  const baseUrl = getBaseUrl(env);
  if (!baseUrl) {
    recordRoadMatcherEvent('skipped', withRoadMatchContext({ reason: 'base-url-missing' }, logContext));
    return null;
  }

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    recordRoadMatcherEvent('skipped', withRoadMatchContext({ reason: 'fetch-missing' }, logContext));
    return null;
  }

  const maxPoints = parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_MAX_POINTS,
    DEFAULT_MAX_POINTS,
    2,
    100
  );
  const points = samplePolyline(normalizePolyline(polyline), maxPoints);
  if (points.length < 2) {
    recordRoadMatcherEvent('skipped', withRoadMatchContext({ reason: 'too-few-points' }, logContext));
    return null;
  }

  const timeoutMs = parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    500,
    30000
  );
  let matchError = null;
  let rejectedForTrust = false;
  const externalRejectionReasons = Array.isArray(options.rejectionReasons)
    ? options.rejectionReasons
    : null;
  const recordRejectionReasons = (reasons) => {
    if (externalRejectionReasons && Array.isArray(reasons) && reasons.length > 0) {
      externalRejectionReasons.push(...reasons);
    }
  };

  if (prefersRouteMatching(options, env)) {
    try {
      const routeFirstResult = await routePolylineToRoads(points, {
        baseUrl,
        fetchImpl,
        timeoutMs,
        options,
        recordRejectionReasons,
      });
      recordRoadMatcherEvent('route-attempt', withRoadMatchContext({
        mode: 'prefer-route',
        ok: Boolean(routeFirstResult),
      }, logContext));
      if (routeFirstResult) {
        recordRoadMatcherEvent('success', withRoadMatchContext({ source: ROAD_ROUTE_SOURCE }, logContext));
        return routeFirstResult;
      }
      recordRoadMatcherEvent('rejection', withRoadMatchContext({
        source: ROAD_ROUTE_SOURCE,
        reason: 'unusable-route-result',
      }, logContext));
      return null;
    } catch (err) {
      matchError = err;
      if (err?.name === 'AbortError') {
        recordRoadMatcherEvent('failure', withRoadMatchContext({
          source: ROAD_ROUTE_SOURCE,
          reason: 'timeout',
        }, logContext));
        return null;
      }
      recordRoadMatcherEvent('failure', withRoadMatchContext({
        source: ROAD_ROUTE_SOURCE,
        reason: err?.message || String(err),
      }, logContext));
      logRoadMatchEvent('detour_road_match_failed', withRoadMatchContext({
        source: ROAD_ROUTE_SOURCE,
        reason: err?.message || String(err),
      }, logContext));
    }
  }

  for (const radiusMeters of getAdaptiveMatchRadii(env)) {
    try {
      recordRoadMatcherEvent('match-attempt', withRoadMatchContext({ radiusMeters }, logContext));
      const payload = await fetchOsrmJsonWithTimeout(
        buildOsrmMatchUrl(baseUrl, points, {
          ...env,
          DETOUR_ROAD_MATCHING_RADIUS_METERS: String(radiusMeters),
        }),
        fetchImpl,
        timeoutMs
      );
      const matching = Array.isArray(payload?.matchings) ? payload.matchings[0] : null;
      const rejectionReasons = [];
      const matchResult = matching
        ? buildRoadMatchedResult(matching, ROAD_MATCH_SOURCE, {
          ...options,
          candidatePolyline: points,
          rejectionReasons,
        })
        : null;
      if (matchResult) {
        recordRoadMatcherEvent('success', withRoadMatchContext({
          source: ROAD_MATCH_SOURCE,
          radiusMeters,
        }, logContext));
        return matchResult;
      }
      if (matching) {
        recordRejectionReasons(rejectionReasons);
        if (rejectionReasons.some(({ reason }) => reason === 'endpoint-mismatch')) {
          rejectedForTrust = true;
        }
        logRoadMatchEvent('detour_road_match_rejected', withRoadMatchContext({
          source: ROAD_MATCH_SOURCE,
          radiusMeters,
          reason: rejectionReasons[0]?.reason || 'no usable road-matched path after safety checks',
          details: rejectionReasons[0] || undefined,
        }, logContext));
        recordRoadMatcherEvent('rejection', withRoadMatchContext({
          source: ROAD_MATCH_SOURCE,
          radiusMeters,
          reason: rejectionReasons[0]?.reason || 'unusable-match-result',
        }, logContext));
        break;
      }
      matchError = null;
      break;
    } catch (err) {
      matchError = err;
      if (err?.name === 'AbortError') {
        recordRoadMatcherEvent('failure', withRoadMatchContext({
          source: ROAD_MATCH_SOURCE,
          radiusMeters,
          reason: 'timeout',
        }, logContext));
        break;
      }
      recordRoadMatcherEvent('failure', withRoadMatchContext({
        source: ROAD_MATCH_SOURCE,
        radiusMeters,
        reason: err?.message || String(err),
      }, logContext));
      logRoadMatchEvent('detour_road_match_failed', withRoadMatchContext({
        source: ROAD_MATCH_SOURCE,
        radiusMeters,
        reason: err?.message || String(err),
      }, logContext));
    }
  }

  if (rejectedForTrust) {
    return null;
  }

  if (!isRouteFallbackEnabled(env, options)) {
    if (matchError) throw matchError;
    return null;
  }

  try {
    const fallback = await routePolylineToRoads(points, {
      baseUrl,
      fetchImpl,
      timeoutMs,
      options,
      recordRejectionReasons,
    });
    recordRoadMatcherEvent('route-attempt', withRoadMatchContext({
      mode: 'fallback',
      ok: Boolean(fallback),
    }, logContext));
    if (fallback) {
      recordRoadMatcherEvent('fallback-success', withRoadMatchContext({
        source: ROAD_ROUTE_SOURCE,
      }, logContext));
    } else {
      recordRoadMatcherEvent('rejection', withRoadMatchContext({
        source: ROAD_ROUTE_SOURCE,
        reason: 'unusable-route-fallback',
      }, logContext));
    }
    return fallback;
  } catch (err) {
    recordRoadMatcherEvent('failure', withRoadMatchContext({
      source: ROAD_ROUTE_SOURCE,
      reason: err?.message || String(err),
    }, logContext));
    throw err;
  }
}

function clearRoadMatchedFields(value) {
  const next = { ...(value || {}) };
  ROAD_MATCH_FIELDS.forEach((field) => {
    delete next[field];
  });
  return next;
}

function getMatchCandidate(segment) {
  if (segment?.canShowDetourPath === false) {
    return [];
  }

  if (Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2) {
    return segment.inferredDetourPolyline;
  }
  return [];
}

function getRouteShapePolylineForSegment(segment, options = {}) {
  if (Array.isArray(options.routeShapePolyline) && options.routeShapePolyline.length >= 2) {
    return options.routeShapePolyline;
  }

  const shapeId = segment?.shapeId || options.shapeId || null;
  const shapes = options.shapes || options.routeShapes || null;
  if (!shapeId || !shapes) return [];

  if (typeof shapes.get === 'function') {
    return shapes.get(shapeId) || [];
  }

  if (typeof shapes === 'object') {
    return shapes[shapeId] || [];
  }

  return [];
}

function getStopId(stop) {
  const value = stop?.stopId ?? stop?.id;
  return value == null ? null : String(value);
}

function getStopCode(stop) {
  const value = stop?.stopCode ?? stop?.code;
  return value == null ? null : String(value);
}

function getStopCoordinate(stop) {
  return normalizeCoordinate(stop?.coordinate || stop?.location || stop);
}

function filterStopsToDisplaySpan(stops, displaySkippedSegmentPolyline) {
  if (!Array.isArray(stops)) return null;
  const displaySpan = normalizePolyline(displaySkippedSegmentPolyline);
  if (displaySpan.length < 2) return null;
  return stops.filter((stop) => {
    const coordinate = getStopCoordinate(stop);
    return coordinate && pointToPolylineDistance(coordinate, displaySpan) <= 75;
  });
}

function addDisplayStopMetadata(match, segment) {
  if (!match?.displayBoundaryRefined) return match;
  const displaySkippedStops = filterStopsToDisplaySpan(
    segment?.skippedStops,
    match.displaySkippedSegmentPolyline
  );
  if (!displaySkippedStops) return match;
  return {
    ...match,
    displaySkippedStops,
    displaySkippedStopIds: displaySkippedStops.map(getStopId).filter(Boolean),
    displaySkippedStopCodes: displaySkippedStops.map(getStopCode).filter(Boolean),
  };
}

async function matchSegment(segment, options) {
  const candidate = getMatchCandidate(segment);
  if (candidate.length < 2) {
    return { ...segment };
  }

  try {
    const rejectionReasons = [];
    const match = await matchPolylineToRoads(candidate, {
      ...options,
      allowRouteFallback: segment?.configuredCorridor === true ||
        segment?.configuredCorridorLabel
        ? false
        : options.allowRouteFallback,
      logContext: {
        ...(options.logContext || {}),
        segmentEventId: segment?.detourEventId || segment?.sharedDetourEventId || options.segmentEventId || null,
      },
      blockedPolyline: segment?.skippedSegmentPolyline,
      routeShapePolyline: getRouteShapePolylineForSegment(segment, options),
      serviceRejoinPoint: segment?.serviceRejoinPoint,
      rejectionReasons,
    });
    if (!match) {
      const cleared = clearRoadMatchedFields(segment);
      if (rejectionReasons.some(({ reason }) => (
        reason === 'blocked-overlap' ||
        reason === 'published-blocked-overlap'
      ))) {
        return {
          ...cleared,
          canShowDetourPath: false,
          inferredDetourPolyline: null,
          detourPathSuppressedReason: 'road-match-closed-overlap',
        };
      }
      return cleared;
    }
    return {
      ...clearRoadMatchedFields(segment),
      ...addDisplayStopMetadata(match, segment),
    };
  } catch (err) {
    logRoadMatchEvent('detour_road_match_fallback_to_inferred', withRoadMatchContext({
      reason: err.message,
    }, buildRoadMatchLogContext(options)));
    return { ...segment };
  }
}

async function matchDetourGeometry(geometry, options = {}) {
  if (!geometry || typeof geometry !== 'object') return geometry;

  const env = options.env || process.env;
  const next = JSON.parse(JSON.stringify(geometry));
  next.detourPathLabel = next.detourPathLabel || DETOUR_PATH_LABEL;

  if (!isRoadMatchingEnabled(env) || !getBaseUrl(env)) {
    return next;
  }

  const originalSegments = Array.isArray(next.segments) ? next.segments : [];
  let primaryMatch = null;

  if (
    originalSegments.length > 1 &&
    Array.isArray(next.inferredDetourPolyline) &&
    next.inferredDetourPolyline.length >= 2
  ) {
    primaryMatch = await matchSegment(next, options);
  }

  const segments = [];
  for (const segment of originalSegments) {
    // Keep requests sequential. Public OSRM and small hosted matchers often
    // time out when several segment match + route-fallback calls are fired at
    // once for route-family detours.
    // eslint-disable-next-line no-await-in-loop
    segments.push(await matchSegment(segment, options));
  }

  next.segments = segments;

  const hasSuppressedDetourPathSegment = segments.some((segment) =>
    segment?.detourPathSuppressedReason === 'road-match-closed-overlap'
  );
  const hasRenderableDetourPathSegment = segments.some((segment) => (
    segment?.canShowDetourPath === true &&
    (
      (Array.isArray(segment?.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 2) ||
      (Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2)
    )
  ));
  if (hasSuppressedDetourPathSegment && !hasRenderableDetourPathSegment) {
    next.canShowDetourPath = false;
    next.inferredDetourPolyline = null;
    next.detourPathSuppressedReason = 'road-match-closed-overlap';
  }

  primaryMatch = segments.find((segment) => (
      Array.isArray(segment?.likelyDetourPolyline) &&
      segment.likelyDetourPolyline.length >= 2
    )) || (
      primaryMatch?.likelyDetourPolyline?.length >= 2
        ? primaryMatch
        : null
    );

  if (
    !primaryMatch &&
    originalSegments.length === 0 &&
    Array.isArray(next.inferredDetourPolyline) &&
    next.inferredDetourPolyline.length >= 2
  ) {
    const topLevelMatch = await matchSegment(next, options);
    primaryMatch = topLevelMatch;
  }

  if (primaryMatch?.likelyDetourPolyline?.length >= 2) {
    ROAD_MATCH_FIELDS.forEach((field) => {
      delete next[field];
    });
    next.likelyDetourPolyline = primaryMatch.likelyDetourPolyline;
    next.entryConnectorPolyline = primaryMatch.entryConnectorPolyline || null;
    next.exitConnectorPolyline = primaryMatch.exitConnectorPolyline || null;
    next.likelyDetourRoadNames = primaryMatch.likelyDetourRoadNames || [];
    next.roadMatchConfidence = primaryMatch.roadMatchConfidence || null;
    next.roadMatchRawConfidence = primaryMatch.roadMatchRawConfidence ?? null;
    next.roadMatchSource = primaryMatch.roadMatchSource || ROAD_MATCH_SOURCE;
    next.endpointMismatchMeters = primaryMatch.endpointMismatchMeters ?? null;
    next.endpointMismatchAcceptedReason = primaryMatch.endpointMismatchAcceptedReason ?? null;
    next.detourPathLabel = DETOUR_PATH_LABEL;
    if (primaryMatch.displayBoundaryRefined === true) {
      copyRefinedDisplayGeometry(next, primaryMatch);
    }
  } else {
    ROAD_MATCH_FIELDS.forEach((field) => {
      delete next[field];
    });
  }

  return next;
}

module.exports = {
  DETOUR_PATH_LABEL,
  ROAD_MATCH_SOURCE,
  buildOsrmMatchUrl,
  buildOsrmRouteUrl,
  confidenceLabel,
  getRoadMatcherStats,
  isRoadMatchingEnabled,
  matchDetourGeometry,
  matchPolylineToRoads,
  normalizePolyline,
  removeAvoidableBacktracksFromPolyline,
  resetRoadMatcherStats,
};
