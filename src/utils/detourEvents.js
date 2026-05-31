import { filterRiderVisibleDetours } from './detourVisibility';
import { getRouteFamilyId, normalizeRouteId } from './routeDetourMatching';

const GENERIC_TITLES = new Set([
  'active detour',
  'detour active',
  'likely detour',
  'likely detour path',
  'likely path',
  'detour route',
  'temporary detour',
]);

const CONFIDENCE_RANK = { high: 2, medium: 1, low: 0 };
const SAME_EVENT_ENDPOINT_THRESHOLD_METERS = 225;
const SAME_EVENT_CENTROID_THRESHOLD_METERS = 450;

const normalizeConfidence = (value) => String(value || '').trim().toLowerCase();

const getConfidenceRank = (value) => CONFIDENCE_RANK[normalizeConfidence(value)] ?? -1;

const pointSignature = (point) => {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
};

const pointFrom = (value) => {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lon ?? value?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

const distanceMeters = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const radiusMeters = 6_371_000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * radiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const centroidOf = (pair) => (
  pair
    ? {
      latitude: (pair[0].latitude + pair[1].latitude) / 2,
      longitude: (pair[0].longitude + pair[1].longitude) / 2,
    }
    : null
);

const getEndpointPair = (segment = {}, detour = {}) => {
  const polylineCandidates = [
    segment?.skippedSegmentPolyline,
    segment?.likelyDetourPolyline,
    segment?.inferredDetourPolyline,
    detour?.skippedSegmentPolyline,
    detour?.likelyDetourPolyline,
    detour?.inferredDetourPolyline,
  ];

  for (const polyline of polylineCandidates) {
    if (Array.isArray(polyline) && polyline.length >= 2) {
      const start = pointFrom(polyline[0]);
      const end = pointFrom(polyline[polyline.length - 1]);
      if (start && end) return [start, end];
    }
  }

  const entry = pointFrom(segment?.entryPoint || detour?.entryPoint);
  const exit = pointFrom(segment?.exitPoint || detour?.exitPoint);
  return entry && exit ? [entry, exit] : null;
};

const routeSortKey = (routeId) => {
  const normalized = normalizeRouteId(routeId);
  const match = normalized.match(/^(\d+)([A-Z]?)$/);
  return match ? [Number(match[1]), match[2] || ''] : [Number.MAX_SAFE_INTEGER, normalized];
};

const sortRouteIds = (routeIds) => [...new Set(routeIds.map(normalizeRouteId).filter(Boolean))]
  .sort((a, b) => {
    const [aNumber, aSuffix] = routeSortKey(a);
    const [bNumber, bSuffix] = routeSortKey(b);
    if (aNumber !== bNumber) return aNumber - bNumber;
    return String(aSuffix).localeCompare(String(bSuffix));
  });

const cleanRoadName = (value) => String(value || '')
  .replace(/\b(Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Crescent|Cres\.?)\b/gi, '')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeRoadNameForCompare = (value) => cleanRoadName(value).toLowerCase();

const ampersandList = (items) => {
  const cleaned = items.map(cleanRoadName).filter(Boolean);
  const unique = [...new Set(cleaned.map((item) => item.trim()))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} & ${unique[1]}`;
  return `${unique[0]} & ${unique[1]}`;
};

const isGenericTitle = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  if (GENERIC_TITLES.has(text)) return true;
  return /^route\s+\d+[a-z]?\s+detour$/i.test(text);
};

export const cleanDetourEventTitle = (value) => {
  const raw = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  if (isGenericTitle(raw)) return '';

  const cleaned = raw
    .replace(/\s*[-–—]\s*Routes?\s+[\dA-Za-z,\s/&-]+$/i, '')
    .replace(/\s*\(\s*Routes?\s+[\dA-Za-z,\s/&-]+\s*\)\s*$/i, '')
    .replace(/\btest\s+detour\b/gi, '')
    .replace(/\bdetour\b/gi, '')
    .replace(/\bintersection\s+closure\b/gi, '')
    .replace(/\bclosure\b/gi, '')
    .replace(/\s*(?:\/|\band\b)\s*/gi, ' & ')
    .replace(/\s*&\s*/g, ' & ')
    .replace(/\s+/g, ' ')
    .replace(/[.:-]+$/g, '')
    .trim();

  return isGenericTitle(cleaned) ? '' : cleaned;
};

const hasMultipleSegments = (detour) => Array.isArray(detour?.segments) && detour.segments.length > 1;

const shouldUseTopLevelDetourFields = (detour, segment) => !segment || !hasMultipleSegments(detour);

const getCandidateRoadNames = (detour, segment) => ([
  ...(Array.isArray(segment?.likelyDetourRoadNames) ? segment.likelyDetourRoadNames : []),
  ...(shouldUseTopLevelDetourFields(detour, segment) && Array.isArray(detour?.likelyDetourRoadNames)
    ? detour.likelyDetourRoadNames
    : []),
]);

const buildRoadTitle = (detour, segment) => ampersandList(getCandidateRoadNames(detour, segment));

const roadOverlapScore = (a = {}, b = {}) => {
  const roadsA = new Set(getCandidateRoadNames(a.detour, a.segment).map(normalizeRoadNameForCompare).filter(Boolean));
  const roadsB = new Set(getCandidateRoadNames(b.detour, b.segment).map(normalizeRoadNameForCompare).filter(Boolean));
  if (roadsA.size === 0 || roadsB.size === 0) return 0;
  return [...roadsA].filter((road) => roadsB.has(road)).length;
};

const normalizeStopCode = (value) => {
  const text = String(value ?? '')
    .replace(/^#/, '')
    .replace(/^stop\s*#?/i, '')
    .trim();
  return text || '';
};

const getStopCodeFromReference = (reference) => {
  if (reference == null) return '';
  if (typeof reference === 'object') {
    return normalizeStopCode(
      reference.code ??
      reference.stopCode ??
      reference.stop_code ??
      reference.id ??
      reference.stopId ??
      reference.stop_id
    );
  }
  return normalizeStopCode(reference);
};

const getCodesFromReferences = (references) => (
  (Array.isArray(references) ? references : [])
    .map(getStopCodeFromReference)
    .filter(Boolean)
);

const getCandidateStopCodes = (detour, segment) => ([
  ...getCodesFromReferences(segment?.skippedStopCodes),
  ...getCodesFromReferences(segment?.skippedStops),
  ...getCodesFromReferences(segment?.skippedStopIds),
  ...getCodesFromReferences(segment?.affectedStopCodes),
  ...getCodesFromReferences(segment?.affectedStops),
  ...getCodesFromReferences(segment?.affectedStopIds),
  ...(shouldUseTopLevelDetourFields(detour, segment)
    ? [
      ...getCodesFromReferences(detour?.skippedStopCodes),
      ...getCodesFromReferences(detour?.skippedStops),
      ...getCodesFromReferences(detour?.skippedStopIds),
      ...getCodesFromReferences(detour?.affectedStopCodes),
      ...getCodesFromReferences(detour?.affectedStops),
      ...getCodesFromReferences(detour?.affectedStopIds),
    ]
    : []),
]);

const uniqueStopCodes = (codes = []) => {
  const seen = new Set();
  return codes.filter((code) => {
    const normalized = normalizeStopCode(code);
    const key = normalized.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const formatStopCodeList = (codes = []) => {
  const uniqueCodes = uniqueStopCodes(codes);
  if (uniqueCodes.length === 0) return '';
  if (uniqueCodes.length === 1) return `Stop #${uniqueCodes[0]}`;
  if (uniqueCodes.length === 2) return `Stops #${uniqueCodes[0]} & #${uniqueCodes[1]}`;
  return `Stops #${uniqueCodes[0]}, #${uniqueCodes[1]} +${uniqueCodes.length - 2}`;
};

const titleAlreadyHasStopCode = (title, codes = []) => {
  const text = String(title || '').toLowerCase();
  return uniqueStopCodes(codes).some((code) => {
    const escaped = String(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:#|\\bstop\\s*#?)${escaped}\\b`, 'i').test(text);
  });
};

const combineLocationAndStopTitle = (locationTitle, stopCodeTitle, codes) => {
  if (!stopCodeTitle) return locationTitle;
  if (!locationTitle) return stopCodeTitle;
  if (titleAlreadyHasStopCode(locationTitle, codes)) return locationTitle;
  return `${locationTitle} · ${stopCodeTitle}`;
};

export const buildDetourEventTitle = ({ routeId, detour = {}, segment = null }) => {
  const explicitSources = [
    segment?.eventLocationLabel,
    detour?.eventLocationLabel,
    segment?.title,
    segment?.description,
    detour?.title,
    detour?.description,
    segment?.locationText,
    detour?.locationText,
  ];

  for (const source of explicitSources) {
    const title = cleanDetourEventTitle(source);
    if (title) {
      const stopCodes = getCandidateStopCodes(detour, segment);
      return combineLocationAndStopTitle(title, formatStopCodeList(stopCodes), stopCodes);
    }
  }

  const stopCodes = getCandidateStopCodes(detour, segment);
  const stopCodeTitle = formatStopCodeList(stopCodes);

  const labelTitle = cleanDetourEventTitle(segment?.detourPathLabel || detour?.detourPathLabel);
  if (labelTitle) return combineLocationAndStopTitle(labelTitle, stopCodeTitle, stopCodes);

  const roadTitle = buildRoadTitle(detour, segment);
  if (roadTitle) return combineLocationAndStopTitle(roadTitle, stopCodeTitle, stopCodes);

  const familyId = getRouteFamilyId(routeId);
  return stopCodeTitle || (familyId ? `Route ${familyId} detour` : 'Active detour');
};

const buildCandidateGroupKey = ({ routeId, detour, segment, segmentIndex }) => {
  const hasMultipleRouteSegments = hasMultipleSegments(detour);
  const sharedEventId =
    segment?.sharedDetourEventId ||
    (!hasMultipleRouteSegments ? detour?.sharedDetourEventId : null);
  if (sharedEventId) return `event:${sharedEventId}`;

  const backendEventId = segment?.detourEventId || (!hasMultipleRouteSegments ? detour?.detourEventId : null);
  if (backendEventId) return `event:${backendEventId}`;

  const explicitSources = [
    segment?.title,
    segment?.description,
    segment?.locationText,
    segment?.detourPathLabel,
  ];

  if (!hasMultipleRouteSegments) {
    explicitSources.push(
      detour?.title,
      detour?.description,
      detour?.locationText,
      detour?.detourPathLabel
    );
  }

  const explicitTitle = explicitSources.map(cleanDetourEventTitle).find(Boolean);
  if (explicitTitle) return `title:${explicitTitle.toLowerCase()}`;

  const geometry = [
    pointSignature(segment?.entryPoint || detour?.entryPoint),
    pointSignature(segment?.exitPoint || detour?.exitPoint),
  ].filter(Boolean).sort().join('|');

  return `segment:${normalizeRouteId(routeId)}:${segmentIndex ?? 'top'}:${geometry}`;
};

const createCandidate = ({ routeId, detour, segment, segmentIndex }) => ({
  routeId: normalizeRouteId(routeId),
  familyId: getRouteFamilyId(routeId),
  detour,
  segment,
  segmentIndex,
  title: buildDetourEventTitle({ routeId, detour, segment }),
  groupKey: buildCandidateGroupKey({ routeId, detour, segment, segmentIndex }),
  eventPrimaryRouteId: normalizeRouteId(segment?.eventPrimaryRouteId || detour?.eventPrimaryRouteId),
  confidence: normalizeConfidence(segment?.confidence || detour?.confidence),
  state: detour?.state === 'clear-pending' || segment?.state === 'clear-pending' ? 'clear-pending' : 'active',
});

const titleQuality = (candidate) => {
  const roadCount = getCandidateRoadNames(candidate.detour, candidate.segment).length;
  const stopCodeCount = getCandidateStopCodes(candidate.detour, candidate.segment).length;
  const text = String(candidate.title || '').toLowerCase();
  const isRouteFallback = /^route\s+\d+[a-z]?\s+detour$/i.test(candidate.title || '');

  return (
    (roadCount > 0 ? 8 : 0) +
    (stopCodeCount > 0 ? 4 : 0) +
    (!isRouteFallback && text ? 2 : 0)
  );
};

const samePhysicalDetour = (a, b) => {
  if (!a || !b) return false;

  const endpointsA = getEndpointPair(a.segment, a.detour);
  const endpointsB = getEndpointPair(b.segment, b.detour);
  if (!endpointsA || !endpointsB) return false;

  const roadOverlap = roadOverlapScore(a, b);
  const sameRouteFamily = a.familyId === b.familyId;

  // Different route families can share one physical road closure. Only merge
  // them when both geometry and road-name evidence agree, so nearby but
  // unrelated route-specific detours stay separate.
  if (!sameRouteFamily && roadOverlap < 2) return false;

  const sameDirectionMax = Math.max(
    distanceMeters(endpointsA[0], endpointsB[0]),
    distanceMeters(endpointsA[1], endpointsB[1])
  );
  const oppositeDirectionMax = Math.max(
    distanceMeters(endpointsA[0], endpointsB[1]),
    distanceMeters(endpointsA[1], endpointsB[0])
  );

  if (Math.min(sameDirectionMax, oppositeDirectionMax) <= SAME_EVENT_ENDPOINT_THRESHOLD_METERS) {
    return true;
  }

  const centroidDistance = distanceMeters(centroidOf(endpointsA), centroidOf(endpointsB));
  return centroidDistance <= SAME_EVENT_CENTROID_THRESHOLD_METERS && roadOverlap >= 2;
};

const candidateBelongsInGroup = (candidate, group) => {
  if (candidate.groupKey && group.groupKey && candidate.groupKey === group.groupKey) {
    return true;
  }

  return group.candidates.some((existing) => samePhysicalDetour(candidate, existing));
};

const getDetourCandidates = (routeId, detour) => {
  const segments = Array.isArray(detour?.segments) && detour.segments.length > 0
    ? detour.segments
    : [null];

  return segments.map((segment, index) => createCandidate({
    routeId,
    detour,
    segment,
    segmentIndex: segment ? index : null,
  }));
};

const buildEventFromCandidates = (groupKey, candidates) => {
  const routeIds = sortRouteIds(candidates.map((candidate) => candidate.routeId));
  const requestedPrimaryRouteId = candidates
    .map((candidate) => candidate.eventPrimaryRouteId)
    .find((routeId) => routeId && routeIds.includes(routeId));
  const primary = (requestedPrimaryRouteId
    ? candidates.find((candidate) => candidate.routeId === requestedPrimaryRouteId)
    : null) || [...candidates].sort((a, b) => {
    const routeCompare = sortRouteIds([a.routeId, b.routeId])[0] === a.routeId ? -1 : 1;
    if (a.routeId !== b.routeId) return routeCompare;
    return (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0);
  })[0];
  const confidence = candidates.reduce((best, candidate) => (
    getConfidenceRank(candidate.confidence) > getConfidenceRank(best) ? candidate.confidence : best
  ), '');
  const allClearing = candidates.every((candidate) => candidate.state === 'clear-pending');
  const bestTitleCandidate = [...candidates].sort((a, b) => {
    const qualityDiff = titleQuality(b) - titleQuality(a);
    if (qualityDiff !== 0) return qualityDiff;
    const routeCompare = sortRouteIds([a.routeId, b.routeId])[0] === a.routeId ? -1 : 1;
    if (a.routeId !== b.routeId) return routeCompare;
    return (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0);
  })[0];

  return {
    eventId: groupKey,
    title: bestTitleCandidate?.title || primary.title,
    routeIds,
    primaryRouteId: primary.routeId,
    primarySegmentIndex: primary.segmentIndex,
    confidence: confidence || null,
    state: allClearing ? 'clear-pending' : 'active',
    candidates,
  };
};

export const buildActiveDetourEvents = (activeDetours = {}) => {
  const visibleDetours = filterRiderVisibleDetours(activeDetours);
  const groups = [];

  Object.entries(visibleDetours).forEach(([routeId, detour]) => {
    getDetourCandidates(routeId, detour).forEach((candidate) => {
      const targetGroup = groups.find((group) => candidateBelongsInGroup(candidate, group));
      if (targetGroup) {
        targetGroup.candidates.push(candidate);
        return;
      }
      groups.push({
        groupKey: candidate.groupKey,
        candidates: [candidate],
      });
    });
  });

  return groups
    .map((group) => buildEventFromCandidates(group.groupKey, group.candidates))
    .sort((a, b) => a.title.localeCompare(b.title));
};

export const getActiveDetourEventCount = (activeDetours = {}) => buildActiveDetourEvents(activeDetours).length;
