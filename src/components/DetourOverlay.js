/**
 * DetourOverlay (Native)
 *
 * Renders detour geometry on the native MapLibre map:
 * - Red dashed line for the skipped normal-route segment
 * - Orange line for the inferred detour path
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import RoutePolyline from './RoutePolyline';

const DetourOverlay = ({
  routeId,
  skippedSegmentPolyline,
  inferredDetourPolyline,
  opacity,
  skippedColor,
  detourColor,
}) => (
  <>
    {skippedSegmentPolyline?.length >= 2 && (
      <RoutePolyline
        id={`detour-skipped-${routeId}`}
        coordinates={skippedSegmentPolyline}
        color={skippedColor}
        strokeWidth={5}
        lineDashPattern={[8, 6]}
        opacity={opacity}
        outlineWidth={1.5}
      />
    )}
    {inferredDetourPolyline?.length >= 2 && (
      <RoutePolyline
        id={`detour-path-${routeId}`}
        coordinates={inferredDetourPolyline}
        color={detourColor}
        strokeWidth={5}
        opacity={opacity}
        outlineWidth={1.5}
      />
    )}
  </>
);

export default DetourOverlay;
