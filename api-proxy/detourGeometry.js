'use strict';

const { haversineDistance, pointToPolylineDistance } = require('./geometry');
const {
  findClosestShapePoint,
  buildCumulativeDistances,
  dedupeConsecutivePoints,
  buildPolylineLengthMeters,
  extractSkippedSegment,
  extractSkippedSegmentByProgress,
  douglasPeucker,
} = require('./detour/geometry/polyline');
const { pickPrimarySegment } = require('./detour/geometry/segmentSelection');
const {
  createRouteFamilyReconciler,
  getRouteFamilyKey,
  hasRenderableSegment,
  hasRenderableGeometry,
} = require('./detour/geometry/routeFamilyReconciliation');
const { deriveSegmentStopImpacts } = require('./detour/stopImpacts');
const { getRouteDetectorConfig } = require('./detourRouteConfig');

// Minimum evidence points needed for any geometry output.
// A two-bus corroborated detour can now draw a trusted path.
const MIN_EVIDENCE_FOR_GEOMETRY = 2;
// Minimum points after simplification to return an inferredDetourPolyline
const MIN_SIMPLIFIED_POINTS = 2;
// Douglas-Peucker tolerance in meters
const DP_TOLERANCE_METERS = 25;
// Minimum linear span on the route to publish skipped-segment geometry
const MIN_LINEAR_SEGMENT_LENGTH_METERS = Number.parseFloat(
  process.env.DETOUR_MIN_LINEAR_SEGMENT_LENGTH_METERS || '100'
);
// Minimum off-route GPS points from the same bus before the rider-facing detour
// path is trusted enough for road matching.
const MIN_SAME_VEHICLE_PATH_POINTS = Math.max(
  1,
  Number.parseInt(process.env.DETOUR_MIN_SAME_VEHICLE_PATH_POINTS || '2', 10) || 2
);
// Minimum distance between projected evidence clusters before they count as separate detour segments
const SEGMENT_GAP_METERS = Number.parseFloat(process.env.DETOUR_SEGMENT_GAP_METERS || '400');
// Confidence thresholds
const HIGH_CONFIDENCE_DURATION_MS = 5 * 60 * 1000;
const HIGH_CONFIDENCE_POINTS = 10;
const HIGH_CONFIDENCE_VEHICLES = 2;
const HIGH_CONFIDENCE_CORROBORATED_OBSERVATIONS = Number.parseInt(
  process.env.DETOUR_HIGH_CONFIDENCE_CORROBORATED_OBSERVATIONS || '3',
  10
) || 3;
const MEDIUM_CONFIDENCE_DURATION_MS = 2 * 60 * 1000;
const MEDIUM_CONFIDENCE_POINTS = 5;
const MEDIUM_CONFIDENCE_VEHICLES = 2;
const MULTI_VEHICLE_PATH_MIN_EVIDENCE_POINTS = 2;
const MULTI_VEHICLE_PATH_MIN_UNIQUE_VEHICLES = 2;
const ROUTE_FAMILY_SEGMENT_MATCH_METERS = Number.parseFloat(
  process.env.DETOUR_ROUTE_FAMILY_SEGMENT_MATCH_METERS || '250'
);
const ROUTE_FAMILY_TARGET_ROUTE_OVERLAP_METERS = Number.parseFloat(
  process.env.DETOUR_ROUTE_FAMILY_TARGET_ROUTE_OVERLAP_METERS || '75'
);
const ENABLE_ROUTE_FAMILY_HANDOFF = process.env.DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF
  ? process.env.DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF === 'true'
  : true;
const REPRESENTATIVE_PATH_CORRIDOR_METERS = 60;
const REPRESENTATIVE_PATH_OVERLAP_THRESHOLD = 0.7;
const OPEN_CLOSED_OVERLAP_PROXIMITY_METERS = 35;
const OPEN_CLOSED_OVERLAP_MIN_RUN_METERS = 35;
const OPEN_CLOSED_INTERIOR_OVERLAP_RATIO = 0.5;
const UNTRUSTED_PATH_MAX_ENDPOINT_MISMATCH_METERS = Number.parseFloat(
  process.env.DETOUR_UNTRUSTED_PATH_MAX_ENDPOINT_MISMATCH_METERS || '3000'
);

const reconcileRouteFamilyGeometries = createRouteFamilyReconciler({
  enabled: ENABLE_ROUTE_FAMILY_HANDOFF,
  segmentMatchMeters: ROUTE_FAMILY_SEGMENT_MATCH_METERS,
  minLinearSegmentLengthMeters: MIN_LINEAR_SEGMENT_LENGTH_METERS,
  haversineDistance,
  pointToPolylineDistance,
  findClosestShapePoint,
  buildCumulativeDistances,
  extractSkippedSegmentByProgress,
  dedupeConsecutivePoints,
  pickPrimarySegment,
  targetRouteOverlapMeters: ROUTE_FAMILY_TARGET_ROUTE_OVERLAP_METERS,
});

function resolveShapeSelectionCandidates(shapeIds, evidenceGroups = []) {
  if (!Array.isArray(shapeIds) || shapeIds.length === 0) return [];

  const allowedShapeIds = new Set(shapeIds);
  const hintedShapeIds = new Set();

  evidenceGroups.forEach((group) => {
    if (!Array.isArray(group)) return;

    group.forEach((point) => {
      const hintedShapeId = point?.tripShapeId || point?.shapeId || null;
      if (hintedShapeId && allowedShapeIds.has(hintedShapeId)) {
        hintedShapeIds.add(hintedShapeId);
      }
    });
  });

  return hintedShapeIds.size > 0 ? [...hintedShapeIds] : shapeIds;
}

/**
 * Find entry/exit anchor indices on the best-matching shape for the evidence points.
 * Projects ALL evidence points onto each candidate shape and uses min/max shape indices,
 * which is stable even for ongoing detours where the "exit" is just the bus's current position.
 * Picks the shape that minimizes the total projection distance across all evidence points.
 */
function findAnchors(evidencePoints, shapes, shapeIds) {
  if (!evidencePoints || evidencePoints.length === 0) return null;
  if (!shapeIds || shapeIds.length === 0) return null;

  const candidateShapeIds = resolveShapeSelectionCandidates(shapeIds, [evidencePoints]);

  let bestShapeId = null;
  let bestMinIndex = 0;
  let bestMaxIndex = 0;
  let bestTotalDist = Infinity;

  for (const shapeId of candidateShapeIds) {
    const polyline = shapes.get(shapeId);
    if (!polyline || polyline.length < 2) continue;

    // Project ALL evidence points onto this shape, track min/max index and total distance
    let minIdx = Infinity;
    let maxIdx = -Infinity;
    let totalDist = 0;

    for (const pt of evidencePoints) {
      const csp = findClosestShapePoint(pt, polyline);
      if (!csp) continue;
      if (csp.index < minIdx) minIdx = csp.index;
      if (csp.index > maxIdx) maxIdx = csp.index;
      totalDist += csp.distanceMeters;
    }

    if (minIdx === Infinity || maxIdx === -Infinity) continue;

    if (totalDist < bestTotalDist) {
      bestTotalDist = totalDist;
      bestShapeId = shapeId;
      bestMinIndex = minIdx;
      bestMaxIndex = maxIdx;
    }
  }

  if (!bestShapeId) return null;

  return {
    shapeId: bestShapeId,
    entryIndex: bestMinIndex,
    exitIndex: bestMaxIndex,
    swapped: false,
  };
}

function getPathOverlapRatio(sourcePath, targetPath) {
  if (!Array.isArray(sourcePath) || sourcePath.length < 2 || !Array.isArray(targetPath) || targetPath.length < 2) {
    return 0;
  }

  let overlappingPointCount = 0;
  sourcePath.forEach((point) => {
    if (pointToPolylineDistance(point, targetPath) <= REPRESENTATIVE_PATH_CORRIDOR_METERS) {
      overlappingPointCount += 1;
    }
  });

  return overlappingPointCount / sourcePath.length;
}

function candidatePathsOverlap(a, b) {
  if (!a?.rawPath || !b?.rawPath) return false;

  return (
    getPathOverlapRatio(a.rawPath, b.rawPath) >= REPRESENTATIVE_PATH_OVERLAP_THRESHOLD &&
    getPathOverlapRatio(b.rawPath, a.rawPath) >= REPRESENTATIVE_PATH_OVERLAP_THRESHOLD
  );
}

function buildRepresentativePathCandidates(cluster) {
  if (!Array.isArray(cluster) || cluster.length === 0) return [];

  const pointsByVehicle = new Map();
  cluster.forEach((point) => {
    const vehicleKey = point?.vehicleId ? `vehicle:${point.vehicleId}` : 'vehicle:unknown';
    if (!pointsByVehicle.has(vehicleKey)) pointsByVehicle.set(vehicleKey, []);
    pointsByVehicle.get(vehicleKey).push(point);
  });

  const candidates = [];

  for (const [vehicleKey, vehiclePoints] of pointsByVehicle.entries()) {
    const sortedPoints = vehiclePoints
      .slice()
      .sort((a, b) => a.timestampMs - b.timestampMs);
    const rawPath = dedupeConsecutivePoints(
      sortedPoints.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      }))
    );
    if (rawPath.length < 2) continue;

    const simplifiedPath = douglasPeucker(rawPath, DP_TOLERANCE_METERS);
    if (!Array.isArray(simplifiedPath) || simplifiedPath.length < 2) continue;

    const progressValues = sortedPoints
      .map((point) => point.progressMeters)
      .filter(Number.isFinite);
    const progressSpanMeters = progressValues.length > 0
      ? Math.max(...progressValues) - Math.min(...progressValues)
      : 0;

    candidates.push({
      vehicleKey,
      rawPath,
      path: simplifiedPath,
      evidencePointCount: sortedPoints.length,
      progressSpanMeters,
      lastEvidenceAt: sortedPoints[sortedPoints.length - 1]?.timestampMs || 0,
      pathLengthMeters: buildPolylineLengthMeters(rawPath),
    });
  }

  return candidates;
}

function selectRepresentativeDetourPath(cluster) {
  const candidates = buildRepresentativePathCandidates(cluster);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].path;

  const scoredCandidates = candidates
    .map((candidate, index) => {
      let supportCount = 0;
      let supportWeight = 0;

      candidates.forEach((otherCandidate, otherIndex) => {
        if (otherIndex === index) return;
        if (!candidatePathsOverlap(candidate, otherCandidate)) return;

        supportCount += 1;
        supportWeight += otherCandidate.evidencePointCount || 0;
      });

      return {
        ...candidate,
        supportCount,
        supportWeight,
      };
    })
    .sort((a, b) => {
      if (b.supportCount !== a.supportCount) return b.supportCount - a.supportCount;
      if (b.supportWeight !== a.supportWeight) return b.supportWeight - a.supportWeight;
      if ((b.progressSpanMeters || 0) !== (a.progressSpanMeters || 0)) {
        return (b.progressSpanMeters || 0) - (a.progressSpanMeters || 0);
      }
      if ((b.evidencePointCount || 0) !== (a.evidencePointCount || 0)) {
        return (b.evidencePointCount || 0) - (a.evidencePointCount || 0);
      }
      if ((b.pathLengthMeters || 0) !== (a.pathLengthMeters || 0)) {
        return (b.pathLengthMeters || 0) - (a.pathLengthMeters || 0);
      }
      return (b.lastEvidenceAt || 0) - (a.lastEvidenceAt || 0);
    });

  return scoredCandidates[0]?.path || null;
}

function getPathVehicleKey(point) {
  const value = point?.recurringObservationId || point?.vehicleId || null;
  return value ? String(value) : null;
}

function getVehicleEvidenceKey(point) {
  const value = point?.vehicleId || point?.recurringObservationId || null;
  return value ? String(value) : null;
}

function getUniqueVehicleEvidenceCount(points) {
  if (!Array.isArray(points)) return 0;
  return new Set(points.map(getVehicleEvidenceKey).filter(Boolean)).size;
}

function assessMultiVehiclePathOverride(cluster, routeConfig = {}) {
  const minUniqueVehicles = Number.isFinite(routeConfig.multiVehiclePathMinUniqueVehicles)
    ? routeConfig.multiVehiclePathMinUniqueVehicles
    : MULTI_VEHICLE_PATH_MIN_UNIQUE_VEHICLES;
  if (!minUniqueVehicles) return null;

  const minEvidencePoints = Number.isFinite(routeConfig.multiVehiclePathMinEvidencePoints)
    ? routeConfig.multiVehiclePathMinEvidencePoints
    : MULTI_VEHICLE_PATH_MIN_EVIDENCE_POINTS;
  const pointCount = Array.isArray(cluster) ? cluster.length : 0;
  const vehicleCount = getUniqueVehicleEvidenceCount(cluster);

  if (pointCount >= minEvidencePoints && vehicleCount >= minUniqueVehicles) {
    return {
      canShowDetourPath: true,
      reason: 'multi-vehicle-corroborated',
      vehicleKey: null,
      pointCount,
      vehicleCount,
    };
  }

  return null;
}

function assessPathConfidence(cluster, entryBoundaryCandidate, exitBoundaryCandidate, routeConfig = {}) {
  if (!entryBoundaryCandidate || !exitBoundaryCandidate) {
    return {
      canShowDetourPath: false,
      reason: 'missing-boundary-anchor',
      vehicleKey: null,
      pointCount: 0,
      vehicleCount: 0,
    };
  }

  const multiVehicleOverride = assessMultiVehiclePathOverride(cluster, routeConfig);
  const entryVehicleKey = getPathVehicleKey(entryBoundaryCandidate);
  const exitVehicleKey = getPathVehicleKey(exitBoundaryCandidate);
  if (!entryVehicleKey || !exitVehicleKey || entryVehicleKey !== exitVehicleKey) {
    return multiVehicleOverride || {
      canShowDetourPath: false,
      reason: 'no-single-vehicle-trace',
      vehicleKey: null,
      pointCount: 0,
      vehicleCount: getUniqueVehicleEvidenceCount(cluster),
    };
  }

  const sameVehiclePointCount = Array.isArray(cluster)
    ? cluster.filter((point) => getPathVehicleKey(point) === entryVehicleKey).length
    : 0;

  if (sameVehiclePointCount < MIN_SAME_VEHICLE_PATH_POINTS) {
    return multiVehicleOverride || {
      canShowDetourPath: false,
      reason: 'no-single-vehicle-trace',
      vehicleKey: entryVehicleKey,
      pointCount: sameVehiclePointCount,
      vehicleCount: getUniqueVehicleEvidenceCount(cluster),
    };
  }

  return {
    canShowDetourPath: true,
    reason: 'single-vehicle-trace',
    vehicleKey: entryVehicleKey,
    pointCount: sameVehiclePointCount,
    vehicleCount: getUniqueVehicleEvidenceCount(cluster),
  };
}

function projectEvidenceOntoShape(evidencePoints, polyline) {
  if (!Array.isArray(evidencePoints) || evidencePoints.length === 0 || !Array.isArray(polyline) || polyline.length < 2) {
    return [];
  }

  const cumulative = buildCumulativeDistances(polyline);

  return evidencePoints
    .map((point) => {
      const projection = findClosestShapePoint(point, polyline);
      if (!projection || !projection.projectedPoint) return null;

      const segmentStart = polyline[projection.index];
      const progressMeters =
        cumulative[projection.index] +
        haversineDistance(
          segmentStart.latitude,
          segmentStart.longitude,
          projection.projectedPoint.latitude,
          projection.projectedPoint.longitude
        );

      return {
        ...point,
        shapeIndex: projection.index,
        projectedPoint: projection.projectedPoint,
        progressMeters,
        distanceMeters: projection.distanceMeters,
      };
    })
    .filter(Boolean);
}

function findBestShapeProjection(evidencePoints, shapes, shapeIds) {
  if (!Array.isArray(evidencePoints) || evidencePoints.length === 0) return null;
  if (!Array.isArray(shapeIds) || shapeIds.length === 0) return null;

  let best = null;

  for (const shapeId of shapeIds) {
    const polyline = shapes.get(shapeId);
    if (!polyline || polyline.length < 2) continue;

    const projectedPoints = projectEvidenceOntoShape(evidencePoints, polyline);
    if (projectedPoints.length === 0) continue;

    const totalDistance = projectedPoints.reduce((sum, point) => sum + point.distanceMeters, 0);
    if (!best || totalDistance < best.totalDistance) {
      best = {
        shapeId,
        polyline,
        projectedPoints,
        totalDistance,
      };
    }
  }

  return best;
}

function clusterProjectedEvidence(projectedPoints) {
  if (!Array.isArray(projectedPoints) || projectedPoints.length === 0) return [];

  const sorted = projectedPoints
    .slice()
    .sort((a, b) => a.progressMeters - b.progressMeters);

  const clusters = [];
  let currentCluster = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.progressMeters - prev.progressMeters;

    if (gap > SEGMENT_GAP_METERS) {
      clusters.push(currentCluster);
      currentCluster = [curr];
      continue;
    }

    currentCluster.push(curr);
  }

  clusters.push(currentCluster);
  return clusters;
}

function projectBoundaryCandidates(candidates, polyline) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  return projectEvidenceOntoShape(candidates, polyline);
}

function selectEntryBoundaryCandidate(projectedCandidates, segmentDetectedAtMs) {
  if (!Array.isArray(projectedCandidates) || projectedCandidates.length === 0) return null;

  const candidatesBeforeSegment = projectedCandidates
    .filter((candidate) => candidate.timestampMs <= segmentDetectedAtMs)
    .sort((a, b) => b.timestampMs - a.timestampMs);

  return candidatesBeforeSegment[0] || null;
}

function selectExitBoundaryCandidate(projectedCandidates, lastEvidenceAt) {
  if (!Array.isArray(projectedCandidates) || projectedCandidates.length === 0) return null;

  const candidatesAfterSegment = projectedCandidates
    .filter((candidate) => candidate.timestampMs >= lastEvidenceAt)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (candidatesAfterSegment.length > 0) {
    return candidatesAfterSegment[candidatesAfterSegment.length - 1];
  }

  return projectedCandidates
    .slice()
    .sort((a, b) => b.timestampMs - a.timestampMs)[0] || null;
}

function clampStaleEntryAnchorToEvidence(entryProjection, sortedByProgress, routeConfig = {}) {
  const maxGapMeters = Number.isFinite(routeConfig.staleEntryAnchorMaxGapMeters)
    ? routeConfig.staleEntryAnchorMaxGapMeters
    : null;
  if (!maxGapMeters || !entryProjection || !Array.isArray(sortedByProgress) || sortedByProgress.length === 0) {
    return {
      projection: entryProjection,
      adjusted: false,
      gapMeters: null,
    };
  }

  const entryProgress = entryProjection.progressMeters;
  if (!Number.isFinite(entryProgress)) {
    return {
      projection: entryProjection,
      adjusted: false,
      gapMeters: null,
    };
  }

  const firstEvidenceProjection = sortedByProgress[0];
  const lastEvidenceProjection = sortedByProgress[sortedByProgress.length - 1];
  const firstEvidenceProgress = firstEvidenceProjection?.progressMeters;
  const lastEvidenceProgress = lastEvidenceProjection?.progressMeters;

  if (Number.isFinite(firstEvidenceProgress) && entryProgress < firstEvidenceProgress) {
    const gapMeters = firstEvidenceProgress - entryProgress;
    if (gapMeters > maxGapMeters) {
      return {
        projection: firstEvidenceProjection,
        adjusted: true,
        gapMeters,
      };
    }
  }

  if (Number.isFinite(lastEvidenceProgress) && entryProgress > lastEvidenceProgress) {
    const gapMeters = entryProgress - lastEvidenceProgress;
    if (gapMeters > maxGapMeters) {
      return {
        projection: lastEvidenceProjection,
        adjusted: true,
        gapMeters,
      };
    }
  }

  return {
    projection: entryProjection,
    adjusted: false,
    gapMeters: null,
  };
}

function anchorPolylineToEndpoints(polyline, entryPoint, exitPoint, toleranceMeters = 10) {
  if (!Array.isArray(polyline) || polyline.length < 2) {
    return Array.isArray(polyline) ? polyline.slice() : [];
  }

  const anchored = polyline.slice();

  if (entryPoint?.latitude != null && entryPoint?.longitude != null) {
    const firstPoint = anchored[0];
    const firstDistance = firstPoint
      ? haversineDistance(
        firstPoint.latitude,
        firstPoint.longitude,
        entryPoint.latitude,
        entryPoint.longitude
      )
      : Infinity;
    if (firstDistance > toleranceMeters) {
      anchored.unshift({
        latitude: entryPoint.latitude,
        longitude: entryPoint.longitude,
      });
    }
  }

  if (exitPoint?.latitude != null && exitPoint?.longitude != null) {
    const lastPoint = anchored[anchored.length - 1];
    const lastDistance = lastPoint
      ? haversineDistance(
        lastPoint.latitude,
        lastPoint.longitude,
        exitPoint.latitude,
        exitPoint.longitude
      )
      : Infinity;
    if (lastDistance > toleranceMeters) {
      anchored.push({
        latitude: exitPoint.latitude,
        longitude: exitPoint.longitude,
      });
    }
  }

  return dedupeConsecutivePoints(anchored);
}

function isFiniteCoordinate(point) {
  return (
    Number.isFinite(Number(point?.latitude)) &&
    Number.isFinite(Number(point?.longitude))
  );
}

function normalizeGeometryPath(path) {
  return Array.isArray(path)
    ? path
      .filter(isFiniteCoordinate)
      .map((point) => ({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
      }))
    : [];
}

function getEndpointDistanceMeters(from, to) {
  if (!isFiniteCoordinate(from) || !isFiniteCoordinate(to)) return Infinity;
  const distance = haversineDistance(
    Number(from.latitude),
    Number(from.longitude),
    Number(to.latitude),
    Number(to.longitude)
  );
  return Number.isFinite(distance) ? distance : Infinity;
}

function getAnchoredPathEndpointMismatchMeters(path, entryPoint, exitPoint) {
  const points = normalizeGeometryPath(path);
  if (points.length < 2 || !isFiniteCoordinate(entryPoint) || !isFiniteCoordinate(exitPoint)) {
    return Infinity;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const forwardMismatch = Math.max(
    getEndpointDistanceMeters(first, entryPoint),
    getEndpointDistanceMeters(last, exitPoint)
  );
  const reverseMismatch = Math.max(
    getEndpointDistanceMeters(first, exitPoint),
    getEndpointDistanceMeters(last, entryPoint)
  );

  return Math.min(forwardMismatch, reverseMismatch);
}

function isUsableUntrustedDetourPath(path, entryPoint, exitPoint) {
  return getAnchoredPathEndpointMismatchMeters(path, entryPoint, exitPoint) <=
    UNTRUSTED_PATH_MAX_ENDPOINT_MISMATCH_METERS;
}

function getEndpointOverlapRunLength(openPath, closedPath, fromEnd = false) {
  const orderedPath = fromEnd ? [...openPath].reverse() : openPath;
  const run = [];

  for (const point of orderedPath) {
    if (pointToPolylineDistance(point, closedPath) > OPEN_CLOSED_OVERLAP_PROXIMITY_METERS) {
      break;
    }
    run.push(point);
  }

  if (run.length < 2) return 0;
  const orderedRun = fromEnd ? run.reverse() : run;
  return buildPolylineLengthMeters(orderedRun);
}

function projectPointOntoPathWithProgress(point, path) {
  const projection = findClosestShapePoint(point, path);
  if (!projection?.projectedPoint) return null;

  const cumulative = buildCumulativeDistances(path);
  const segmentStart = path[projection.index] || path[0];
  const progressMeters =
    (cumulative[projection.index] || 0) +
    haversineDistance(
      segmentStart.latitude,
      segmentStart.longitude,
      projection.projectedPoint.latitude,
      projection.projectedPoint.longitude
    );

  return {
    point: {
      latitude: projection.projectedPoint.latitude,
      longitude: projection.projectedPoint.longitude,
    },
    progressMeters,
    distanceMeters: projection.distanceMeters,
  };
}

function getEndpointOverlapBoundary(openPath, closedPath, fromEnd = false) {
  const orderedPath = openPath.map((point, index) => ({ point, index }));
  const scanPath = fromEnd ? [...orderedPath].reverse() : orderedPath;
  const run = [];

  for (const entry of scanPath) {
    if (pointToPolylineDistance(entry.point, closedPath) > OPEN_CLOSED_OVERLAP_PROXIMITY_METERS) {
      break;
    }
    run.push(entry);
  }

  if (run.length < 2) return null;

  const runPoints = (fromEnd ? [...run].reverse() : run).map((entry) => entry.point);
  const overlapMeters = buildPolylineLengthMeters(runPoints);
  if (overlapMeters < OPEN_CLOSED_OVERLAP_MIN_RUN_METERS) return null;

  const boundaryEntry = run[run.length - 1];
  const projection = projectPointOntoPathWithProgress(boundaryEntry.point, closedPath);
  if (!projection) return null;

  return {
    index: boundaryEntry.index,
    point: projection.point,
    progressMeters: projection.progressMeters,
    overlapMeters,
  };
}

function trimOpenPathToBoundaries(openPath, prefixBoundary, suffixBoundary) {
  const startIndex = prefixBoundary?.index ?? 0;
  const endIndex = suffixBoundary?.index ?? openPath.length - 1;
  if (startIndex > endIndex) return null;

  const points = openPath.slice(startIndex, endIndex + 1).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));
  if (points.length === 0) return null;

  if (prefixBoundary) {
    points[0] = { ...prefixBoundary.point };
  }
  if (suffixBoundary) {
    points[points.length - 1] = { ...suffixBoundary.point };
  }

  const deduped = dedupeConsecutivePoints(points);
  return deduped.length >= 2 ? deduped : null;
}

function trimClosedPathToBoundaries(closedPath, prefixBoundary, suffixBoundary) {
  const closedLengthMeters = buildPolylineLengthMeters(closedPath);
  if (closedLengthMeters <= 0) return null;

  const startProgress = prefixBoundary
    ? Math.max(0, Math.min(prefixBoundary.progressMeters, closedLengthMeters))
    : 0;
  const endProgress = suffixBoundary
    ? Math.max(0, Math.min(suffixBoundary.progressMeters, closedLengthMeters))
    : closedLengthMeters;

  if (endProgress <= startProgress) return null;
  if ((endProgress - startProgress) < MIN_LINEAR_SEGMENT_LENGTH_METERS) return null;

  const trimmed = extractSkippedSegmentByProgress(closedPath, startProgress, endProgress);
  if (trimmed.length < 2) return null;
  return buildPolylineLengthMeters(trimmed) >= MIN_LINEAR_SEGMENT_LENGTH_METERS
    ? trimmed
    : null;
}

function trimOverlappingOpenClosedGeometry(openPath, closedPath) {
  const open = normalizeGeometryPath(openPath);
  const closed = normalizeGeometryPath(closedPath);
  if (open.length < 2 || closed.length < 2) {
    return {
      openPath,
      closedPath,
      overlapTrimmed: false,
      overlapSuppressed: false,
      prefixTrimmed: false,
      suffixTrimmed: false,
    };
  }

  const prefixBoundary = getEndpointOverlapBoundary(open, closed, false);
  const suffixBoundary = getEndpointOverlapBoundary(open, closed, true);
  const overlapTrimmed = Boolean(prefixBoundary || suffixBoundary);

  if (!overlapTrimmed) {
    return {
      openPath,
      closedPath,
      overlapTrimmed: false,
      overlapSuppressed: false,
      prefixTrimmed: false,
      suffixTrimmed: false,
    };
  }

  const trimmedOpenPath = trimOpenPathToBoundaries(open, prefixBoundary, suffixBoundary);
  const trimmedClosedPath = trimClosedPathToBoundaries(closed, prefixBoundary, suffixBoundary);

  return {
    openPath: trimmedOpenPath,
    closedPath: trimmedClosedPath,
    overlapTrimmed: true,
    overlapSuppressed: !trimmedClosedPath,
    prefixTrimmed: Boolean(prefixBoundary),
    suffixTrimmed: Boolean(suffixBoundary),
  };
}

function hasMaterialOpenClosedOverlap(openPath, closedPath) {
  const open = normalizeGeometryPath(openPath);
  const closed = normalizeGeometryPath(closedPath);
  if (open.length < 2 || closed.length < 2) return false;

  const prefixOverlapMeters = getEndpointOverlapRunLength(open, closed, false);
  if (prefixOverlapMeters >= OPEN_CLOSED_OVERLAP_MIN_RUN_METERS) {
    return true;
  }

  const suffixOverlapMeters = getEndpointOverlapRunLength(open, closed, true);
  if (suffixOverlapMeters >= OPEN_CLOSED_OVERLAP_MIN_RUN_METERS) {
    return true;
  }

  const interior = open.slice(1, -1);
  if (interior.length < 3) return false;

  const nearClosedCount = interior.filter((point) =>
    pointToPolylineDistance(point, closed) <= OPEN_CLOSED_OVERLAP_PROXIMITY_METERS
  ).length;

  return (nearClosedCount / interior.length) >= OPEN_CLOSED_INTERIOR_OVERLAP_RATIO;
}

function dedupeAdjacentPolylinePoints(points) {
  if (!Array.isArray(points)) return [];

  const deduped = [];
  for (const point of points) {
    if (!isFiniteCoordinate(point)) continue;
    const normalized = {
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
    };
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      Math.abs(previous.latitude - normalized.latitude) < 0.000001 &&
      Math.abs(previous.longitude - normalized.longitude) < 0.000001
    ) {
      continue;
    }
    deduped.push(normalized);
  }
  return deduped;
}

function buildAnchoredEvidencePath(rawCoords, entryPoint, exitPoint) {
  const path = dedupeAdjacentPolylinePoints([
    entryPoint,
    ...(Array.isArray(rawCoords) ? rawCoords : []),
    exitPoint,
  ]);
  return path.length >= 2 ? path : null;
}

function buildSegmentGeometry(
  cluster,
  polyline,
  now,
  detectedAtMs,
  boundaryCandidates = {},
  routeConfig = {},
  confidenceCluster = cluster
) {
  if (!Array.isArray(cluster) || cluster.length === 0) return null;

  const pathConfidenceCluster = Array.isArray(confidenceCluster) && confidenceCluster.length > cluster.length
    ? confidenceCluster
    : cluster;
  const sortedByProgress = cluster
    .slice()
    .sort((a, b) => a.progressMeters - b.progressMeters || a.timestampMs - b.timestampMs);
  const segmentDetectedAtMs = Math.min(...cluster.map((point) => point.timestampMs));
  const lastEvidenceAt = Math.max(...cluster.map((point) => point.timestampMs));
  let selectedEntryBoundaryCandidate = selectEntryBoundaryCandidate(
    boundaryCandidates.entryCandidates,
    segmentDetectedAtMs
  );
  const fullClusterCanUseMultiVehiclePath = Boolean(
    assessMultiVehiclePathOverride(pathConfidenceCluster, routeConfig)
  );
  if (!selectedEntryBoundaryCandidate && fullClusterCanUseMultiVehiclePath) {
    selectedEntryBoundaryCandidate = (boundaryCandidates.entryCandidates || [])
      .filter((candidate) => candidate.timestampMs <= lastEvidenceAt)
      .sort((a, b) => b.timestampMs - a.timestampMs)[0] || null;
  }
  const selectedExitBoundaryCandidate = selectExitBoundaryCandidate(
    boundaryCandidates.exitCandidates,
    lastEvidenceAt
  );
  const pathConfidence = assessPathConfidence(
    pathConfidenceCluster,
    selectedEntryBoundaryCandidate,
    selectedExitBoundaryCandidate,
    routeConfig
  );
  const unclampedEntryProjection = selectedEntryBoundaryCandidate || sortedByProgress[0];
  const entryAnchorClamp = clampStaleEntryAnchorToEvidence(
    unclampedEntryProjection,
    sortedByProgress,
    routeConfig
  );
  const rawEntryProjection = entryAnchorClamp.projection;
  const rawExitProjection = selectedExitBoundaryCandidate || sortedByProgress[sortedByProgress.length - 1];
  const hasEntryBoundaryCandidate = Boolean(selectedEntryBoundaryCandidate);
  const hasExitBoundaryCandidate = Boolean(selectedExitBoundaryCandidate);
  const semanticReversed = (rawEntryProjection.progressMeters || 0) > (rawExitProjection.progressMeters || 0);
  const entryProjection = semanticReversed ? rawExitProjection : rawEntryProjection;
  const exitProjection = semanticReversed ? rawEntryProjection : rawExitProjection;
  const entryIndex = entryProjection.shapeIndex;
  const exitIndex = exitProjection.shapeIndex;
  const spanMeters = Math.max(
    0,
    Math.max(rawEntryProjection.progressMeters || 0, rawExitProjection.progressMeters || 0) -
      Math.min(rawEntryProjection.progressMeters || 0, rawExitProjection.progressMeters || 0)
  );
  const skippedSegmentPolyline = extractSkippedSegmentByProgress(
    polyline,
    rawEntryProjection.progressMeters || 0,
    rawExitProjection.progressMeters || 0
  );

  const rawCoords = cluster
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  let entryPoint = entryProjection.projectedPoint
    ? {
      latitude: entryProjection.projectedPoint.latitude,
      longitude: entryProjection.projectedPoint.longitude,
    }
    : null;
  let exitPoint = exitProjection.projectedPoint
    ? {
      latitude: exitProjection.projectedPoint.latitude,
      longitude: exitProjection.projectedPoint.longitude,
    }
    : null;
  const representativeDetourPath = selectRepresentativeDetourPath(cluster);
  const simplified = douglasPeucker(rawCoords, DP_TOLERANCE_METERS);
  const rawInferredDetourPolyline =
    representativeDetourPath ||
    (simplified.length >= MIN_SIMPLIFIED_POINTS ? simplified : null);
  const untrustedPathEndpointMismatchMeters = getAnchoredPathEndpointMismatchMeters(
    rawInferredDetourPolyline,
    entryPoint,
    exitPoint
  );
  const inferredDetourPolyline = pathConfidence.canShowDetourPath
    ? (
      rawInferredDetourPolyline ||
      buildAnchoredEvidencePath(
        rawCoords,
        hasEntryBoundaryCandidate ? entryPoint : null,
        hasExitBoundaryCandidate ? exitPoint : null
      )
    )
    : (
      isUsableUntrustedDetourPath(rawInferredDetourPolyline, entryPoint, exitPoint)
        ? rawInferredDetourPolyline
        : null
    );
  const anchoredInferredDetourPolyline = inferredDetourPolyline
    ? anchorPolylineToEndpoints(
      inferredDetourPolyline,
      hasEntryBoundaryCandidate ? entryPoint : null,
      hasExitBoundaryCandidate ? exitPoint : null
    )
    : null;
  const confidence = scoreConfidence(
    pathConfidenceCluster,
    Math.min(segmentDetectedAtMs, detectedAtMs),
    now,
    routeConfig
  );
  const hasRenderableSkippedSegment =
    hasEntryBoundaryCandidate &&
    hasExitBoundaryCandidate &&
    skippedSegmentPolyline.length >= 2 && spanMeters >= MIN_LINEAR_SEGMENT_LENGTH_METERS;
  const overlapAdjustment = hasRenderableSkippedSegment && anchoredInferredDetourPolyline?.length >= 2
    ? trimOverlappingOpenClosedGeometry(anchoredInferredDetourPolyline, skippedSegmentPolyline)
    : {
      openPath: anchoredInferredDetourPolyline,
      closedPath: skippedSegmentPolyline,
      overlapTrimmed: false,
      overlapSuppressed: false,
      prefixTrimmed: false,
      suffixTrimmed: false,
    };
  const renderableSkippedSegment = hasRenderableSkippedSegment
    ? overlapAdjustment.closedPath
    : null;
  const renderableInferredDetourPolyline = overlapAdjustment.openPath;

  if (renderableSkippedSegment?.length >= 2 && overlapAdjustment.overlapTrimmed) {
    entryPoint = renderableSkippedSegment[0];
    exitPoint = renderableSkippedSegment[renderableSkippedSegment.length - 1];
  }

  const hasRenderableGeometry =
    (renderableSkippedSegment && renderableSkippedSegment.length >= 2) ||
    (renderableInferredDetourPolyline && renderableInferredDetourPolyline.length >= 2);
  if (!hasRenderableGeometry) return null;

  return {
    entryIndex,
    exitIndex,
    spanMeters,
    skippedSegmentPolyline: renderableSkippedSegment,
    inferredDetourPolyline: renderableInferredDetourPolyline,
    entryPoint,
    exitPoint,
    confidence,
    canShowDetourPath: pathConfidence.canShowDetourPath,
    evidencePointCount: cluster.length,
    lastEvidenceAt,
    suppressStopDerivation: overlapAdjustment.overlapSuppressed,
    debug: {
      entryAnchorSource: hasEntryBoundaryCandidate ? 'boundary-candidate' : 'projected-evidence-fallback',
      exitAnchorSource:
        hasExitBoundaryCandidate ? 'boundary-candidate' : 'projected-evidence-fallback',
      entryCandidateCount: Array.isArray(boundaryCandidates.entryCandidates)
        ? boundaryCandidates.entryCandidates.length
        : 0,
      exitCandidateCount: Array.isArray(boundaryCandidates.exitCandidates)
        ? boundaryCandidates.exitCandidates.length
        : 0,
      hasEntryBoundaryCandidate,
      hasExitBoundaryCandidate,
      semanticReversed,
      clusterVehicleIds: [...new Set(cluster.map((point) => point.vehicleId).filter(Boolean))],
      usedRepresentativePath: Boolean(representativeDetourPath),
      rawPathRejectedByEndpointMismatch:
        Boolean(rawInferredDetourPolyline) &&
        !pathConfidence.canShowDetourPath &&
        !isUsableUntrustedDetourPath(rawInferredDetourPolyline, entryPoint, exitPoint),
      untrustedPathEndpointMismatchMeters: Number.isFinite(untrustedPathEndpointMismatchMeters)
        ? Math.round(untrustedPathEndpointMismatchMeters)
        : null,
      overlapTrimmed: overlapAdjustment.overlapTrimmed,
      overlapSuppressed: overlapAdjustment.overlapSuppressed,
      overlapPrefixTrimmed: overlapAdjustment.prefixTrimmed,
      overlapSuffixTrimmed: overlapAdjustment.suffixTrimmed,
      boundaryQuality: overlapAdjustment.overlapSuppressed
        ? 'overlap-suppressed'
        : overlapAdjustment.overlapTrimmed
          ? 'overlap-trimmed'
        : hasEntryBoundaryCandidate && hasExitBoundaryCandidate
          ? 'confirmed'
          : 'inferred',
      canShowDetourPath: pathConfidence.canShowDetourPath,
      pathConfidenceReason: pathConfidence.reason,
      sameVehicleTraceVehicleId: pathConfidence.vehicleKey,
      sameVehicleTracePointCount: pathConfidence.pointCount,
      multiVehicleTraceVehicleCount: pathConfidence.vehicleCount,
      entryAnchorAdjusted: entryAnchorClamp.adjusted,
      entryAnchorGapMeters: entryAnchorClamp.adjusted && Number.isFinite(entryAnchorClamp.gapMeters)
        ? Math.round(entryAnchorClamp.gapMeters)
        : null,
    },
  };
}

function shouldCollapseWeakClustersIntoSingleSegment(segments, mergedSegment) {
  if (!Array.isArray(segments) || segments.length < 2 || !mergedSegment) return false;

  const anchorSignature = (segment) => {
    const entry = segment?.entryPoint;
    const exit = segment?.exitPoint;
    if (!entry || !exit) return '';
    return [
      segment?.shapeId || '',
      Number(entry.latitude).toFixed(6),
      Number(entry.longitude).toFixed(6),
      Number(exit.latitude).toFixed(6),
      Number(exit.longitude).toFixed(6),
    ].join(':');
  };
  const firstAnchorSignature = anchorSignature(segments[0]);
  const allSegmentsShareAnchors =
    firstAnchorSignature &&
    segments.every((segment) => anchorSignature(segment) === firstAnchorSignature);
  if (allSegmentsShareAnchors) {
    return true;
  }

  const allWeak = segments.every((segment) => {
    const hasSkipped = Array.isArray(segment?.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2;
    const spanMeters = Number.isFinite(segment?.spanMeters) ? segment.spanMeters : 0;
    return !hasSkipped && spanMeters < MIN_LINEAR_SEGMENT_LENGTH_METERS;
  });
  if (!allWeak) return false;

  const mergedHasSkipped =
    Array.isArray(mergedSegment.skippedSegmentPolyline) &&
    mergedSegment.skippedSegmentPolyline.length >= 2;
  const mergedSpanMeters = Number.isFinite(mergedSegment.spanMeters) ? mergedSegment.spanMeters : 0;
  const maxIndividualSpanMeters = segments.reduce(
    (max, segment) => Math.max(max, Number.isFinite(segment?.spanMeters) ? segment.spanMeters : 0),
    0
  );

  const mergedPathLength = buildPolylineLengthMeters(mergedSegment.inferredDetourPolyline || []);
  const maxIndividualPathLength = segments.reduce(
    (max, segment) =>
      Math.max(max, buildPolylineLengthMeters(segment?.inferredDetourPolyline || [])),
    0
  );

  const mergedHasDistinctAnchors =
    mergedSegment.entryPoint &&
    mergedSegment.exitPoint &&
    haversineDistance(
      mergedSegment.entryPoint.latitude,
      mergedSegment.entryPoint.longitude,
      mergedSegment.exitPoint.latitude,
      mergedSegment.exitPoint.longitude
    ) >= MIN_LINEAR_SEGMENT_LENGTH_METERS;

  return (
    mergedHasSkipped ||
    mergedSpanMeters > maxIndividualSpanMeters ||
    (mergedHasDistinctAnchors && mergedPathLength > maxIndividualPathLength)
  );
}

function removeRedundantWeakSegments(segments) {
  if (!Array.isArray(segments) || segments.length < 2) return segments;

  return segments.filter((segment, index) => {
    const hasSkipped =
      Array.isArray(segment?.skippedSegmentPolyline) &&
      segment.skippedSegmentPolyline.length >= 2;
    const spanMeters = Number.isFinite(segment?.spanMeters) ? segment.spanMeters : 0;
    if (hasSkipped || spanMeters >= MIN_LINEAR_SEGMENT_LENGTH_METERS) {
      return true;
    }

    const segmentMin = Math.min(segment.entryIndex ?? 0, segment.exitIndex ?? 0);
    const segmentMax = Math.max(segment.entryIndex ?? 0, segment.exitIndex ?? 0);

    return !segments.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const otherHasSkipped =
        Array.isArray(other?.skippedSegmentPolyline) &&
        other.skippedSegmentPolyline.length >= 2;
      const otherSpanMeters = Number.isFinite(other?.spanMeters) ? other.spanMeters : 0;
      if (!otherHasSkipped && otherSpanMeters < MIN_LINEAR_SEGMENT_LENGTH_METERS) {
        return false;
      }

      const otherMin = Math.min(other.entryIndex ?? 0, other.exitIndex ?? 0);
      const otherMax = Math.max(other.entryIndex ?? 0, other.exitIndex ?? 0);
      return segmentMin >= otherMin - 1 && segmentMax <= otherMax + 1;
    });
  });
}

function publishableSegment(shapeId, segment) {
  return {
    shapeId,
    skippedSegmentPolyline: segment.skippedSegmentPolyline,
    inferredDetourPolyline: segment.inferredDetourPolyline,
    entryPoint: segment.entryPoint,
    exitPoint: segment.exitPoint,
    confidence: segment.confidence,
    canShowDetourPath: segment.canShowDetourPath,
    evidencePointCount: segment.evidencePointCount,
    lastEvidenceAt: segment.lastEvidenceAt,
    suppressStopDerivation: segment.suppressStopDerivation === true,
    spanMeters: segment.spanMeters,
    entryIndex: segment.entryIndex,
    exitIndex: segment.exitIndex,
    debug: segment.debug,
  };
}

function enrichSegmentsWithStopImpacts(routeId, segments, shapes, fallbackShapeId, stopImpactData) {
  if (!stopImpactData || !Array.isArray(segments) || segments.length === 0 || !(shapes instanceof Map)) {
    return Array.isArray(segments) ? segments : [];
  }

  return segments.map((segment) => {
    const shapeId = segment?.shapeId || fallbackShapeId || null;
    const polyline = shapeId ? shapes.get(shapeId) : null;
    const stopImpacts = deriveSegmentStopImpacts({
      routeId,
      shapeId,
      segment,
      polyline,
      stopImpactData,
    });

    return Object.keys(stopImpacts).length > 0
      ? { ...segment, ...stopImpacts }
      : segment;
  });
}

function enrichGeometryStopImpacts(routeId, geometry, shapes, stopImpactData) {
  if (!geometry || typeof geometry !== 'object') return geometry;
  const segments = enrichSegmentsWithStopImpacts(
    routeId,
    geometry.segments,
    shapes,
    geometry.shapeId,
    stopImpactData
  );
  if (!Array.isArray(segments) || segments.length === 0) return geometry;

  const primarySegment = pickPrimarySegment(segments);
  return {
    ...geometry,
    segments,
    skippedStopIds: primarySegment?.skippedStopIds || [],
    skippedStopCodes: primarySegment?.skippedStopCodes || [],
    skippedStops: primarySegment?.skippedStops || [],
    affectedStopIds: primarySegment?.affectedStopIds || [],
    affectedStopCodes: primarySegment?.affectedStopCodes || [],
    affectedStops: primarySegment?.affectedStops || [],
    entryStopId: primarySegment?.entryStopId || null,
    exitStopId: primarySegment?.exitStopId || null,
  };
}

function enrichDetourMapStopImpacts(detourMap, shapes, stopImpactData) {
  if (!detourMap || typeof detourMap !== 'object') return detourMap;
  if (!(shapes instanceof Map) || !stopImpactData) return detourMap;

  Object.entries(detourMap).forEach(([routeId, detour]) => {
    if (!detour?.geometry) return;
    detour.geometry = enrichGeometryStopImpacts(routeId, detour.geometry, shapes, stopImpactData);
  });

  return detourMap;
}

/**
 * Score geometry confidence based on evidence density, duration, and vehicle count.
 */
function scoreConfidence(evidencePoints, detectedAtMs, now, routeConfig = {}) {
  if (!evidencePoints || evidencePoints.length === 0) return 'low';

  const count = evidencePoints.length;
  const durationMs = now - detectedAtMs;
  const uniqueVehicles = new Set(
    evidencePoints.map(p => p.recurringObservationId || p.vehicleId)
  ).size;
  const physicalVehicleCount = getUniqueVehicleEvidenceCount(evidencePoints);

  if (durationMs >= HIGH_CONFIDENCE_DURATION_MS &&
      count >= HIGH_CONFIDENCE_POINTS &&
      uniqueVehicles >= HIGH_CONFIDENCE_VEHICLES) {
    return 'high';
  }
  if (
    count >= HIGH_CONFIDENCE_CORROBORATED_OBSERVATIONS &&
    physicalVehicleCount >= MULTI_VEHICLE_PATH_MIN_UNIQUE_VEHICLES
  ) {
    return 'high';
  }
  const routeMediumMinPoints = Number.isFinite(routeConfig.mediumConfidenceMinEvidencePoints)
    ? routeConfig.mediumConfidenceMinEvidencePoints
    : null;
  const routeMediumMinVehicles = Number.isFinite(routeConfig.mediumConfidenceMinUniqueVehicles)
    ? routeConfig.mediumConfidenceMinUniqueVehicles
    : null;
  if (
    routeMediumMinPoints &&
    routeMediumMinVehicles &&
    count >= routeMediumMinPoints &&
    physicalVehicleCount >= routeMediumMinVehicles
  ) {
    return 'medium';
  }
  if (
    count >= MULTI_VEHICLE_PATH_MIN_EVIDENCE_POINTS &&
    physicalVehicleCount >= MULTI_VEHICLE_PATH_MIN_UNIQUE_VEHICLES
  ) {
    return 'medium';
  }
  if (
    durationMs >= MEDIUM_CONFIDENCE_DURATION_MS &&
    count >= MEDIUM_CONFIDENCE_POINTS &&
    uniqueVehicles >= MEDIUM_CONFIDENCE_VEHICLES
  ) {
    return 'medium';
  }
  return 'low';
}

/**
 * Top-level geometry builder. Called per active detour when building the snapshot.
 */
function buildGeometry(routeId, evidenceWindow, shapes, routeShapeMapping, now, detectedAtMs, stopImpactData = null) {
  const routeConfig = getRouteDetectorConfig(routeId, {});
  const minEvidenceForGeometry = Number.isFinite(routeConfig.minEvidenceForGeometry)
    ? routeConfig.minEvidenceForGeometry
    : MIN_EVIDENCE_FOR_GEOMETRY;
  const empty = {
    shapeId: null,
    segments: [],
    skippedSegmentPolyline: null,
    inferredDetourPolyline: null,
    entryPoint: null,
    exitPoint: null,
    confidence: 'low',
    evidencePointCount: 0,
    lastEvidenceAt: null,
    debug: {
      routeId,
      candidateShapeIds: [],
      selectedShapeId: null,
      clusterCount: 0,
      routeFamilyHandoffEnabled: ENABLE_ROUTE_FAMILY_HANDOFF,
      minEvidenceForGeometry,
    },
  };

  const points = Array.isArray(evidenceWindow?.points) ? evidenceWindow.points : [];
  const confidencePoints = Array.isArray(evidenceWindow?.confidencePoints) && evidenceWindow.confidencePoints.length > points.length
    ? evidenceWindow.confidencePoints
    : points;

  if (
    !evidenceWindow ||
    points.length === 0 ||
    (points.length < minEvidenceForGeometry && confidencePoints.length < minEvidenceForGeometry)
  ) {
    return empty;
  }

  const shapeIds = routeShapeMapping.get(routeId);
  if (!shapeIds || shapeIds.length === 0) return empty;

  const lastEvidenceAt = points[points.length - 1].timestampMs;
  const candidateShapeIds = resolveShapeSelectionCandidates(shapeIds, [
    evidenceWindow.points,
    evidenceWindow.entryCandidates,
    evidenceWindow.exitCandidates,
  ]);
  empty.debug.candidateShapeIds = candidateShapeIds;
  const bestShape = findBestShapeProjection(points, shapes, candidateShapeIds);
  if (!bestShape) return empty;
  empty.debug.selectedShapeId = bestShape.shapeId;
  const projectedEntryCandidates = projectBoundaryCandidates(evidenceWindow.entryCandidates, bestShape.polyline);
  const projectedExitCandidates = projectBoundaryCandidates(evidenceWindow.exitCandidates, bestShape.polyline);

  const clusters = clusterProjectedEvidence(bestShape.projectedPoints);
  empty.debug.clusterCount = clusters.length;
  let segments = clusters
    .map((cluster) => buildSegmentGeometry(cluster, bestShape.polyline, now, detectedAtMs, {
      entryCandidates: projectedEntryCandidates,
      exitCandidates: projectedExitCandidates,
    }, routeConfig, confidencePoints))
    .filter(Boolean)
    .map((segment) => publishableSegment(bestShape.shapeId, segment));
  segments = removeRedundantWeakSegments(segments);

  const fullEvidenceSegment = buildSegmentGeometry(
    bestShape.projectedPoints,
    bestShape.polyline,
    now,
    detectedAtMs,
    {
      entryCandidates: projectedEntryCandidates,
      exitCandidates: projectedExitCandidates,
    },
    routeConfig,
    confidencePoints
  );

  if (
    fullEvidenceSegment?.canShowDetourPath === true &&
    Array.isArray(fullEvidenceSegment.inferredDetourPolyline) &&
    fullEvidenceSegment.inferredDetourPolyline.length >= 2
  ) {
    segments = [publishableSegment(bestShape.shapeId, fullEvidenceSegment)];
  }

  if (segments.length > 1) {
    if (shouldCollapseWeakClustersIntoSingleSegment(segments, fullEvidenceSegment)) {
      segments = [publishableSegment(bestShape.shapeId, fullEvidenceSegment)];
    }
  }

  if (segments.length === 0) return empty;

  segments = enrichSegmentsWithStopImpacts(routeId, segments, shapes, bestShape.shapeId, stopImpactData);
  const primarySegment = pickPrimarySegment(segments);
  const confidence = scoreConfidence(confidencePoints, detectedAtMs, now, routeConfig);

  return {
    shapeId: bestShape.shapeId,
    segments,
    skippedSegmentPolyline: primarySegment?.skippedSegmentPolyline ?? null,
    inferredDetourPolyline: primarySegment?.inferredDetourPolyline ?? null,
    entryPoint: primarySegment?.entryPoint ?? null,
    exitPoint: primarySegment?.exitPoint ?? null,
    confidence,
    canShowDetourPath: primarySegment?.canShowDetourPath === true,
    skippedStopIds: primarySegment?.skippedStopIds || [],
    skippedStopCodes: primarySegment?.skippedStopCodes || [],
    skippedStops: primarySegment?.skippedStops || [],
    affectedStopIds: primarySegment?.affectedStopIds || [],
    affectedStopCodes: primarySegment?.affectedStopCodes || [],
    affectedStops: primarySegment?.affectedStops || [],
    entryStopId: primarySegment?.entryStopId || null,
    exitStopId: primarySegment?.exitStopId || null,
    evidencePointCount: points.length,
    lastEvidenceAt,
    debug: {
      routeId,
      candidateShapeIds,
      selectedShapeId: bestShape.shapeId,
      clusterCount: clusters.length,
      routeFamilyHandoffEnabled: ENABLE_ROUTE_FAMILY_HANDOFF,
      minEvidenceForGeometry,
      confidenceEvidencePointCount: confidencePoints.length,
      routeSpecificGeometryOverride: Boolean(
        routeConfig.multiVehiclePathMinUniqueVehicles ||
        routeConfig.mediumConfidenceMinUniqueVehicles ||
        routeConfig.minEvidenceForGeometry
      ),
    },
  };
}

module.exports = {
  findClosestShapePoint,
  findAnchors,
  buildCumulativeDistances,
  projectEvidenceOntoShape,
  findBestShapeProjection,
  clusterProjectedEvidence,
  resolveShapeSelectionCandidates,
  projectBoundaryCandidates,
  selectEntryBoundaryCandidate,
  selectExitBoundaryCandidate,
  buildSegmentGeometry,
  pickPrimarySegment,
  getRouteFamilyKey,
  hasRenderableSegment,
  hasRenderableGeometry,
  enrichGeometryStopImpacts,
  enrichDetourMapStopImpacts,
  reconcileRouteFamilyGeometries,
  extractSkippedSegment,
  extractSkippedSegmentByProgress,
  douglasPeucker,
  selectRepresentativeDetourPath,
  scoreConfidence,
  buildGeometry,
  ENABLE_ROUTE_FAMILY_HANDOFF,
  MIN_EVIDENCE_FOR_GEOMETRY,
  MIN_SIMPLIFIED_POINTS,
  MIN_LINEAR_SEGMENT_LENGTH_METERS,
  MIN_SAME_VEHICLE_PATH_POINTS,
  HIGH_CONFIDENCE_CORROBORATED_OBSERVATIONS,
  DP_TOLERANCE_METERS,
  SEGMENT_GAP_METERS,
  UNTRUSTED_PATH_MAX_ENDPOINT_MISMATCH_METERS,
};
