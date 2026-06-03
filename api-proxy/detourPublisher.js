const { getDb } = require('./firebaseAdmin');
const { DETOUR_PATH_LABEL, matchDetourGeometry } = require('./detourRoadMatcher');
const { shouldAutoClearStaleDetour, evaluateStaleRiderVisibility } = require('./detour/staleClear');
const { normalizeDetourGeometryOrientation } = require('./detour/geometry/pathOrientation');
const { filterNonClosureSelfLoopSegments } = require('./detour/geometry/segmentValidity');
const { pruneDetourPathServedStopsFromGeometry } = require('./detour/stopImpacts');
const { resolveDetourStorageConfig } = require('./detour/storageConfig');
const {
  buildClearedEvent,
  buildDetectedEvent,
  buildUpdatedEvent,
  makeSnapshot,
} = require('./detour/publisher/snapshotEvents');

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const HISTORY_MAX_LIMIT = 200;
const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_RETENTION_DAYS = Number.parseInt(process.env.DETOUR_HISTORY_RETENTION_DAYS || '30', 10);
const HISTORY_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const HISTORY_ENABLED = process.env.DETOUR_HISTORY_ENABLED
  ? process.env.DETOUR_HISTORY_ENABLED === 'true'
  : true;

const configuredGeoThrottleMs = Number.parseFloat(
  process.env.DETOUR_GEOMETRY_WRITE_THROTTLE_MS || '120000'
);
const GEOMETRY_WRITE_THROTTLE_MS =
  Number.isFinite(configuredGeoThrottleMs) && configuredGeoThrottleMs >= 0
    ? configuredGeoThrottleMs
    : 120_000;
// Minimum point count change to trigger a geometry write within throttle window
const GEOMETRY_POINT_CHANGE_THRESHOLD = 5;
const SHARED_EVENT_OVERLAP_THRESHOLD_METERS = 85;
const SHARED_EVENT_CLOSED_MIN_OVERLAP_RATIO = 0.65;
const SHARED_EVENT_PATH_MIN_OVERLAP_RATIO = 0.7;
const SHARED_EVENT_PATH_SECONDARY_OVERLAP_RATIO = 0.5;
const SHARED_EVENT_ENDPOINT_THRESHOLD_METERS = 225;
const SHARED_EVENT_CENTROID_THRESHOLD_METERS = 450;

const lastPublishedIds = new Set();
const lastPublishedState = new Map();
const lastSeenUpdateTime = new Map();
const lastGeometryWriteTime = new Map();
const lastKnownGeometry = new Map(); // Tracks geometry state for throttle decisions
let hydratePromise = null;
let publisherCacheKey = null;
let lastHistoryPruneAt = 0;

function resetPublisherCache() {
  hydratePromise = null;
  lastPublishedIds.clear();
  lastPublishedState.clear();
  lastSeenUpdateTime.clear();
  lastGeometryWriteTime.clear();
  lastKnownGeometry.clear();
}

function resolvePublisherStorageConfig(storageConfig) {
  const resolved = resolveDetourStorageConfig(storageConfig);
  const cacheKey = `${resolved.activeCollection}/${resolved.historyCollection}`;
  if (publisherCacheKey !== cacheKey) {
    resetPublisherCache();
    publisherCacheKey = cacheKey;
  }
  return resolved;
}

function getRouteFamilyId(routeId) {
  const normalized = String(routeId || '').trim().toUpperCase();
  const match = normalized.match(/^(\d+)[A-Z]$/);
  return match ? match[1] : normalized;
}

function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') {
    const dateValue = value.toDate();
    return dateValue instanceof Date ? dateValue.getTime() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value, fallbackMs) {
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();

  const valueMs = toMillis(value);
  if (valueMs != null) return new Date(valueMs);

  if (Number.isFinite(fallbackMs)) return new Date(fallbackMs);
  return new Date();
}

function normalizeVehicleCount(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableHash(value) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getPointKey(point, precision = 3) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${latitude.toFixed(precision)},${longitude.toFixed(precision)}`;
}

function normalizeRouteId(routeId) {
  return String(routeId || '').trim().toUpperCase();
}

function routeSortKey(routeId) {
  const normalized = normalizeRouteId(routeId);
  const match = normalized.match(/^(\d+)([A-Z]?)$/);
  return match ? [Number(match[1]), match[2] || ''] : [Number.MAX_SAFE_INTEGER, normalized];
}

function sortRouteIds(routeIds = []) {
  return [...new Set(routeIds.map(normalizeRouteId).filter(Boolean))]
    .sort((a, b) => {
      const [aNumber, aSuffix] = routeSortKey(a);
      const [bNumber, bSuffix] = routeSortKey(b);
      if (aNumber !== bNumber) return aNumber - bNumber;
      return String(aSuffix).localeCompare(String(bSuffix));
    });
}

function getClosedSegmentSignature(segment) {
  const skipped = Array.isArray(segment?.skippedSegmentPolyline)
    ? segment.skippedSegmentPolyline.filter(Boolean)
    : [];
  const points = skipped.length >= 2
    ? [skipped[0], skipped[skipped.length - 1]]
    : [segment?.entryPoint, segment?.exitPoint];
  const keys = points.map((point) => getPointKey(point)).filter(Boolean).sort();
  return keys.length >= 2 ? `closed:${keys.join('|')}` : '';
}

function getRoadSignature(segment) {
  const names = Array.isArray(segment?.likelyDetourRoadNames)
    ? segment.likelyDetourRoadNames
    : [];
  const normalized = names
    .map((roadName) => String(roadName || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return normalized.length > 0 ? `roads:${[...new Set(normalized)].join('|')}` : '';
}

function buildDetourEventId(routeId, segment = {}) {
  const familyId = getRouteFamilyId(routeId) || 'unknown';
  const signature =
    getClosedSegmentSignature(segment) ||
    getRoadSignature(segment) ||
    `route:${familyId}:unknown`;
  return `detour-event-${stableHash(signature)}`;
}

function buildNormalizedDetourEventId(routeId, segment = {}) {
  if (segment?.debug?.sharedLocationHandoffEnabled && segment?.detourEventId) {
    return segment.detourEventId;
  }
  const physicalSignature = getClosedSegmentSignature(segment) || getRoadSignature(segment);
  if (physicalSignature) return `detour-event-${stableHash(physicalSignature)}`;
  return segment?.detourEventId || buildDetourEventId(routeId, segment);
}

function withDetourEventIds(routeId, geo = {}) {
  const segments = Array.isArray(geo?.segments) ? geo.segments : [];
  const annotatedSegments = segments.map((segment) => ({
    ...segment,
    detourEventId: buildNormalizedDetourEventId(routeId, segment),
  }));
  const primarySegment = annotatedSegments[0] || null;
  return {
    ...geo,
    detourEventId:
      primarySegment?.detourEventId ||
      buildNormalizedDetourEventId(routeId, geo),
    segments: annotatedSegments,
  };
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

function hasGeometryPayload(source) {
  return [
    'shapeId',
    'segments',
    'entryPoint',
    'exitPoint',
    'skippedSegmentPolyline',
    'inferredDetourPolyline',
    'canShowDetourPath',
    'likelyDetourPolyline',
    'likelyDetourRoadNames',
    'roadMatchConfidence',
    'detourPathLabel',
  ].some((key) => hasOwn(source, key));
}

function polylineSignature(polyline) {
  if (!Array.isArray(polyline) || polyline.length === 0) return '';
  const first = polyline[0] || {};
  const last = polyline[polyline.length - 1] || {};
  return [
    polyline.length,
    first.latitude ?? first.lat ?? '',
    first.longitude ?? first.lon ?? '',
    last.latitude ?? last.lat ?? '',
    last.longitude ?? last.lon ?? '',
  ].join(':');
}

function stopListSignature(stops, ids, codes) {
  const values = [
    ...(Array.isArray(ids) ? ids : []),
    ...(Array.isArray(codes) ? codes : []),
    ...(Array.isArray(stops)
      ? stops.map((stop) => stop?.id ?? stop?.code ?? stop?.stopId ?? stop?.stopCode ?? '')
      : []),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort();

  return [...new Set(values)].join(',');
}

function stopImpactSignature(segment) {
  if (!segment || typeof segment !== 'object') return '';
  return [
    stopListSignature(segment.skippedStops, segment.skippedStopIds, segment.skippedStopCodes),
    stopListSignature(
      segment.detourPathServedStops,
      segment.detourPathServedStopIds,
      segment.detourPathServedStopCodes
    ),
    stopListSignature(
      segment.noticeTemporaryStops,
      segment.noticeTemporaryStopIds,
      segment.noticeTemporaryStopCodes
    ),
    stopListSignature(
      segment.noticeActiveStops,
      segment.noticeActiveStopIds,
      segment.noticeActiveStopCodes
    ),
  ].join('/');
}

function hasNoticeStopImpacts(geo) {
  if (!geo || typeof geo !== 'object') return false;
  if (geo.noticeStopImpactSource === 'official-notice') return true;
  return Array.isArray(geo.segments) && geo.segments.some((segment) => (
    segment?.noticeStopImpactSource === 'official-notice'
  ));
}

function getPrimaryStopImpactSegment(source) {
  if (!source || typeof source !== 'object') return null;
  if (Array.isArray(source.segments) && source.segments.length > 0) {
    return source.segments[0] || null;
  }
  return source;
}

function hasNoticeStopImpactWriteDelta(previousSnapshot, geo) {
  if (!hasNoticeStopImpacts(geo)) return false;
  const previousSegment = getPrimaryStopImpactSegment(previousSnapshot);
  const currentSegment = getPrimaryStopImpactSegment(geo);
  if (!currentSegment) return false;
  if (!previousSegment) return true;
  if (stopImpactSignature(previousSegment) !== stopImpactSignature(currentSegment)) return true;
  const previousSource = previousSnapshot?.noticeStopImpactSource ||
    previousSegment?.noticeStopImpactSource ||
    null;
  const currentSource = geo?.noticeStopImpactSource ||
    currentSegment?.noticeStopImpactSource ||
    null;
  return previousSource !== currentSource;
}

function normalizeStopCode(value) {
  return String(value || '').trim();
}

function getRouteFamily(routeId) {
  const normalized = normalizeRouteId(routeId);
  const match = normalized.match(/^(\d+)[A-Z]$/);
  return match ? match[1] : normalized;
}

function noticeAppliesToRoute(routeId, noticeImpact = {}) {
  const route = normalizeRouteId(routeId);
  const family = getRouteFamily(route);
  const affectedRoutes = Array.isArray(noticeImpact.affectedRoutes)
    ? noticeImpact.affectedRoutes.map(normalizeRouteId).filter(Boolean)
    : [];
  return affectedRoutes.some((affectedRoute) => (
    affectedRoute === route ||
    affectedRoute === family ||
    getRouteFamily(affectedRoute) === family
  ));
}

function getRouteStopIds(routeId, routeStopSequencesMapping = {}) {
  const routeSequences = routeStopSequencesMapping?.[routeId] || routeStopSequencesMapping?.[normalizeRouteId(routeId)];
  if (!routeSequences || typeof routeSequences !== 'object') return new Set();
  return new Set(Object.values(routeSequences)
    .flat()
    .map((stopId) => normalizeStopCode(stopId))
    .filter(Boolean));
}

function getStopCodeFromStop(stop) {
  return normalizeStopCode(stop?.code ?? stop?.stopCode ?? stop?.id ?? stop?.stopId);
}

function resolveNoticeStop(stopLike, gtfsData = {}) {
  const code = normalizeStopCode(stopLike?.stopCode ?? stopLike?.code ?? stopLike?.id);
  const resolved = gtfsData.stopsByCode?.get(code) || gtfsData.stopsById?.get(code) || null;
  return {
    id: resolved?.id || stopLike?.stopId || stopLike?.id || null,
    code: resolved?.code || code,
    name: resolved?.name || stopLike?.name || '',
    latitude: Number.isFinite(resolved?.latitude) ? resolved.latitude : stopLike?.latitude ?? null,
    longitude: Number.isFinite(resolved?.longitude) ? resolved.longitude : stopLike?.longitude ?? null,
    source: 'official-notice',
  };
}

function mergeStopsByCode(existingStops = [], addedStops = []) {
  const byCode = new Map();
  for (const stop of [...existingStops, ...addedStops]) {
    const code = getStopCodeFromStop(stop);
    if (!code || byCode.has(code)) continue;
    byCode.set(code, stop);
  }
  return [...byCode.values()];
}

function setStopListFields(target, prefix, stops) {
  const list = Array.isArray(stops) ? stops : [];
  target[`${prefix}Stops`] = list;
  target[`${prefix}StopIds`] = list.map((stop) => stop?.id).filter(Boolean);
  target[`${prefix}StopCodes`] = list.map(getStopCodeFromStop).filter(Boolean);
}

function refreshSkippedStopFields(segment, skippedStops) {
  setStopListFields(segment, 'skipped', skippedStops);
  const firstSkippedStop = skippedStops[0] || null;
  segment.firstSkippedStop = firstSkippedStop;
  segment.firstSkippedStopId = firstSkippedStop?.id || null;
  segment.firstSkippedStopCode = firstSkippedStop ? getStopCodeFromStop(firstSkippedStop) : null;
}

function getSegmentBoundaryStopCodes(segment = {}) {
  return new Set([
    segment.entryStopId,
    segment.entryStopCode,
    segment.exitStopId,
    segment.exitStopCode,
  ].map(normalizeStopCode).filter(Boolean));
}

function mergeNoticeStopImpactsIntoGeometry(routeId, geo, noticeStopImpacts = [], gtfsData = {}) {
  if (!geo || typeof geo !== 'object') return geo;
  const relevantImpacts = (noticeStopImpacts || []).filter((impact) => noticeAppliesToRoute(routeId, impact));
  if (relevantImpacts.length === 0) return geo;

  const routeStopIds = getRouteStopIds(routeId, gtfsData.routeStopSequencesMapping || {});
  const closureCandidates = relevantImpacts
    .flatMap((impact) => Array.isArray(impact.stopClosureCandidates) ? impact.stopClosureCandidates : [])
    .map((stop) => ({ ...stop, stopCode: normalizeStopCode(stop.stopCode ?? stop.code ?? stop.id) }))
    .filter((stop) => stop.stopCode);
  const temporaryStops = relevantImpacts
    .flatMap((impact) => Array.isArray(impact.temporaryStops) ? impact.temporaryStops : [])
    .map((stop) => ({ ...stop, stopCode: normalizeStopCode(stop.stopCode ?? stop.code ?? stop.id) }))
    .filter((stop) => stop.stopCode);
  const temporaryStopCodes = new Set(temporaryStops.map((stop) => stop.stopCode));

  const mergeSegment = (segment = {}) => {
    const currentSkippedStops = Array.isArray(segment.skippedStops) ? segment.skippedStops : [];
    const currentSkippedCodes = new Set([
      ...(Array.isArray(segment.skippedStopCodes) ? segment.skippedStopCodes : []),
      ...(Array.isArray(segment.skippedStopIds) ? segment.skippedStopIds : []),
      ...currentSkippedStops.map(getStopCodeFromStop),
    ].map(normalizeStopCode).filter(Boolean));
    const boundaryStopCodes = getSegmentBoundaryStopCodes(segment);
    const routeCandidates = closureCandidates.filter((stop) => (
      routeStopIds.size === 0 ||
      routeStopIds.has(stop.stopCode) ||
      currentSkippedCodes.has(stop.stopCode) ||
      boundaryStopCodes.has(stop.stopCode)
    ));
    const officialClosureCodes = new Set(currentSkippedCodes);
    const activeStops = [];

    for (const candidate of routeCandidates) {
      const code = candidate.stopCode;
      const hasOwnTempReplacement = temporaryStopCodes.has(`${code}0`);
      const isBoundary = boundaryStopCodes.has(code);
      if (currentSkippedCodes.has(code) || (isBoundary && hasOwnTempReplacement)) {
        officialClosureCodes.add(code);
      } else {
        activeStops.push(resolveNoticeStop(candidate, gtfsData));
      }
    }

    const addedClosureStops = routeCandidates
      .filter((candidate) => officialClosureCodes.has(candidate.stopCode))
      .map((candidate) => resolveNoticeStop(candidate, gtfsData));
    const skippedStops = mergeStopsByCode(currentSkippedStops, addedClosureStops)
      .filter((stop) => officialClosureCodes.has(getStopCodeFromStop(stop)));
    const nextSegment = {
      ...segment,
      noticeStopImpactSource: 'official-notice',
      noticeStopImpactSourceNewsIds: [...new Set(relevantImpacts.map((impact) => String(impact.sourceNewsId || '')).filter(Boolean))],
    };
    refreshSkippedStopFields(nextSegment, skippedStops);
    setStopListFields(nextSegment, 'noticeTemporary', temporaryStops.map((stop) => resolveNoticeStop(stop, gtfsData)));
    setStopListFields(nextSegment, 'noticeActive', activeStops);
    return nextSegment;
  };

  const nextGeo = { ...geo };
  const segments = Array.isArray(geo.segments) && geo.segments.length > 0
    ? geo.segments.map(mergeSegment)
    : [mergeSegment(geo)];
  nextGeo.segments = segments;

  const primary = segments[0] || {};
  [
    'skippedStops',
    'skippedStopIds',
    'skippedStopCodes',
    'firstSkippedStop',
    'firstSkippedStopId',
    'firstSkippedStopCode',
    'noticeTemporaryStops',
    'noticeTemporaryStopIds',
    'noticeTemporaryStopCodes',
    'noticeActiveStops',
    'noticeActiveStopIds',
    'noticeActiveStopCodes',
    'noticeStopImpactSource',
    'noticeStopImpactSourceNewsIds',
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(primary, key)) nextGeo[key] = primary[key];
  });

  return nextGeo;
}

async function loadActiveNoticeStopImpacts(db) {
  try {
    const collection = db.collection('transitNewsImpacts');
    if (!collection || typeof collection.where !== 'function') return [];
    const typeQuery = collection.where('type', '==', 'route_detour_stop_impacts');
    if (!typeQuery || typeof typeQuery.get !== 'function') return [];
    const snapshot = await typeQuery.get();
    const impacts = [];
    snapshot.forEach((doc) => {
      const impact = doc.data();
      if (impact?.source === 'myridebarrie' && impact?.status === 'active' && impact?.archivedAt == null) {
        impacts.push(impact);
      }
    });
    return impacts;
  } catch (error) {
    console.warn('[detourPublisher] Failed to load official notice stop impacts:', error.message);
    return [];
  }
}

function geometrySignatureFromSegments(segments) {
  if (!Array.isArray(segments)) return '';
  return segments
    .map((segment) => {
      const entry = segment?.entryPoint;
      const exit = segment?.exitPoint;
      return [
        segment?.shapeId || '',
        entry?.latitude ?? entry?.lat ?? '',
        entry?.longitude ?? entry?.lon ?? '',
        exit?.latitude ?? exit?.lat ?? '',
        exit?.longitude ?? exit?.lon ?? '',
        segment?.canShowDetourPath === true ? 'show-path' : segment?.canShowDetourPath === false ? 'hide-path' : '',
        segment?.detourEventId || '',
        polylineSignature(segment?.skippedSegmentPolyline),
        polylineSignature(segment?.likelyDetourPolyline),
        polylineSignature(segment?.inferredDetourPolyline),
        (segment?.likelyDetourRoadNames || []).join(','),
        stopImpactSignature(segment),
      ].join(':');
    })
    .join('|');
}

function hasBoundaryDebug(segment) {
  const debug = segment?.debug || {};
  return [
    'entryCandidateCount',
    'exitCandidateCount',
    'hasEntryBoundaryCandidate',
    'hasExitBoundaryCandidate',
    'entryAnchorSource',
    'exitAnchorSource',
  ].some((key) => hasOwn(debug, key));
}

function hasConfirmedBoundaryAnchorPair(segment) {
  if (!segment?.entryPoint || !segment?.exitPoint) return false;
  if (!hasBoundaryDebug(segment)) return true;

  const debug = segment.debug || {};
  if (debug.entryCandidateCount === 0 || debug.hasEntryBoundaryCandidate === false) {
    return false;
  }
  if (debug.entryAnchorSource === 'projected-evidence-fallback') {
    return false;
  }
  if (debug.exitCandidateCount === 0 || debug.hasExitBoundaryCandidate === false) {
    return false;
  }
  if (debug.exitAnchorSource === 'projected-evidence-fallback') {
    return false;
  }

  return true;
}

function clearRoadMatchedPath(target) {
  target.likelyDetourPolyline = null;
  target.likelyDetourRoadNames = [];
  target.roadMatchConfidence = null;
  target.roadMatchRawConfidence = null;
  target.roadMatchSource = null;
}

function getRenderableSegment(segment) {
  if (!segment) return false;
  return (
    Array.isArray(segment.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2
  ) || (
    Array.isArray(segment.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2
  ) || (
    Array.isArray(segment.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 2
  );
}

function hasLikelyDetourPath(source) {
  if (!source || typeof source !== 'object') return false;
  if (hasTrustedLikelyDetourPath(source)) {
    return true;
  }
  return Array.isArray(source.segments) && source.segments.some(hasTrustedLikelyDetourPath);
}

function hasTrustedLikelyDetourPath(source) {
  if (
    !source ||
    typeof source !== 'object' ||
    !Array.isArray(source.likelyDetourPolyline) ||
    source.likelyDetourPolyline.length < 2
  ) {
    return false;
  }

  const rawConfidence = source.roadMatchRawConfidence == null
    ? NaN
    : Number(source.roadMatchRawConfidence);
  const confidenceLabel = String(source.roadMatchConfidence || '').toLowerCase();
  const roadMatchSource = String(source.roadMatchSource || '').toLowerCase();
  const endpointMismatchMeters = Number(source.debug?.untrustedPathEndpointMismatchMeters);
  if (Number.isFinite(endpointMismatchMeters) && endpointMismatchMeters > 45) return false;
  if (confidenceLabel === 'low') return false;
  if (Number.isFinite(rawConfidence) && rawConfidence < 0.45) return false;
  if (
    roadMatchSource === 'osrm-match' &&
    !['medium', 'high'].includes(confidenceLabel)
  ) {
    return false;
  }
  return true;
}

function getTrustedDetourPathSnapshot(source) {
  if (!source || typeof source !== 'object') return null;

  const rawSegments = Array.isArray(source.segments) ? source.segments : null;
  const segments = filterNonClosureSelfLoopSegments(rawSegments || []);
  if (rawSegments && rawSegments.length > 0 && segments.length === 0) return null;

  const trustedLikelySegment = segments.find(hasTrustedLikelyDetourPath);
  const trustedSegment = trustedLikelySegment || segments.find((segment) => (
    segment?.canShowDetourPath === true &&
    Array.isArray(segment?.inferredDetourPolyline) &&
    segment.inferredDetourPolyline.length >= 2
  ));

  const canUseTopLevelLikelyPath =
    hasTrustedLikelyDetourPath(source) &&
    (!rawSegments || rawSegments.length === 0 || Boolean(trustedLikelySegment));
  const likelyDetourPolyline =
    canUseTopLevelLikelyPath
      ? source.likelyDetourPolyline
      : trustedLikelySegment?.likelyDetourPolyline;
  const inferredDetourPolyline =
    Array.isArray(source.inferredDetourPolyline) && source.inferredDetourPolyline.length >= 2
      ? source.inferredDetourPolyline
      : trustedSegment?.inferredDetourPolyline;
  const path = likelyDetourPolyline || inferredDetourPolyline;

  if (!Array.isArray(path) || path.length < 2) return null;

  return {
    likelyDetourPolyline: cloneJson(likelyDetourPolyline || null),
    inferredDetourPolyline: cloneJson(inferredDetourPolyline || path),
    likelyDetourRoadNames: cloneJson(
      likelyDetourPolyline && source.likelyDetourRoadNames?.length
        ? source.likelyDetourRoadNames
        : likelyDetourPolyline
          ? trustedLikelySegment?.likelyDetourRoadNames || []
          : []
    ),
    roadMatchConfidence: likelyDetourPolyline
      ? source.roadMatchConfidence || trustedLikelySegment?.roadMatchConfidence || null
      : null,
    roadMatchRawConfidence: likelyDetourPolyline
      ? source.roadMatchRawConfidence ?? trustedLikelySegment?.roadMatchRawConfidence ?? null
      : null,
    roadMatchSource: likelyDetourPolyline
      ? source.roadMatchSource || trustedLikelySegment?.roadMatchSource || null
      : null,
    detourPathLabel: source.detourPathLabel || trustedSegment?.detourPathLabel || DETOUR_PATH_LABEL,
    segment: trustedSegment ? cloneJson(trustedSegment) : null,
  };
}

function hasTrustedInferredDetourPath(geometry) {
  if (!geometry || typeof geometry !== 'object') return false;
  if (
    geometry.canShowDetourPath === true &&
    Array.isArray(geometry.inferredDetourPolyline) &&
    geometry.inferredDetourPolyline.length >= 2
  ) {
    return true;
  }
  return Array.isArray(geometry.segments) && geometry.segments.some((segment) => (
    segment?.canShowDetourPath === true &&
    Array.isArray(segment.inferredDetourPolyline) &&
    segment.inferredDetourPolyline.length >= 2
  ));
}

function hasNonClosureSelfLoopSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  return filterNonClosureSelfLoopSegments(segments).length !== segments.length;
}

function clearUntrustedLikelyDetourPath(target) {
  if (
    target &&
    typeof target === 'object' &&
    Array.isArray(target.likelyDetourPolyline) &&
    target.likelyDetourPolyline.length >= 2 &&
    !hasTrustedLikelyDetourPath(target)
  ) {
    clearRoadMatchedPath(target);
  }
}

const TRUSTED_PATH_PRESERVE_MAX_ANCHOR_DISTANCE_METERS = 1000;
const TRUSTED_PATH_REPLACE_LENGTH_RATIO = 1.5;
const TRUSTED_PATH_BACKTRACK_METERS = 75;
const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function distanceMeters(a, b) {
  if (
    !Number.isFinite(a?.latitude) ||
    !Number.isFinite(a?.longitude) ||
    !Number.isFinite(b?.latitude) ||
    !Number.isFinite(b?.longitude)
  ) {
    return Infinity;
  }
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function normalizeCoordinate(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function addPolylineEndpoints(points, polyline) {
  if (!Array.isArray(polyline) || polyline.length === 0) return;
  const first = normalizeCoordinate(polyline[0]);
  const last = normalizeCoordinate(polyline[polyline.length - 1]);
  if (first) points.push(first);
  if (last) points.push(last);
}

function collectGeometryAnchorPoints(source) {
  const points = [];
  if (!source || typeof source !== 'object') return points;

  for (const key of ['entryPoint', 'exitPoint']) {
    const point = normalizeCoordinate(source[key]);
    if (point) points.push(point);
  }
  for (const key of ['skippedSegmentPolyline', 'inferredDetourPolyline', 'likelyDetourPolyline']) {
    addPolylineEndpoints(points, source[key]);
  }
  for (const segment of Array.isArray(source.segments) ? source.segments : []) {
    points.push(...collectGeometryAnchorPoints(segment));
  }

  return points;
}

function geometryMatchesTrustedPathLocation(geometry, previousSnapshot, trusted) {
  const currentPoints = collectGeometryAnchorPoints(geometry);
  const previousPoints = collectGeometryAnchorPoints(previousSnapshot);
  addPolylineEndpoints(previousPoints, trusted?.likelyDetourPolyline);
  addPolylineEndpoints(previousPoints, trusted?.inferredDetourPolyline);

  if (currentPoints.length === 0 || previousPoints.length === 0) return true;

  const currentStart = currentPoints[0];
  const currentEnd = currentPoints[currentPoints.length - 1];
  const previousStart = previousPoints[0];
  const previousEnd = previousPoints[previousPoints.length - 1];
  const directMax = Math.max(
    distanceMeters(currentStart, previousStart),
    distanceMeters(currentEnd, previousEnd)
  );
  const reverseMax = Math.max(
    distanceMeters(currentStart, previousEnd),
    distanceMeters(currentEnd, previousStart)
  );

  return Math.min(directMax, reverseMax) <= TRUSTED_PATH_PRESERVE_MAX_ANCHOR_DISTANCE_METERS;
}

function pathProgressAlongChordMeters(point, start, end) {
  const normalizedPoint = normalizeCoordinate(point);
  const normalizedStart = normalizeCoordinate(start);
  const normalizedEnd = normalizeCoordinate(end);
  if (!normalizedPoint || !normalizedStart || !normalizedEnd) return null;

  const referenceLatitude = (
    normalizedPoint.latitude +
    normalizedStart.latitude +
    normalizedEnd.latitude
  ) / 3;
  const p = toLocalMeters(normalizedPoint, referenceLatitude);
  const a = toLocalMeters(normalizedStart, referenceLatitude);
  const b = toLocalMeters(normalizedEnd, referenceLatitude);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chordMeters = Math.sqrt(dx * dx + dy * dy);
  if (chordMeters <= 0) return null;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / chordMeters;
}

function hasMaterialBacktracking(polyline) {
  const points = normalizePolyline(polyline);
  if (points.length < 4) return false;

  const start = points[0];
  const end = points[points.length - 1];
  let previousProgress = pathProgressAlongChordMeters(start, start, end);
  if (!Number.isFinite(previousProgress)) return false;

  let backtrackMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    const progress = pathProgressAlongChordMeters(points[index], start, end);
    if (!Number.isFinite(progress)) continue;
    if (progress < previousProgress) {
      backtrackMeters += previousProgress - progress;
    }
    previousProgress = Math.max(previousProgress, progress);
  }

  return backtrackMeters >= TRUSTED_PATH_BACKTRACK_METERS;
}

function shouldReplacePreservedTrustedPath(geometry, trusted) {
  const currentTrusted = getTrustedDetourPathSnapshot(geometry);
  const currentPath = currentTrusted?.inferredDetourPolyline;
  const previousPath = trusted?.likelyDetourPolyline || trusted?.inferredDetourPolyline;
  if (!Array.isArray(currentPath) || currentPath.length < 2) return false;
  if (!Array.isArray(previousPath) || previousPath.length < 2) return false;

  const currentLength = polylineLengthMeters(currentPath);
  const previousLength = polylineLengthMeters(previousPath);
  if (!Number.isFinite(currentLength) || currentLength <= 0 || !Number.isFinite(previousLength)) {
    return false;
  }

  return (
    previousLength >= currentLength * TRUSTED_PATH_REPLACE_LENGTH_RATIO &&
    hasMaterialBacktracking(previousPath)
  );
}

function gpsSupersedesPreviousPath(geometry) {
  return geometry?.gpsSupersedesPreviousPath === true ||
    (Array.isArray(geometry?.segments) &&
      geometry.segments.some((segment) => segment?.gpsSupersedesPreviousPath === true));
}

function preserveTrustedDetourPath(geometry, previousSnapshot, detour = {}) {
  if (!geometry || typeof geometry !== 'object') return geometry;
  if (detour?.state === 'clear-pending' || geometry?.state === 'clear-pending') return geometry;
  if (geometry.geometryTrustBlockedReason === 'jumpy-inferred-path') return geometry;
  if (gpsSupersedesPreviousPath(geometry)) return geometry;
  if (hasLikelyDetourPath(geometry)) return geometry;

  const trusted = getTrustedDetourPathSnapshot(previousSnapshot);
  if (!trusted) return geometry;
  if (!trusted.likelyDetourPolyline && hasTrustedInferredDetourPath(geometry)) return geometry;
  if (shouldReplacePreservedTrustedPath(geometry, trusted)) return geometry;
  if (!geometryMatchesTrustedPathLocation(geometry, previousSnapshot, trusted)) return geometry;

  const previousSegments = filterNonClosureSelfLoopSegments(
    Array.isArray(previousSnapshot?.segments)
      ? cloneJson(previousSnapshot.segments)
      : []
  );
  const next = {
    ...cloneJson(geometry),
    shapeId: previousSnapshot?.shapeId || geometry.shapeId || null,
    skippedSegmentPolyline: cloneJson(previousSnapshot?.skippedSegmentPolyline) || geometry.skippedSegmentPolyline || null,
    entryPoint: cloneJson(previousSnapshot?.entryPoint) || geometry.entryPoint || null,
    exitPoint: cloneJson(previousSnapshot?.exitPoint) || geometry.exitPoint || null,
    confidence: previousSnapshot?.confidence || geometry.confidence || null,
    evidencePointCount: previousSnapshot?.evidencePointCount ?? geometry.evidencePointCount ?? null,
    lastEvidenceAt: previousSnapshot?.lastEvidenceAt ?? geometry.lastEvidenceAt ?? null,
    segments: previousSegments,
  };
  next.preservedTrustedDetourPath = true;
  next.canShowDetourPath = true;
  next.likelyDetourPolyline = trusted.likelyDetourPolyline;
  next.inferredDetourPolyline =
    Array.isArray(previousSnapshot?.inferredDetourPolyline) && previousSnapshot.inferredDetourPolyline.length >= 2
      ? cloneJson(previousSnapshot.inferredDetourPolyline)
      : trusted.inferredDetourPolyline;
  next.likelyDetourRoadNames = trusted.likelyDetourRoadNames;
  next.roadMatchConfidence = trusted.roadMatchConfidence;
  next.roadMatchRawConfidence = trusted.roadMatchRawConfidence;
  next.roadMatchSource = trusted.roadMatchSource;
  next.detourPathLabel = trusted.detourPathLabel;

  const preservedSegment = {
    ...(trusted.segment || {}),
    canShowDetourPath: true,
    likelyDetourPolyline: trusted.likelyDetourPolyline,
    inferredDetourPolyline: trusted.inferredDetourPolyline,
    likelyDetourRoadNames: trusted.likelyDetourRoadNames,
    roadMatchConfidence: trusted.roadMatchConfidence,
    roadMatchRawConfidence: trusted.roadMatchRawConfidence,
    roadMatchSource: trusted.roadMatchSource,
    detourPathLabel: trusted.detourPathLabel,
  };

  if (Array.isArray(next.segments) && next.segments.length > 0) {
    const targetIndex = next.segments.findIndex((segment) => (
      !hasLikelyDetourPath(segment) && !hasTrustedInferredDetourPath(segment)
    ));
    const index = targetIndex >= 0 ? targetIndex : 0;
    next.segments[index] = {
      ...next.segments[index],
      ...preservedSegment,
      skippedSegmentPolyline: preservedSegment.skippedSegmentPolyline || next.segments[index]?.skippedSegmentPolyline || null,
      entryPoint: preservedSegment.entryPoint || next.segments[index]?.entryPoint || null,
      exitPoint: preservedSegment.exitPoint || next.segments[index]?.exitPoint || null,
      shapeId: preservedSegment.shapeId || next.segments[index]?.shapeId || next.shapeId || null,
    };
  } else if (trusted.segment) {
    next.segments = [{
      ...preservedSegment,
      shapeId: preservedSegment.shapeId || next.shapeId || null,
      skippedSegmentPolyline: next.skippedSegmentPolyline || preservedSegment.skippedSegmentPolyline || null,
      entryPoint: next.entryPoint || preservedSegment.entryPoint || null,
      exitPoint: next.exitPoint || preservedSegment.exitPoint || null,
    }];
  }

  return normalizeDetourGeometryOrientation(next);
}

function geometryBackfillSignature(geometry) {
  const segmentSignature = geometrySignatureFromSegments(geometry?.segments);
  if (segmentSignature) return segmentSignature;
  return polylineSignature(geometry?.inferredDetourPolyline);
}

function getRoadMatchBackfillSignatures(geometry) {
  if (!geometry || typeof geometry !== 'object') return [];

  const segments = filterNonClosureSelfLoopSegments(
    Array.isArray(geometry.segments) ? geometry.segments : []
  );
  const signatures = [];

  if (segments.length > 0) {
    for (const segment of segments) {
      if (
        segment?.canShowDetourPath === true &&
        Array.isArray(segment.inferredDetourPolyline) &&
        segment.inferredDetourPolyline.length >= 2 &&
        !hasTrustedLikelyDetourPath(segment)
      ) {
        const signature = polylineSignature(segment.inferredDetourPolyline);
        if (signature) signatures.push(signature);
      }
    }
  } else if (
    hasTrustedInferredDetourPath(geometry) &&
    !hasTrustedLikelyDetourPath(geometry)
  ) {
    const signature = geometryBackfillSignature(geometry);
    if (signature) signatures.push(signature);
  }

  return [...new Set(signatures)];
}

function shouldAttemptRoadMatchBackfill(geometry, previousSnapshot, knownGeometry) {
  const signatures = getRoadMatchBackfillSignatures(geometry);
  if (signatures.length === 0) return false;

  const segmentCount = Array.isArray(geometry?.segments)
    ? filterNonClosureSelfLoopSegments(geometry.segments).length
    : 0;
  if (segmentCount <= 1 && hasLikelyDetourPath(previousSnapshot)) {
    const trustedPreviousPath = getTrustedDetourPathSnapshot(previousSnapshot);
    if (
      trustedPreviousPath &&
      geometryMatchesTrustedPathLocation(geometry, previousSnapshot, trustedPreviousPath)
    ) {
      return false;
    }
  }

  const attempted = new Set(
    Array.isArray(knownGeometry?.roadMatchBackfillAttemptedSignatures)
      ? knownGeometry.roadMatchBackfillAttemptedSignatures
      : []
  );
  if (knownGeometry?.roadMatchBackfillAttemptedSignature) {
    attempted.add(knownGeometry.roadMatchBackfillAttemptedSignature);
  }

  return signatures.some(signature => !attempted.has(signature));
}

function enforceGeometryTrustGate(geometry) {
  if (!geometry || typeof geometry !== 'object') return geometry;

  const next = cloneJson(geometry);
  const originalSegmentCount = Array.isArray(next.segments) ? next.segments.length : 0;
  const segments = filterNonClosureSelfLoopSegments(Array.isArray(next.segments)
    ? next.segments.map((segment) => {
      const normalized = { ...segment };
      const hasConfirmedBoundaries = hasConfirmedBoundaryAnchorPair(normalized);

      if (!hasConfirmedBoundaries && hasBoundaryDebug(normalized)) {
        normalized.skippedSegmentPolyline = null;
      }

      if (normalized.canShowDetourPath !== true) {
        normalized.canShowDetourPath =
          normalized.canShowDetourPath === false || !hasConfirmedBoundaries
            ? false
            : normalized.canShowDetourPath;
      }

      if (normalized.canShowDetourPath === false) {
        clearRoadMatchedPath(normalized);
      } else {
        clearUntrustedLikelyDetourPath(normalized);
      }

      return normalized;
    })
    : []);

  if (Array.isArray(next.segments)) {
    next.segments = segments;
  }

  const primarySegment = segments.find(getRenderableSegment) || segments[0] || null;
  if (primarySegment) {
    next.skippedSegmentPolyline = primarySegment.skippedSegmentPolyline || null;
    next.inferredDetourPolyline = primarySegment.inferredDetourPolyline || null;
    next.entryPoint = primarySegment.entryPoint || null;
    next.exitPoint = primarySegment.exitPoint || null;

    if (Array.isArray(primarySegment.likelyDetourPolyline) && primarySegment.likelyDetourPolyline.length >= 2) {
      next.likelyDetourPolyline = primarySegment.likelyDetourPolyline;
      next.likelyDetourRoadNames = Array.isArray(primarySegment.likelyDetourRoadNames)
        ? primarySegment.likelyDetourRoadNames
        : [];
      next.roadMatchConfidence = primarySegment.roadMatchConfidence;
      next.roadMatchRawConfidence = primarySegment.roadMatchRawConfidence;
      next.roadMatchSource = primarySegment.roadMatchSource;
    } else {
      clearRoadMatchedPath(next);
    }

    if (primarySegment.canShowDetourPath != null) {
      next.canShowDetourPath = primarySegment.canShowDetourPath === true;
    }

    if (primarySegment.canShowDetourPath === false) {
      clearRoadMatchedPath(next);
    } else {
      clearUntrustedLikelyDetourPath(next);
    }
  } else if (originalSegmentCount > 0 && segments.length === 0) {
    next.invalidGeometrySuppressed = true;
    next.canShowDetourPath = false;
    next.skippedSegmentPolyline = null;
    next.inferredDetourPolyline = null;
    next.entryPoint = null;
    next.exitPoint = null;
    clearRoadMatchedPath(next);
  } else if (next.canShowDetourPath === false) {
    clearRoadMatchedPath(next);
  } else {
    clearUntrustedLikelyDetourPath(next);
  }

  if (
    Array.isArray(next.segments) &&
    next.segments.length > 0 &&
    Array.isArray(next.likelyDetourPolyline) &&
    next.likelyDetourPolyline.length >= 2 &&
    !next.segments.some(hasTrustedLikelyDetourPath)
  ) {
    clearRoadMatchedPath(next);
  }

  return normalizeDetourGeometryOrientation(next);
}

function hasRenderableGeometry(geo) {
  if (!geo) return false;

  const segments = Array.isArray(geo.segments) ? geo.segments : [];
  if (segments.some((segment) =>
    (segment?.skippedSegmentPolyline?.length >= 2) ||
    (segment?.inferredDetourPolyline?.length >= 2) ||
    (segment?.likelyDetourPolyline?.length >= 2)
  )) {
    return true;
  }

  return (
    Array.isArray(geo.skippedSegmentPolyline) && geo.skippedSegmentPolyline.length >= 2
  ) || (
    Array.isArray(geo.inferredDetourPolyline) && geo.inferredDetourPolyline.length >= 2
  ) || (
    Array.isArray(geo.likelyDetourPolyline) && geo.likelyDetourPolyline.length >= 2
  );
}

function hasTrustedSkippedSegment(geo) {
  if (!geo || typeof geo !== 'object') return false;
  if (Array.isArray(geo.skippedSegmentPolyline) && geo.skippedSegmentPolyline.length >= 2) {
    return true;
  }
  return Array.isArray(geo.segments) && geo.segments.some((segment) => (
    Array.isArray(segment?.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2
  ));
}

function hasTrustworthyRiderGeometry(geo) {
  return hasTrustedSkippedSegment(geo) || hasLikelyDetourPath(geo) || hasTrustedInferredDetourPath(geo);
}

function normalizePoint(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizePolyline(polyline) {
  return (Array.isArray(polyline) ? polyline : [])
    .map(normalizePoint)
    .filter(Boolean);
}

function toLocalMeters(point, referenceLatitude) {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  const latitudeMeters = latitude * 111_320;
  const longitudeMeters = longitude * 111_320 * Math.cos(referenceLatitude * Math.PI / 180);
  return { x: longitudeMeters, y: latitudeMeters };
}

function distancePointToSegmentMeters(point, start, end) {
  const normalizedPoint = normalizePoint(point);
  const normalizedStart = normalizePoint(start);
  const normalizedEnd = normalizePoint(end);
  if (!normalizedPoint || !normalizedStart || !normalizedEnd) return Number.POSITIVE_INFINITY;

  const referenceLatitude = (
    normalizedPoint.latitude + normalizedStart.latitude + normalizedEnd.latitude
  ) / 3;
  const p = toLocalMeters(normalizedPoint, referenceLatitude);
  const a = toLocalMeters(normalizedStart, referenceLatitude);
  const b = toLocalMeters(normalizedEnd, referenceLatitude);
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) return distanceMeters(normalizedPoint, normalizedStart);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projection = { x: a.x + t * dx, y: a.y + t * dy };
  const deltaX = p.x - projection.x;
  const deltaY = p.y - projection.y;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function distancePointToPolylineMeters(point, polyline) {
  const points = normalizePolyline(polyline);
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return distanceMeters(point, points[0]);

  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, distancePointToSegmentMeters(point, points[index - 1], points[index]));
  }
  return best;
}

function polylineLengthMeters(polyline) {
  const points = normalizePolyline(polyline);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMeters(points[index - 1], points[index]);
  }
  return total;
}

function polylineOverlapRatio(source, target, thresholdMeters = SHARED_EVENT_OVERLAP_THRESHOLD_METERS) {
  const sourcePoints = normalizePolyline(source);
  const targetPoints = normalizePolyline(target);
  if (sourcePoints.length === 0 || targetPoints.length < 2) return 0;
  const matched = sourcePoints.filter((point) =>
    distancePointToPolylineMeters(point, targetPoints) <= thresholdMeters
  ).length;
  return matched / sourcePoints.length;
}

function bidirectionalPolylineOverlap(a, b, thresholdMeters = SHARED_EVENT_OVERLAP_THRESHOLD_METERS) {
  return {
    aToB: polylineOverlapRatio(a, b, thresholdMeters),
    bToA: polylineOverlapRatio(b, a, thresholdMeters),
  };
}

function centroidOfPolyline(polyline) {
  const points = normalizePolyline(polyline);
  if (points.length === 0) return null;
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
}

function endpointsNear(a, b) {
  const pointsA = normalizePolyline(a);
  const pointsB = normalizePolyline(b);
  if (pointsA.length < 2 || pointsB.length < 2) return false;

  const sameDirectionMax = Math.max(
    distanceMeters(pointsA[0], pointsB[0]),
    distanceMeters(pointsA[pointsA.length - 1], pointsB[pointsB.length - 1])
  );
  const oppositeDirectionMax = Math.max(
    distanceMeters(pointsA[0], pointsB[pointsB.length - 1]),
    distanceMeters(pointsA[pointsA.length - 1], pointsB[0])
  );
  if (Math.min(sameDirectionMax, oppositeDirectionMax) <= SHARED_EVENT_ENDPOINT_THRESHOLD_METERS) {
    return true;
  }

  return distanceMeters(centroidOfPolyline(pointsA), centroidOfPolyline(pointsB)) <=
    SHARED_EVENT_CENTROID_THRESHOLD_METERS;
}

function normalizeRoadName(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueRoadNames(names = []) {
  const seen = new Set();
  const unique = [];
  (Array.isArray(names) ? names : []).forEach((roadName) => {
    const text = String(roadName || '').trim();
    const key = normalizeRoadName(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(text);
  });
  return unique;
}

function roadOverlapCount(a = [], b = []) {
  const roadsA = new Set(uniqueRoadNames(a).map(normalizeRoadName));
  const roadsB = new Set(uniqueRoadNames(b).map(normalizeRoadName));
  if (roadsA.size === 0 || roadsB.size === 0) return 0;
  return [...roadsA].filter((roadName) => roadsB.has(roadName)).length;
}

function getCandidateRoadNames(candidate) {
  return uniqueRoadNames(candidate?.likelyDetourRoadNames || []);
}

function formatSharedEventLocationLabel(candidates, primaryCandidate) {
  const bestRoadCandidate = [...candidates]
    .sort((a, b) => getCandidateRoadNames(b).length - getCandidateRoadNames(a).length)[0] ||
    primaryCandidate;
  const roadNames = getCandidateRoadNames(bestRoadCandidate);
  if (roadNames.length === 0) return null;
  if (roadNames.length === 1) return roadNames[0];
  if (roadNames.length === 2) return `${roadNames[0]} & ${roadNames[1]}`;
  return `${roadNames[0]} & ${roadNames[1]} +${roadNames.length - 2}`;
}

function confidenceRank(value) {
  const confidence = String(value || '').trim().toLowerCase();
  if (confidence === 'high') return 2;
  if (confidence === 'medium') return 1;
  if (confidence === 'low') return 0;
  return -1;
}

function getBestConfidence(candidates) {
  return candidates.reduce((best, candidate) => (
    confidenceRank(candidate.confidence) > confidenceRank(best) ? candidate.confidence : best
  ), null);
}

function getSharedEventPhysicalSignature(candidate) {
  const path =
    normalizePolyline(candidate?.skippedSegmentPolyline).length >= 2
      ? candidate.skippedSegmentPolyline
      : (
        normalizePolyline(candidate?.likelyDetourPolyline).length >= 2
          ? candidate.likelyDetourPolyline
          : candidate?.inferredDetourPolyline
      );
  const points = normalizePolyline(path);
  if (points.length >= 2) {
    const middle = points[Math.floor(points.length / 2)];
    return [
      'path',
      getPointKey(points[0]),
      getPointKey(middle),
      getPointKey(points[points.length - 1]),
    ].join(':');
  }
  const roads = uniqueRoadNames(candidate?.likelyDetourRoadNames);
  if (roads.length > 0) return `roads:${roads.map(normalizeRoadName).sort().join('|')}`;
  return candidate?.detourEventId || `route:${normalizeRouteId(candidate?.routeId)}`;
}

function buildSharedDetourEventId(candidates, primaryCandidate) {
  const eventIds = [...new Set(candidates.map((candidate) => candidate.detourEventId).filter(Boolean))];
  if (eventIds.length === 1) return eventIds[0];
  return `shared-detour-event-${stableHash(getSharedEventPhysicalSignature(primaryCandidate))}`;
}

function scorePrimarySharedEventCandidate(candidate) {
  return (
    getCandidateRoadNames(candidate).length * 1000 +
    normalizePolyline(candidate.likelyDetourPolyline).length * 20 +
    normalizePolyline(candidate.inferredDetourPolyline).length * 10 +
    normalizePolyline(candidate.skippedSegmentPolyline).length * 10 +
    Math.round(polylineLengthMeters(candidate.skippedSegmentPolyline) / 10) +
    Math.round(polylineLengthMeters(candidate.likelyDetourPolyline) / 20) +
    (Number(candidate.evidencePointCount) || 0) +
    confidenceRank(candidate.confidence) * 25
  );
}

function pickPrimarySharedEventCandidate(candidates) {
  return [...candidates].sort((a, b) => {
    const scoreDiff = scorePrimarySharedEventCandidate(b) - scorePrimarySharedEventCandidate(a);
    if (scoreDiff !== 0) return scoreDiff;
    return sortRouteIds([a.routeId, b.routeId])[0] === a.routeId ? -1 : 1;
  })[0];
}

function getComparablePath(candidate, key) {
  const path = candidate?.[key];
  return normalizePolyline(path).length >= 2 ? path : null;
}

function hasClosedSegmentRelationship(a, b) {
  const closedA = getComparablePath(a, 'skippedSegmentPolyline');
  const closedB = getComparablePath(b, 'skippedSegmentPolyline');
  if (!closedA || !closedB) return false;
  const overlap = bidirectionalPolylineOverlap(closedA, closedB);
  return (
    Math.min(overlap.aToB, overlap.bToA) >= SHARED_EVENT_CLOSED_MIN_OVERLAP_RATIO &&
    Math.max(overlap.aToB, overlap.bToA) >= 0.8
  );
}

function hasLikelyPathRelationship(a, b) {
  const likelyA = getComparablePath(a, 'likelyDetourPolyline') || getComparablePath(a, 'inferredDetourPolyline');
  const likelyB = getComparablePath(b, 'likelyDetourPolyline') || getComparablePath(b, 'inferredDetourPolyline');
  if (!likelyA || !likelyB) return false;

  const overlap = bidirectionalPolylineOverlap(likelyA, likelyB);
  const strongPathOverlap =
    Math.max(overlap.aToB, overlap.bToA) >= SHARED_EVENT_PATH_MIN_OVERLAP_RATIO &&
    Math.min(overlap.aToB, overlap.bToA) >= SHARED_EVENT_PATH_SECONDARY_OVERLAP_RATIO;
  if (!strongPathOverlap) return false;

  const closedA = getComparablePath(a, 'skippedSegmentPolyline');
  const closedB = getComparablePath(b, 'skippedSegmentPolyline');
  const hasSupportingGeometry =
    (closedA && closedB && endpointsNear(closedA, closedB)) ||
    endpointsNear(likelyA, likelyB) ||
    roadOverlapCount(getCandidateRoadNames(a), getCandidateRoadNames(b)) > 0;

  return hasSupportingGeometry;
}

function shouldShareDetourEvent(a, b) {
  if (!a || !b) return false;
  if (a.detourEventId && b.detourEventId && a.detourEventId === b.detourEventId) return true;
  if (hasClosedSegmentRelationship(a, b)) return true;
  return hasLikelyPathRelationship(a, b);
}

function findUnion(parent, index) {
  if (parent[index] !== index) {
    parent[index] = findUnion(parent, parent[index]);
  }
  return parent[index];
}

function union(parent, a, b) {
  const rootA = findUnion(parent, a);
  const rootB = findUnion(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}

function makeSharedAssignment(candidates) {
  const routeIds = sortRouteIds(candidates.map((candidate) => candidate.routeId));
  const primaryCandidate = pickPrimarySharedEventCandidate(candidates);
  return {
    sharedDetourEventId: buildSharedDetourEventId(candidates, primaryCandidate),
    sharedRouteIds: routeIds,
    eventPrimaryRouteId: primaryCandidate.routeId,
    eventRouteCount: routeIds.length,
    eventLocationLabel: formatSharedEventLocationLabel(candidates, primaryCandidate),
    eventConfidence: getBestConfidence(candidates),
  };
}

function deriveSharedDetourEventAssignments(candidates = []) {
  const validCandidates = candidates.filter((candidate) => candidate?.routeId);
  const parent = validCandidates.map((_, index) => index);

  for (let outer = 0; outer < validCandidates.length; outer += 1) {
    for (let inner = outer + 1; inner < validCandidates.length; inner += 1) {
      if (shouldShareDetourEvent(validCandidates[outer], validCandidates[inner])) {
        union(parent, outer, inner);
      }
    }
  }

  const grouped = new Map();
  validCandidates.forEach((candidate, index) => {
    const root = findUnion(parent, index);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(candidate);
  });

  const byRoute = new Map();
  const bySegment = new Map();
  for (const groupCandidates of grouped.values()) {
    const assignment = makeSharedAssignment(groupCandidates);
    groupCandidates.forEach((candidate) => {
      const routeId = normalizeRouteId(candidate.routeId);
      const routeAssignment = byRoute.get(routeId);
      if (
        !routeAssignment ||
        assignment.sharedRouteIds.length > routeAssignment.sharedRouteIds.length
      ) {
        byRoute.set(routeId, assignment);
      }
      bySegment.set(`${routeId}:${candidate.segmentIndex ?? 'top'}`, assignment);
    });
  }

  return { byRoute, bySegment };
}

function getSharedDetourCandidates(routeId, source = {}) {
  const normalizedRouteId = normalizeRouteId(routeId || source.routeId);
  const hasSegments = Array.isArray(source?.segments) && source.segments.length > 0;
  const segments = hasSegments ? source.segments : [source];

  return segments.map((segment, index) => {
    const useTopLevel = !hasSegments;
    const explicitEventId =
      segment?.detourEventId ||
      (useTopLevel ? source?.detourEventId : null) ||
      null;
    const candidate = {
      routeId: normalizedRouteId,
      segmentIndex: hasSegments ? index : 'top',
      detourEventId: explicitEventId,
      skippedSegmentPolyline: segment?.skippedSegmentPolyline || (useTopLevel ? source?.skippedSegmentPolyline : null),
      inferredDetourPolyline: segment?.inferredDetourPolyline || (useTopLevel ? source?.inferredDetourPolyline : null),
      likelyDetourPolyline: segment?.likelyDetourPolyline || (useTopLevel ? source?.likelyDetourPolyline : null),
      likelyDetourRoadNames: Array.isArray(segment?.likelyDetourRoadNames)
        ? segment.likelyDetourRoadNames
        : (useTopLevel && Array.isArray(source?.likelyDetourRoadNames) ? source.likelyDetourRoadNames : []),
      entryPoint: segment?.entryPoint || (useTopLevel ? source?.entryPoint : null),
      exitPoint: segment?.exitPoint || (useTopLevel ? source?.exitPoint : null),
      confidence: segment?.confidence || source?.confidence || null,
      evidencePointCount: segment?.evidencePointCount ?? source?.evidencePointCount ?? null,
    };

    if (!candidate.detourEventId) {
      candidate.detourEventId = getRenderableSegment(candidate)
        ? buildDetourEventId(normalizedRouteId, candidate)
        : `route-detour-${stableHash(`route:${normalizedRouteId}:no-geometry`)}`;
    }
    return candidate;
  });
}

function buildSharedDetourEventAssignmentsForPublish(publishableDetours = {}) {
  const candidates = [];

  Object.entries(publishableDetours).forEach(([routeId, detour]) => {
    const previousSnapshot = lastPublishedState.get(routeId);
    let geo = preserveTrustedDetourPath(
      enforceGeometryTrustGate(detour?.geometry),
      previousSnapshot,
      detour
    );
    if (hasRenderableGeometry(geo)) {
      geo = withDetourEventIds(routeId, geo);
    }

    const source = hasRenderableGeometry(geo)
      ? { ...(previousSnapshot || {}), ...geo, routeId }
      : { ...(previousSnapshot || {}), routeId };
    candidates.push(...getSharedDetourCandidates(routeId, source));
  });

  return deriveSharedDetourEventAssignments(candidates);
}

function applySharedDetourEventMetadata(target, assignment) {
  if (!target || !assignment) return target;
  target.sharedDetourEventId = assignment.sharedDetourEventId || null;
  target.sharedRouteIds = Array.isArray(assignment.sharedRouteIds)
    ? assignment.sharedRouteIds
    : [];
  target.eventPrimaryRouteId = assignment.eventPrimaryRouteId || null;
  target.eventRouteCount = assignment.eventRouteCount ?? target.sharedRouteIds.length;
  target.eventLocationLabel = assignment.eventLocationLabel || null;
  target.eventConfidence = assignment.eventConfidence || null;
  return target;
}

function getPrimarySharedAssignment(routeId, geo, assignments) {
  const normalizedRouteId = normalizeRouteId(routeId);
  const segments = Array.isArray(geo?.segments) ? geo.segments : [];
  const primaryIndex = segments.findIndex(getRenderableSegment);
  const selectedIndex = primaryIndex >= 0 ? primaryIndex : 0;
  return assignments.bySegment.get(`${normalizedRouteId}:${selectedIndex}`) ||
    assignments.bySegment.get(`${normalizedRouteId}:top`) ||
    assignments.byRoute.get(normalizedRouteId) ||
    null;
}

function applySharedDetourEventAssignmentsToGeometry(routeId, geo, assignments) {
  if (!geo || typeof geo !== 'object') return geo;
  const normalizedRouteId = normalizeRouteId(routeId);
  const next = cloneJson(geo);

  if (Array.isArray(next.segments)) {
    next.segments = next.segments.map((segment, index) => {
      const assignment = assignments.bySegment.get(`${normalizedRouteId}:${index}`) ||
        assignments.byRoute.get(normalizedRouteId);
      return assignment ? applySharedDetourEventMetadata({ ...segment }, assignment) : segment;
    });
  }

  const primaryAssignment = getPrimarySharedAssignment(normalizedRouteId, next, assignments);
  if (primaryAssignment) {
    applySharedDetourEventMetadata(next, primaryAssignment);
  }
  return next;
}

function hasSharedDetourMetadataChanged(previousSnapshot, assignment) {
  if (!assignment) return false;
  const previousRoutes = Array.isArray(previousSnapshot?.sharedRouteIds)
    ? previousSnapshot.sharedRouteIds
    : [];
  return (
    (previousSnapshot?.sharedDetourEventId || null) !== (assignment.sharedDetourEventId || null) ||
    previousRoutes.join('|') !== (assignment.sharedRouteIds || []).join('|') ||
    (previousSnapshot?.eventPrimaryRouteId || null) !== (assignment.eventPrimaryRouteId || null)
  );
}

function shouldClearSuppressedGeometry(geo, previousSnapshot = null) {
  return (
    geo &&
    typeof geo === 'object' &&
    geo.canShowDetourPath === false &&
    !hasRenderableGeometry(geo) &&
    (
      geo.invalidGeometrySuppressed === true ||
      hasRenderableGeometry(previousSnapshot) ||
      previousSnapshot?.canShowDetourPath === true ||
      hasNonClosureSelfLoopSegments(previousSnapshot?.segments)
    )
  );
}

function normalizeDetourZoneForWrite(source, fallbackShapeId = null) {
  if (!source || typeof source !== 'object') return null;
  const start = toFiniteNumber(source.startProgressMeters);
  const end = toFiniteNumber(source.endProgressMeters);
  const shapeId = source.shapeId || fallbackShapeId || null;

  if (Number.isFinite(start) && Number.isFinite(end) && end !== start && shapeId) {
    return {
      startProgressMeters: Math.min(start, end),
      endProgressMeters: Math.max(start, end),
      shapeId,
    };
  }

  return source.shapeId ? cloneJson(source) : null;
}

function deriveDetourZoneForWrite(detour = {}, geo = null) {
  const explicit = normalizeDetourZoneForWrite(detour.detourZone, detour.shapeId || geo?.shapeId || null);
  if (explicit) return explicit;

  const geometryZone = normalizeDetourZoneForWrite(geo, geo?.shapeId || detour.shapeId || null);
  if (geometryZone) return geometryZone;

  const primarySegment = Array.isArray(geo?.segments)
    ? geo.segments.find((segment) => (
      Number.isFinite(Number(segment?.startProgressMeters)) &&
      Number.isFinite(Number(segment?.endProgressMeters))
    ))
    : null;
  return normalizeDetourZoneForWrite(primarySegment, primarySegment?.shapeId || geo?.shapeId || detour.shapeId || null);
}

function applyGeometryMetadata(doc, geo) {
  if (!geo || typeof geo !== 'object') return;

  if (hasOwn(geo, 'shapeId')) {
    doc.shapeId = geo.shapeId || null;
  }
  if (hasOwn(geo, 'canShowDetourPath')) {
    doc.canShowDetourPath = geo.canShowDetourPath ?? null;
  }
  if (hasOwn(geo, 'confidence')) {
    doc.confidence = geo.confidence || null;
  }
  if (hasOwn(geo, 'evidencePointCount')) {
    doc.evidencePointCount = geo.evidencePointCount ?? null;
  }
  if (hasOwn(geo, 'lastEvidenceAt')) {
    doc.lastEvidenceAt = geo.lastEvidenceAt ?? null;
  }

  if (geo.canShowDetourPath === false) {
    doc.likelyDetourPolyline = null;
    doc.likelyDetourRoadNames = [];
    doc.roadMatchConfidence = null;
    doc.roadMatchRawConfidence = null;
    doc.roadMatchSource = null;
  }
}

/**
 * Determine if geometry should be written to Firestore this tick.
 * Writes are throttled to avoid write amplification on every 30s tick.
 * Uses lastKnownGeometry (not lastPublishedState) to avoid false positives
 * when geometry was suppressed on a previous tick.
 */
function shouldWriteGeometry(routeId, detour, previousSnapshot, now) {
  const lastGeoWrite = lastGeometryWriteTime.get(routeId) || 0;
  const timeSinceLastWrite = now - lastGeoWrite;
  const geo = detour.geometry;

  // No geometry to write
  if (!geo) return false;
  if (hasNonClosureSelfLoopSegments(previousSnapshot?.segments)) return true;

  // Always write on state change
  const prevState = previousSnapshot?.state || 'active';
  const currState = detour.state || 'active';
  if (prevState !== currState) return true;

  // Use the last-known geometry state (tracks actual geometry, not just what was written)
  const prevGeo = lastKnownGeometry.get(routeId);

  // Always write on confidence change
  const prevConfidence = prevGeo?.confidence || null;
  if (prevConfidence !== geo.confidence) return true;

  const prevRoadMatchConfidence = prevGeo?.roadMatchConfidence || null;
  if (prevRoadMatchConfidence !== (geo.roadMatchConfidence || null)) return true;

  const currentSegmentCount = Array.isArray(geo.segments) ? geo.segments.length : 0;
  const prevSegmentCount = prevGeo?.segmentCount ?? 0;
  if (currentSegmentCount !== prevSegmentCount) return true;

  const currentSignature = Array.isArray(geo.segments)
    ? geometrySignatureFromSegments(geo.segments)
    : '';
  if ((prevGeo?.geometrySignature || '') !== currentSignature) return true;

  // Write if point count changed significantly since last write
  const prevPointCount = prevGeo?.evidencePointCount ?? 0;
  const pointCountDelta = Math.abs((geo.evidencePointCount || 0) - prevPointCount);
  if (pointCountDelta >= GEOMETRY_POINT_CHANGE_THRESHOLD) return true;

  // Write if throttle window elapsed
  if (timeSinceLastWrite >= GEOMETRY_WRITE_THROTTLE_MS) return true;

  return false;
}

function rememberPublishedDetour(routeId, data = {}) {
  const normalized = {
    routeId,
    detectedAt: data.detectedAt || null,
    lastSeenAt: data.lastSeenAt || null,
    updatedAt: data.updatedAt || null,
    triggerVehicleId: data.triggerVehicleId || null,
    vehicleCount: normalizeVehicleCount(data.vehicleCount),
    uniqueVehicleCount: normalizeVehicleCount(data.uniqueVehicleCount ?? data.vehicleCount),
    currentVehicleCount: normalizeVehicleCount(data.currentVehicleCount ?? data.vehicleCount),
    state: data.state || 'active',
    clearReason: data.clearReason || null,
    handoffSourceRouteId: data.handoffSourceRouteId || null,
    riderVisible: data.riderVisible !== false,
    riderVisibilityReason: data.riderVisibilityReason || null,
    staleForReview: Boolean(data.staleForReview),
    confidence: data.confidence || null,
    roadMatchConfidence: data.roadMatchConfidence || null,
    roadMatchRawConfidence: data.roadMatchRawConfidence ?? null,
    roadMatchSource: data.roadMatchSource || null,
    detourPathLabel: data.detourPathLabel || DETOUR_PATH_LABEL,
    likelyDetourRoadNames: Array.isArray(data.likelyDetourRoadNames)
      ? data.likelyDetourRoadNames
      : [],
    evidencePointCount: data.evidencePointCount ?? null,
    lastEvidenceAt: data.lastEvidenceAt || null,
    latestGpsEvidenceAt: data.latestGpsEvidenceAt || data.lastEvidenceAt || null,
    geometryLastEvidenceAt: data.geometryLastEvidenceAt || data.lastEvidenceAt || null,
    detourZone: cloneJson(data.detourZone) || null,
    clearWindow: cloneJson(data.clearWindow) || null,
    clearWindows: cloneJson(data.clearWindows) || [],
    clearedSegments: cloneJson(data.clearedSegments) || [],
    segments: Array.isArray(data.segments) ? data.segments : [],
    shapeId: data.shapeId || null,
    skippedSegmentPolyline: data.skippedSegmentPolyline || null,
    inferredDetourPolyline: data.inferredDetourPolyline || null,
    likelyDetourPolyline: data.likelyDetourPolyline || null,
    canShowDetourPath: data.canShowDetourPath ?? null,
    entryPoint: data.entryPoint || null,
    exitPoint: data.exitPoint || null,
    detourEventId: data.detourEventId || null,
    sharedDetourEventId: data.sharedDetourEventId || null,
    sharedRouteIds: Array.isArray(data.sharedRouteIds) ? data.sharedRouteIds : [],
    eventPrimaryRouteId: data.eventPrimaryRouteId || null,
    eventRouteCount: data.eventRouteCount ?? null,
    eventLocationLabel: data.eventLocationLabel || null,
    eventConfidence: data.eventConfidence || null,
  };

  lastPublishedIds.add(routeId);
  lastPublishedState.set(routeId, makeSnapshot(normalized));

  const updatedAtMs = toMillis(normalized.updatedAt);
  if (updatedAtMs != null) {
    lastSeenUpdateTime.set(routeId, updatedAtMs);
    lastGeometryWriteTime.set(routeId, updatedAtMs);
  }

  const hydratedGeometry = {
    shapeId: data.shapeId || null,
    segments: Array.isArray(data.segments) ? data.segments : [],
    skippedSegmentPolyline: data.skippedSegmentPolyline || null,
    inferredDetourPolyline: data.inferredDetourPolyline || null,
    likelyDetourPolyline: data.likelyDetourPolyline || null,
    likelyDetourRoadNames: Array.isArray(data.likelyDetourRoadNames)
      ? data.likelyDetourRoadNames
      : [],
    confidence: data.confidence || null,
    roadMatchConfidence: data.roadMatchConfidence || null,
    roadMatchRawConfidence: data.roadMatchRawConfidence ?? null,
    roadMatchSource: data.roadMatchSource || null,
    detourPathLabel: data.detourPathLabel || DETOUR_PATH_LABEL,
    evidencePointCount: data.evidencePointCount ?? null,
    lastEvidenceAt: data.lastEvidenceAt || null,
  };
  if (hasRenderableGeometry(hydratedGeometry)) {
    lastKnownGeometry.set(routeId, {
      confidence: hydratedGeometry.confidence,
      roadMatchConfidence: hydratedGeometry.roadMatchConfidence,
      evidencePointCount: hydratedGeometry.evidencePointCount,
      lastEvidenceAt: hydratedGeometry.lastEvidenceAt,
      segmentCount: hydratedGeometry.segments.length,
      geometrySignature: geometrySignatureFromSegments(hydratedGeometry.segments),
    });
  }
}

async function refreshPublishedDetoursFromFirestore(db, storageConfig) {
  const snapshot = await db.collection(storageConfig.activeCollection).get();
  snapshot.forEach((doc) => {
    const data = doc.data() || {};
    const routeId = data.routeId || doc.id;
    rememberPublishedDetour(routeId, data);
  });
  return snapshot.size;
}

async function writeHistoryEvent(db, event, storageConfig) {
  if (!HISTORY_ENABLED || !event) return;
  const suffix = Math.random().toString(36).slice(2, 8);
  const docId = `${event.occurredAt}-${event.routeId}-${event.eventType}-${suffix}`;
  await db.collection(storageConfig.historyCollection).doc(docId).set(event);
}

async function hydratePublisherState(db, storageConfig) {
  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    try {
      const count = await refreshPublishedDetoursFromFirestore(db, storageConfig);
      if (count > 0) {
        console.log(`[detourPublisher] Hydrated ${count} active detours`);
      }
    } catch (err) {
      console.error('[detourPublisher] Failed to hydrate existing detours:', err.message);
    }
  })();

  await hydratePromise;
}

async function pruneHistoryIfNeeded(db, now, storageConfig) {
  if (!HISTORY_ENABLED) return;
  if (!Number.isFinite(HISTORY_RETENTION_DAYS) || HISTORY_RETENTION_DAYS <= 0) return;
  if ((now - lastHistoryPruneAt) < HISTORY_PRUNE_INTERVAL_MS) return;

  lastHistoryPruneAt = now;
  const cutoff = now - (HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    let totalDeleted = 0;
    for (let i = 0; i < 10; i++) {
      const snapshot = await db
        .collection(storageConfig.historyCollection)
        .where('occurredAt', '<', cutoff)
        .orderBy('occurredAt', 'asc')
        .limit(200)
        .get();

      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += snapshot.size;

      if (snapshot.size < 200) break;
    }

    if (totalDeleted > 0) {
      console.log(
        `[detourPublisher] Pruned ${totalDeleted} detour history records older than ${HISTORY_RETENTION_DAYS} days`
      );
    }
  } catch (err) {
    console.error('[detourPublisher] Failed to prune detour history:', err.message);
  }
}

function normalizeHistoryDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...data,
    occurredAt: toMillis(data.occurredAt),
    detectedAt: toMillis(data.detectedAt),
    lastSeenAt: toMillis(data.lastSeenAt),
    clearedAt: toMillis(data.clearedAt),
  };
}

async function deletePublishedDetour(db, routeId, event, logPrefix = 'delete', storageConfig) {
  try {
    await db.collection(storageConfig.activeCollection).doc(routeId).delete();
    await writeHistoryEvent(db, event, storageConfig);
    lastPublishedIds.delete(routeId);
    lastPublishedState.delete(routeId);
    lastSeenUpdateTime.delete(routeId);
    lastGeometryWriteTime.delete(routeId);
    lastKnownGeometry.delete(routeId);
    return true;
  } catch (err) {
    console.error(`[detourPublisher] Failed to ${logPrefix} ${routeId}:`, err.message);
    return false;
  }
}

function hasNormalRouteClearProof(previousSnapshot) {
  return (
    previousSnapshot?.clearReason === 'normal-route-observed' ||
    previousSnapshot?.clearReason === 'obsolete-shape-normal-route-observed'
  );
}

function assignSnapshotDate(doc, key, valueMs) {
  if (valueMs != null && Number.isFinite(valueMs)) {
    doc[key] = new Date(valueMs);
  }
}

function buildRetainedAbsentDetourDoc(routeId, previousSnapshot, now) {
  const vehicleCount = normalizeVehicleCount(previousSnapshot?.vehicleCount);
  const uniqueVehicleCount = normalizeVehicleCount(
    previousSnapshot?.uniqueVehicleCount ?? previousSnapshot?.vehicleCount
  );
  const doc = {
    routeId,
    updatedAt: now,
    triggerVehicleId: previousSnapshot?.triggerVehicleId || null,
    vehicleCount,
    uniqueVehicleCount,
    currentVehicleCount: 0,
    state: previousSnapshot?.state || 'active',
    clearReason: previousSnapshot?.clearReason || null,
    isPersistent: Boolean(previousSnapshot?.isPersistent),
    handoffSourceRouteId: previousSnapshot?.handoffSourceRouteId || null,
    latestGpsEvidenceAt: previousSnapshot?.latestGpsEvidenceAt ?? null,
    geometryLastEvidenceAt: previousSnapshot?.geometryLastEvidenceAt ?? null,
    lastEvidenceAt: previousSnapshot?.lastEvidenceAt ?? null,
    detourZone: cloneJson(previousSnapshot?.detourZone) || null,
    clearWindow: cloneJson(previousSnapshot?.clearWindow) || null,
    clearWindows: cloneJson(previousSnapshot?.clearWindows) || [],
    clearedSegments: cloneJson(previousSnapshot?.clearedSegments) || [],
    confidence: previousSnapshot?.confidence || null,
    evidencePointCount: previousSnapshot?.evidencePointCount ?? null,
  };

  assignSnapshotDate(doc, 'detectedAt', previousSnapshot?.detectedAtMs);
  assignSnapshotDate(doc, 'lastSeenAt', previousSnapshot?.lastSeenAtMs);

  const detourForVisibility = {
    ...previousSnapshot,
    vehicleCount,
    uniqueVehicleCount,
    currentVehicleCount: 0,
    geometry: previousSnapshot,
  };
  const riderVisibility = evaluateStaleRiderVisibility({
    routeId,
    detour: detourForVisibility,
    previousSnapshot,
    now,
  });
  doc.riderVisible = riderVisibility.riderVisible !== false;
  doc.riderVisibilityReason = riderVisibility.reason || null;
  doc.staleForReview = Boolean(riderVisibility.staleForReview);

  if (doc.riderVisible !== false && !hasTrustworthyRiderGeometry(previousSnapshot)) {
    doc.riderVisible = false;
    doc.riderVisibilityReason = 'insufficient-geometry';
    doc.staleForReview = true;
  }

  return doc;
}

function getBaselineDivergedRouteIds(options = {}) {
  const ids = new Set();
  const addRouteId = (routeId) => {
    if (routeId != null && String(routeId).trim()) {
      ids.add(String(routeId).trim());
    }
  };

  (options.baselineDivergedRouteIds || []).forEach(addRouteId);
  (options.baselineDivergence?.changedRouteIds || []).forEach(addRouteId);
  (options.baselineDivergence?.added || []).forEach((entry) => addRouteId(entry?.routeId));
  (options.baselineDivergence?.removed || []).forEach((entry) => addRouteId(entry?.routeId));

  return ids;
}

function applyBaselineDivergenceSuppression(doc, routeId, baselineDivergedRouteIds) {
  if (!baselineDivergedRouteIds?.has(String(routeId))) {
    return doc;
  }

  doc.riderVisible = false;
  doc.riderVisibilityReason = 'baseline-diverged';
  doc.staleForReview = true;
  doc.baselineDiverged = true;
  return doc;
}

async function publishDetours(activeDetours, options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[detourPublisher] Firestore not configured — skipping publish');
    return { staleAutoClearedRouteIds: [] };
  }
  const storageConfig = resolvePublisherStorageConfig(options.storageConfig);
  await hydratePublisherState(db, storageConfig);

  const now = options.now || Date.now();
  const vehicles = Array.isArray(options.vehicles) ? options.vehicles : [];
  const scheduleIndex = options.scheduleIndex || options.gtfsData?.scheduleIndex || null;
  const baselineDivergedRouteIds = getBaselineDivergedRouteIds(options);
  const gtfsData = options.gtfsData || {};
  const noticeStopImpacts = Array.isArray(options.noticeStopImpacts)
    ? options.noticeStopImpacts
    : await loadActiveNoticeStopImpacts(db);
  const activeEntries = Object.entries(activeDetours || {});
  const stalePublishSuppressedIds = new Set();
  const publishableDetours = Object.fromEntries(activeEntries.filter(([routeId, detour]) => {
    const staleDecision = shouldAutoClearStaleDetour({
      routeId,
      detour,
      previousSnapshot: lastPublishedState.get(routeId),
      vehicles,
      scheduleIndex,
      now,
    });
    if (staleDecision.validationOnly === true && staleDecision.reason === 'gps-clear-required') {
      // Low-confidence validation-only stale outputs are monitoring evidence.
      // Do not publish them as rider-facing active detours, and do not clear an
      // existing detour without normal-route GPS proof.
      stalePublishSuppressedIds.add(routeId);
      return false;
    }
    return true;
  }));
  const currentIds = new Set([
    ...Object.keys(publishableDetours),
    ...stalePublishSuppressedIds,
  ]);

  // Master cleanup pass: re-scan Firestore every publish cycle so orphaned
  // activeDetours docs are cleared even if they appeared after this process
  // finished its initial hydration.
  try {
    await refreshPublishedDetoursFromFirestore(db, storageConfig);
  } catch (err) {
    console.error('[detourPublisher] Failed to refresh active detours before cleanup:', err.message);
  }

  if (
    options.suppressDeletesWhenEmpty === true &&
    Object.keys(publishableDetours).length === 0 &&
    stalePublishSuppressedIds.size === 0
  ) {
    console.warn(
      `[detourPublisher] Suppressing activeDetours deletion: ${options.suppressDeleteReason || 'unknown'}`
    );
    return { staleAutoClearedRouteIds: [] };
  }

  const removedIds = [...lastPublishedIds].filter(id => !currentIds.has(id));
  for (const routeId of removedIds) {
    const previous = lastPublishedState.get(routeId);
    if (!hasNormalRouteClearProof(previous)) {
      const retainedDoc = buildRetainedAbsentDetourDoc(routeId, previous, now);
      applyBaselineDivergenceSuppression(retainedDoc, routeId, baselineDivergedRouteIds);
      try {
        await db.collection(storageConfig.activeCollection).doc(routeId).set(retainedDoc, { merge: true });
        const currentSnapshot = makeSnapshot(retainedDoc, previous);
        await writeHistoryEvent(db, buildUpdatedEvent(routeId, previous, currentSnapshot, now), storageConfig);
        lastPublishedIds.add(routeId);
        lastPublishedState.set(routeId, currentSnapshot);
        lastSeenUpdateTime.set(routeId, now);
      } catch (err) {
        console.error(`[detourPublisher] Failed to retain ${routeId}:`, err.message);
      }
      continue;
    }
    const event = buildClearedEvent(routeId, previous, now);
    await deletePublishedDetour(db, routeId, event, 'delete', storageConfig);
  }

  const sharedEventAssignments = buildSharedDetourEventAssignmentsForPublish(publishableDetours);

  for (const [routeId, detour] of Object.entries(publishableDetours)) {
    const isNew = !lastPublishedIds.has(routeId);
    const lastUpdate = lastSeenUpdateTime.get(routeId) || 0;
    const shouldUpdateLastSeen = isNew || (now - lastUpdate >= LAST_SEEN_THROTTLE_MS);
    const previousSnapshot = lastPublishedState.get(routeId);

    const doc = {
      routeId,
      detectedAt: toDate(detour.detectedAt, now),
      updatedAt: now,
      triggerVehicleId: detour.triggerVehicleId || null,
      vehicleCount: detour.vehiclesOffRoute && detour.vehiclesOffRoute.size > 0
        ? normalizeVehicleCount(detour.vehicleCount ?? detour.vehiclesOffRoute.size)
        : normalizeVehicleCount(detour.vehicleCount),
      uniqueVehicleCount: normalizeVehicleCount(detour.uniqueVehicleCount ?? detour.vehicleCount),
      currentVehicleCount: detour.vehiclesOffRoute && detour.vehiclesOffRoute.size >= 0
        ? detour.vehiclesOffRoute.size
        : normalizeVehicleCount(detour.currentVehicleCount ?? 0),
      state: detour.state || 'active',
      clearReason: detour.clearReason || null,
      isPersistent: Boolean(detour.isPersistent),
      handoffSourceRouteId: detour.handoffSourceRouteId || null,
      latestGpsEvidenceAt: detour.latestGpsEvidenceAt ?? null,
      geometryLastEvidenceAt: detour.geometryLastEvidenceAt ?? detour.geometry?.lastEvidenceAt ?? null,
    };

    if (shouldUpdateLastSeen) {
      doc.lastSeenAt = toDate(detour.lastSeenAt, now);
    }

    // Geometry write throttle: only write geometry when criteria are met.
    // Optional road matching decorates the inferred GPS path as a rider-facing
    // "likely detour path" only when we are already going to write geometry,
    // so active detours do not generate map-matching traffic every tick.
    let geo = preserveTrustedDetourPath(
      enforceGeometryTrustGate(detour.geometry),
      previousSnapshot,
      detour
    );
    geo = pruneDetourPathServedStopsFromGeometry(geo);
    geo = mergeNoticeStopImpactsIntoGeometry(routeId, geo, noticeStopImpacts, gtfsData);
    if (hasRenderableGeometry(geo)) {
      geo = withDetourEventIds(routeId, geo);
    }
    let detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
    applyGeometryMetadata(doc, geo);
    let noticeStopImpactWriteDelta = hasNoticeStopImpactWriteDelta(previousSnapshot, geo);
    let writeGeo = noticeStopImpactWriteDelta || shouldClearSuppressedGeometry(geo, previousSnapshot) || (
      hasRenderableGeometry(geo) &&
      (isNew || shouldWriteGeometry(routeId, detourForGeometry, previousSnapshot, now))
    );
    if (
      geo?.preservedTrustedDetourPath === true &&
      previousSnapshot &&
      !hasNonClosureSelfLoopSegments(previousSnapshot?.segments) &&
      !noticeStopImpactWriteDelta &&
      now - (lastGeometryWriteTime.get(routeId) || 0) < GEOMETRY_WRITE_THROTTLE_MS
    ) {
      writeGeo = false;
    }
    const knownGeometry = lastKnownGeometry.get(routeId);
    const shouldBackfillRoadMatch = !writeGeo &&
      hasRenderableGeometry(geo) &&
      shouldAttemptRoadMatchBackfill(geo, previousSnapshot, knownGeometry);
    const roadMatchBackfillAttemptedSignatures = shouldBackfillRoadMatch
      ? getRoadMatchBackfillSignatures(geo)
      : [];
    const roadMatchBackfillAttemptedSignature = roadMatchBackfillAttemptedSignatures[0] || null;

    if (((writeGeo && hasRenderableGeometry(geo)) || shouldBackfillRoadMatch) && geo) {
      try {
        geo = await matchDetourGeometry(geo, {
          shapes: options.shapes || options.gtfsData?.shapes || null,
        });
        detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
      } catch (err) {
        console.warn('[detourPublisher] Road matching skipped:', err.message);
      }
      geo = preserveTrustedDetourPath(geo, previousSnapshot, detour);
      geo = pruneDetourPathServedStopsFromGeometry(geo);
      geo = mergeNoticeStopImpactsIntoGeometry(routeId, geo, noticeStopImpacts, gtfsData);
      if (hasRenderableGeometry(geo)) {
        geo = withDetourEventIds(routeId, geo);
      }
      detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
      noticeStopImpactWriteDelta = hasNoticeStopImpactWriteDelta(previousSnapshot, geo);
      writeGeo = noticeStopImpactWriteDelta || shouldClearSuppressedGeometry(geo, previousSnapshot) || (
        hasRenderableGeometry(geo) &&
        (isNew || shouldWriteGeometry(routeId, detourForGeometry, previousSnapshot, now))
      );
      if (
        geo?.preservedTrustedDetourPath === true &&
        previousSnapshot &&
        !hasNonClosureSelfLoopSegments(previousSnapshot?.segments) &&
        !noticeStopImpactWriteDelta &&
        now - (lastGeometryWriteTime.get(routeId) || 0) < GEOMETRY_WRITE_THROTTLE_MS
      ) {
        writeGeo = false;
      }
      if (
        shouldBackfillRoadMatch &&
        hasRenderableGeometry(geo) &&
        hasLikelyDetourPath(geo)
      ) {
        writeGeo = true;
      }
    }

    if (geo) {
      geo = applySharedDetourEventAssignmentsToGeometry(routeId, geo, sharedEventAssignments);
      detourForGeometry = geo === detour.geometry ? detour : { ...detour, geometry: geo };
      noticeStopImpactWriteDelta = hasNoticeStopImpactWriteDelta(previousSnapshot, geo);
      if (noticeStopImpactWriteDelta) {
        writeGeo = true;
      }
    }
    const sharedAssignment = getPrimarySharedAssignment(routeId, geo, sharedEventAssignments) ||
      sharedEventAssignments.byRoute.get(normalizeRouteId(routeId)) ||
      null;
    applySharedDetourEventMetadata(doc, sharedAssignment);
    const detourZone = deriveDetourZoneForWrite(detour, geo);
    if (detourZone) {
      doc.detourZone = detourZone;
    }
    if (detour.clearWindow) {
      doc.clearWindow = cloneJson(detour.clearWindow);
    }
    if (Array.isArray(detour.clearWindows)) {
      doc.clearWindows = cloneJson(detour.clearWindows);
    }
    if (Array.isArray(detour.clearedSegments)) {
      doc.clearedSegments = cloneJson(detour.clearedSegments);
    }
    if (
      hasRenderableGeometry(geo) &&
      (sharedAssignment?.eventRouteCount || 0) > 1 &&
      hasSharedDetourMetadataChanged(previousSnapshot, sharedAssignment)
    ) {
      writeGeo = true;
    }

    const detourForVisibility = {
      ...detourForGeometry,
      geometry: geo,
    };
    const riderVisibility = evaluateStaleRiderVisibility({
      routeId,
      detour: detourForVisibility,
      previousSnapshot,
      vehicles,
      scheduleIndex,
      now,
    });
    doc.riderVisible = riderVisibility.riderVisible !== false;
    doc.riderVisibilityReason = riderVisibility.reason || null;
    doc.staleForReview = Boolean(riderVisibility.staleForReview);

    if (shouldClearSuppressedGeometry(geo, previousSnapshot)) {
      doc.riderVisible = false;
      doc.riderVisibilityReason = 'suppressed-invalid-geometry';
      doc.staleForReview = true;
    } else if (doc.riderVisible !== false && !hasTrustworthyRiderGeometry(geo)) {
      doc.riderVisible = false;
      doc.riderVisibilityReason = 'insufficient-geometry';
      doc.staleForReview = true;
    }
    applyBaselineDivergenceSuppression(doc, routeId, baselineDivergedRouteIds);

    if (writeGeo && geo) {
      doc.shapeId = geo.shapeId || null;
      doc.segments = geo.segments || [];
      doc.skippedSegmentPolyline = geo.skippedSegmentPolyline || null;
      doc.inferredDetourPolyline = geo.inferredDetourPolyline || null;
      doc.canShowDetourPath = geo.canShowDetourPath ?? null;
      doc.likelyDetourPolyline = geo.likelyDetourPolyline || null;
      doc.likelyDetourRoadNames = Array.isArray(geo.likelyDetourRoadNames)
        ? geo.likelyDetourRoadNames
        : [];
      doc.roadMatchConfidence = geo.roadMatchConfidence || null;
      doc.roadMatchRawConfidence = geo.roadMatchRawConfidence ?? null;
      doc.roadMatchSource = geo.roadMatchSource || null;
      doc.detourPathLabel = geo.detourPathLabel || DETOUR_PATH_LABEL;
      doc.detourEventId = geo.detourEventId || null;
      doc.entryPoint = geo.entryPoint || null;
      doc.exitPoint = geo.exitPoint || null;
      doc.noticeTemporaryStops = Array.isArray(geo.noticeTemporaryStops) ? geo.noticeTemporaryStops : [];
      doc.noticeTemporaryStopIds = Array.isArray(geo.noticeTemporaryStopIds) ? geo.noticeTemporaryStopIds : [];
      doc.noticeTemporaryStopCodes = Array.isArray(geo.noticeTemporaryStopCodes) ? geo.noticeTemporaryStopCodes : [];
      doc.noticeActiveStops = Array.isArray(geo.noticeActiveStops) ? geo.noticeActiveStops : [];
      doc.noticeActiveStopIds = Array.isArray(geo.noticeActiveStopIds) ? geo.noticeActiveStopIds : [];
      doc.noticeActiveStopCodes = Array.isArray(geo.noticeActiveStopCodes) ? geo.noticeActiveStopCodes : [];
      doc.noticeStopImpactSource = geo.noticeStopImpactSource || null;
      doc.noticeStopImpactSourceNewsIds = Array.isArray(geo.noticeStopImpactSourceNewsIds)
        ? geo.noticeStopImpactSourceNewsIds
        : [];
      doc.confidence = geo.confidence || null;
      doc.evidencePointCount = geo.evidencePointCount ?? null;
      doc.lastEvidenceAt = geo.lastEvidenceAt ?? null;
      doc.geometryLastEvidenceAt = detour.geometryLastEvidenceAt ?? geo.lastEvidenceAt ?? null;
      doc.latestGpsEvidenceAt = detour.latestGpsEvidenceAt ?? doc.lastEvidenceAt ?? null;
      applySharedDetourEventMetadata(doc, sharedAssignment);
    }

    try {
      await db.collection(storageConfig.activeCollection).doc(routeId).set(doc, { merge: true });
      const currentSnapshot = makeSnapshot(doc, previousSnapshot);
      if (isNew) {
        await writeHistoryEvent(db, buildDetectedEvent(routeId, currentSnapshot, now), storageConfig);
      } else {
        await writeHistoryEvent(
          db,
          buildUpdatedEvent(routeId, previousSnapshot, currentSnapshot, now),
          storageConfig
        );
      }
      lastPublishedIds.add(routeId);
      lastPublishedState.set(routeId, currentSnapshot);
      if (shouldUpdateLastSeen) {
        lastSeenUpdateTime.set(routeId, now);
      }
      if (writeGeo && geo) {
        lastGeometryWriteTime.set(routeId, now);
      }
      // Always track geometry state for accurate throttle decisions on next tick
      if (geo) {
        lastKnownGeometry.set(routeId, {
          confidence: geo.confidence,
          roadMatchConfidence: geo.roadMatchConfidence || null,
          evidencePointCount: geo.evidencePointCount,
          lastEvidenceAt: geo.lastEvidenceAt,
          segmentCount: Array.isArray(geo.segments) ? geo.segments.length : 0,
          geometrySignature: Array.isArray(geo.segments)
            ? geometrySignatureFromSegments(geo.segments)
            : '',
          roadMatchBackfillAttemptedSignature: geo.roadMatchSource
            ? null
            : (
              roadMatchBackfillAttemptedSignature ||
              knownGeometry?.roadMatchBackfillAttemptedSignature ||
              null
            ),
          roadMatchBackfillAttemptedSignatures: geo.roadMatchSource
            ? roadMatchBackfillAttemptedSignatures
            : (
              roadMatchBackfillAttemptedSignatures.length > 0
                ? roadMatchBackfillAttemptedSignatures
                : (
                  Array.isArray(knownGeometry?.roadMatchBackfillAttemptedSignatures)
                    ? knownGeometry.roadMatchBackfillAttemptedSignatures
                    : []
                )
            ),
        });
      }
    } catch (err) {
      console.error(`[detourPublisher] Failed to write ${routeId}:`, err.message);
    }
  }

  await pruneHistoryIfNeeded(db, now, storageConfig);
  return {
    staleAutoClearedRouteIds: [],
  };
}

async function getDetourHistory(options = {}) {
  const db = getDb();
  if (!db) {
    console.warn('[detourPublisher] Firestore not configured — detour history unavailable');
    return [];
  }
  const storageConfig = resolveDetourStorageConfig(options.storageConfig);

  const parsedLimit = Number.parseInt(String(options.limit ?? HISTORY_DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), HISTORY_MAX_LIMIT)
    : HISTORY_DEFAULT_LIMIT;

  const routeId = options.routeId ? String(options.routeId).trim() : '';
  const eventTypes = Array.isArray(options.eventTypes)
    ? options.eventTypes
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean)
    : [];

  const startMs = Number.isFinite(options.startMs) ? options.startMs : null;
  const endMs = Number.isFinite(options.endMs) ? options.endMs : null;

  let query = db.collection(storageConfig.historyCollection).orderBy('occurredAt', 'desc');
  if (startMs != null) {
    query = query.where('occurredAt', '>=', startMs);
  }
  if (endMs != null) {
    query = query.where('occurredAt', '<=', endMs);
  }

  const needsFilter = Boolean(routeId) || eventTypes.length > 0;
  const fetchLimit = needsFilter
    ? Math.min(1000, Math.max(limit * 10, limit))
    : limit;

  const snapshot = await query.limit(fetchLimit).get();
  let logs = snapshot.docs.map(normalizeHistoryDoc);

  if (routeId) {
    logs = logs.filter((entry) => entry.routeId === routeId);
  }

  if (eventTypes.length > 0) {
    const allowedTypes = new Set(eventTypes);
    logs = logs.filter((entry) => allowedTypes.has(String(entry.eventType || '').toUpperCase()));
  }

  return logs.slice(0, limit);
}

function getLastPublishedIds() {
  return new Set(lastPublishedIds);
}

module.exports = {
  publishDetours,
  getLastPublishedIds,
  getDetourHistory,
  HISTORY_MAX_LIMIT,
  GEOMETRY_WRITE_THROTTLE_MS,
  // Exported for testing
  shouldWriteGeometry,
  shouldAttemptRoadMatchBackfill,
  enforceGeometryTrustGate,
  preserveTrustedDetourPath,
  buildDetourEventId,
  mergeNoticeStopImpactsIntoGeometry,
  hasNoticeStopImpactWriteDelta,
  hasNormalRouteClearProof,
  deriveSharedDetourEventAssignments,
  makeSnapshot,
  buildUpdatedEvent,
  buildDetectedEvent,
  buildClearedEvent,
};
