'use strict';

const {
  buildCumulativeDistances,
  enrichDetourMapStopImpacts,
} = require('../detourGeometry');
const { projectCoordinateToRoute } = require('../detour/projection');
const { haversineDistance } = require('../geometry');

const DEFAULT_OFF_ROUTE_THRESHOLD_METERS = 75;
const DEFAULT_ON_ROUTE_CLEAR_THRESHOLD_METERS = 40;
const MIN_OFF_ROUTE_POINTS = 3;
const MIN_UNIQUE_SIGNATURES = 2;
const MIN_SAFE_SPAN_METERS = 100;
const GEOMETRY_CLUSTER_GAP_METERS = positiveNumber(
  process.env.DETOUR_V2_GEOMETRY_CLUSTER_GAP_METERS,
  1000
);
const INFERRED_DETOUR_POINT_DEDUPE_METERS = positiveNumber(
  process.env.DETOUR_V2_INFERRED_POINT_DEDUPE_METERS,
  20
);
const MAX_INFERRED_DETOUR_POINTS = positiveInteger(
  process.env.DETOUR_V2_MAX_INFERRED_POINTS,
  16
);
const CLEAR_MIN_TRAVERSAL_RATIO = 0.6;
const CLEAR_MIN_TRAVERSAL_METERS = 100;

function positiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toMillis(value, fallback = Date.now()) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getVehicleSampleTimeMs(vehicle) {
  if (vehicle?.timestampMs != null) {
    const value = Number(vehicle.timestampMs);
    return Number.isFinite(value) ? value : Date.now();
  }
  return toMillis(vehicle?.timestamp, Date.now());
}

function normalizeCoordinate(point) {
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizeRouteId(routeId) {
  return String(routeId || '').trim();
}

function evidenceSignature(vehicle = {}) {
  return String(vehicle.tripId || vehicle.id || vehicle.vehicleId || '').trim();
}

function vehicleId(vehicle = {}) {
  return String(vehicle.id || vehicle.vehicleId || vehicle.tripId || '').trim();
}

function sampleKey(vehicle, coordinate, timestampMs) {
  return [
    vehicleId(vehicle),
    evidenceSignature(vehicle),
    normalizeRouteId(vehicle.routeId),
    timestampMs,
    coordinate.latitude.toFixed(6),
    coordinate.longitude.toFixed(6),
  ].join('|');
}

function getPointAtProgress(polyline, cumulative, progressMeters) {
  if (!Array.isArray(polyline) || polyline.length === 0) return null;
  if (progressMeters <= 0) return polyline[0];
  const total = cumulative[cumulative.length - 1] || 0;
  if (progressMeters >= total) return polyline[polyline.length - 1];

  for (let index = 1; index < cumulative.length; index += 1) {
    if (cumulative[index] < progressMeters) continue;
    const prev = polyline[index - 1];
    const next = polyline[index];
    const segmentStart = cumulative[index - 1];
    const segmentLength = cumulative[index] - segmentStart;
    const ratio = segmentLength > 0 ? (progressMeters - segmentStart) / segmentLength : 0;
    return {
      latitude: prev.latitude + (next.latitude - prev.latitude) * ratio,
      longitude: prev.longitude + (next.longitude - prev.longitude) * ratio,
    };
  }

  return polyline[polyline.length - 1];
}

function getShapeSpan(polyline, startProgress, endProgress) {
  const cumulative = buildCumulativeDistances(polyline);
  const start = getPointAtProgress(polyline, cumulative, startProgress);
  const end = getPointAtProgress(polyline, cumulative, endProgress);
  if (!start || !end) return [];

  const points = [start];
  for (let index = 1; index < polyline.length - 1; index += 1) {
    if (cumulative[index] > startProgress && cumulative[index] < endProgress) {
      points.push(polyline[index]);
    }
  }
  points.push(end);
  return points;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function coordinateDistanceMeters(a, b) {
  if (!a || !b) return Infinity;
  return haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
}

function getPointStats(points = []) {
  const progressValues = points
    .map((point) => Number(point.progressMeters))
    .filter(Number.isFinite);
  const minProgressMeters = progressValues.length > 0 ? Math.min(...progressValues) : Infinity;
  const maxProgressMeters = progressValues.length > 0 ? Math.max(...progressValues) : -Infinity;
  const timestamps = points
    .map((point) => Number(point.timestampMs))
    .filter(Number.isFinite);

  return {
    points,
    pointCount: points.length,
    signatureCount: new Set(points.map((point) => point.signature).filter(Boolean)).size,
    minProgressMeters,
    maxProgressMeters,
    spanMeters: maxProgressMeters - minProgressMeters,
    lastEvidenceAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

function splitPointsByProgress(points = []) {
  const sorted = points
    .filter((point) => point?.coordinate && Number.isFinite(point.progressMeters))
    .sort((a, b) => {
      if (a.progressMeters !== b.progressMeters) return a.progressMeters - b.progressMeters;
      return (a.timestampMs || 0) - (b.timestampMs || 0);
    });
  const clusters = [];
  let current = [];

  for (const point of sorted) {
    const previous = current[current.length - 1];
    if (
      previous &&
      point.progressMeters - previous.progressMeters > GEOMETRY_CLUSTER_GAP_METERS
    ) {
      clusters.push(current);
      current = [];
    }
    current.push(point);
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

function isPublishableGeometryStats(stats) {
  return stats.pointCount >= MIN_OFF_ROUTE_POINTS &&
    stats.signatureCount >= MIN_UNIQUE_SIGNATURES &&
    stats.spanMeters >= MIN_SAFE_SPAN_METERS;
}

function selectGeometryEvidence(candidate) {
  const allStats = getPointStats(candidate.points || []);
  const validClusters = splitPointsByProgress(candidate.points || [])
    .map(getPointStats)
    .filter(isPublishableGeometryStats)
    .sort((a, b) => {
      if ((b.lastEvidenceAt || 0) !== (a.lastEvidenceAt || 0)) {
        return (b.lastEvidenceAt || 0) - (a.lastEvidenceAt || 0);
      }
      if (b.signatureCount !== a.signatureCount) return b.signatureCount - a.signatureCount;
      if (b.pointCount !== a.pointCount) return b.pointCount - a.pointCount;
      return b.spanMeters - a.spanMeters;
    });

  return validClusters[0] || allStats;
}

function thinPolyline(polyline, maxPoints = MAX_INFERRED_DETOUR_POINTS) {
  if (!Array.isArray(polyline) || polyline.length <= maxPoints) return polyline;
  const result = [];
  const lastIndex = polyline.length - 1;

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round((index * lastIndex) / (maxPoints - 1));
    const point = polyline[sourceIndex];
    const previous = result[result.length - 1];
    if (!previous || coordinateDistanceMeters(previous, point) > 0) {
      result.push(point);
    }
  }

  return result;
}

function buildInferredDetourPolyline(points = []) {
  const sorted = points
    .filter((point) => point?.coordinate && Number.isFinite(point.progressMeters))
    .sort((a, b) => {
      if (a.progressMeters !== b.progressMeters) return a.progressMeters - b.progressMeters;
      return (a.timestampMs || 0) - (b.timestampMs || 0);
    });
  const deduped = [];

  for (const point of sorted) {
    const coordinate = cloneJson(point.coordinate);
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      coordinateDistanceMeters(previous, coordinate) <= INFERRED_DETOUR_POINT_DEDUPE_METERS
    ) {
      continue;
    }
    deduped.push(coordinate);
  }

  return thinPolyline(deduped);
}

function makeCandidate(routeId, shapeId) {
  return {
    routeId,
    shapeId,
    points: [],
    signatures: new Set(),
    vehicleIds: new Set(),
    minProgressMeters: Infinity,
    maxProgressMeters: -Infinity,
    firstSeenAt: null,
    lastSeenAt: null,
    triggerVehicleId: null,
  };
}

function addPointToCandidate(candidate, point) {
  candidate.points.push(point);
  candidate.signatures.add(point.signature);
  candidate.vehicleIds.add(point.vehicleId);
  candidate.minProgressMeters = Math.min(candidate.minProgressMeters, point.progressMeters);
  candidate.maxProgressMeters = Math.max(candidate.maxProgressMeters, point.progressMeters);
  candidate.firstSeenAt = candidate.firstSeenAt == null
    ? point.timestampMs
    : Math.min(candidate.firstSeenAt, point.timestampMs);
  candidate.lastSeenAt = Math.max(candidate.lastSeenAt || 0, point.timestampMs);
  candidate.triggerVehicleId = candidate.triggerVehicleId || point.vehicleId;
}

function hasEnoughEvidence(candidate) {
  return candidate.points.length >= MIN_OFF_ROUTE_POINTS &&
    candidate.signatures.size >= MIN_UNIQUE_SIGNATURES;
}

function buildGeometry(candidate, shapes) {
  const geometryEvidence = selectGeometryEvidence(candidate);
  const polyline = shapes.get(candidate.shapeId);
  const startProgress = geometryEvidence.minProgressMeters;
  const endProgress = geometryEvidence.maxProgressMeters;
  const hasSafeProgress =
    Number.isFinite(startProgress) &&
    Number.isFinite(endProgress) &&
    endProgress >= startProgress;
  const spanMeters = hasSafeProgress ? endProgress - startProgress : 0;
  const skippedSegmentPolyline = hasSafeProgress && Array.isArray(polyline) && polyline.length >= 2
    ? getShapeSpan(polyline, startProgress, endProgress)
    : [];
  const inferredDetourPolyline = buildInferredDetourPolyline(geometryEvidence.points);
  const entryPoint = skippedSegmentPolyline[0] || null;
  const exitPoint = skippedSegmentPolyline[skippedSegmentPolyline.length - 1] || null;
  const evidencePointCount = geometryEvidence.pointCount || candidate.points.length;
  const lastEvidenceAt = geometryEvidence.lastEvidenceAt || candidate.lastSeenAt;
  const canShowDetourPath =
    spanMeters >= MIN_SAFE_SPAN_METERS &&
    skippedSegmentPolyline.length >= 2 &&
    inferredDetourPolyline.length >= MIN_OFF_ROUTE_POINTS &&
    Boolean(entryPoint && exitPoint);

  return {
    shapeId: candidate.shapeId,
    skippedSegmentPolyline: canShowDetourPath ? skippedSegmentPolyline : null,
    inferredDetourPolyline: canShowDetourPath ? inferredDetourPolyline : null,
    likelyDetourPolyline: null,
    canShowDetourPath,
    entryPoint,
    exitPoint,
    confidence: candidate.signatures.size >= 3 || candidate.points.length >= 5 ? 'high' : 'medium',
    evidencePointCount,
    lastEvidenceAt,
    startProgressMeters: Number.isFinite(startProgress) ? startProgress : null,
    endProgressMeters: Number.isFinite(endProgress) ? endProgress : null,
    segments: [{
      shapeId: candidate.shapeId,
      skippedSegmentPolyline: canShowDetourPath ? skippedSegmentPolyline : null,
      inferredDetourPolyline: canShowDetourPath ? inferredDetourPolyline : null,
      likelyDetourPolyline: null,
      canShowDetourPath,
      entryPoint,
      exitPoint,
      confidence: candidate.signatures.size >= 3 || candidate.points.length >= 5 ? 'high' : 'medium',
      evidencePointCount,
      lastEvidenceAt,
      startProgressMeters: Number.isFinite(startProgress) ? startProgress : null,
      endProgressMeters: Number.isFinite(endProgress) ? endProgress : null,
    }],
  };
}

function buildDetour(candidate, shapes) {
  const geometry = buildGeometry(candidate, shapes);
  const riderVisible = geometry.canShowDetourPath === true;
  return {
    routeId: candidate.routeId,
    detourVersion: 'v2',
    detectedAt: new Date(candidate.firstSeenAt),
    lastSeenAt: new Date(candidate.lastSeenAt),
    triggerVehicleId: candidate.triggerVehicleId,
    vehiclesOffRoute: new Set(candidate.vehicleIds),
    matchedVehicleIds: [...candidate.vehicleIds],
    vehicleCount: candidate.signatures.size,
    uniqueVehicleCount: candidate.signatures.size,
    currentVehicleCount: candidate.vehicleIds.size,
    state: 'active',
    confidence: geometry.confidence,
    riderVisible,
    riderVisibilityReason: riderVisible ? 'v2-confirmed' : 'insufficient-geometry',
    staleForReview: !riderVisible,
    canShowDetourPath: geometry.canShowDetourPath,
    geometry,
    detourZone: {
      startProgressMeters: Number.isFinite(geometry.startProgressMeters)
        ? geometry.startProgressMeters
        : candidate.minProgressMeters,
      endProgressMeters: Number.isFinite(geometry.endProgressMeters)
        ? geometry.endProgressMeters
        : candidate.maxProgressMeters,
      shapeId: candidate.shapeId,
    },
    latestGpsEvidenceAt: candidate.lastSeenAt,
    geometryLastEvidenceAt: geometry.lastEvidenceAt,
    lastEvidenceAt: geometry.lastEvidenceAt,
  };
}

function snapshotDetour(detour) {
  return {
    ...detour,
    vehiclesOffRoute: new Set(detour.vehiclesOffRoute || []),
    matchedVehicleIds: [...(detour.matchedVehicleIds || [])],
    geometry: cloneJson(detour.geometry),
    detourZone: cloneJson(detour.detourZone),
  };
}

function serializeDetour(detour) {
  return {
    ...detour,
    detectedAt: toMillis(detour.detectedAt, null),
    lastSeenAt: toMillis(detour.lastSeenAt, null),
    vehiclesOffRoute: [...(detour.vehiclesOffRoute || [])],
    geometry: cloneJson(detour.geometry),
    detourZone: cloneJson(detour.detourZone),
  };
}

function restoreDetour(routeId, data = {}) {
  return {
    ...data,
    routeId,
    detectedAt: new Date(toMillis(data.detectedAt, Date.now())),
    lastSeenAt: new Date(toMillis(data.lastSeenAt, Date.now())),
    vehiclesOffRoute: new Set(data.vehiclesOffRoute || data.matchedVehicleIds || []),
    matchedVehicleIds: data.matchedVehicleIds || data.vehiclesOffRoute || [],
    geometry: cloneJson(data.geometry),
    detourZone: cloneJson(data.detourZone),
  };
}

function createDetourV2Detector(config = {}) {
  const offRouteThresholdMeters =
    Number(config.offRouteThresholdMeters) || DEFAULT_OFF_ROUTE_THRESHOLD_METERS;
  const onRouteClearThresholdMeters =
    Number(config.onRouteClearThresholdMeters) || DEFAULT_ON_ROUTE_CLEAR_THRESHOLD_METERS;

  let tickId = 0;
  let lastVehicleCount = 0;
  let lastReportedDetours = {};
  const seenSamples = new Set();
  const candidates = new Map();
  const activeDetours = new Map();
  const clearTracks = new Map();
  const projectionDiagnostics = new Map();

  function clearVehicleState() {
    tickId = 0;
    lastVehicleCount = 0;
    lastReportedDetours = {};
    seenSamples.clear();
    candidates.clear();
    activeDetours.clear();
    clearTracks.clear();
    projectionDiagnostics.clear();
  }

  function getCandidate(routeId, shapeId) {
    const existing = candidates.get(routeId);
    if (existing && existing.shapeId === shapeId) return existing;
    const candidate = makeCandidate(routeId, shapeId);
    candidates.set(routeId, candidate);
    return candidate;
  }

  function shouldClearFromTrack(detour, track) {
    if (!detour?.detourZone || !Array.isArray(track) || track.length < 2) return false;
    const start = detour.detourZone.startProgressMeters;
    const end = detour.detourZone.endProgressMeters;
    const span = end - start;
    if (!Number.isFinite(span) || span <= 0) return false;

    const progresses = track.map((sample) => sample.progressMeters).filter(Number.isFinite);
    if (progresses.length < 2) return false;
    const observedStart = Math.max(Math.min(...progresses), start);
    const observedEnd = Math.min(Math.max(...progresses), end);
    const overlapMeters = Math.max(0, observedEnd - observedStart);
    const movementMeters = Math.max(...progresses) - Math.min(...progresses);
    const requiredMovement = Math.min(CLEAR_MIN_TRAVERSAL_METERS, span * CLEAR_MIN_TRAVERSAL_RATIO);

    return overlapMeters / span >= CLEAR_MIN_TRAVERSAL_RATIO &&
      movementMeters >= requiredMovement;
  }

  function trackClearSample(routeId, signature, sample, currentTickId) {
    const detour = activeDetours.get(routeId);
    if (!detour || detour.state === 'clear-pending') return;
    if (sample.timestampMs <= Number(detour.latestGpsEvidenceAt || 0)) return;

    const routeTracks = clearTracks.get(routeId) || new Map();
    const track = routeTracks.get(signature) || [];
    track.push(sample);
    routeTracks.set(signature, track);
    clearTracks.set(routeId, routeTracks);

    if (shouldClearFromTrack(detour, track)) {
      detour.state = 'clear-pending';
      detour.clearReason = 'normal-route-observed';
      detour.clearPendingTick = currentTickId;
    }
  }

  function processVehicles(
    vehicles = [],
    shapes = new Map(),
    routeShapeMapping = new Map(),
    _tripMapping = null,
    stopImpactData = null
  ) {
    tickId += 1;
    lastVehicleCount = vehicles.length;
    const offRouteThisTick = new Set();

    for (const vehicle of vehicles) {
      const routeId = normalizeRouteId(vehicle.routeId);
      const coordinate = normalizeCoordinate(vehicle.coordinate);
      const signature = evidenceSignature(vehicle);
      const id = vehicleId(vehicle);
      if (!routeId || !coordinate || !signature || !id) continue;

      const projection = projectCoordinateToRoute(
        routeId,
        coordinate,
        shapes,
        routeShapeMapping,
        vehicle.tripShapeId || null
      );
      if (!projection?.shapeId || !Number.isFinite(projection.progressMeters)) continue;

      const shape = shapes.get(projection.shapeId);
      if (!Array.isArray(shape) || shape.length < 2) continue;

      const timestampMs = getVehicleSampleTimeMs(vehicle);
      const key = sampleKey(vehicle, coordinate, timestampMs);
      if (seenSamples.has(key)) continue;
      seenSamples.add(key);

      projectionDiagnostics.set(id, {
        routeId,
        vehicleId: id,
        tripId: vehicle.tripId || null,
        shapeId: projection.shapeId,
        distanceMeters: projection.distanceMeters,
        progressMeters: projection.progressMeters,
        sampledAt: timestampMs,
        classification: projection.distanceMeters > offRouteThresholdMeters
          ? 'off-route'
          : projection.distanceMeters <= onRouteClearThresholdMeters
            ? 'on-route-clear'
            : 'deadband',
      });

      if (projection.distanceMeters > offRouteThresholdMeters) {
        offRouteThisTick.add(routeId);
        clearTracks.delete(routeId);
        const candidate = getCandidate(routeId, projection.shapeId);
        addPointToCandidate(candidate, {
          vehicleId: id,
          signature,
          coordinate,
          progressMeters: projection.progressMeters,
          projectedPoint: projection.projectedPoint,
          distanceMeters: projection.distanceMeters,
          timestampMs,
        });

        if (hasEnoughEvidence(candidate)) {
          const previousDetour = activeDetours.get(routeId);
          const detour = buildDetour(candidate, shapes);
          if (previousDetour) {
            detour.detectedAt = previousDetour.detectedAt || detour.detectedAt;
            detour.triggerVehicleId = previousDetour.triggerVehicleId || detour.triggerVehicleId;
          }
          activeDetours.set(routeId, detour);
        }
      } else if (projection.distanceMeters <= onRouteClearThresholdMeters) {
        trackClearSample(routeId, signature, {
          progressMeters: projection.progressMeters,
          timestampMs,
        }, tickId);
      }
    }

    for (const [routeId, detour] of [...activeDetours.entries()]) {
      if (
        detour.state === 'clear-pending' &&
        tickId > detour.clearPendingTick &&
        !offRouteThisTick.has(routeId)
      ) {
        activeDetours.delete(routeId);
        candidates.delete(routeId);
        clearTracks.delete(routeId);
      }
    }

    lastReportedDetours = {};
    for (const [routeId, detour] of activeDetours.entries()) {
      lastReportedDetours[routeId] = snapshotDetour(detour);
    }
    enrichDetourMapStopImpacts(lastReportedDetours, shapes, stopImpactData);
    return lastReportedDetours;
  }

  function getState() {
    const detours = Object.fromEntries(
      [...activeDetours.entries()].map(([routeId, detour]) => [routeId, {
        vehicleCount: detour.vehicleCount || 0,
        uniqueVehicleCount: detour.uniqueVehicleCount || 0,
        currentVehicleCount: detour.currentVehicleCount || 0,
        detectedAt: new Date(detour.detectedAt).toISOString(),
        triggerVehicleId: detour.triggerVehicleId || null,
        state: detour.state || 'active',
      }])
    );
    const candidateEvidence = Object.fromEntries(
      [...candidates.entries()].map(([routeId, candidate]) => [routeId, {
        routeId,
        pointCount: candidate.points.length,
        uniqueSignatureCount: candidate.signatures.size,
        oldestMs: candidate.firstSeenAt,
        newestMs: candidate.lastSeenAt,
        shapeId: candidate.shapeId,
      }])
    );

    return {
      detourVersion: 'v2',
      vehicleCount: lastVehicleCount,
      activeDetourCount: Object.keys(detours).length,
      detours,
      detourStates: Object.fromEntries(
        Object.entries(detours).map(([routeId, detour]) => [routeId, detour.state])
      ),
      candidateEvidence,
    };
  }

  function getDetourEvidence() {
    return Object.fromEntries(
      [...candidates.entries()].map(([routeId, candidate]) => [routeId, {
        pointCount: candidate.points.length,
        uniqueVehicles: candidate.vehicleIds.size,
        oldestMs: candidate.firstSeenAt,
        newestMs: candidate.lastSeenAt,
      }])
    );
  }

  function getRawDetourEvidence() {
    return Object.fromEntries(
      [...candidates.entries()].map(([routeId, candidate]) => [routeId, {
        routeId,
        pointCount: candidate.points.length,
        uniqueVehicles: candidate.vehicleIds.size,
        points: candidate.points.map((point) => ({
          lat: point.coordinate.latitude,
          lon: point.coordinate.longitude,
          ts: point.timestampMs,
          v: point.vehicleId,
        })),
      }])
    );
  }

  function getRouteDebug(routeId) {
    const route = normalizeRouteId(routeId);
    return {
      routeId: route,
      candidateEvidence: getState().candidateEvidence[route] || null,
      snapshot: lastReportedDetours[route] ? serializeDetour(lastReportedDetours[route]) : null,
      projectionDiagnostics: [...projectionDiagnostics.values()]
        .filter((diagnostic) => diagnostic.routeId === route),
    };
  }

  function serializeDetectorRuntimeState() {
    return {
      detourVersion: 'v2',
      candidates: [...candidates.entries()].map(([routeId, candidate]) => ({
        routeId,
        shapeId: candidate.shapeId,
        points: candidate.points,
      })),
      activeDetours: Object.fromEntries(
        [...activeDetours.entries()].map(([routeId, detour]) => [routeId, serializeDetour(detour)])
      ),
      seenSamples: [...seenSamples].slice(-500),
    };
  }

  function hydrateRuntimeState(snapshot = {}) {
    clearVehicleState();
    (snapshot.seenSamples || []).forEach((key) => seenSamples.add(key));
    for (const item of snapshot.candidates || []) {
      const candidate = makeCandidate(item.routeId, item.shapeId);
      for (const point of item.points || []) {
        addPointToCandidate(candidate, point);
      }
      candidates.set(item.routeId, candidate);
    }
    for (const [routeId, detour] of Object.entries(snapshot.activeDetours || {})) {
      activeDetours.set(routeId, restoreDetour(routeId, detour));
    }
  }

  function hydrateActiveDetourSnapshots(records = {}) {
    let count = 0;
    for (const [routeId, record] of Object.entries(records || {})) {
      if (activeDetours.has(routeId)) continue;
      activeDetours.set(routeId, restoreDetour(routeId, {
        ...record,
        geometry: record.geometry || record,
        vehiclesOffRoute: record.matchedVehicleIds || [],
      }));
      count += 1;
    }
    return count;
  }

  return {
    processVehicles,
    clearVehicleState,
    getState,
    getDetourEvidence,
    getRawDetourEvidence,
    getRouteDebug,
    serializeDetectorRuntimeState,
    hydrateRuntimeState,
    hydrateActiveDetourSnapshots,
    getPersistentDetours: () => ({}),
    getPersistentDetourGeometries: () => ({}),
    hydratePersistentDetours: () => {},
    hydratePersistentDetourGeometries: () => {},
    clearRouteDetour: (routeId) => activeDetours.delete(routeId),
  };
}

module.exports = {
  createDetourV2Detector,
};
