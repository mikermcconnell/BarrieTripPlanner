const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_POINTS = 100;
const DEFAULT_RADIUS_METERS = 75;
const ROAD_MATCH_SOURCE = 'osrm-match';
const ROAD_ROUTE_SOURCE = 'osrm-route';
const DETOUR_PATH_LABEL = 'Likely detour path';
const EARTH_RADIUS_METERS = 6371000;
const DEFAULT_BLOCKED_PROXIMITY_METERS = 15;
const DEFAULT_BLOCKED_OVERLAP_RATIO = 0.05;
const DEFAULT_BLOCKED_ENDPOINT_RATIO = 0.12;
const DEFAULT_BLOCKED_MIN_POINTS = 3;
const DEFAULT_BACKTRACK_PROXIMITY_METERS = 12;
const DEFAULT_BACKTRACK_MIN_SEGMENT_METERS = 20;
const DEFAULT_BACKTRACK_MIN_TURN_DEGREES = 150;
const DEFAULT_BACKTRACK_MAX_WINDOW_POINTS = 30;

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

function removeAvoidableBacktracksFromPolyline(polyline, env = process.env) {
  let cleaned = normalizePolyline(polyline);
  if (cleaned.length < 3) return cleaned;

  const options = getBacktrackOptions(env);
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
  const startIndex = Math.min(points.length - 1, Math.floor(points.length * endpointRatio));
  const endIndex = Math.max(startIndex + 1, Math.ceil(points.length * (1 - endpointRatio)) - 1);
  const interior = points.slice(startIndex, endIndex + 1);
  if (interior.length === 0) return false;

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

  const nearBlockedCount = interior.filter((point) =>
    pointToPolylineDistance(point, blocked) <= proximityMeters
  ).length;

  return nearBlockedCount >= minPoints && (nearBlockedCount / interior.length) >= overlapRatio;
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

function buildOsrmMatchUrl(baseUrl, points, env = process.env) {
  const coordinateList = points
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');
  const radiusMeters = parsePositiveInt(
    env.DETOUR_ROAD_MATCHING_RADIUS_METERS,
    DEFAULT_RADIUS_METERS,
    5,
    500
  );
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
  const matchedPolyline = removeAvoidableBacktracksFromPolyline(
    parseMatchedPolyline(matchable),
    options.env
  );
  if (matchedPolyline.length < 2) return null;
  if (doesPathUseBlockedSegment(matchedPolyline, options.blockedPolyline, options.env)) {
    return null;
  }

  return {
    likelyDetourPolyline: matchedPolyline,
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
  try {
    const payload = await fetchOsrmJsonWithTimeout(
      buildOsrmMatchUrl(baseUrl, points, env),
      fetchImpl,
      timeoutMs
    );
    const matching = Array.isArray(payload?.matchings) ? payload.matchings[0] : null;
    const matchResult = matching ? buildRoadMatchedResult(matching, ROAD_MATCH_SOURCE, options) : null;
    if (matchResult) return matchResult;
  } catch (err) {
    matchError = err;
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
  return route ? buildRoadMatchedResult(route, ROAD_ROUTE_SOURCE, options) : null;
}

function getMatchCandidate(segment) {
  if (Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2) {
    return segment.inferredDetourPolyline;
  }
  return [];
}

async function matchSegment(segment, options) {
  const candidate = getMatchCandidate(segment);
  if (candidate.length < 2) {
    return { ...segment };
  }

  try {
    const match = await matchPolylineToRoads(candidate, {
      ...options,
      blockedPolyline: segment?.skippedSegmentPolyline,
    });
    if (!match) return { ...segment };
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
  if (primaryMatch?.likelyDetourPolyline?.length >= 2 && originalSegments.length > 1) {
    segments.push(...originalSegments.map((segment) => ({ ...segment })));
  } else {
    for (const segment of originalSegments) {
      // Keep requests sequential. Public OSRM and small hosted matchers often
      // time out when several segment match + route-fallback calls are fired at
      // once for route-family detours.
      // eslint-disable-next-line no-await-in-loop
      segments.push(await matchSegment(segment, options));
    }
  }

  next.segments = segments;

  primaryMatch = primaryMatch?.likelyDetourPolyline?.length >= 2
    ? primaryMatch
    : segments.find((segment) => (
      Array.isArray(segment?.likelyDetourPolyline) &&
      segment.likelyDetourPolyline.length >= 2
    ));

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
    next.likelyDetourRoadNames = primaryMatch.likelyDetourRoadNames || [];
    next.roadMatchConfidence = primaryMatch.roadMatchConfidence || null;
    next.roadMatchRawConfidence = primaryMatch.roadMatchRawConfidence ?? null;
    next.roadMatchSource = primaryMatch.roadMatchSource || ROAD_MATCH_SOURCE;
    next.detourPathLabel = DETOUR_PATH_LABEL;
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
