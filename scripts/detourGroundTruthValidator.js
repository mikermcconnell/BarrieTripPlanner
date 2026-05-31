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
  const actualRouteId = String(detour?.routeId || expectedRouteId || '').trim();

  const checks = [
    makeCheck('route id matches', actualRouteId === expectedRouteId, {
      expectedRouteId,
      actualRouteId,
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
    checks.push(...validatePointSetAgainstPolyline({
      label: 'closed section',
      expectedPoints: closedExpected,
      actualPolyline: getClosedSectionPolyline(detour),
      maxDistanceMeters: closedMaxDistanceMeters,
    }));
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

async function fetchLiveActiveDetours({ apiKey, projectId, fetchImpl = fetch }) {
  if (!apiKey || !projectId) {
    throw new Error('Missing Firebase public config. Set EXPO_PUBLIC_FIREBASE_API_KEY and EXPO_PUBLIC_FIREBASE_PROJECT_ID.');
  }
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/activeDetours?key=${apiKey}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch activeDetours (${response.status})`);
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
  fetchLiveActiveDetours,
  getClosedSectionPolyline,
  getRenderableDetourPath,
  loadEnvFile,
  loadJsonFile,
  nearestPointOnPolyline,
  normalizePoint,
  normalizePolyline,
  validateDetourAgainstGroundTruth,
};
