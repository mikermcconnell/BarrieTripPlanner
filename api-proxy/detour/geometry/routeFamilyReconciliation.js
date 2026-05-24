'use strict';

const {
  normalizeDetourSegmentOrientation,
  normalizeDetourGeometryOrientation,
} = require('./pathOrientation');

const SHARED_LOCATION_TARGET_ROUTE_OVERLAP_METERS = Number.parseFloat(
  process.env.DETOUR_SHARED_LOCATION_TARGET_ROUTE_OVERLAP_METERS || '45'
);
const SHARED_LOCATION_TARGET_ROUTE_OVERLAP_RATIO = Number.parseFloat(
  process.env.DETOUR_SHARED_LOCATION_TARGET_ROUTE_OVERLAP_RATIO || '0.8'
);

function getRouteFamilyKey(routeId) {
  const normalized = String(routeId || '').trim().toUpperCase();
  const match = normalized.match(/^(\d+)([A-Z]+)$/);
  return match ? match[1] : null;
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

function getPhysicalDetourEventId(segment) {
  const skipped = Array.isArray(segment?.skippedSegmentPolyline)
    ? segment.skippedSegmentPolyline.filter(Boolean)
    : [];
  const points = skipped.length >= 2
    ? [skipped[0], skipped[skipped.length - 1]]
    : [segment?.entryPoint, segment?.exitPoint];
  const keys = points.map((point) => getPointKey(point)).filter(Boolean).sort();
  if (keys.length < 2) return null;
  return `detour-event-${stableHash(`closed:${keys.join('|')}`)}`;
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

function hasConfirmedBoundaryAnchors(segment) {
  if (!segment?.entryPoint || !segment?.exitPoint) return false;

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

  return Array.isArray(segment.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length >= 2;
}

function getConfirmedRenderableSegments(geometry) {
  return Array.isArray(geometry?.segments)
    ? geometry.segments.filter((segment) => hasRenderableSegment(segment) && hasConfirmedBoundaryAnchors(segment))
    : [];
}

function createRouteFamilyReconciler({
  enabled,
  segmentMatchMeters,
  minLinearSegmentLengthMeters,
  haversineDistance,
  pointToPolylineDistance,
  findClosestShapePoint,
  buildCumulativeDistances,
  extractSkippedSegmentByProgress,
  dedupeConsecutivePoints,
  pickPrimarySegment,
  targetRouteOverlapMeters = 75,
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
    const segments = getConfirmedRenderableSegments(geometry);
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
    if (!hasConfirmedBoundaryAnchors(segment)) return null;

    const bestShape = findBestShapeForSegment(segment, shapes, targetShapeIds);
    if (!bestShape) return null;
    if (detourPathFollowsTargetRoute(segment, bestShape.polyline)) return null;

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

    return normalizeDetourSegmentOrientation({
      shapeId: bestShape.shapeId,
      skippedSegmentPolyline:
        skippedSegmentPolyline.length >= 2 && spanMeters >= minLinearSegmentLengthMeters
          ? skippedSegmentPolyline
          : null,
      inferredDetourPolyline: Array.isArray(segment.inferredDetourPolyline)
        ? dedupeConsecutivePoints(segment.inferredDetourPolyline)
        : null,
      likelyDetourPolyline: Array.isArray(segment.likelyDetourPolyline)
        ? dedupeConsecutivePoints(segment.likelyDetourPolyline)
        : null,
      likelyDetourRoadNames: Array.isArray(segment.likelyDetourRoadNames)
        ? [...segment.likelyDetourRoadNames]
        : [],
      roadMatchConfidence: segment.roadMatchConfidence || null,
      roadMatchRawConfidence: segment.roadMatchRawConfidence ?? null,
      roadMatchSource: segment.roadMatchSource || null,
      detourPathLabel: segment.detourPathLabel || null,
      detourEventId: segment.detourEventId || null,
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
      canShowDetourPath: segment.canShowDetourPath === false ? false : true,
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
    });
  }

  function getTargetComparableDetourPath(segment) {
    if (Array.isArray(segment?.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 3) {
      return segment.likelyDetourPolyline;
    }
    if (Array.isArray(segment?.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 3) {
      return segment.inferredDetourPolyline;
    }
    return null;
  }

  function detourPathFollowsTargetRoute(segment, targetPolyline) {
    if (typeof pointToPolylineDistance !== 'function') return false;
    if (!Array.isArray(targetPolyline) || targetPolyline.length < 2) return false;

    const path = getTargetComparableDetourPath(segment);
    if (!Array.isArray(path) || path.length < 3) return false;

    const distances = path
      .map((point) => pointToPolylineDistance(point, targetPolyline))
      .filter(Number.isFinite);
    if (distances.length < 3) return false;

    const closeCount = distances.filter((distance) => distance <= targetRouteOverlapMeters).length;
    const closeRatio = closeCount / distances.length;
    const averageDistance = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;

    return closeRatio >= 0.75 && averageDistance <= targetRouteOverlapMeters;
  }

  function getClosedSegmentPath(segment) {
    const skipped = Array.isArray(segment?.skippedSegmentPolyline)
      ? segment.skippedSegmentPolyline.filter(Boolean)
      : [];
    if (skipped.length >= 2) return skipped;
    return [segment?.entryPoint, segment?.exitPoint].filter(Boolean);
  }

  function closedSegmentFollowsTargetRoute(segment, targetPolyline) {
    if (typeof pointToPolylineDistance !== 'function') return false;
    if (!Array.isArray(targetPolyline) || targetPolyline.length < 2) return false;

    const closedPath = getClosedSegmentPath(segment);
    if (closedPath.length < 2) return false;

    const distances = closedPath
      .map((point) => pointToPolylineDistance(point, targetPolyline))
      .filter(Number.isFinite);
    if (distances.length < 2) return false;

    const closeCount = distances.filter(
      (distance) => distance <= SHARED_LOCATION_TARGET_ROUTE_OVERLAP_METERS
    ).length;
    const closeRatio = closeCount / distances.length;
    const maxDistance = Math.max(...distances);

    return (
      closeRatio >= SHARED_LOCATION_TARGET_ROUTE_OVERLAP_RATIO &&
      maxDistance <= SHARED_LOCATION_TARGET_ROUTE_OVERLAP_METERS * 1.5
    );
  }

  function withSharedLocationDebug(segment, sourceRouteId, targetRouteId) {
    return normalizeDetourSegmentOrientation({
      ...segment,
      debug: {
        ...(segment.debug || {}),
        routeFamilyHandoffEnabled: true,
        sharedLocationHandoffEnabled: true,
        routeFamilyMergeMode: 'projected-shared-location',
        projectedFromSharedLocationRouteId: sourceRouteId,
        projectedSharedLocationRouteId: targetRouteId,
      },
    });
  }

  function buildProjectedSiblingDetour(
    routeId,
    leaderRouteId,
    leaderDetour,
    projectedSegments,
    options = {}
  ) {
    const normalizedProjectedSegments = Array.isArray(projectedSegments)
      ? projectedSegments.map(normalizeDetourSegmentOrientation)
      : [];
    const primarySegment = pickPrimarySegment(normalizedProjectedSegments);
    if (!primarySegment) return null;

    const leaderGeometry = leaderDetour.geometry || {};
    const leaderVehicleCount =
      leaderDetour.vehicleCount ??
      leaderDetour.uniqueVehicleCount ??
      leaderDetour.matchedVehicleIds?.size ??
      leaderDetour.vehiclesOffRoute?.size ??
      0;
    const leaderMatchedVehicleIds = leaderDetour.matchedVehicleIds instanceof Set
      ? [...leaderDetour.matchedVehicleIds]
      : Array.isArray(leaderDetour.matchedVehicleIds)
        ? leaderDetour.matchedVehicleIds
        : [];

    return {
      routeId,
      detectedAt: leaderDetour.detectedAt || new Date(),
      lastSeenAt: leaderDetour.lastSeenAt || leaderDetour.detectedAt || new Date(),
      triggerVehicleId: leaderDetour.triggerVehicleId || null,
      vehiclesOffRoute: new Set(),
      matchedVehicleIds: new Set(leaderMatchedVehicleIds.filter(Boolean)),
      normalRouteVehicleIds: new Set(),
      uniqueVehicleCount: leaderDetour.uniqueVehicleCount ?? leaderVehicleCount,
      currentVehicleCount: 0,
      vehicleCount: leaderVehicleCount,
      state: leaderDetour.state || 'active',
      clearReason: leaderDetour.clearReason || null,
      isPersistent: Boolean(leaderDetour.isPersistent),
      handoffSourceRouteId: leaderRouteId,
      geometry: {
        shapeId: primarySegment.shapeId || null,
        segments: normalizedProjectedSegments,
        skippedSegmentPolyline: primarySegment.skippedSegmentPolyline || null,
        inferredDetourPolyline: primarySegment.inferredDetourPolyline || null,
        likelyDetourPolyline: primarySegment.likelyDetourPolyline || null,
        likelyDetourRoadNames: Array.isArray(primarySegment.likelyDetourRoadNames)
          ? primarySegment.likelyDetourRoadNames
          : [],
        roadMatchConfidence: primarySegment.roadMatchConfidence || null,
        roadMatchRawConfidence: primarySegment.roadMatchRawConfidence ?? null,
        roadMatchSource: primarySegment.roadMatchSource || null,
        detourPathLabel: primarySegment.detourPathLabel || leaderGeometry.detourPathLabel || null,
        detourEventId: primarySegment.detourEventId || leaderGeometry.detourEventId || null,
        entryPoint: primarySegment.entryPoint || null,
        exitPoint: primarySegment.exitPoint || null,
        canShowDetourPath: primarySegment.canShowDetourPath === true,
        confidence: leaderGeometry.confidence || primarySegment.confidence || 'low',
        evidencePointCount: leaderGeometry.evidencePointCount || primarySegment.evidencePointCount || 0,
        lastEvidenceAt: leaderGeometry.lastEvidenceAt || primarySegment.lastEvidenceAt || null,
        skippedStopIds: [],
        skippedStopCodes: [],
        skippedStops: [],
        affectedStopIds: [],
        affectedStopCodes: [],
        affectedStops: [],
        entryStopId: null,
        exitStopId: null,
        debug: {
          ...(cloneJson(leaderGeometry.debug) || {}),
          routeFamilyHandoffEnabled: true,
          sharedLocationHandoffEnabled: options.sharedLocation === true,
          routeFamilyLeaderRouteId: leaderRouteId,
          routeFamilyMergeMode: options.mergeMode || 'projected-route',
          projectedRouteId: routeId,
        },
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

  function hasTrustedDetourPath(segment) {
    return segment?.canShowDetourPath === true && (
      (Array.isArray(segment.inferredDetourPolyline) && segment.inferredDetourPolyline.length >= 2) ||
      (Array.isArray(segment.likelyDetourPolyline) && segment.likelyDetourPolyline.length >= 2)
    );
  }

  function confidenceMax(a, b) {
    return confidenceRank(b) > confidenceRank(a) ? b : a;
  }

  function supplementMatchingSegments(existingSegments, leaderSegments, shapes, targetShapeIds, leaderRouteId) {
    return existingSegments.map((existingSegment) => {
      if (hasTrustedDetourPath(existingSegment)) return existingSegment;

      const bestLeader = leaderSegments
        .filter(hasTrustedDetourPath)
        .map((leaderSegment) => ({
          leaderSegment,
          distance: getSegmentMatchDistanceMeters(existingSegment, leaderSegment),
        }))
        .filter((candidate) => candidate.distance <= segmentMatchMeters)
        .sort((a, b) => a.distance - b.distance)[0]?.leaderSegment || null;

      if (!bestLeader) return existingSegment;

      const projected = projectSegmentOntoSiblingRoute(bestLeader, shapes, targetShapeIds);
      if (!projected || !hasTrustedDetourPath(projected)) return existingSegment;

      return normalizeDetourSegmentOrientation({
        ...existingSegment,
        shapeId: projected.shapeId || existingSegment.shapeId || null,
        skippedSegmentPolyline: projected.skippedSegmentPolyline || existingSegment.skippedSegmentPolyline || null,
        inferredDetourPolyline: projected.inferredDetourPolyline || existingSegment.inferredDetourPolyline || null,
        likelyDetourPolyline: projected.likelyDetourPolyline || existingSegment.likelyDetourPolyline || null,
        likelyDetourRoadNames: projected.likelyDetourRoadNames?.length
          ? projected.likelyDetourRoadNames
          : existingSegment.likelyDetourRoadNames || [],
        roadMatchConfidence: projected.roadMatchConfidence || existingSegment.roadMatchConfidence || null,
        roadMatchRawConfidence: projected.roadMatchRawConfidence ?? existingSegment.roadMatchRawConfidence ?? null,
        roadMatchSource: projected.roadMatchSource || existingSegment.roadMatchSource || null,
        detourPathLabel: projected.detourPathLabel || existingSegment.detourPathLabel || null,
        entryPoint: projected.entryPoint || existingSegment.entryPoint || null,
        exitPoint: projected.exitPoint || existingSegment.exitPoint || null,
        canShowDetourPath: true,
        confidence: confidenceMax(existingSegment.confidence || 'low', projected.confidence || 'low'),
        evidencePointCount: Math.max(existingSegment.evidencePointCount || 0, projected.evidencePointCount || 0),
        lastEvidenceAt: Math.max(existingSegment.lastEvidenceAt || 0, projected.lastEvidenceAt || 0) || null,
        spanMeters: projected.spanMeters || existingSegment.spanMeters || 0,
        entryIndex: projected.entryIndex ?? existingSegment.entryIndex,
        exitIndex: projected.exitIndex ?? existingSegment.exitIndex,
        debug: {
          ...(existingSegment.debug || {}),
          projectedFromSiblingShapeId: projected.debug?.projectedFromSiblingShapeId || bestLeader.shapeId || null,
          projectedToShapeId: projected.debug?.projectedToShapeId || projected.shapeId || null,
          routeFamilyHandoffEnabled: true,
          routeFamilyLeaderRouteId: leaderRouteId,
          routeFamilyMergeMode: 'supplemented-path',
        },
      });
    });
  }

  function projectSharedLocationDetours(detourMap, shapes, routeShapeMapping) {
    if (!routeShapeMapping || typeof routeShapeMapping.entries !== 'function') return;

    const routeEntries = [...routeShapeMapping.entries()];
    const sourceEntries = Object.entries(detourMap)
      .flatMap(([sourceRouteId, sourceDetour]) =>
        getConfirmedRenderableSegments(sourceDetour?.geometry).map((segment) => ({
          sourceRouteId,
          sourceDetour,
          segment,
        }))
      );

    for (const { sourceRouteId, sourceDetour, segment } of sourceEntries) {
      const sourceFamilyKey = getRouteFamilyKey(sourceRouteId);

      for (const [targetRouteId, targetShapeIds] of routeEntries) {
        if (targetRouteId === sourceRouteId) continue;
        if (!Array.isArray(targetShapeIds) || targetShapeIds.length === 0) continue;

        const targetFamilyKey = getRouteFamilyKey(targetRouteId);
        if (!sourceFamilyKey || !targetFamilyKey) continue;
        if (sourceFamilyKey && targetFamilyKey && sourceFamilyKey === targetFamilyKey) {
          continue;
        }

        const bestShape = findBestShapeForSegment(segment, shapes, targetShapeIds);
        if (!bestShape || !closedSegmentFollowsTargetRoute(segment, bestShape.polyline)) {
          continue;
        }

        const projected = projectSegmentOntoSiblingRoute(segment, shapes, targetShapeIds);
        if (!projected || !hasRenderableSegment(projected)) continue;

        const sharedSegment = withSharedLocationDebug(projected, sourceRouteId, targetRouteId);
        const targetDetour = detourMap[targetRouteId];

        if (!targetDetour) {
          const projectedDetour = buildProjectedSiblingDetour(
            targetRouteId,
            sourceRouteId,
            sourceDetour,
            [sharedSegment],
            {
              mergeMode: 'projected-shared-location',
              sharedLocation: true,
            }
          );
          if (projectedDetour) {
            detourMap[targetRouteId] = projectedDetour;
          }
          continue;
        }

        const existingSegments = Array.isArray(targetDetour.geometry?.segments)
          ? targetDetour.geometry.segments.filter(hasRenderableSegment)
          : [];
        const alreadyMatched = existingSegments.some((existingSegment) =>
          getSegmentMatchDistanceMeters(existingSegment, sharedSegment) <= segmentMatchMeters
        );
        if (alreadyMatched) {
          const sharedEventId =
            getPhysicalDetourEventId(segment) ||
            segment.detourEventId ||
            sharedSegment.detourEventId ||
            null;
          if (sharedEventId && Array.isArray(targetDetour.geometry?.segments)) {
            targetDetour.geometry.segments = targetDetour.geometry.segments.map((existingSegment) => {
              if (getSegmentMatchDistanceMeters(existingSegment, sharedSegment) > segmentMatchMeters) {
                return existingSegment;
              }
              return withSharedLocationDebug(
                {
                  ...existingSegment,
                  detourEventId: sharedEventId,
                },
                sourceRouteId,
                targetRouteId
              );
            });
            targetDetour.geometry.detourEventId = sharedEventId;
            targetDetour.geometry.debug = {
              ...(targetDetour.geometry.debug || {}),
              routeFamilyHandoffEnabled: true,
              sharedLocationHandoffEnabled: true,
              routeFamilyLeaderRouteId: sourceRouteId,
              routeFamilyMergeMode: 'projected-shared-location',
            };
          }
          continue;
        }

        const reconciledSegments = [...existingSegments, sharedSegment].map(normalizeDetourSegmentOrientation);
        const primarySegment = pickPrimarySegment(reconciledSegments);
        if (!primarySegment) continue;

        targetDetour.geometry = normalizeDetourGeometryOrientation({
          ...(targetDetour.geometry || {}),
          shapeId: primarySegment.shapeId || targetDetour.geometry?.shapeId || null,
          segments: reconciledSegments,
          skippedSegmentPolyline: primarySegment.skippedSegmentPolyline || null,
          inferredDetourPolyline: primarySegment.inferredDetourPolyline || null,
          likelyDetourPolyline: primarySegment.likelyDetourPolyline || targetDetour.geometry?.likelyDetourPolyline || null,
          entryPoint: primarySegment.entryPoint || null,
          exitPoint: primarySegment.exitPoint || null,
          canShowDetourPath: primarySegment.canShowDetourPath === true,
          confidence: confidenceMax(
            targetDetour.geometry?.confidence || 'low',
            sourceDetour.geometry?.confidence || primarySegment.confidence || 'low'
          ),
          evidencePointCount: Math.max(
            targetDetour.geometry?.evidencePointCount || 0,
            sourceDetour.geometry?.evidencePointCount || primarySegment.evidencePointCount || 0
          ),
          lastEvidenceAt: Math.max(
            targetDetour.geometry?.lastEvidenceAt || 0,
            sourceDetour.geometry?.lastEvidenceAt || primarySegment.lastEvidenceAt || 0
          ) || null,
          debug: {
            ...(targetDetour.geometry?.debug || {}),
            routeFamilyHandoffEnabled: true,
            sharedLocationHandoffEnabled: true,
            routeFamilyLeaderRouteId: sourceRouteId,
            routeFamilyMergeMode: 'projected-shared-location',
          },
        });
      }
    }
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
        .filter(([, detour]) => getConfirmedRenderableSegments(detour?.geometry).length > 0);
      if (entries.length === 0) continue;

      const leaderEntry = entries
        .slice()
        .sort(([, a], [, b]) => compareLeaderScores(scoreRouteFamilyLeader(a), scoreRouteFamilyLeader(b)))[0];
      const [leaderRouteId, leaderDetour] = leaderEntry;
      const leaderSegments = getConfirmedRenderableSegments(leaderDetour.geometry);
      if (leaderSegments.length === 0) continue;

      for (const routeId of routeIds) {
        if (routeId === leaderRouteId) continue;

        const targetShapeIds = routeShapeMapping.get(routeId);
        if (!Array.isArray(targetShapeIds) || targetShapeIds.length === 0) continue;

        const detour = detourMap[routeId];
        if (!detour) {
          const projectedSegments = leaderSegments
            .map((segment) => projectSegmentOntoSiblingRoute(segment, shapes, targetShapeIds))
            .filter(hasRenderableSegment);
          const projectedDetour = buildProjectedSiblingDetour(
            routeId,
            leaderRouteId,
            leaderDetour,
            projectedSegments
          );
          if (projectedDetour) {
            detourMap[routeId] = projectedDetour;
          }
          continue;
        }

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
        reconciledSegments = supplementMatchingSegments(
          reconciledSegments,
          leaderSegments,
          shapes,
          targetShapeIds,
          leaderRouteId
        );

        if (!Array.isArray(reconciledSegments) || reconciledSegments.length === 0) continue;
        reconciledSegments = reconciledSegments.map(normalizeDetourSegmentOrientation);

        const primarySegment = pickPrimarySegment(reconciledSegments);
        const supplementedPath = reconciledSegments.some((segment) =>
          segment?.debug?.routeFamilyMergeMode === 'supplemented-path'
        );
        detour.geometry = normalizeDetourGeometryOrientation({
          ...(detour.geometry || {}),
          shapeId: primarySegment?.shapeId ?? detour.geometry?.shapeId ?? null,
          segments: reconciledSegments,
          skippedSegmentPolyline: primarySegment?.skippedSegmentPolyline ?? null,
          inferredDetourPolyline: primarySegment?.inferredDetourPolyline ?? null,
          likelyDetourPolyline: primarySegment?.likelyDetourPolyline ?? detour.geometry?.likelyDetourPolyline ?? null,
          entryPoint: primarySegment?.entryPoint ?? null,
          exitPoint: primarySegment?.exitPoint ?? null,
          canShowDetourPath: primarySegment?.canShowDetourPath === true,
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
            routeFamilyMergeMode: supplementedPath
              ? 'supplemented-path'
              : existingSegments.length === 0 || matchingCount === 0 ? 'projected' : 'merged',
          },
        });
      }

    }

    projectSharedLocationDetours(detourMap, shapes, routeShapeMapping);

    return detourMap;
  };
}

module.exports = {
  createRouteFamilyReconciler,
  getRouteFamilyKey,
  hasRenderableSegment,
  hasRenderableGeometry,
  hasConfirmedBoundaryAnchors,
};
