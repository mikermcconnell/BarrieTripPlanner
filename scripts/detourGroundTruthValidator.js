const fs = require('fs');
const path = require('path');
const {
  haversineDistance,
  pointToPolylineDistance,
} = require('../api-proxy/geometry');

const DEFAULT_CLOSED_SECTION_MAX_DISTANCE_METERS = 120;
const DEFAULT_DETOUR_PATH_MAX_DISTANCE_METERS = 120;

function normalizePoint(point) {
  if (!point || typeof point !== 'object') return null;
  const latitude = Number(point.latitude ?? point.lat);
  const longitude = Number(point.longitude ?? point.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizePolyline(polyline) {
  if (!Array.isArray(polyline)) return [];
  return polyline.map(normalizePoint).filter(Boolean);
}

function segmentLengthMeters(start, end) {
  return haversineDistance(start.latitude, start.longitude, end.latitude, end.longitude);
}

function polylineLengthMeters(polyline) {
  const line = normalizePolyline(polyline);
  if (line.length < 2) return 0;
  return line.slice(1).reduce((total, point, index) => (
    total + segmentLengthMeters(line[index], point)
  ), 0);
}

function nearestPointOnPolyline(point, polyline) {
  const target = normalizePoint(point);
  const line = normalizePolyline(polyline);
  if (!target || line.length === 0) {
    return { distanceMeters: Infinity, distanceAlongMeters: null };
  }

  if (line.length === 1) {
    return {
      distanceMeters: haversineDistance(
        target.latitude,
        target.longitude,
        line[0].latitude,
        line[0].longitude
      ),
      distanceAlongMeters: 0,
    };
  }

  let best = { distanceMeters: Infinity, distanceAlongMeters: null };
  let cumulativeMeters = 0;

  for (let index = 0; index < line.length - 1; index += 1) {
    const start = line[index];
    const end = line[index + 1];
    const dx = end.longitude - start.longitude;
    const dy = end.latitude - start.latitude;
    const segmentMeters = segmentLengthMeters(start, end);
    const cosLat = Math.cos(((start.latitude + end.latitude) / 2) * (Math.PI / 180));
    const sdx = dx * cosLat;
    const sdy = dy;
    const denominator = sdx * sdx + sdy * sdy;
    const t = denominator === 0
      ? 0
      : Math.max(0, Math.min(1, (
        ((target.longitude - start.longitude) * cosLat * sdx) +
        ((target.latitude - start.latitude) * sdy)
      ) / denominator));
    const closest = {
      latitude: start.latitude + t * dy,
      longitude: start.longitude + t * dx,
    };
    const distanceMeters = haversineDistance(
      target.latitude,
      target.longitude,
      closest.latitude,
      closest.longitude
    );
    if (distanceMeters < best.distanceMeters) {
      best = {
        distanceMeters,
        distanceAlongMeters: cumulativeMeters + (segmentMeters * t),
      };
    }
    cumulativeMeters += segmentMeters;
  }

  return best;
}

function pickFirstRenderablePolyline(candidates) {
  for (const candidate of candidates) {
    const normalized = normalizePolyline(candidate);
    if (normalized.length >= 2) return normalized;
  }
  return [];
}

function getSegments(detour) {
  return Array.isArray(detour?.segments) ? detour.segments : [];
}

function getClosedSectionPolyline(detour) {
  const segmentCandidates = getSegments(detour).map((segment) => segment?.skippedSegmentPolyline);
  return pickFirstRenderablePolyline([
    ...segmentCandidates,
    detour?.skippedSegmentPolyline,
  ]);
}

function getRenderableDetourPath(detour) {
  const segments = getSegments(detour);
  const likelyCandidates = [
    ...segments.map((segment) => segment?.likelyDetourPolyline),
    detour?.likelyDetourPolyline,
  ];
  const likely = pickFirstRenderablePolyline(likelyCandidates);
  if (likely.length >= 2) return likely;

  const trustedInferredCandidates = [
    ...segments
      .filter((segment) => segment?.canShowDetourPath === true)
      .map((segment) => segment?.inferredDetourPolyline),
    detour?.canShowDetourPath === true ? detour?.inferredDetourPolyline : null,
  ];
  return pickFirstRenderablePolyline(trustedInferredCandidates);
}

function makeCheck(name, pass, details = {}) {
  return { name, pass: Boolean(pass), ...details };
}

function normalizeComparable(value) {
  return String(value ?? '').trim().toUpperCase();
}

function uniqueNormalized(values = []) {
  const seen = new Set();
  const result = [];
  values.map(normalizeComparable).filter(Boolean).forEach((value) => {
    if (seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

function sortedValues(values = []) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function getDetourRouteIds(detour) {
  return uniqueNormalized([
    detour?.routeId,
    detour?.eventPrimaryRouteId,
    detour?.primaryRouteId,
    ...(Array.isArray(detour?.routeIds) ? detour.routeIds : []),
    ...(Array.isArray(detour?.sharedRouteIds) ? detour.sharedRouteIds : []),
  ]);
}

function routeMatchesGroundTruth(detour, groundTruth) {
  const expectedRouteId = normalizeComparable(groundTruth?.routeId);
  if (!expectedRouteId) return true;
  return getDetourRouteIds(detour).includes(expectedRouteId);
}

function extractCodesFromValue(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(extractCodesFromValue);
  if (typeof value === 'object') {
    return [
      value.code,
      value.stopCode,
      value.stop_code,
      value.id,
      value.stopId,
      value.stop_id,
    ].filter((item) => item != null);
  }
  return [value];
}

function collectValuesFromFields(detour, fieldNames = []) {
  const targets = [
    detour,
    ...(Array.isArray(detour?.segments) ? detour.segments : []),
  ].filter(Boolean);

  return targets.flatMap((target) => (
    fieldNames.flatMap((fieldName) => extractCodesFromValue(target?.[fieldName]))
  ));
}

const SKIPPED_STOP_CODE_FIELDS = [
  'skippedStopCodes',
  'skippedStopIds',
  'skippedStops',
];

const NOTICE_STOP_CODE_FIELDS = [
  'noticeTemporaryStopCodes',
  'noticeTemporaryStopIds',
  'noticeTemporaryStops',
  'noticeActiveStopCodes',
  'noticeActiveStopIds',
  'noticeActiveStops',
  'noticeClosureStopCodes',
  'noticeClosureStopIds',
  'noticeClosureStops',
];

function collectSkippedStopCodes(detour) {
  return uniqueNormalized(collectValuesFromFields(detour, SKIPPED_STOP_CODE_FIELDS));
}

function collectNoticeStopCodes(detour) {
  return uniqueNormalized(collectValuesFromFields(detour, NOTICE_STOP_CODE_FIELDS));
}

function collectNoticeSourceIds(detour) {
  return uniqueNormalized(collectValuesFromFields(detour, [
    'sourceNewsId',
    'sourceNewsIds',
    'noticeSourceId',
    'noticeSourceIds',
    'noticeStopImpactSourceNewsId',
    'noticeStopImpactSourceNewsIds',
  ]));
}

function getDetourIdentityValues(detour) {
  return uniqueNormalized([
    detour?.id,
    detour?.eventId,
    detour?.detourEventId,
    detour?.sharedDetourEventId,
  ]);
}

function getExpectedEventId(groundTruth) {
  return normalizeComparable(
    groundTruth?.eventId ??
    groundTruth?.detourEventId ??
    groundTruth?.expectedEventId
  );
}

function unwrapMaybeFirestoreDocument(document) {
  if (!document || typeof document !== 'object') return null;
  const id = document.id || (typeof document.name === 'string' ? document.name.split('/').pop() : null);
  if (document.fields && typeof document.fields === 'object') {
    return { id, ...unwrapFirestoreFields(document.fields) };
  }
  if (document.data && typeof document.data === 'object') {
    return { id, ...document.data };
  }
  return { ...document, ...(id ? { id } : {}) };
}

function looksLikeDetourDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Boolean(
    value.routeId ||
    value.eventPrimaryRouteId ||
    value.eventId ||
    value.detourEventId ||
    value.skippedSegmentPolyline ||
    value.entryPoint ||
    value.exitPoint ||
    Array.isArray(value.segments)
  );
}

function normalizeActiveDetourEntries(payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.map(unwrapMaybeFirestoreDocument).filter(looksLikeDetourDocument);
  }

  if (Array.isArray(payload.docs)) {
    return payload.docs.map(unwrapMaybeFirestoreDocument).filter(looksLikeDetourDocument);
  }

  if (Array.isArray(payload.documents)) {
    return payload.documents.map(unwrapMaybeFirestoreDocument).filter(looksLikeDetourDocument);
  }

  if (payload.activeDetours) {
    return normalizeActiveDetourEntries(payload.activeDetours);
  }

  if (payload.activeDetourEventsV2) {
    return normalizeActiveDetourEntries(payload.activeDetourEventsV2);
  }

  if (typeof payload === 'object') {
    return Object.entries(payload)
      .map(([id, value]) => (
        value && typeof value === 'object' && !Array.isArray(value)
          ? { id: value.id ?? id, ...value }
          : null
      ))
      .filter(looksLikeDetourDocument);
  }

  return [];
}

function scoreDetourAgainstGroundTruth(detour, groundTruth) {
  const closedExpected = [
    normalizePoint(groundTruth?.closedSection?.start),
    normalizePoint(groundTruth?.closedSection?.end),
  ].filter(Boolean);
  const actualPolyline = getClosedSectionPolyline(detour);
  if (closedExpected.length === 0 || actualPolyline.length < 2) return 0;
  return closedExpected.reduce((total, point) => (
    total + nearestPointOnPolyline(point, actualPolyline).distanceMeters
  ), 0);
}

function selectDetourForGroundTruth(activeDetoursPayload, groundTruth) {
  const entries = normalizeActiveDetourEntries(activeDetoursPayload);
  const expectedEventId = getExpectedEventId(groundTruth);

  if (expectedEventId) {
    const byEventId = entries.find((detour) => (
      getDetourIdentityValues(detour).includes(expectedEventId)
    ));
    if (byEventId) return byEventId;
  }

  const routeMatches = entries.filter((detour) => routeMatchesGroundTruth(detour, groundTruth));
  if (routeMatches.length <= 1) return routeMatches[0] || null;

  return routeMatches
    .map((detour) => ({ detour, score: scoreDetourAgainstGroundTruth(detour, groundTruth) }))
    .sort((a, b) => a.score - b.score)[0]?.detour || null;
}

function validatePointSetAgainstPolyline({
  label,
  expectedPoints,
  actualPolyline,
  maxDistanceMeters,
  requireForwardOrder = false,
}) {
  if (!actualPolyline || actualPolyline.length < 2) {
    return [makeCheck(`${label}: actual polyline exists`, false, {
      expected: 'at least 2 points',
      actualPointCount: actualPolyline?.length ?? 0,
    })];
  }

  const checks = [makeCheck(`${label}: actual polyline exists`, true, {
    actualPointCount: actualPolyline.length,
  })];
  let previousDistanceAlongMeters = -Infinity;

  expectedPoints.forEach((point, index) => {
    const nearest = nearestPointOnPolyline(point, actualPolyline);
    checks.push(makeCheck(`${label}: expected point ${index + 1} is nearby`, (
      nearest.distanceMeters <= maxDistanceMeters
    ), {
      distanceMeters: Number(nearest.distanceMeters.toFixed(1)),
      maxDistanceMeters,
      expectedPoint: normalizePoint(point),
    }));

    if (requireForwardOrder && Number.isFinite(nearest.distanceAlongMeters)) {
      checks.push(makeCheck(`${label}: expected point ${index + 1} is in path order`, (
        nearest.distanceAlongMeters + 1 >= previousDistanceAlongMeters
      ), {
        distanceAlongMeters: Number(nearest.distanceAlongMeters.toFixed(1)),
      }));
      previousDistanceAlongMeters = Math.max(previousDistanceAlongMeters, nearest.distanceAlongMeters);
    }
  });

  return checks;
}

function validateDetourAgainstGroundTruth(detour, groundTruth) {
  const tolerances = groundTruth?.tolerances || {};
  const closedMaxDistanceMeters = Number(
    tolerances.closedSectionMaxDistanceMeters ?? DEFAULT_CLOSED_SECTION_MAX_DISTANCE_METERS
  );
  const pathMaxDistanceMeters = Number(
    tolerances.detourPathMaxDistanceMeters ?? DEFAULT_DETOUR_PATH_MAX_DISTANCE_METERS
  );
  const expectedRouteId = String(groundTruth?.routeId || '').trim();
  const actualRouteIds = getDetourRouteIds(detour);
  const actualRouteId = actualRouteIds[0] || null;

  const checks = [
    makeCheck('detour exists', Boolean(detour), {}),
    makeCheck('route id matches', routeMatchesGroundTruth(detour, groundTruth), {
      expectedRouteId,
      actualRouteIds,
    }),
  ];

  if (groundTruth?.status === 'active') {
    const state = String(detour?.state || '').toLowerCase();
    checks.push(makeCheck('detour is active or clear-pending', (
      state === 'active' || state === 'clear-pending'
    ), { actualState: detour?.state ?? null }));
    checks.push(makeCheck('detour is rider-visible', detour?.riderVisible !== false, {
      riderVisible: detour?.riderVisible ?? null,
      riderVisibilityReason: detour?.riderVisibilityReason ?? null,
    }));
  }

  const closedExpected = [
    normalizePoint(groundTruth?.closedSection?.start),
    normalizePoint(groundTruth?.closedSection?.end),
  ].filter(Boolean);
  if (closedExpected.length > 0) {
    const closedSectionPolyline = getClosedSectionPolyline(detour);
    checks.push(...validatePointSetAgainstPolyline({
      label: 'closed section',
      expectedPoints: closedExpected,
      actualPolyline: closedSectionPolyline,
      maxDistanceMeters: closedMaxDistanceMeters,
    }));
    const closedSectionMaxLengthMeters = Number(
      groundTruth?.closedSection?.maxLengthMeters ??
      tolerances.closedSectionMaxLengthMeters
    );
    if (Number.isFinite(closedSectionMaxLengthMeters) && closedSectionMaxLengthMeters > 0) {
      const actualLengthMeters = polylineLengthMeters(closedSectionPolyline);
      checks.push(makeCheck('closed section: length is within maximum', (
        actualLengthMeters <= closedSectionMaxLengthMeters
      ), {
        actualLengthMeters: Number(actualLengthMeters.toFixed(1)),
        maxLengthMeters: closedSectionMaxLengthMeters,
      }));
    }
  }

  const detourPathExpected = normalizePolyline(groundTruth?.detourPath);
  if (detourPathExpected.length > 0) {
    checks.push(...validatePointSetAgainstPolyline({
      label: 'detour path',
      expectedPoints: detourPathExpected,
      actualPolyline: getRenderableDetourPath(detour),
      maxDistanceMeters: pathMaxDistanceMeters,
      requireForwardOrder: true,
    }));
  }

  if (Array.isArray(groundTruth?.expectedSkippedStopCodes)) {
    const expectedSkippedStopCodes = sortedValues(uniqueNormalized(groundTruth.expectedSkippedStopCodes));
    const actualSkippedStopCodes = sortedValues(collectSkippedStopCodes(detour));
    checks.push(makeCheck('skipped stop codes match expected', (
      JSON.stringify(actualSkippedStopCodes) === JSON.stringify(expectedSkippedStopCodes)
    ), {
      expectedSkippedStopCodes,
      actualSkippedStopCodes,
    }));
  }

  const disallowedNoticeSourceIds = uniqueNormalized(groundTruth?.disallowedNoticeSourceIds || []);
  if (disallowedNoticeSourceIds.length > 0) {
    const actualNoticeSourceIds = collectNoticeSourceIds(detour);
    const presentDisallowedNoticeSourceIds = actualNoticeSourceIds.filter((id) => (
      disallowedNoticeSourceIds.includes(id)
    ));
    checks.push(makeCheck('disallowed notice source ids are absent', (
      presentDisallowedNoticeSourceIds.length === 0
    ), {
      disallowedNoticeSourceIds,
      presentDisallowedNoticeSourceIds,
    }));
  }

  const disallowedStopCodes = uniqueNormalized(groundTruth?.disallowedStopCodes || []);
  if (disallowedStopCodes.length > 0) {
    const actualStopCodes = uniqueNormalized([
      ...collectSkippedStopCodes(detour),
      ...collectNoticeStopCodes(detour),
    ]);
    const presentDisallowedStopCodes = actualStopCodes.filter((code) => disallowedStopCodes.includes(code));
    checks.push(makeCheck('disallowed stop codes are absent', (
      presentDisallowedStopCodes.length === 0
    ), {
      disallowedStopCodes,
      presentDisallowedStopCodes,
    }));
  }

  const failures = checks.filter((check) => !check.pass);
  return {
    id: groundTruth?.id ?? expectedRouteId,
    routeId: expectedRouteId,
    pass: failures.length === 0,
    checks,
    failures,
  };
}

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadEnvFile(envPath = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(envPath)) return {};
  return fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
      if (!match) return env;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      return env;
    }, {});
}

function unwrapFirestoreValue(value) {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(unwrapFirestoreValue);
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, nestedValue]) => [
        key,
        unwrapFirestoreValue(nestedValue),
      ])
    );
  }
  return undefined;
}

function unwrapFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, unwrapFirestoreValue(value)])
  );
}

function normalizeActiveDetourCollectionName(value) {
  const collectionName = String(value || '').trim();
  return collectionName || 'activeDetours';
}

async function fetchLiveActiveDetours({
  apiKey,
  projectId,
  collectionName = 'activeDetours',
  fetchImpl = fetch,
}) {
  if (!apiKey || !projectId) {
    throw new Error('Missing Firebase public config. Set EXPO_PUBLIC_FIREBASE_API_KEY and EXPO_PUBLIC_FIREBASE_PROJECT_ID.');
  }
  const activeCollection = normalizeActiveDetourCollectionName(collectionName);
  const encodedCollection = encodeURIComponent(activeCollection);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encodedCollection}?key=${apiKey}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${activeCollection} (${response.status})`);
  }
  const payload = await response.json();
  return Object.fromEntries((payload.documents || []).map((document) => {
    const id = document.name.split('/').pop();
    return [id, { routeId: id, ...unwrapFirestoreFields(document.fields || {}) }];
  }));
}

module.exports = {
  DEFAULT_CLOSED_SECTION_MAX_DISTANCE_METERS,
  DEFAULT_DETOUR_PATH_MAX_DISTANCE_METERS,
  collectNoticeSourceIds,
  collectNoticeStopCodes,
  collectSkippedStopCodes,
  fetchLiveActiveDetours,
  getClosedSectionPolyline,
  getRenderableDetourPath,
  loadEnvFile,
  loadJsonFile,
  nearestPointOnPolyline,
  normalizeActiveDetourEntries,
  normalizeActiveDetourCollectionName,
  normalizePoint,
  normalizePolyline,
  polylineLengthMeters,
  selectDetourForGroundTruth,
  validateDetourAgainstGroundTruth,
};
