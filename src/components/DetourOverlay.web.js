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
import { CircleMarker, Tooltip } from 'react-leaflet';
import { WebRoutePolyline } from './WebMapView';

const hasFiniteCoordinate = (point) =>
  Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);

const getMidpoint = (polyline) => {
  if (!polyline || polyline.length < 2) return null;
  const mid = Math.floor(polyline.length / 2);
  const p = polyline[mid];
  return p?.latitude != null && p?.longitude != null ? p : null;
};

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
    {skippedSegmentPolyline?.length >= 2 && (() => {
      const mid = getMidpoint(skippedSegmentPolyline);
      return mid ? (
        <CircleMarker
          center={[mid.latitude, mid.longitude]}
          radius={0}
          interactive={false}
        >
          <Tooltip permanent direction="center" className="detour-label-skipped">
            Skipped
          </Tooltip>
        </CircleMarker>
      ) : null;
    })()}
    {inferredDetourPolyline?.length >= 2 && (() => {
      const mid = getMidpoint(inferredDetourPolyline);
      return mid ? (
        <CircleMarker
          center={[mid.latitude, mid.longitude]}
          radius={0}
          interactive={false}
        >
          <Tooltip permanent direction="center" className="detour-label-detour">
            Detour route
          </Tooltip>
        </CircleMarker>
      ) : null;
    })()}
  </>
);

export default DetourOverlay;
