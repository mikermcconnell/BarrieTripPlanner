/**
 * useDetourOverlays Hook
 *
 * Derives renderable detour overlay data from active detours and the
 * current route selection. Shared between native and web HomeScreens.
 *
 * Only returns overlays for selected routes that have geometry data.
 * Feature-flag gated via EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI.
 */
import { useMemo } from 'react';

const ENABLED = process.env.EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI === 'true';

const DETOUR_COLORS = {
  SKIPPED: '#ef4444',  // red — the normal segment being bypassed
  DETOUR: '#f97316',   // orange — the inferred detour path
  MARKER_BORDER: '#f97316', // orange border for entry/exit markers
};

/**
 * Pure derivation function (exported for testing without React).
 */
export function deriveDetourOverlays({ selectedRouteIds, activeDetours, enabled }) {
  if (!enabled) return [];
  if (!selectedRouteIds || selectedRouteIds.size === 0) return [];

  const overlays = [];
  selectedRouteIds.forEach((routeId) => {
    const detour = activeDetours[routeId];
    if (!detour) return;

    const hasGeometry =
      (detour.skippedSegmentPolyline?.length >= 2) ||
      (detour.inferredDetourPolyline?.length >= 2);
    if (!hasGeometry) return;

    overlays.push({
      routeId,
      state: detour.state ?? 'active',
      skippedSegmentPolyline: detour.skippedSegmentPolyline ?? null,
      inferredDetourPolyline: detour.inferredDetourPolyline ?? null,
      entryPoint: detour.entryPoint ?? null,
      exitPoint: detour.exitPoint ?? null,
      opacity: detour.state === 'clear-pending' ? 0.45 : 1.0,
      skippedColor: DETOUR_COLORS.SKIPPED,
      detourColor: DETOUR_COLORS.DETOUR,
      markerBorderColor: DETOUR_COLORS.MARKER_BORDER,
    });
  });

  return overlays;
}

export const useDetourOverlays = ({ selectedRouteIds, activeDetours, enabled = ENABLED }) => {
  const detourOverlays = useMemo(
    () => deriveDetourOverlays({ selectedRouteIds, activeDetours, enabled }),
    [enabled, selectedRouteIds, activeDetours]
  );

  return { detourOverlays };
};
