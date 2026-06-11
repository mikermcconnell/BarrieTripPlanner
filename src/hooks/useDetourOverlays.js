/**
 * useDetourOverlays Hook
 *
 * Derives renderable detour overlay data from active detours and the
 * current route selection. Shared between native and web HomeScreens.
 *
 * Only returns overlays for selected routes that have geometry data.
 * Visibility can be controlled by the caller to support runtime rollout
 * and user-facing detour toggles.
 */
import { useMemo } from 'react';
import { COLORS } from '../config/theme';
import { getMatchingDetourRouteIds } from '../utils/routeDetourMatching';
import { getRouteFamilyId, normalizeRouteId } from '../utils/routeDetourMatching';
import { filterRiderVisibleDetours } from '../utils/detourVisibility';
import {
  getLikelyDetourPath,
  getPathSignature,
  getPrimaryRenderablePath,
  getRenderableDetourPath,
  getTrustedInferredDetourPath,
  isStopServedByRenderableDetourPath,
  normalizePath,
  trimOverlappingSegmentGeometry,
} from '../utils/detourOverlayGeometry';
import { haversineDistance } from '../utils/geometryUtils';


const DETOUR_FAMILY_LANE_SPACING_METERS = 18;
const DETOUR_FAMILY_ARROW_STAGGER_RATIO = 0.045;

const DETOUR_COLORS = {
  SKIPPED: COLORS.error,   // closed regular route segment riders should not expect service on
  DETOUR_FALLBACK: COLORS.primary, // open reroute path fallback when a route color is unavailable
  ROUTE_BASE: '#111827', // neutral base route, closer to the reference map
  ROUTE_STOP_FILL: '#ffffff',
  ROUTE_STOP_STROKE: '#111827',
};

const isValidColor = (value) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim());

const getOverlayRouteColor = (routeId, routeColorByRouteId = {}) => {
  const color = routeColorByRouteId?.[routeId] ?? routeColorByRouteId?.[String(routeId)];
  return isValidColor(color) ? color : DETOUR_COLORS.DETOUR_FALLBACK;
};

const getFamilyHasDistinctDetourPaths = (familyRouteIds, riderVisibleDetours, options = {}) => {
  const signatures = familyRouteIds
    .map((routeId) => getPathSignature(getPrimaryRenderablePath(riderVisibleDetours[routeId], options)))
    .filter(Boolean);

  return new Set(signatures).size > 1;
};

const getCenteredOffset = (index, count, spacing) => {
  if (!Number.isFinite(index) || !Number.isFinite(count) || count <= 1) return 0;
  return (index - ((count - 1) / 2)) * spacing;
};

const routeMatchesFocusedFamily = (routeId, focusedRouteId) => (
  Boolean(focusedRouteId) &&
  getRouteFamilyId(routeId) === getRouteFamilyId(focusedRouteId)
);

const getEndpointOrientationSign = (path, referencePath) => {
  const points = normalizePath(path);
  const reference = normalizePath(referencePath);
  if (points.length < 2 || reference.length < 2) return 1;

  const start = points[0];
  const end = points[points.length - 1];
  const referenceStart = reference[0];
  const referenceEnd = reference[reference.length - 1];
  const sameDirectionDistance =
    haversineDistance(start.latitude, start.longitude, referenceStart.latitude, referenceStart.longitude) +
    haversineDistance(end.latitude, end.longitude, referenceEnd.latitude, referenceEnd.longitude);
  const reversedDirectionDistance =
    haversineDistance(start.latitude, start.longitude, referenceEnd.latitude, referenceEnd.longitude) +
    haversineDistance(end.latitude, end.longitude, referenceStart.latitude, referenceStart.longitude);

  return reversedDirectionDistance < sameDirectionDistance ? -1 : 1;
};

const buildFamilyPathRenderInfo = (familyRouteIds, riderVisibleDetours, focusedRouteId = null, options = {}) => {
  const signatures = familyRouteIds.map((routeId) => ({
    routeId,
    path: getPrimaryRenderablePath(riderVisibleDetours[routeId], options),
    signature: getPathSignature(getPrimaryRenderablePath(riderVisibleDetours[routeId], options)),
  }));
  const signatureOrder = Array.from(new Set(signatures.map((entry) => entry.signature).filter(Boolean)));
  const referencePath = signatures.find((entry) => normalizePath(entry.path).length >= 2)?.path ?? null;
  const primaryRouteBySignature = signatures.reduce((acc, entry) => {
    if (!entry.signature) return acc;
    if (!acc[entry.signature] || entry.routeId === focusedRouteId) {
      acc[entry.signature] = entry.routeId;
    }
    return acc;
  }, {});

  return signatures.reduce((acc, entry, routeIndex) => {
    const signatureIndex = entry.signature ? signatureOrder.indexOf(entry.signature) : routeIndex;
    const laneCount = Math.max(signatureOrder.length, familyRouteIds.length > 1 ? 2 : 1);
    const laneIndex = signatureIndex >= 0 ? signatureIndex : routeIndex;
    const isDuplicateSharedPath =
      Boolean(entry.signature) &&
      signatureOrder.length === 1 &&
      familyRouteIds.length > 1 &&
      primaryRouteBySignature[entry.signature] !== entry.routeId;
    const rawLaneOffsetMeters = signatureOrder.length > 1
      ? getCenteredOffset(laneIndex, signatureOrder.length, DETOUR_FAMILY_LANE_SPACING_METERS)
      : 0;
    const orientationSign = getEndpointOrientationSign(entry.path, referencePath);

    acc[entry.routeId] = {
      isDuplicateSharedPath,
      laneOffsetMeters: rawLaneOffsetMeters * orientationSign,
      arrowPositionOffsetRatio: signatureOrder.length > 1
        ? getCenteredOffset(laneIndex, signatureOrder.length, DETOUR_FAMILY_ARROW_STAGGER_RATIO)
        : 0,
    };
    return acc;
  }, {});
};

const getStopKey = (stop) => (
  String(stop?.id ?? stop?.stopId ?? stop?.stop_id ?? stop?.code ?? stop?.stopCode ?? stop?.name ?? '')
    .trim()
    .toLowerCase()
);

const normalizeRouteKey = (routeId) => (
  routeId == null ? null : String(routeId).trim().toUpperCase()
);

const mergeRouteIds = (...routeLists) => {
  const seen = new Set();
  const merged = [];
  routeLists.flat().forEach((routeId) => {
    const key = normalizeRouteKey(routeId);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(key);
  });
  return merged;
};

const tagStopsForRoute = (routeId, stops = []) => (
  (Array.isArray(stops) ? stops : []).map((stop) => {
    const affectedRouteIds = mergeRouteIds(
      stop?.affectedRouteIds,
      stop?.routeIds,
      stop?.routeId,
      routeId
    );
    const servedRouteIds = mergeRouteIds(stop?.servedRouteIds);

    return {
      ...stop,
      routeId: stop?.routeId ?? routeId,
      routeIds: affectedRouteIds,
      affectedRouteIds,
      servedRouteIds,
      impactScope: stop?.impactScope || (servedRouteIds.length > 0 ? 'partial' : 'route'),
    };
  })
);

const mergeUniqueStops = (...stopLists) => {
  const seen = new Set();
  const merged = [];
  const indexByKey = new Map();

  stopLists.flat().forEach((stop) => {
    if (!stop) return;
    const key = getStopKey(stop);
    if (key && seen.has(key)) {
      const existingIndex = indexByKey.get(key);
      const existing = merged[existingIndex];
      const affectedRouteIds = mergeRouteIds(
        existing?.affectedRouteIds,
        existing?.routeIds,
        existing?.routeId,
        stop?.affectedRouteIds,
        stop?.routeIds,
        stop?.routeId
      );
      const servedRouteIds = mergeRouteIds(existing?.servedRouteIds, stop?.servedRouteIds);
      merged[existingIndex] = {
        ...existing,
        affectedRouteIds,
        routeIds: affectedRouteIds,
        servedRouteIds,
        allServingRouteIds: mergeRouteIds(existing?.allServingRouteIds, stop?.allServingRouteIds, affectedRouteIds, servedRouteIds),
        impactScope: servedRouteIds.length > 0 ? 'partial' : existing?.impactScope || stop?.impactScope || 'route',
      };
      return;
    }
    if (key) {
      seen.add(key);
      indexByKey.set(key, merged.length);
    }
    merged.push(stop);
  });

  return merged;
};

const getFamilyClosedStopDetails = (familyRouteIds, detourStopDetailsByRouteId = {}) => {
  const skippedStops = [];
  const affectedStops = [];

  familyRouteIds.forEach((familyRouteId) => {
    const routeDetails = detourStopDetailsByRouteId[familyRouteId] || {};
    const segments = Array.isArray(routeDetails.segmentStopDetails)
      ? routeDetails.segmentStopDetails
      : [];

    segments.forEach((segment) => {
      skippedStops.push(...tagStopsForRoute(familyRouteId, segment?.skippedStops));
      affectedStops.push(...tagStopsForRoute(familyRouteId, segment?.affectedStops));
    });
  });

  return {
    skippedStops: mergeUniqueStops(skippedStops),
    affectedStops: mergeUniqueStops(affectedStops),
  };
};

const mergeSharedFamilyClosedStops = ({
  segmentStopDetails,
  routeId,
  familyRouteIds,
  detourStopDetailsByRouteId,
}) => {
  const normalizedSegments = Array.isArray(segmentStopDetails) ? segmentStopDetails : [];
  if (normalizedSegments.length === 0 || !Array.isArray(familyRouteIds) || familyRouteIds.length < 2) {
    return {
      segmentStopDetails: normalizedSegments,
      merged: false,
    };
  }

  const familyStops = getFamilyClosedStopDetails(familyRouteIds, detourStopDetailsByRouteId);
  if (familyStops.skippedStops.length === 0 && familyStops.affectedStops.length === 0) {
    return {
      segmentStopDetails: normalizedSegments,
      merged: false,
    };
  }

  return {
    segmentStopDetails: normalizedSegments.map((segment, index) => (
      index === 0
        ? {
          ...segment,
          routeIds: familyRouteIds,
          skippedStops: mergeUniqueStops(
            tagStopsForRoute(routeId ?? familyRouteIds[0], segment?.skippedStops),
            familyStops.skippedStops
          ),
          affectedStops: mergeUniqueStops(
            tagStopsForRoute(routeId ?? familyRouteIds[0], segment?.affectedStops),
            familyStops.affectedStops
          ),
        }
        : segment
    )),
    merged: true,
  };
};

const normalizeExplorerRouteIds = (routeIds = []) => (
  Array.isArray(routeIds)
    ? routeIds.map(normalizeRouteId).filter(Boolean)
    : []
);

const getExplorerRouteScope = (detourExplorerSelection) => {
  const level = detourExplorerSelection?.level;
  const selectedRouteId = normalizeRouteId(detourExplorerSelection?.routeId);
  const eventRouteIds = normalizeExplorerRouteIds(detourExplorerSelection?.event?.routeIds);

  if (level === 'route' && selectedRouteId) {
    return new Set([selectedRouteId]);
  }

  if (level === 'event' && eventRouteIds.length > 0) {
    return new Set(eventRouteIds);
  }

  return null;
};

const getExplorerSegmentIndexes = (detourExplorerSelection, routeId) => {
  const level = detourExplorerSelection?.level;
  if (level !== 'event' && level !== 'route') return null;

  const normalizedRouteId = normalizeRouteId(routeId);
  if (level === 'route') {
    const selectedRouteId = normalizeRouteId(detourExplorerSelection?.routeId);
    if (selectedRouteId && selectedRouteId !== normalizedRouteId) return null;
  }

  const candidates = Array.isArray(detourExplorerSelection?.event?.candidates)
    ? detourExplorerSelection.event.candidates
    : [];
  const indexes = candidates
    .filter((candidate) => normalizeRouteId(candidate?.routeId) === normalizedRouteId)
    .map((candidate) => candidate?.segmentIndex)
    .filter((index) => Number.isInteger(index));

  return indexes.length > 0 ? new Set(indexes) : null;
};

const filterBySegmentIndexes = (items, segmentIndexes) => {
  if (!segmentIndexes || !Array.isArray(items)) return items;
  return items.filter((_, index) => segmentIndexes.has(index));
};

const removeDetourPathServedSkippedStops = (segment) => {
  if (!segment || !Array.isArray(segment.skippedStops) || segment.skippedStops.length === 0) {
    return segment;
  }

  const skippedStops = segment.skippedStops.filter(
    (stop) => !isStopServedByRenderableDetourPath(stop, segment)
  );
  if (skippedStops.length === segment.skippedStops.length) return segment;

  return {
    ...segment,
    skippedStops,
  };
};

/**
 * Pure derivation function (exported for testing without React).
 */
export function deriveDetourOverlays({
  selectedRouteIds,
  activeDetours,
  enabled,
  focusedRouteId = null,
  detourStopDetailsByRouteId = {},
  routeColorByRouteId = {},
  showAllClosedStopMarkers = false,
  detourExplorerSelection = null,
}) {
  if (!enabled) return [];

  const overlays = [];
  const renderOptions = { includeValidationPreview: false };
  const riderVisibleDetours = filterRiderVisibleDetours(activeDetours);
  const explorerRouteScope = getExplorerRouteScope(detourExplorerSelection);

  // When no routes selected, show ALL active detours
  const routeIds = explorerRouteScope ?? ((selectedRouteIds && selectedRouteIds.size > 0)
    ? new Set(Array.from(selectedRouteIds).flatMap((routeId) => {
      const matches = getMatchingDetourRouteIds(routeId, riderVisibleDetours);
      return matches.length > 0 ? matches : [routeId];
    }))
    : new Set(Object.keys(riderVisibleDetours)));
  const renderedRouteIds = Array.from(routeIds)
    .filter((routeId) => riderVisibleDetours[routeId])
    .sort((a, b) => normalizeRouteId(a).localeCompare(normalizeRouteId(b)));
  const renderedFamilyRouteIds = renderedRouteIds.reduce((acc, routeId) => {
    const familyId = getRouteFamilyId(routeId);
    if (!acc[familyId]) acc[familyId] = [];
    acc[familyId].push(routeId);
    return acc;
  }, {});

  routeIds.forEach((routeId) => {
    const detour = riderVisibleDetours[routeId];
    if (!detour) return;
    const segmentIndexes = getExplorerSegmentIndexes(detourExplorerSelection, routeId);
    const familyRouteIds = renderedFamilyRouteIds[getRouteFamilyId(routeId)] || [routeId];
    const familyPathRenderInfo = buildFamilyPathRenderInfo(familyRouteIds, riderVisibleDetours, focusedRouteId, renderOptions);
    const routePathRenderInfo = familyPathRenderInfo[routeId] || {};
    if (routePathRenderInfo.isDuplicateSharedPath) return;

    const routeLineLabel = familyRouteIds.join('/');
    const familyHasDistinctDetourPaths = getFamilyHasDistinctDetourPaths(familyRouteIds, riderVisibleDetours, renderOptions);
    const directionArrowMode = familyRouteIds.length > 1
      ? (familyHasDistinctDetourPaths ? 'forward' : 'both')
      : 'forward';

    const allSegments = Array.isArray(detour.segments) ? detour.segments : [];
    const normalizedSegments = filterBySegmentIndexes(allSegments, segmentIndexes) || [];
    const isSegmentScoped = Boolean(segmentIndexes && allSegments.length > 0);
    const topLevelLikelyDetourPath = isSegmentScoped ? null : getLikelyDetourPath(detour);
    const topLevelRenderableDetourPath = isSegmentScoped ? null : getRenderableDetourPath(detour, renderOptions);
    const hasSegmentRenderableDetourPath = normalizedSegments.some(
      (segment) => getRenderableDetourPath(segment, renderOptions)
    );
    const hasSegmentTrustedRawOnlyDetourPath = normalizedSegments.some(
      (segment) => !getRenderableDetourPath(segment, renderOptions) && getTrustedInferredDetourPath(segment)
    );
    const shouldRenderTopLevelRoadMatchOnly =
      topLevelRenderableDetourPath &&
      normalizedSegments.length > 1 &&
      !hasSegmentRenderableDetourPath &&
      !hasSegmentTrustedRawOnlyDetourPath;
    const topLevelRenderSegment = {
      shapeId: detour.shapeId ?? normalizedSegments[0]?.shapeId ?? null,
      skippedSegmentPolyline: detour.skippedSegmentPolyline ?? normalizedSegments[0]?.skippedSegmentPolyline ?? null,
      inferredDetourPolyline: topLevelRenderableDetourPath,
      likelyDetourPolyline: topLevelLikelyDetourPath,
      entryConnectorPolyline: detour.entryConnectorPolyline ?? normalizedSegments[0]?.entryConnectorPolyline ?? null,
      exitConnectorPolyline: detour.exitConnectorPolyline ?? normalizedSegments[0]?.exitConnectorPolyline ?? null,
      likelyDetourRoadNames: Array.isArray(detour.likelyDetourRoadNames) ? detour.likelyDetourRoadNames : [],
      detourPathLabel: detour.detourPathLabel ?? normalizedSegments[0]?.detourPathLabel ?? null,
      canShowDetourPath: detour.canShowDetourPath ?? null,
      confidence: detour.confidence ?? null,
      entryPoint: detour.entryPoint ?? normalizedSegments[0]?.entryPoint ?? null,
      exitPoint: detour.exitPoint ?? normalizedSegments[0]?.exitPoint ?? null,
      affectedStops: [],
      skippedStops: [],
      entryStop: null,
      exitStop: null,
    };
    const hasGeometry =
      normalizedSegments.some((segment) =>
        (segment?.skippedSegmentPolyline?.length >= 2) ||
        Boolean(getRenderableDetourPath(segment, renderOptions))
      ) ||
      (!isSegmentScoped && detour.skippedSegmentPolyline?.length >= 2) ||
      (!isSegmentScoped && Boolean(topLevelRenderableDetourPath));
    if (!hasGeometry) return;

    const fallbackSegmentStopDetails = shouldRenderTopLevelRoadMatchOnly
      ? [topLevelRenderSegment]
      : normalizedSegments.length > 0
      ? normalizedSegments.map((segment) => ({
        shapeId: segment?.shapeId ?? detour.shapeId ?? null,
        skippedSegmentPolyline: segment?.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: getRenderableDetourPath(segment, renderOptions),
        likelyDetourPolyline: segment?.likelyDetourPolyline ?? null,
        entryConnectorPolyline: segment?.entryConnectorPolyline ?? null,
        exitConnectorPolyline: segment?.exitConnectorPolyline ?? null,
        likelyDetourRoadNames: Array.isArray(segment?.likelyDetourRoadNames) ? segment.likelyDetourRoadNames : [],
        detourPathLabel: segment?.detourPathLabel ?? detour.detourPathLabel ?? null,
        canShowDetourPath: segment?.canShowDetourPath ?? null,
        confidence: segment?.confidence ?? detour.confidence ?? null,
        entryPoint: segment?.entryPoint ?? null,
        exitPoint: segment?.exitPoint ?? null,
        affectedStops: [],
        skippedStops: [],
        entryStop: null,
        exitStop: null,
      }))
      : [{
        shapeId: detour.shapeId ?? null,
        skippedSegmentPolyline: detour.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: topLevelRenderableDetourPath,
        likelyDetourPolyline: detour.likelyDetourPolyline ?? null,
        entryConnectorPolyline: detour.entryConnectorPolyline ?? null,
        exitConnectorPolyline: detour.exitConnectorPolyline ?? null,
        likelyDetourRoadNames: Array.isArray(detour.likelyDetourRoadNames) ? detour.likelyDetourRoadNames : [],
        detourPathLabel: detour.detourPathLabel ?? null,
        canShowDetourPath: detour.canShowDetourPath ?? null,
        confidence: detour.confidence ?? null,
        entryPoint: detour.entryPoint ?? null,
        exitPoint: detour.exitPoint ?? null,
        affectedStops: [],
        skippedStops: [],
        entryStop: null,
        exitStop: null,
      }];
    const explicitSegmentStopDetails = filterBySegmentIndexes(
      detourStopDetailsByRouteId[routeId]?.segmentStopDetails,
      segmentIndexes
    );
    const hasExplicitSegmentStopDetails = Boolean(explicitSegmentStopDetails?.length);
    const baseResolvedSegmentStopDetails = shouldRenderTopLevelRoadMatchOnly
      ? [topLevelRenderSegment]
      : hasExplicitSegmentStopDetails
        ? explicitSegmentStopDetails
        : fallbackSegmentStopDetails;
    const hasResolvedSegmentRenderableDetourPath = baseResolvedSegmentStopDetails.some(
      (segment) => getRenderableDetourPath(segment, renderOptions)
    );
    let resolvedSegmentStopDetails = baseResolvedSegmentStopDetails
      .map((segment, index) => ({
        ...segment,
        // Rendering reads inferredDetourPolyline for each segment. Prefer the
        // backend road-matched line whenever it exists, then backend-trusted raw
        // geometry. Do not put untrusted raw GPS/inferred paths back on the map.
        inferredDetourPolyline:
          getRenderableDetourPath(segment, renderOptions) ??
          (!hasResolvedSegmentRenderableDetourPath && !hasSegmentTrustedRawOnlyDetourPath && index === 0
            ? topLevelRenderableDetourPath
            : null),
        likelyDetourPolyline:
          segment?.likelyDetourPolyline ??
          (!hasResolvedSegmentRenderableDetourPath && !hasSegmentTrustedRawOnlyDetourPath && index === 0
            ? topLevelLikelyDetourPath
            : null),
      }))
      .map(trimOverlappingSegmentGeometry);
    const shouldMergeSharedFamilyClosedStops =
      familyRouteIds.length > 1 &&
      !familyHasDistinctDetourPaths;
    let familyStopsMerged = false;
    if (shouldMergeSharedFamilyClosedStops) {
      const mergedFamilyStops = mergeSharedFamilyClosedStops({
        segmentStopDetails: resolvedSegmentStopDetails,
        routeId,
        familyRouteIds,
        detourStopDetailsByRouteId,
      });
      resolvedSegmentStopDetails = mergedFamilyStops.segmentStopDetails;
      familyStopsMerged = mergedFamilyStops.merged;
    }
    resolvedSegmentStopDetails = resolvedSegmentStopDetails.map(removeDetourPathServedSkippedStops);
    const routeColor = getOverlayRouteColor(routeId, routeColorByRouteId);
    const primaryResolvedSegment = resolvedSegmentStopDetails[0] || {};
    const primaryStopsSuppressed = primaryResolvedSegment.suppressStopDerivation === true;
    const hasPrimarySkippedStops =
      Array.isArray(primaryResolvedSegment.skippedStops) &&
      (
        hasExplicitSegmentStopDetails ||
        familyStopsMerged ||
        primaryResolvedSegment.skippedStops.length > 0
      );
    const primaryRenderableDetourPath = getRenderableDetourPath(primaryResolvedSegment, renderOptions);
    const primaryLikelyDetourPath = getLikelyDetourPath(primaryResolvedSegment);
    const allowTopLevelDetourPathFallback =
      !hasSegmentRenderableDetourPath &&
      !hasSegmentTrustedRawOnlyDetourPath &&
      !isSegmentScoped;

    overlays.push({
      routeId,
      routeIds: familyRouteIds,
      state: detour.state ?? 'active',
      skippedSegmentPolyline: primaryResolvedSegment.skippedSegmentPolyline ?? null,
      inferredDetourPolyline:
        primaryRenderableDetourPath ??
        (allowTopLevelDetourPathFallback ? getRenderableDetourPath(detour, renderOptions) : null) ??
        getRenderableDetourPath(normalizedSegments[0], renderOptions) ??
        null,
      likelyDetourPolyline:
        primaryLikelyDetourPath ??
        (allowTopLevelDetourPathFallback ? getLikelyDetourPath(detour) : null) ??
        getLikelyDetourPath(normalizedSegments[0]) ??
        null,
      entryPoint: primaryResolvedSegment.entryPoint ?? (!isSegmentScoped ? detour.entryPoint : null) ?? normalizedSegments[0]?.entryPoint ?? null,
      exitPoint: primaryResolvedSegment.exitPoint ?? (!isSegmentScoped ? detour.exitPoint : null) ?? normalizedSegments[0]?.exitPoint ?? null,
      routeStops: detourStopDetailsByRouteId[routeId]?.routeStops ?? [],
      skippedStops: primaryStopsSuppressed
        ? []
        : (
          hasPrimarySkippedStops
            ? primaryResolvedSegment.skippedStops
            : detourStopDetailsByRouteId[routeId]?.segmentStopDetails?.[0]?.skippedStops ??
              detourStopDetailsByRouteId[routeId]?.skippedStops ??
              []
        ),
      entryStop:
        primaryResolvedSegment.entryStop ??
        detourStopDetailsByRouteId[routeId]?.entryStop ??
        null,
      exitStop:
        primaryResolvedSegment.exitStop ??
        detourStopDetailsByRouteId[routeId]?.exitStop ??
        null,
      segmentStopDetails: resolvedSegmentStopDetails,
      familyStopsMerged,
      opacity:
        focusedRouteId && !routeMatchesFocusedFamily(routeId, focusedRouteId)
          ? 0.24
          : detour.state === 'clear-pending'
            ? 0.45
            : 0.95,
      skippedColor: DETOUR_COLORS.SKIPPED,
      detourColor: routeColor,
      routeBaseColor: routeColor,
      routeStopFillColor: DETOUR_COLORS.ROUTE_STOP_FILL,
      routeStopStrokeColor: DETOUR_COLORS.ROUTE_STOP_STROKE,
      routeLineLabel,
      directionArrowMode,
      detourLaneOffsetMeters: routePathRenderInfo.laneOffsetMeters || 0,
      detourArrowPositionOffsetRatio: routePathRenderInfo.arrowPositionOffsetRatio || 0,
      showLineLabels: true,
      showCallouts: false,
      showStopMarkers: false,
      showClosedStopMarkers: false,
    });
  });

  const shouldShowCallouts = overlays.length === 1 && !focusedRouteId;
  overlays.forEach((overlay) => {
    const isFocusedOverlay = focusedRouteId ? overlay.routeId === focusedRouteId : false;
    overlay.showCallouts = focusedRouteId
      ? isFocusedOverlay
      : shouldShowCallouts;
    overlay.showStopMarkers = focusedRouteId
      ? isFocusedOverlay
      : overlays.length === 1;
    overlay.showClosedStopMarkers = focusedRouteId
      ? isFocusedOverlay
      : showAllClosedStopMarkers || overlays.length === 1;
  });

  return overlays;
}

export const getDetourOverlayRouteIds = (detourOverlays = []) => {
  const routeIds = new Set();

  (Array.isArray(detourOverlays) ? detourOverlays : []).forEach((overlay) => {
    if (overlay?.routeId) {
      routeIds.add(normalizeRouteId(overlay.routeId));
    }

    if (typeof overlay?.routeLineLabel === 'string') {
      overlay.routeLineLabel
        .split('/')
        .map((routeId) => normalizeRouteId(routeId))
        .filter(Boolean)
        .forEach((routeId) => routeIds.add(routeId));
    }
  });

  return routeIds;
};

export const useDetourOverlays = ({
  selectedRouteIds,
  activeDetours,
  enabled = true,
  focusedRouteId = null,
  detourStopDetailsByRouteId = {},
  routeColorByRouteId = {},
  showAllClosedStopMarkers = false,
  detourExplorerSelection = null,
}) => {
  const detourOverlays = useMemo(
    () => deriveDetourOverlays({
      selectedRouteIds,
      activeDetours,
      enabled,
      focusedRouteId,
      detourStopDetailsByRouteId,
      routeColorByRouteId,
      showAllClosedStopMarkers,
      detourExplorerSelection,
    }),
    [enabled, selectedRouteIds, activeDetours, focusedRouteId, detourStopDetailsByRouteId, routeColorByRouteId, showAllClosedStopMarkers, detourExplorerSelection]
  );

  return { detourOverlays };
};
