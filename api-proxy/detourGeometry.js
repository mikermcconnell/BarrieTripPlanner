'use strict';

const { haversineDistance, pointToPolylineDistance, pointToSegmentDistance } = require('./geometry');

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
const ROUTE_FAMILY_SEGMENT_MATCH_METERS = Number.parseFloat(
  process.env.DETOUR_ROUTE_FAMILY_SEGMENT_MATCH_METERS || '250'
);
const REPRESENTATIVE_PATH_CORRIDOR_METERS = 60;
const REPRESENTATIVE_PATH_OVERLAP_THRESHOLD = 0.7;

/**
 * Find the closest point on a polyline to a coordinate.
 * Returns the segment start index, the projected point, and the distance in meters.
 */
function findClosestShapePoint(coord, polyline) {
  if (!polyline || polyline.length === 0) return null;
  if (polyline.length === 1) {
    return {
      index: 0,
      projectedPoint: { latitude: polyline[0].latitude, longitude: polyline[0].longitude },
      distanceMeters: haversineDistance(
        coord.latitude, coord.longitude,
        polyline[0].latitude, polyline[0].longitude
      ),
    };
  }

  let bestIndex = 0;
  let bestDist = Infinity;
  let bestProjected = null;

  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];

    const dx = p2.longitude - p1.longitude;
    const dy = p2.latitude - p1.latitude;
    const lenSq = dx * dx + dy * dy;

    let projLat, projLon;
    if (lenSq === 0) {
      projLat = p1.latitude;
      projLon = p1.longitude;
    } else {
      // Scale longitude by cos(lat) for accurate projection
      const cosLat = Math.cos(((p1.latitude + p2.latitude) / 2) * Math.PI / 180);
      const sdx = dx * cosLat;
      const sdy = dy;
      const t = Math.max(0, Math.min(1,
        ((coord.longitude - p1.longitude) * cosLat * sdx + (coord.latitude - p1.latitude) * sdy) / (sdx * sdx + sdy * sdy)
      ));
      projLat = p1.latitude + t * dy;
      projLon = p1.longitude + t * dx;
    }

    const dist = haversineDistance(coord.latitude, coord.longitude, projLat, projLon);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
      bestProjected = { latitude: projLat, longitude: projLon };
    }
  }

  return { index: bestIndex, projectedPoint: bestProjected, distanceMeters: bestDist };
}

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

function buildCumulativeDistances(polyline) {
  const cumulative = [0];
  for (let i = 1; i < polyline.length; i++) {
    cumulative[i] =
      cumulative[i - 1] +
      haversineDistance(
        polyline[i - 1].latitude,
        polyline[i - 1].longitude,
        polyline[i].latitude,
        polyline[i].longitude
      );
  }
  return cumulative;
}

function dedupeConsecutivePoints(points) {
  if (!Array.isArray(points) || points.length === 0) return [];

  return points.reduce((deduped, point) => {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      previous.latitude === point.latitude &&
      previous.longitude === point.longitude
    ) {
      return deduped;
    }

    deduped.push({
      latitude: point.latitude,
      longitude: point.longitude,
    });
    return deduped;
  }, []);
}

function buildPolylineLengthMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }

  return total;
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

function interpolatePointAlongPolyline(polyline, cumulativeDistances, targetMeters) {
  if (!Array.isArray(polyline) || polyline.length === 0) return null;
  if (polyline.length === 1) {
    return {
      latitude: polyline[0].latitude,
      longitude: polyline[0].longitude,
    };
  }

  const maxDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const clampedTarget = Math.max(0, Math.min(targetMeters, maxDistance));

  for (let i = 1; i < cumulativeDistances.length; i++) {
    if (cumulativeDistances[i] < clampedTarget) continue;

    const segmentStartDistance = cumulativeDistances[i - 1];
    const segmentLength = cumulativeDistances[i] - segmentStartDistance;
    if (segmentLength <= 0) {
      return {
        latitude: polyline[i].latitude,
        longitude: polyline[i].longitude,
      };
    }

    const ratio = (clampedTarget - segmentStartDistance) / segmentLength;
    return {
      latitude: polyline[i - 1].latitude + (polyline[i].latitude - polyline[i - 1].latitude) * ratio,
      longitude: polyline[i - 1].longitude + (polyline[i].longitude - polyline[i - 1].longitude) * ratio,
    };
  }

  const lastPoint = polyline[polyline.length - 1];
  return {
    latitude: lastPoint.latitude,
    longitude: lastPoint.longitude,
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

function getRouteFamilyKey(routeId) {
  const normalized = String(routeId || '').trim().toUpperCase();
  const match = normalized.match(/^(\d+)([A-Z]+)$/);
  return match ? match[1] : null;
}

function confidenceRank(confidence) {
  switch (String(confidence || '').toLowerCase()) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function hasRenderableSegment(segment) {
  if (!segment) return false;
  return (
    Array.isArray(segment.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2
  ) || (
    Array.isArray(segment.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2
  );
}

function hasRenderableGeometry(geometry) {
  return Array.isArray(geometry?.segments) && geometry.segments.some(hasRenderableSegment);
}

function getSegmentMatchDistanceMeters(a, b) {
  if (!a?.entryPoint || !a?.exitPoint || !b?.entryPoint || !b?.exitPoint) return Infinity;

  const direct =
    haversineDistance(
      a.entryPoint.latitude,
      a.entryPoint.longitude,
      b.entryPoint.latitude,
      b.entryPoint.longitude
    ) +
    haversineDistance(
      a.exitPoint.latitude,
      a.exitPoint.longitude,
      b.exitPoint.latitude,
      b.exitPoint.longitude
    );

  const reversed =
    haversineDistance(
      a.entryPoint.latitude,
      a.entryPoint.longitude,
      b.exitPoint.latitude,
      b.exitPoint.longitude
    ) +
    haversineDistance(
      a.exitPoint.latitude,
      a.exitPoint.longitude,
      b.entryPoint.latitude,
      b.entryPoint.longitude
    );

  return Math.min(direct, reversed) / 2;
}

function scoreRouteFamilyLeader(detour) {
  const geometry = detour?.geometry || null;
  const segments = Array.isArray(geometry?.segments)
    ? geometry.segments.filter(hasRenderableSegment)
    : [];
  const bestEvidence = segments.reduce((max, segment) => Math.max(max, segment.evidencePointCount || 0), 0);
  return {
    confidence: confidenceRank(geometry?.confidence),
    vehicleCount: detour?.vehicleCount || detour?.vehiclesOffRoute?.size || 0,
    segmentCount: segments.length,
    bestEvidence,
  };
}

function compareLeaderScores(a, b) {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  if (b.vehicleCount !== a.vehicleCount) return b.vehicleCount - a.vehicleCount;
  if (b.segmentCount !== a.segmentCount) return b.segmentCount - a.segmentCount;
  return b.bestEvidence - a.bestEvidence;
}

function findBestShapeForSegment(segment, shapes, shapeIds) {
  if (!segment?.entryPoint || !segment?.exitPoint || !Array.isArray(shapeIds) || shapeIds.length === 0) {
    return null;
  }

  let best = null;

  for (const shapeId of shapeIds) {
    const polyline = shapes.get(shapeId);
    if (!polyline || polyline.length < 2) continue;

    const entryProjection = findClosestShapePoint(segment.entryPoint, polyline);
    const exitProjection = findClosestShapePoint(segment.exitPoint, polyline);
    if (!entryProjection || !exitProjection) continue;

    const cumulative = buildCumulativeDistances(polyline);
    const entryProgress =
      cumulative[entryProjection.index] +
      haversineDistance(
        polyline[entryProjection.index].latitude,
        polyline[entryProjection.index].longitude,
        entryProjection.projectedPoint.latitude,
        entryProjection.projectedPoint.longitude
      );
    const exitProgress =
      cumulative[exitProjection.index] +
      haversineDistance(
        polyline[exitProjection.index].latitude,
        polyline[exitProjection.index].longitude,
        exitProjection.projectedPoint.latitude,
        exitProjection.projectedPoint.longitude
      );

    const totalDistance = entryProjection.distanceMeters + exitProjection.distanceMeters;
    if (!best || totalDistance < best.totalDistance) {
      best = {
        shapeId,
        polyline,
        totalDistance,
        entryProjection,
        exitProjection,
        entryProgress,
        exitProgress,
      };
    }
  }

  return best;
}

function projectSegmentOntoSiblingRoute(segment, shapes, targetShapeIds) {
  const bestShape = findBestShapeForSegment(segment, shapes, targetShapeIds);
  if (!bestShape) return null;

  const semanticReversed = bestShape.entryProgress > bestShape.exitProgress;
  const routeEntry = semanticReversed ? bestShape.exitProjection : bestShape.entryProjection;
  const routeExit = semanticReversed ? bestShape.entryProjection : bestShape.exitProjection;
  const startProgress = Math.min(bestShape.entryProgress, bestShape.exitProgress);
  const endProgress = Math.max(bestShape.entryProgress, bestShape.exitProgress);
  const spanMeters = Math.max(0, endProgress - startProgress);
  const skippedSegmentPolyline = extractSkippedSegmentByProgress(
    bestShape.polyline,
    startProgress,
    endProgress
  );

  return {
    shapeId: bestShape.shapeId,
    skippedSegmentPolyline:
      skippedSegmentPolyline.length >= 2 && spanMeters >= MIN_LINEAR_SEGMENT_LENGTH_METERS
        ? skippedSegmentPolyline
        : null,
    inferredDetourPolyline: Array.isArray(segment.inferredDetourPolyline)
      ? dedupeConsecutivePoints(segment.inferredDetourPolyline)
      : null,
    entryPoint: routeEntry.projectedPoint
      ? {
        latitude: routeEntry.projectedPoint.latitude,
        longitude: routeEntry.projectedPoint.longitude,
      }
      : null,
    exitPoint: routeExit.projectedPoint
      ? {
        latitude: routeExit.projectedPoint.latitude,
        longitude: routeExit.projectedPoint.longitude,
      }
      : null,
    confidence: segment.confidence || 'low',
    evidencePointCount: segment.evidencePointCount || 0,
    lastEvidenceAt: segment.lastEvidenceAt || null,
    spanMeters,
    entryIndex: routeEntry.index,
    exitIndex: routeExit.index,
  };
}

function mergeSiblingSegments(existingSegments, leaderSegments, shapes, targetShapeIds) {
  const normalizedExisting = Array.isArray(existingSegments)
    ? existingSegments.filter(hasRenderableSegment)
    : [];
  const result = [...normalizedExisting];

  for (const leaderSegment of leaderSegments) {
    const alreadyMatched = normalizedExisting.some((segment) =>
      getSegmentMatchDistanceMeters(segment, leaderSegment) <= ROUTE_FAMILY_SEGMENT_MATCH_METERS
    );
    if (alreadyMatched) continue;

    const projected = projectSegmentOntoSiblingRoute(leaderSegment, shapes, targetShapeIds);
    if (projected && hasRenderableSegment(projected)) {
      result.push(projected);
    }
  }

  return result;
}

function reconcileRouteFamilyGeometries(detourMap, shapes, routeShapeMapping) {
  if (!detourMap || typeof detourMap !== 'object') return detourMap;

  const families = new Map();
  for (const routeId of routeShapeMapping.keys()) {
    const familyKey = getRouteFamilyKey(routeId);
    if (!familyKey) continue;
    if (!families.has(familyKey)) families.set(familyKey, []);
    families.get(familyKey).push(routeId);
  }

  for (const routeIds of families.values()) {
    if (!Array.isArray(routeIds) || routeIds.length < 2) continue;

    const entries = routeIds
      .map((routeId) => [routeId, detourMap[routeId]])
      .filter(([, detour]) => hasRenderableGeometry(detour?.geometry));
    if (entries.length === 0) continue;

    const leaderEntry = entries
      .slice()
      .sort(([, a], [, b]) => compareLeaderScores(scoreRouteFamilyLeader(a), scoreRouteFamilyLeader(b)))[0];
    const [leaderRouteId, leaderDetour] = leaderEntry;
    const leaderSegments = (leaderDetour.geometry?.segments || []).filter(hasRenderableSegment);
    if (leaderSegments.length === 0) continue;

    for (const [routeId, detour] of entries) {
      if (routeId === leaderRouteId) continue;

      const targetShapeIds = routeShapeMapping.get(routeId);
      if (!Array.isArray(targetShapeIds) || targetShapeIds.length === 0) continue;

      const existingSegments = (detour.geometry?.segments || []).filter(hasRenderableSegment);
      const matchingCount = existingSegments.filter((segment) =>
        leaderSegments.some((leaderSegment) =>
          getSegmentMatchDistanceMeters(segment, leaderSegment) <= ROUTE_FAMILY_SEGMENT_MATCH_METERS
        )
      ).length;

      let reconciledSegments = existingSegments;
      if (existingSegments.length === 0 || matchingCount === 0) {
        reconciledSegments = leaderSegments
          .map((segment) => projectSegmentOntoSiblingRoute(segment, shapes, targetShapeIds))
          .filter(hasRenderableSegment);
      } else if (matchingCount < leaderSegments.length) {
        reconciledSegments = mergeSiblingSegments(existingSegments, leaderSegments, shapes, targetShapeIds);
      }

      if (!Array.isArray(reconciledSegments) || reconciledSegments.length === 0) continue;

      const primarySegment = pickPrimarySegment(reconciledSegments);
      detour.geometry = {
        ...(detour.geometry || {}),
        shapeId: primarySegment?.shapeId ?? detour.geometry?.shapeId ?? null,
        segments: reconciledSegments,
        skippedSegmentPolyline: primarySegment?.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: primarySegment?.inferredDetourPolyline ?? null,
        entryPoint: primarySegment?.entryPoint ?? null,
        exitPoint: primarySegment?.exitPoint ?? null,
        confidence:
          confidenceRank(leaderDetour.geometry?.confidence) > confidenceRank(detour.geometry?.confidence)
            ? leaderDetour.geometry.confidence
            : detour.geometry?.confidence || leaderDetour.geometry?.confidence || 'low',
        evidencePointCount: Math.max(
          detour.geometry?.evidencePointCount || 0,
          leaderDetour.geometry?.evidencePointCount || 0
        ),
        lastEvidenceAt: Math.max(
          detour.geometry?.lastEvidenceAt || 0,
          leaderDetour.geometry?.lastEvidenceAt || 0
        ) || null,
      };
    }

    for (const routeId of routeIds) {
      if (detourMap[routeId]) continue;

      const targetShapeIds = routeShapeMapping.get(routeId);
      if (!Array.isArray(targetShapeIds) || targetShapeIds.length === 0) continue;

      const projectedSegments = leaderSegments
        .map((segment) => projectSegmentOntoSiblingRoute(segment, shapes, targetShapeIds))
        .filter(hasRenderableSegment);
      if (projectedSegments.length === 0) continue;

      const primarySegment = pickPrimarySegment(projectedSegments);
      detourMap[routeId] = {
        ...leaderDetour,
        routeId,
        triggerVehicleId: null,
        vehiclesOffRoute: new Set(),
        vehicleCount: leaderDetour.vehicleCount || leaderDetour.vehiclesOffRoute?.size || 0,
        geometry: {
          ...(leaderDetour.geometry || {}),
          shapeId: primarySegment?.shapeId ?? null,
          segments: projectedSegments,
          skippedSegmentPolyline: primarySegment?.skippedSegmentPolyline ?? null,
          inferredDetourPolyline: primarySegment?.inferredDetourPolyline ?? null,
          entryPoint: primarySegment?.entryPoint ?? null,
          exitPoint: primarySegment?.exitPoint ?? null,
        },
        handoffSourceRouteId: leaderRouteId,
      };
    }
  }

  return detourMap;
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
  const rawEntryProjection =
    selectEntryBoundaryCandidate(boundaryCandidates.entryCandidates, segmentDetectedAtMs) ||
    sortedByProgress[0];
  const rawExitProjection =
    selectExitBoundaryCandidate(boundaryCandidates.exitCandidates, lastEvidenceAt) ||
    sortedByProgress[sortedByProgress.length - 1];
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
    ? anchorPolylineToEndpoints(inferredDetourPolyline, entryPoint, exitPoint)
    : null;
  const confidence = scoreConfidence(cluster, Math.min(segmentDetectedAtMs, detectedAtMs), now);
  const hasRenderableSkippedSegment =
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
  };
}

function shouldCollapseWeakClustersIntoSingleSegment(segments, mergedSegment) {
  if (!Array.isArray(segments) || segments.length < 2 || !mergedSegment) return false;

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

function pickPrimarySegment(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  return segments
    .slice()
    .sort((a, b) => {
      if ((b.evidencePointCount || 0) !== (a.evidencePointCount || 0)) {
        return (b.evidencePointCount || 0) - (a.evidencePointCount || 0);
      }
      if ((b.spanMeters || 0) !== (a.spanMeters || 0)) {
        return (b.spanMeters || 0) - (a.spanMeters || 0);
      }
      return (b.exitIndex - b.entryIndex) - (a.exitIndex - a.entryIndex);
    })[0];
}

/**
 * Extract a slice of the polyline between entryIndex and exitIndex (inclusive of endpoints).
 */
function extractSkippedSegment(polyline, entryIndex, exitIndex) {
  if (!polyline || polyline.length === 0) return [];
  const start = Math.max(0, entryIndex);
  const end = Math.min(polyline.length - 1, exitIndex);
  return polyline.slice(start, end + 1).map(p => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}

function extractSkippedSegmentByProgress(polyline, entryProgressMeters, exitProgressMeters) {
  if (!Array.isArray(polyline) || polyline.length === 0) return [];

  const cumulativeDistances = buildCumulativeDistances(polyline);
  const maxDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;
  const startMeters = Math.max(0, Math.min(entryProgressMeters, exitProgressMeters, maxDistance));
  const endMeters = Math.max(0, Math.min(Math.max(entryProgressMeters, exitProgressMeters), maxDistance));

  const points = [];
  const startPoint = interpolatePointAlongPolyline(polyline, cumulativeDistances, startMeters);
  if (startPoint) points.push(startPoint);

  for (let i = 1; i < cumulativeDistances.length - 1; i++) {
    if (cumulativeDistances[i] <= startMeters || cumulativeDistances[i] >= endMeters) continue;
    points.push({
      latitude: polyline[i].latitude,
      longitude: polyline[i].longitude,
    });
  }

  const endPoint = interpolatePointAlongPolyline(polyline, cumulativeDistances, endMeters);
  if (endPoint) points.push(endPoint);

  return dedupeConsecutivePoints(points);
}

/**
 * Douglas-Peucker polyline simplification using haversine distances.
 */
function douglasPeucker(points, toleranceMeters) {
  if (!points || points.length <= 2) return points ? points.slice() : [];

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > toleranceMeters) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), toleranceMeters);
    const right = douglasPeucker(points.slice(maxIdx), toleranceMeters);
    return left.slice(0, -1).concat(right);
  }

  return [start, end];
}

/**
 * Score geometry confidence based on evidence density, duration, and vehicle count.
 */
function scoreConfidence(evidencePoints, detectedAtMs, now) {
  if (!evidencePoints || evidencePoints.length === 0) return 'low';

  const count = evidencePoints.length;
  const durationMs = now - detectedAtMs;
  const uniqueVehicles = new Set(evidencePoints.map(p => p.vehicleId)).size;

  if (durationMs >= HIGH_CONFIDENCE_DURATION_MS &&
      count >= HIGH_CONFIDENCE_POINTS &&
      uniqueVehicles >= HIGH_CONFIDENCE_VEHICLES) {
    return 'high';
  }
  if (durationMs >= MEDIUM_CONFIDENCE_DURATION_MS && count >= MEDIUM_CONFIDENCE_POINTS) {
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
  const bestShape = findBestShapeProjection(points, shapes, candidateShapeIds);
  if (!bestShape) return empty;
  const projectedEntryCandidates = projectBoundaryCandidates(evidenceWindow.entryCandidates, bestShape.polyline);
  const projectedExitCandidates = projectBoundaryCandidates(evidenceWindow.exitCandidates, bestShape.polyline);

  const clusters = clusterProjectedEvidence(bestShape.projectedPoints);
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
    }));

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
  MIN_EVIDENCE_FOR_GEOMETRY,
  MIN_SIMPLIFIED_POINTS,
  MIN_LINEAR_SEGMENT_LENGTH_METERS,
  DP_TOLERANCE_METERS,
  SEGMENT_GAP_METERS,
};
