const { getStaticData } = require('../gtfsLoader');
const { getDb } = require('../firebaseAdmin');
const { matchDetourGeometry } = require('../detourRoadMatcher');
const { haversineDistance, pointToPolylineDistance } = require('../geometry');

const DEFAULT_OFFSET_METERS = 275;
const DEFAULT_ROAD_MATCH_OFFSET_CANDIDATES_METERS = [275, 600, 1000, 1500, 1800];
const DEFAULT_ROUTE_ID = null;

function isFiniteCoordinate(point) {
  return (
    point &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude))
  );
}

function normalizePoint(point) {
  return {
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
  };
}

function offsetPoint(point, offsetMeters = DEFAULT_OFFSET_METERS) {
  const normalized = normalizePoint(point);
  return {
    latitude: normalized.latitude + offsetMeters / 111_320,
    longitude: normalized.longitude,
  };
}

function selectRouteAndShape(staticData, requestedRouteId = DEFAULT_ROUTE_ID) {
  const routeShapeMapping = staticData?.routeShapeMapping;
  const shapes = staticData?.shapes;

  if (!(routeShapeMapping instanceof Map) || !(shapes instanceof Map)) {
    throw new Error('Static GTFS route/shape data is unavailable');
  }

  const availableRouteIds = Array.from(routeShapeMapping.keys()).sort();
  if (availableRouteIds.length === 0) {
    throw new Error('No routes are available in static GTFS data');
  }

  const routeId = requestedRouteId && routeShapeMapping.has(String(requestedRouteId))
    ? String(requestedRouteId)
    : availableRouteIds[0];

  const shapeIds = routeShapeMapping.get(routeId) || [];
  const shapeId = shapeIds.find((id) => Array.isArray(shapes.get(id)) && shapes.get(id).length >= 4);
  if (!shapeId) {
    throw new Error(`Route ${routeId} has no usable shape for simulation`);
  }

  const shape = shapes.get(shapeId).filter(isFiniteCoordinate).map(normalizePoint);
  if (shape.length < 4) {
    throw new Error(`Route ${routeId} shape ${shapeId} is too short for simulation`);
  }

  return {
    routeId,
    shapeId,
    shape,
    availableRouteIds,
  };
}

function buildSyntheticGeometry(shape, shapeId, offsetMeters = DEFAULT_OFFSET_METERS) {
  const lastIndex = shape.length - 1;
  const startIndex = Math.max(1, Math.floor(lastIndex * 0.30));
  const endIndex = Math.min(lastIndex - 1, Math.max(startIndex + 2, Math.floor(lastIndex * 0.58)));
  const middleIndex = Math.floor((startIndex + endIndex) / 2);

  const skippedSegmentPolyline = shape.slice(startIndex, endIndex + 1);
  const entryPoint = skippedSegmentPolyline[0];
  const exitPoint = skippedSegmentPolyline[skippedSegmentPolyline.length - 1];
  const inferredDetourPolyline = [
    entryPoint,
    offsetPoint(shape[startIndex], offsetMeters),
    offsetPoint(shape[middleIndex], offsetMeters),
    offsetPoint(shape[endIndex], offsetMeters),
    exitPoint,
  ];
  const likelyDetourPolyline = inferredDetourPolyline;

  return {
    shapeId,
    entryPoint,
    exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames: [],
    roadMatchConfidence: null,
    roadMatchSource: 'dev-simulation',
    detourPathLabel: 'Likely detour path',
    confidence: 'medium',
    evidencePointCount: inferredDetourPolyline.length,
    lastEvidenceAt: new Date(),
    segments: [
      {
        segmentId: 'simulated-1',
        shapeId,
        entryPoint,
        exitPoint,
        skippedSegmentPolyline,
        inferredDetourPolyline,
        likelyDetourPolyline,
        likelyDetourRoadNames: [],
        roadMatchConfidence: null,
        roadMatchSource: 'dev-simulation',
        detourPathLabel: 'Likely detour path',
        confidence: 'medium',
        evidencePointCount: inferredDetourPolyline.length,
        lastEvidenceAt: new Date(),
      },
    ],
  };
}

function createSimulatedDetourDocument({ routeId, shapeId, geometry, durationMinutes = 30 }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(1, Number(durationMinutes) || 30) * 60_000);

  return {
    routeId,
    detectedAt: now,
    lastSeenAt: now,
    updatedAt: now.getTime(),
    triggerVehicleId: 'simulated-bus',
    vehicleCount: 1,
    state: 'active',
    isPersistent: false,
    simulated: true,
    source: 'dev-detour-simulation',
    expiresAt,
    shapeId,
    ...geometry,
  };
}

function parsePositiveOffset(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOffsetCandidates(value) {
  return String(value || '')
    .split(',')
    .map((item) => parsePositiveOffset(item.trim()))
    .filter((item) => item !== null);
}

function getSimulationOffsetCandidates(options = {}, env = process.env) {
  const requestedOffset = parsePositiveOffset(options.offsetMeters);
  if (requestedOffset) return [requestedOffset];

  const configured = parseOffsetCandidates(env.DETOUR_SIMULATION_OFFSET_CANDIDATES_METERS);
  const candidates = configured.length > 0
    ? configured
    : DEFAULT_ROAD_MATCH_OFFSET_CANDIDATES_METERS;

  return Array.from(new Set(candidates)).filter((item) => item > 0);
}

function canTryRoadMatchCandidates(env = process.env) {
  return (
    env.DETOUR_ROAD_MATCHING_ENABLED === 'true' &&
    Boolean(String(env.DETOUR_ROAD_MATCHING_BASE_URL || '').trim())
  );
}

function isRoadMatchedGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return false;
  if (geometry.roadMatchSource && geometry.roadMatchSource !== 'dev-simulation') {
    return true;
  }
  return Array.isArray(geometry.segments) && geometry.segments.some((segment) => (
    segment?.roadMatchSource && segment.roadMatchSource !== 'dev-simulation'
  ));
}

function getPrimarySimulationSegment(geometry) {
  return Array.isArray(geometry?.segments) && geometry.segments.length > 0
    ? geometry.segments[0]
    : geometry;
}

function getLikelySimulationPath(geometry) {
  const segment = getPrimarySimulationSegment(geometry);
  return Array.isArray(segment?.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 2
    ? segment.likelyDetourPolyline
    : Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2
      ? segment.inferredDetourPolyline
      : [];
}

function getSkippedSimulationPath(geometry) {
  const segment = getPrimarySimulationSegment(geometry);
  return Array.isArray(segment?.skippedSegmentPolyline) ? segment.skippedSegmentPolyline : [];
}

function getPolylineLengthMeters(polyline = []) {
  let length = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    length += haversineDistance(
      polyline[index - 1].latitude,
      polyline[index - 1].longitude,
      polyline[index].latitude,
      polyline[index].longitude
    );
  }
  return length;
}

function getNearClosedSegmentRatio(detourPath = [], skippedPath = []) {
  if (detourPath.length < 3 || skippedPath.length < 2) return 0;

  const maxSamples = 24;
  const step = Math.max(1, Math.floor(detourPath.length / maxSamples));
  let sampleCount = 0;
  let nearCount = 0;

  for (let index = step; index < detourPath.length - step; index += step) {
    sampleCount += 1;
    if (pointToPolylineDistance(detourPath[index], skippedPath) <= 50) {
      nearCount += 1;
    }
  }

  return sampleCount > 0 ? nearCount / sampleCount : 0;
}

function scoreRoadMatchedSimulationGeometry(geometry) {
  const detourPath = getLikelySimulationPath(geometry);
  const skippedPath = getSkippedSimulationPath(geometry);
  const detourLength = getPolylineLengthMeters(detourPath);
  const skippedLength = Math.max(1, getPolylineLengthMeters(skippedPath));
  const lengthRatio = detourLength / skippedLength;
  const nearClosedRatio = getNearClosedSegmentRatio(detourPath, skippedPath);

  return lengthRatio + nearClosedRatio * 3;
}

async function buildMatchedSimulationGeometry({ shape, shapeId, options = {}, env, matchGeometry }) {
  const offsets = canTryRoadMatchCandidates(env)
    ? getSimulationOffsetCandidates(options, env)
    : [parsePositiveOffset(options.offsetMeters) || DEFAULT_OFFSET_METERS];

  let fallbackGeometry = null;
  let bestRoadMatchedGeometry = null;
  let bestRoadMatchedScore = Infinity;

  for (const offsetMeters of offsets) {
    const candidate = buildSyntheticGeometry(shape, shapeId, offsetMeters);
    let matched = candidate;

    try {
      matched = await matchGeometry(candidate, { env });
    } catch (err) {
      console.warn('[detourSimulation] Road matching skipped:', err.message);
    }

    if (!fallbackGeometry) {
      fallbackGeometry = matched;
    }

    if (isRoadMatchedGeometry(matched)) {
      const score = scoreRoadMatchedSimulationGeometry(matched);
      if (score < bestRoadMatchedScore) {
        bestRoadMatchedScore = score;
        bestRoadMatchedGeometry = matched;
      }
    }
  }

  return bestRoadMatchedGeometry || fallbackGeometry || buildSyntheticGeometry(shape, shapeId, DEFAULT_OFFSET_METERS);
}

function createDetourSimulationOps({
  env = process.env,
  loadStaticData = getStaticData,
  getFirestore = getDb,
  matchGeometry = matchDetourGeometry,
} = {}) {
  function isEnabled() {
    return env.NODE_ENV !== 'production' && env.DETOUR_SIMULATION_ENABLED === 'true';
  }

  function disabledResult() {
    return {
      status: 403,
      body: {
        ok: false,
        enabled: false,
        error: 'Detour simulation is disabled. Set DETOUR_SIMULATION_ENABLED=true outside production.',
      },
    };
  }

  async function create(options = {}) {
    if (!isEnabled()) return disabledResult();

    const db = getFirestore();
    if (!db) {
      return {
        status: 500,
        body: {
          ok: false,
          enabled: true,
          error: 'Firestore is not configured, so the simulated detour cannot be published.',
        },
      };
    }

    const staticData = await loadStaticData();
    const { routeId, shapeId, shape, availableRouteIds } = selectRouteAndShape(staticData, options.routeId);
    const geometry = await buildMatchedSimulationGeometry({
      shape,
      shapeId,
      options,
      env,
      matchGeometry,
    });
    const doc = createSimulatedDetourDocument({
      routeId,
      shapeId,
      geometry,
      durationMinutes: options.durationMinutes,
    });

    await db.collection('activeDetours').doc(routeId).set(doc, { merge: true });

    return {
      status: 200,
      body: {
        ok: true,
        enabled: true,
        simulated: true,
        routeId,
        shapeId,
        segmentCount: doc.segments.length,
        roadMatchSource: doc.roadMatchSource || null,
        roadMatchConfidence: doc.roadMatchConfidence || null,
        expiresAt: doc.expiresAt.toISOString(),
        availableRouteIds,
        message: `Simulated detour published for route ${routeId}.`,
      },
    };
  }

  async function clear(options = {}) {
    if (!isEnabled()) return disabledResult();

    const routeId = options.routeId ? String(options.routeId) : null;
    if (!routeId) {
      return {
        status: 400,
        body: {
          ok: false,
          error: 'routeId is required to clear a simulated detour.',
        },
      };
    }

    const db = getFirestore();
    if (!db) {
      return {
        status: 500,
        body: {
          ok: false,
          enabled: true,
          error: 'Firestore is not configured, so the simulated detour cannot be cleared.',
        },
      };
    }

    await db.collection('activeDetours').doc(routeId).delete();

    return {
      status: 200,
      body: {
        ok: true,
        enabled: true,
        routeId,
        message: `Simulated detour cleared for route ${routeId}.`,
      },
    };
  }

  return {
    isEnabled,
    create,
    clear,
  };
}

module.exports = {
  buildMatchedSimulationGeometry,
  buildSyntheticGeometry,
  createDetourSimulationOps,
  getSimulationOffsetCandidates,
  selectRouteAndShape,
};
