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

const getLikelyDetourPath = (segment) => (
  segment?.likelyDetourPolyline?.length >= 2
    ? segment.likelyDetourPolyline
    : null
);

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
}) {
  if (!enabled) return [];

  const overlays = [];
  const riderVisibleDetours = filterRiderVisibleDetours(activeDetours);

  // When no routes selected, show ALL active detours
  const routeIds = (selectedRouteIds && selectedRouteIds.size > 0)
    ? new Set(Array.from(selectedRouteIds).flatMap((routeId) => {
      const matches = getMatchingDetourRouteIds(routeId, riderVisibleDetours);
      return matches.length > 0 ? matches : [routeId];
    }))
    : new Set(Object.keys(riderVisibleDetours));
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
    const familyRouteIds = renderedFamilyRouteIds[getRouteFamilyId(routeId)] || [routeId];
    const routeLineLabel = familyRouteIds.join('/');

    const normalizedSegments = Array.isArray(detour.segments) ? detour.segments : [];
    const topLevelLikelyDetourPath = getLikelyDetourPath(detour);
    const hasSegmentLikelyDetourPath = normalizedSegments.some(
      (segment) => getLikelyDetourPath(segment)
    );
    const shouldRenderTopLevelRoadMatchOnly =
      topLevelLikelyDetourPath &&
      normalizedSegments.length > 1 &&
      !hasSegmentLikelyDetourPath;
    const topLevelRenderSegment = {
      shapeId: detour.shapeId ?? normalizedSegments[0]?.shapeId ?? null,
      skippedSegmentPolyline: detour.skippedSegmentPolyline ?? normalizedSegments[0]?.skippedSegmentPolyline ?? null,
      inferredDetourPolyline: topLevelLikelyDetourPath,
      likelyDetourPolyline: topLevelLikelyDetourPath,
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
        (segment?.likelyDetourPolyline?.length >= 2)
      ) ||
      (detour.skippedSegmentPolyline?.length >= 2) ||
      (detour.likelyDetourPolyline?.length >= 2);
    if (!hasGeometry) return;

    const fallbackSegmentStopDetails = shouldRenderTopLevelRoadMatchOnly
      ? [topLevelRenderSegment]
      : normalizedSegments.length > 0
      ? normalizedSegments.map((segment) => ({
        shapeId: segment?.shapeId ?? detour.shapeId ?? null,
        skippedSegmentPolyline: segment?.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: getLikelyDetourPath(segment),
        likelyDetourPolyline: segment?.likelyDetourPolyline ?? null,
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
        inferredDetourPolyline: getLikelyDetourPath(detour),
        likelyDetourPolyline: detour.likelyDetourPolyline ?? null,
        entryPoint: detour.entryPoint ?? null,
        exitPoint: detour.exitPoint ?? null,
        affectedStops: [],
        skippedStops: [],
        entryStop: null,
        exitStop: null,
      }];
    const baseResolvedSegmentStopDetails = shouldRenderTopLevelRoadMatchOnly
      ? [topLevelRenderSegment]
      : detourStopDetailsByRouteId[routeId]?.segmentStopDetails?.length
        ? detourStopDetailsByRouteId[routeId].segmentStopDetails
        : fallbackSegmentStopDetails;
    const hasResolvedSegmentLikelyDetourPath = baseResolvedSegmentStopDetails.some(
      (segment) => getLikelyDetourPath(segment)
    );
    const resolvedSegmentStopDetails = baseResolvedSegmentStopDetails.map((segment, index) => ({
      ...segment,
      // Rendering reads inferredDetourPolyline for each segment. Prefer the
      // backend road-matched line whenever it exists so stop-detail enrichment
      // does not accidentally put the raw GPS/inferred path back on the map.
      inferredDetourPolyline:
        getLikelyDetourPath(segment) ??
        (!hasResolvedSegmentLikelyDetourPath && index === 0 ? topLevelLikelyDetourPath : null),
      likelyDetourPolyline:
        segment?.likelyDetourPolyline ??
        (!hasResolvedSegmentLikelyDetourPath && index === 0 ? topLevelLikelyDetourPath : null),
    }));
    const routeColor = getOverlayRouteColor(routeId, routeColorByRouteId);

    overlays.push({
      routeId,
      state: detour.state ?? 'active',
      skippedSegmentPolyline: detour.skippedSegmentPolyline ?? normalizedSegments[0]?.skippedSegmentPolyline ?? null,
      inferredDetourPolyline: getLikelyDetourPath(detour) ?? getLikelyDetourPath(normalizedSegments[0]) ?? null,
      likelyDetourPolyline: detour.likelyDetourPolyline ?? normalizedSegments[0]?.likelyDetourPolyline ?? null,
      entryPoint: detour.entryPoint ?? normalizedSegments[0]?.entryPoint ?? null,
      exitPoint: detour.exitPoint ?? normalizedSegments[0]?.exitPoint ?? null,
      routeStops: detourStopDetailsByRouteId[routeId]?.routeStops ?? [],
      skippedStops:
        detourStopDetailsByRouteId[routeId]?.segmentStopDetails?.[0]?.skippedStops ??
        detourStopDetailsByRouteId[routeId]?.skippedStops ??
        resolvedSegmentStopDetails[0]?.skippedStops ??
        [],
      entryStop:
        detourStopDetailsByRouteId[routeId]?.segmentStopDetails?.[0]?.entryStop ??
        detourStopDetailsByRouteId[routeId]?.entryStop ??
        resolvedSegmentStopDetails[0]?.entryStop ??
        null,
      exitStop:
        detourStopDetailsByRouteId[routeId]?.segmentStopDetails?.[0]?.exitStop ??
        detourStopDetailsByRouteId[routeId]?.exitStop ??
        resolvedSegmentStopDetails[0]?.exitStop ??
        null,
      segmentStopDetails: resolvedSegmentStopDetails,
      opacity:
        focusedRouteId && routeId !== focusedRouteId
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
      showLineLabels: true,
      showCallouts: false,
      showStopMarkers: false,
    });
  });

  const shouldShowCallouts = overlays.length === 1 && !focusedRouteId;
  overlays.forEach((overlay) => {
    overlay.showCallouts = focusedRouteId
      ? overlay.routeId === focusedRouteId
      : shouldShowCallouts;
    overlay.showStopMarkers = focusedRouteId
      ? overlay.routeId === focusedRouteId
      : overlays.length === 1;
  });

  return overlays;
}

export const useDetourOverlays = ({
  selectedRouteIds,
  activeDetours,
  enabled = true,
  focusedRouteId = null,
  detourStopDetailsByRouteId = {},
  routeColorByRouteId = {},
}) => {
  const detourOverlays = useMemo(
    () => deriveDetourOverlays({
      selectedRouteIds,
      activeDetours,
      enabled,
      focusedRouteId,
      detourStopDetailsByRouteId,
      routeColorByRouteId,
    }),
    [enabled, selectedRouteIds, activeDetours, focusedRouteId, detourStopDetailsByRouteId, routeColorByRouteId]
  );

  return { detourOverlays };
};
