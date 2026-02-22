/**
 * DetourOverlay (Web)
 *
 * Renders detour geometry on the Leaflet web map:
 * - Red dashed line for the skipped normal-route segment
 * - Orange line for the inferred detour path
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { WebRoutePolyline } from './WebMapView';

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
      <WebRoutePolyline
        coordinates={skippedSegmentPolyline}
        color={skippedColor}
        strokeWidth={5}
        dashArray="10, 8"
        opacity={opacity}
        outlineWidth={0}
        interactive={false}
      />
    )}
    {inferredDetourPolyline?.length >= 2 && (
      <WebRoutePolyline
        coordinates={inferredDetourPolyline}
        color={detourColor}
        strokeWidth={5}
        opacity={opacity}
        outlineWidth={1.5}
        interactive={false}
      />
    )}
  </>
);

export default DetourOverlay;
