/**
 * DetourOverlay (Web)
 *
 * Renders detour geometry on the Leaflet web map:
 * - Red dashed line for the skipped normal-route segment
 * - Orange line for the inferred detour path
 * - White circle markers at entry/exit points
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { CircleMarker } from 'react-leaflet';
import { WebRoutePolyline } from './WebMapView';

const hasFiniteCoordinate = (point) =>
  Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);

const DetourOverlay = ({
  routeId,
  skippedSegmentPolyline,
  inferredDetourPolyline,
  entryPoint,
  exitPoint,
  opacity,
  skippedColor,
  detourColor,
  markerBorderColor,
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
    {hasFiniteCoordinate(entryPoint) && (
      <CircleMarker
        center={[entryPoint.latitude, entryPoint.longitude]}
        radius={8}
        pathOptions={{
          fillColor: markerBorderColor,
          fillOpacity: opacity,
          color: '#ffffff',
          weight: 2,
          opacity,
        }}
        interactive={false}
      />
    )}
    {hasFiniteCoordinate(exitPoint) && (
      <CircleMarker
        center={[exitPoint.latitude, exitPoint.longitude]}
        radius={6}
        pathOptions={{
          fillColor: '#ffffff',
          fillOpacity: opacity,
          color: markerBorderColor,
          weight: 2,
          opacity,
        }}
        interactive={false}
      />
    )}
  </>
);

export default DetourOverlay;
