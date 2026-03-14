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

const DETOUR_COLORS = {
  SKIPPED: '#d92d20',    // strong red — skipped stops / detour emphasis
  DETOUR: '#d92d20',     // active detour path matches skipped service alert color
  ROUTE_BASE: '#111827', // neutral base route, closer to the reference map
  ROUTE_STOP_FILL: '#ffffff',
  ROUTE_STOP_STROKE: '#111827',
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
}) {
  if (!enabled) return [];

  const overlays = [];

  // When no routes selected, show ALL active detours
  const routeIds = (selectedRouteIds && selectedRouteIds.size > 0)
    ? selectedRouteIds
    : new Set(Object.keys(activeDetours));

  routeIds.forEach((routeId) => {
    const detour = activeDetours[routeId];
    if (!detour) return;

    const normalizedSegments = Array.isArray(detour.segments) ? detour.segments : [];
    const hasGeometry =
      normalizedSegments.some((segment) =>
        (segment?.skippedSegmentPolyline?.length >= 2) ||
        (segment?.inferredDetourPolyline?.length >= 2)
      ) ||
      (detour.skippedSegmentPolyline?.length >= 2) ||
      (detour.inferredDetourPolyline?.length >= 2);
    if (!hasGeometry) return;

    const fallbackSegmentStopDetails = normalizedSegments.length > 0
      ? normalizedSegments.map((segment) => ({
        shapeId: segment?.shapeId ?? detour.shapeId ?? null,
        skippedSegmentPolyline: segment?.skippedSegmentPolyline ?? null,
        inferredDetourPolyline: segment?.inferredDetourPolyline ?? null,
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
        inferredDetourPolyline: detour.inferredDetourPolyline ?? null,
        entryPoint: detour.entryPoint ?? null,
        exitPoint: detour.exitPoint ?? null,
        affectedStops: [],
        skippedStops: [],
        entryStop: null,
        exitStop: null,
      }];
    const resolvedSegmentStopDetails =
      detourStopDetailsByRouteId[routeId]?.segmentStopDetails?.length
        ? detourStopDetailsByRouteId[routeId].segmentStopDetails
        : fallbackSegmentStopDetails;

    overlays.push({
      routeId,
      state: detour.state ?? 'active',
      skippedSegmentPolyline: detour.skippedSegmentPolyline ?? normalizedSegments[0]?.skippedSegmentPolyline ?? null,
      inferredDetourPolyline: detour.inferredDetourPolyline ?? normalizedSegments[0]?.inferredDetourPolyline ?? null,
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
      detourColor: DETOUR_COLORS.DETOUR,
      routeBaseColor: DETOUR_COLORS.ROUTE_BASE,
      routeStopFillColor: DETOUR_COLORS.ROUTE_STOP_FILL,
      routeStopStrokeColor: DETOUR_COLORS.ROUTE_STOP_STROKE,
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
}) => {
  const detourOverlays = useMemo(
    () => deriveDetourOverlays({
      selectedRouteIds,
      activeDetours,
      enabled,
      focusedRouteId,
      detourStopDetailsByRouteId,
    }),
    [enabled, selectedRouteIds, activeDetours, focusedRouteId, detourStopDetailsByRouteId]
  );

  return { detourOverlays };
};
