const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_POINTS = 100;
const DEFAULT_RADIUS_METERS = 75;
const ROAD_MATCH_SOURCE = 'osrm-match';
const ROAD_ROUTE_SOURCE = 'osrm-route';
const DETOUR_PATH_LABEL = 'Likely detour path';
const ROAD_MATCH_FIELDS = [
  'likelyDetourPolyline',
  'entryConnectorPolyline',
  'exitConnectorPolyline',
  'likelyDetourRoadNames',
  'roadMatchConfidence',
  'roadMatchRawConfidence',
  'roadMatchSource',
];
const EARTH_RADIUS_METERS = 6371000;
const DEFAULT_BLOCKED_PROXIMITY_METERS = 35;
const DEFAULT_BLOCKED_OVERLAP_RATIO = 0.05;
const DEFAULT_BLOCKED_ENDPOINT_RATIO = 0.12;
const DEFAULT_BLOCKED_MIN_POINTS = 3;
const DEFAULT_ROUTE_OVERLAP_PROXIMITY_METERS = 35;
const DEFAULT_ROUTE_OVERLAP_MIN_RUN_METERS = 35;
const DEFAULT_BACKTRACK_PROXIMITY_METERS = 12;
const DEFAULT_BACKTRACK_MIN_SEGMENT_METERS = 20;
const DEFAULT_BACKTRACK_MIN_TURN_DEGREES = 150;
const DEFAULT_BACKTRACK_MAX_WINDOW_POINTS = 30;
const DEFAULT_MIN_MATCH_CONFIDENCE = 0.45;
const DEFAULT_ENDPOINT_MAX_MISMATCH_METERS = 45;

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

function normalizeCoordinate(point) {
  if (!point || typeof point !== 'object') return null;
  const rawLatitude = point.latitude ?? point.lat;
  const rawLongitude = point.longitude ?? point.lon;
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function haversineDistance(pointA, pointB) {
  if (!pointA || !pointB) return Infinity;
  const lat1 = Number(pointA.latitude);
  const lon1 = Number(pointA.longitude);
  const lat2 = Number(pointB.latitude);
  const lon2 = Number(pointB.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistance(point, start, end) {
  if (!point || !start || !end) return Infinity;

  const x = Number(point.longitude);
  const y = Number(point.latitude);
  const x1 = Number(start.longitude);
  const y1 = Number(start.latitude);
  const x2 = Number(end.longitude);
  const y2 = Number(end.latitude);
  if (![x, y, x1, y1, x2, y2].every(Number.isFinite)) return Infinity;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return haversineDistance(point, start);
  }

  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const closest = {
    latitude: y1 + t * dy,
    longitude: x1 + t * dx,
  };
  return haversineDistance(point, closest);
}

function pointToPolylineDistance(point, polyline) {
  const line = normalizePolyline(polyline);
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineDistance(point, line[0]);

  let minDistance = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    minDistance = Math.min(minDistance, pointToSegmentDistance(point, line[i], line[i + 1]));
  }
  return minDistance;
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

function normalizePolyline(polyline) {
  if (!Array.isArray(polyline)) return [];

  const points = [];
  let previousKey = null;
  polyline.forEach((point) => {
    const normalized = normalizeCoordinate(point);
    if (!normalized) return;
    const key = `${normalized.latitude.toFixed(6)},${normalized.longitude.toFixed(6)}`;
    if (key === previousKey) return;
    previousKey = key;
    points.push(normalized);
  });

  return points;
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

function doesPathUseBlockedSegment(path, blockedPolyline, env = process.env) {
  const points = normalizePolyline(path);
  const blocked = normalizePolyline(blockedPolyline);
  if (points.length < 2 || blocked.length < 2) return false;

  const endpointRatio = parseNonNegativeFloat(
    env.DETOUR_ROAD_MATCHING_BLOCKED_ENDPOINT_RATIO,
    DEFAULT_BLOCKED_ENDPOINT_RATIO,
    0,
    0.45
  );
  const proximityMeters = parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_BLOCKED_PROXIMITY_METERS,
    DEFAULT_BLOCKED_PROXIMITY_METERS,
    5,
    200
  );
  const overlapRatio = parseNonNegativeFloat(
    env.DETOUR_ROAD_MATCHING_BLOCKED_OVERLAP_RATIO,
    DEFAULT_BLOCKED_OVERLAP_RATIO,
    0.05,
    1
  );
  const minPoints = parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_BLOCKED_MIN_POINTS,
    DEFAULT_BLOCKED_MIN_POINTS,
    1,
    50
  );
  const endpointPointCount = Math.min(
    Math.ceil(points.length * endpointRatio),
    Math.max(0, Math.floor((points.length - minPoints) / 2))
  );
  const startIndex = endpointPointCount;
  const endIndex = points.length - endpointPointCount - 1;
  const interior = points.slice(startIndex, endIndex + 1);
  if (interior.length === 0) return false;

  const nearBlockedCount = interior.filter((point) =>
    pointToPolylineDistance(point, blocked) <= proximityMeters
  ).length;

  return nearBlockedCount >= minPoints && (nearBlockedCount / interior.length) >= overlapRatio;
}

function polylineLengthMeters(polyline) {
  const points = normalizePolyline(polyline);
  if (points.length < 2) return 0;

  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = haversineDistance(points[index - 1], points[index]);
    if (Number.isFinite(distance)) length += distance;
  }
  return length;
}

function getEndpointRouteOverlapRun(path, routeShapePolyline, env = process.env, fromEnd = false) {
  const orderedPath = fromEnd ? [...path].reverse() : path;
  const run = [];
  const proximityMeters = parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_ROUTE_OVERLAP_PROXIMITY_METERS,
    DEFAULT_ROUTE_OVERLAP_PROXIMITY_METERS,
    5,
    200
  );

  for (const point of orderedPath) {
    if (pointToPolylineDistance(point, routeShapePolyline) > proximityMeters) {
      break;
    }
    run.push(point);
  }

  if (run.length < 2) return null;

  const runLengthMeters = polylineLengthMeters(fromEnd ? run.reverse() : run);
  const minRunMeters = parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_ROUTE_OVERLAP_MIN_RUN_METERS,
    DEFAULT_ROUTE_OVERLAP_MIN_RUN_METERS,
    1,
    500
  );
  if (runLengthMeters < minRunMeters) return null;

  return {
    pointCount: run.length,
    runLengthMeters,
  };
}

function dedupeConsecutivePoints(points) {
  if (!Array.isArray(points) || points.length === 0) return [];

  return points.reduce((deduped, point) => {
    const normalized = normalizeCoordinate(point);
    if (!normalized) return deduped;

    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      previous.latitude === normalized.latitude &&
      previous.longitude === normalized.longitude
    ) {
      return deduped;
    }

    deduped.push(normalized);
    return deduped;
  }, []);
}

function buildConnectorPolyline(points) {
  const connector = dedupeConsecutivePoints(points);
  return connector.length >= 2 ? connector : null;
}

function stitchRenderableDetourPolyline(path, entryConnectorPolyline, exitConnectorPolyline) {
  const stitched = dedupeConsecutivePoints([
    ...(Array.isArray(entryConnectorPolyline) ? entryConnectorPolyline : []),
    ...(Array.isArray(path) ? path : []),
    ...(Array.isArray(exitConnectorPolyline) ? exitConnectorPolyline : []),
  ]);
  return stitched.length >= 2 ? stitched : [];
}

function trimNormalRouteEndpointOverlap(path, routeShapePolyline, env = process.env) {
  const points = normalizePolyline(path);
  const route = normalizePolyline(routeShapePolyline);
  if (points.length < 2 || route.length < 2) {
    return {
      path: points,
      prefixTrimmed: false,
      suffixTrimmed: false,
    };
  }

  const prefixRun = getEndpointRouteOverlapRun(points, route, env, false);
  const suffixRun = getEndpointRouteOverlapRun(points, route, env, true);
  let startIndex = prefixRun ? prefixRun.pointCount : 0;
  let endIndex = suffixRun ? points.length - suffixRun.pointCount - 1 : points.length - 1;

  startIndex = Math.max(0, Math.min(startIndex, points.length));
  endIndex = Math.max(-1, Math.min(endIndex, points.length - 1));

  const trimmed = startIndex <= endIndex ? points.slice(startIndex, endIndex + 1) : [];
  const entryConnectorPolyline = prefixRun && trimmed.length >= 1
    ? buildConnectorPolyline([
      ...points.slice(0, startIndex),
      trimmed[0],
    ])
    : null;
  const exitConnectorPolyline = suffixRun && trimmed.length >= 1
    ? buildConnectorPolyline([
      trimmed[trimmed.length - 1],
      ...points.slice(endIndex + 1),
    ])
    : null;
  return {
    path: trimmed.length >= 2 ? trimmed : [],
    prefixTrimmed: Boolean(prefixRun),
    suffixTrimmed: Boolean(suffixRun),
    prefixOverlapMeters: prefixRun?.runLengthMeters || 0,
    suffixOverlapMeters: suffixRun?.runLengthMeters || 0,
    entryConnectorPolyline,
    exitConnectorPolyline,
  };
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

function endpointMismatchMeters(path, referencePath) {
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
  return Math.min(direct, reversed);
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

  const mismatchMeters = endpointMismatchMeters(matchedPolyline, options.candidatePolyline);
  if (
    mismatchMeters != null &&
    mismatchMeters > getEndpointMaxMismatchMeters(options.env)
  ) {
    addRejectionReason(options, 'endpoint-mismatch', { mismatchMeters });
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
    addRejectionReason(options, 'published-blocked-overlap');
    return null;
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
    detourPathLabel: DETOUR_PATH_LABEL,
  };
}

function isRouteFallbackEnabled(env = process.env) {
  return env.DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED == null
    ? true
    : isTruthy(env.DETOUR_ROAD_MATCHING_ROUTE_FALLBACK_ENABLED);
}

async function matchPolylineToRoads(polyline, options = {}) {
  const env = options.env || process.env;
  if (!isRoadMatchingEnabled(env)) return null;

  const baseUrl = getBaseUrl(env);
  if (!baseUrl) return null;

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const maxPoints = parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_MAX_POINTS,
    DEFAULT_MAX_POINTS,
    2,
    100
  );
  const points = samplePolyline(normalizePolyline(polyline), maxPoints);
  if (points.length < 2) return null;

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
  for (const radiusMeters of getAdaptiveMatchRadii(env)) {
    try {
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
      if (matchResult) return matchResult;
      if (matching) {
        recordRejectionReasons(rejectionReasons);
        if (rejectionReasons.some(({ reason }) => reason === 'endpoint-mismatch')) {
          rejectedForTrust = true;
        }
        console.warn('[detourRoadMatcher] OSRM match result rejected or unusable', {
          radiusMeters,
          reason: rejectionReasons[0]?.reason || 'no usable road-matched path after safety checks',
          details: rejectionReasons[0] || undefined,
        });
        break;
      }
      matchError = null;
      break;
    } catch (err) {
      matchError = err;
      if (err?.name === 'AbortError') {
        break;
      }
      console.warn('[detourRoadMatcher] OSRM match attempt failed', {
        radiusMeters,
        reason: err?.message || String(err),
      });
    }
  }

  if (rejectedForTrust) {
    return null;
  }

  if (!isRouteFallbackEnabled(env)) {
    if (matchError) throw matchError;
    return null;
  }

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

async function matchSegment(segment, options) {
  const candidate = getMatchCandidate(segment);
  if (candidate.length < 2) {
    return { ...segment };
  }

  try {
    const rejectionReasons = [];
    const match = await matchPolylineToRoads(candidate, {
      ...options,
      blockedPolyline: segment?.skippedSegmentPolyline,
      routeShapePolyline: getRouteShapePolylineForSegment(segment, options),
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
      ...segment,
      ...match,
    };
  } catch (err) {
    console.warn('[detourRoadMatcher] Falling back to inferred detour path:', err.message);
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
    next.likelyDetourPolyline = primaryMatch.likelyDetourPolyline;
    next.entryConnectorPolyline = primaryMatch.entryConnectorPolyline || null;
    next.exitConnectorPolyline = primaryMatch.exitConnectorPolyline || null;
    next.likelyDetourRoadNames = primaryMatch.likelyDetourRoadNames || [];
    next.roadMatchConfidence = primaryMatch.roadMatchConfidence || null;
    next.roadMatchRawConfidence = primaryMatch.roadMatchRawConfidence ?? null;
    next.roadMatchSource = primaryMatch.roadMatchSource || ROAD_MATCH_SOURCE;
    next.detourPathLabel = DETOUR_PATH_LABEL;
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
  isRoadMatchingEnabled,
  matchDetourGeometry,
  matchPolylineToRoads,
  normalizePolyline,
  removeAvoidableBacktracksFromPolyline,
};
