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

function createRouteFamilyReconciler({
  enabled,
  segmentMatchMeters,
  minLinearSegmentLengthMeters,
  haversineDistance,
  findClosestShapePoint,
  buildCumulativeDistances,
  extractSkippedSegmentByProgress,
  dedupeConsecutivePoints,
  pickPrimarySegment,
}) {
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
        skippedSegmentPolyline.length >= 2 && spanMeters >= minLinearSegmentLengthMeters
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
      debug: {
        ...(segment.debug || {}),
        projectedFromSiblingShapeId: segment.shapeId || null,
        projectedToShapeId: bestShape.shapeId,
        routeFamilyHandoffEnabled: true,
        semanticReversed,
      },
    };
  }

  function mergeSiblingSegments(existingSegments, leaderSegments, shapes, targetShapeIds) {
    const normalizedExisting = Array.isArray(existingSegments)
      ? existingSegments.filter(hasRenderableSegment)
      : [];
    const result = [...normalizedExisting];

    for (const leaderSegment of leaderSegments) {
      const alreadyMatched = normalizedExisting.some((segment) =>
        getSegmentMatchDistanceMeters(segment, leaderSegment) <= segmentMatchMeters
      );
      if (alreadyMatched) continue;

      const projected = projectSegmentOntoSiblingRoute(leaderSegment, shapes, targetShapeIds);
      if (projected && hasRenderableSegment(projected)) {
        result.push(projected);
      }
    }

    return result;
  }

  return function reconcileRouteFamilyGeometries(detourMap, shapes, routeShapeMapping) {
    if (!detourMap || typeof detourMap !== 'object') return detourMap;
    if (!enabled) return detourMap;

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
            getSegmentMatchDistanceMeters(segment, leaderSegment) <= segmentMatchMeters
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
          debug: {
            ...(detour.geometry?.debug || {}),
            routeFamilyHandoffEnabled: true,
            routeFamilyLeaderRouteId: leaderRouteId,
            routeFamilyMergeMode: existingSegments.length === 0 || matchingCount === 0 ? 'projected' : 'merged',
          },
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
            debug: {
              ...(leaderDetour.geometry?.debug || {}),
              routeFamilyHandoffEnabled: true,
              routeFamilyLeaderRouteId: leaderRouteId,
              routeFamilyMergeMode: 'projected-new-route',
            },
          },
          handoffSourceRouteId: leaderRouteId,
        };
      }
    }

    return detourMap;
  };
}

module.exports = {
  createRouteFamilyReconciler,
  getRouteFamilyKey,
  hasRenderableSegment,
  hasRenderableGeometry,
};
