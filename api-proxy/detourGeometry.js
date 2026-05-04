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

// Minimum evidence points needed for any geometry output
const MIN_EVIDENCE_FOR_GEOMETRY = 3;
// Minimum points after simplification to return an inferredDetourPolyline
const MIN_SIMPLIFIED_POINTS = 2;
// Douglas-Peucker tolerance in meters
const DP_TOLERANCE_METERS = 25;
// Minimum linear span on the route to publish skipped-segment geometry
const MIN_LINEAR_SEGMENT_LENGTH_METERS = Number.parseFloat(
  process.env.DETOUR_MIN_LINEAR_SEGMENT_LENGTH_METERS || '100'
);
// Minimum distance between projected evidence clusters before they count as separate detour segments
const SEGMENT_GAP_METERS = Number.parseFloat(process.env.DETOUR_SEGMENT_GAP_METERS || '400');
// Confidence thresholds
const HIGH_CONFIDENCE_DURATION_MS = 5 * 60 * 1000;
const HIGH_CONFIDENCE_POINTS = 10;
const HIGH_CONFIDENCE_VEHICLES = 2;
const MEDIUM_CONFIDENCE_DURATION_MS = 2 * 60 * 1000;
const MEDIUM_CONFIDENCE_POINTS = 5;
const MEDIUM_CONFIDENCE_VEHICLES = 2;
const ROUTE_FAMILY_SEGMENT_MATCH_METERS = Number.parseFloat(
  process.env.DETOUR_ROUTE_FAMILY_SEGMENT_MATCH_METERS || '250'
);
const ENABLE_ROUTE_FAMILY_HANDOFF = process.env.DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF
  ? process.env.DETOUR_ENABLE_ROUTE_FAMILY_HANDOFF === 'true'
  : true;
const REPRESENTATIVE_PATH_CORRIDOR_METERS = 60;
const REPRESENTATIVE_PATH_OVERLAP_THRESHOLD = 0.7;

const reconcileRouteFamilyGeometries = createRouteFamilyReconciler({
  enabled: ENABLE_ROUTE_FAMILY_HANDOFF,
  segmentMatchMeters: ROUTE_FAMILY_SEGMENT_MATCH_METERS,
  minLinearSegmentLengthMeters: MIN_LINEAR_SEGMENT_LENGTH_METERS,
  haversineDistance,
  findClosestShapePoint,
  buildCumulativeDistances,
  extractSkippedSegmentByProgress,
  dedupeConsecutivePoints,
  pickPrimarySegment,
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

function buildSegmentGeometry(cluster, polyline, now, detectedAtMs, boundaryCandidates = {}) {
  if (!Array.isArray(cluster) || cluster.length === 0) return null;

  const sortedByProgress = cluster
    .slice()
    .sort((a, b) => a.progressMeters - b.progressMeters || a.timestampMs - b.timestampMs);
  const segmentDetectedAtMs = Math.min(...cluster.map((point) => point.timestampMs));
  const lastEvidenceAt = Math.max(...cluster.map((point) => point.timestampMs));
  const selectedEntryBoundaryCandidate = selectEntryBoundaryCandidate(
    boundaryCandidates.entryCandidates,
    segmentDetectedAtMs
  );
  const selectedExitBoundaryCandidate = selectExitBoundaryCandidate(
    boundaryCandidates.exitCandidates,
    lastEvidenceAt
  );
  const rawEntryProjection = selectedEntryBoundaryCandidate || sortedByProgress[0];
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

  const representativeDetourPath = selectRepresentativeDetourPath(cluster);
  const rawCoords = cluster
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  const simplified = douglasPeucker(rawCoords, DP_TOLERANCE_METERS);
  const inferredDetourPolyline =
    representativeDetourPath ||
    (simplified.length >= MIN_SIMPLIFIED_POINTS ? simplified : null);
  const entryPoint = entryProjection.projectedPoint
    ? {
      latitude: entryProjection.projectedPoint.latitude,
      longitude: entryProjection.projectedPoint.longitude,
    }
    : null;
  const exitPoint = exitProjection.projectedPoint
    ? {
      latitude: exitProjection.projectedPoint.latitude,
      longitude: exitProjection.projectedPoint.longitude,
    }
    : null;
  const anchoredInferredDetourPolyline = inferredDetourPolyline
    ? anchorPolylineToEndpoints(
      inferredDetourPolyline,
      hasEntryBoundaryCandidate ? entryPoint : null,
      hasExitBoundaryCandidate ? exitPoint : null
    )
    : null;
  const confidence = scoreConfidence(cluster, Math.min(segmentDetectedAtMs, detectedAtMs), now);
  const hasRenderableSkippedSegment =
    hasExitBoundaryCandidate &&
    skippedSegmentPolyline.length >= 2 && spanMeters >= MIN_LINEAR_SEGMENT_LENGTH_METERS;

  const hasRenderableGeometry =
    hasRenderableSkippedSegment ||
    (anchoredInferredDetourPolyline && anchoredInferredDetourPolyline.length >= 2);
  if (!hasRenderableGeometry) return null;

  return {
    entryIndex,
    exitIndex,
    spanMeters,
    skippedSegmentPolyline: hasRenderableSkippedSegment ? skippedSegmentPolyline : null,
    inferredDetourPolyline: anchoredInferredDetourPolyline,
    entryPoint,
    exitPoint,
    confidence,
    evidencePointCount: cluster.length,
    lastEvidenceAt,
    debug: {
      entryAnchorSource:
        rawEntryProjection === sortedByProgress[0] ? 'projected-evidence-fallback' : 'boundary-candidate',
      exitAnchorSource:
        rawExitProjection === sortedByProgress[sortedByProgress.length - 1]
          ? 'projected-evidence-fallback'
          : 'boundary-candidate',
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

/**
 * Score geometry confidence based on evidence density, duration, and vehicle count.
 */
function scoreConfidence(evidencePoints, detectedAtMs, now) {
  if (!evidencePoints || evidencePoints.length === 0) return 'low';

  const count = evidencePoints.length;
  const durationMs = now - detectedAtMs;
  const uniqueVehicles = new Set(
    evidencePoints.map(p => p.recurringObservationId || p.vehicleId)
  ).size;

  if (durationMs >= HIGH_CONFIDENCE_DURATION_MS &&
      count >= HIGH_CONFIDENCE_POINTS &&
      uniqueVehicles >= HIGH_CONFIDENCE_VEHICLES) {
    return 'high';
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
function buildGeometry(routeId, evidenceWindow, shapes, routeShapeMapping, now, detectedAtMs) {
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
    },
  };

  if (!evidenceWindow || evidenceWindow.points.length < MIN_EVIDENCE_FOR_GEOMETRY) {
    return empty;
  }

  const points = evidenceWindow.points;
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
    }))
    .filter(Boolean)
    .map((segment) => ({
      shapeId: bestShape.shapeId,
      skippedSegmentPolyline: segment.skippedSegmentPolyline,
      inferredDetourPolyline: segment.inferredDetourPolyline,
      entryPoint: segment.entryPoint,
      exitPoint: segment.exitPoint,
      confidence: segment.confidence,
      evidencePointCount: segment.evidencePointCount,
      lastEvidenceAt: segment.lastEvidenceAt,
      spanMeters: segment.spanMeters,
      entryIndex: segment.entryIndex,
      exitIndex: segment.exitIndex,
      debug: segment.debug,
    }));
  segments = removeRedundantWeakSegments(segments);

  if (segments.length > 1) {
    const mergedSegment = buildSegmentGeometry(
      bestShape.projectedPoints,
      bestShape.polyline,
      now,
      detectedAtMs,
      {
        entryCandidates: projectedEntryCandidates,
        exitCandidates: projectedExitCandidates,
      }
    );

    if (shouldCollapseWeakClustersIntoSingleSegment(segments, mergedSegment)) {
      segments = [{
        shapeId: bestShape.shapeId,
        skippedSegmentPolyline: mergedSegment.skippedSegmentPolyline,
        inferredDetourPolyline: mergedSegment.inferredDetourPolyline,
        entryPoint: mergedSegment.entryPoint,
        exitPoint: mergedSegment.exitPoint,
        confidence: mergedSegment.confidence,
        evidencePointCount: mergedSegment.evidencePointCount,
        lastEvidenceAt: mergedSegment.lastEvidenceAt,
        spanMeters: mergedSegment.spanMeters,
        entryIndex: mergedSegment.entryIndex,
        exitIndex: mergedSegment.exitIndex,
        debug: mergedSegment.debug,
      }];
    }
  }

  if (segments.length === 0) return empty;

  const primarySegment = pickPrimarySegment(segments);
  const confidence = scoreConfidence(points, detectedAtMs, now);

  return {
    shapeId: bestShape.shapeId,
    segments,
    skippedSegmentPolyline: primarySegment?.skippedSegmentPolyline ?? null,
    inferredDetourPolyline: primarySegment?.inferredDetourPolyline ?? null,
    entryPoint: primarySegment?.entryPoint ?? null,
    exitPoint: primarySegment?.exitPoint ?? null,
    confidence,
    evidencePointCount: points.length,
    lastEvidenceAt,
    debug: {
      routeId,
      candidateShapeIds,
      selectedShapeId: bestShape.shapeId,
      clusterCount: clusters.length,
      routeFamilyHandoffEnabled: ENABLE_ROUTE_FAMILY_HANDOFF,
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
  DP_TOLERANCE_METERS,
  SEGMENT_GAP_METERS,
};
