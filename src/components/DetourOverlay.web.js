/**
 * DetourOverlay (Web)
 *
 * Renders detour geometry on the MapLibre web map:
 * - Red dashed line for the skipped normal-route segment
 * - Orange line for the inferred detour path
 * - White circle markers at entry/exit points
 * - Midpoint labels ("Skipped" / "Detour route")
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { WebHtmlMarker, WebRoutePolyline } from './WebMapView';
import { hasFiniteCoordinate } from '../utils/geometryUtils';
import { getPolylineMidpoint } from '../utils/polylineUtils';

const makeCircleHtml = (diameter, fillColor, borderColor) => `
  <div style="
    width:${diameter}px;
    height:${diameter}px;
    border-radius:50%;
    background:${fillColor};
    border:2px solid ${borderColor};
    box-sizing:border-box;
    box-shadow:0 1px 3px rgba(0,0,0,0.15);
  "></div>
`;

const makeLabelHtml = (label) => `
  <div style="
    font-size:11px;
    font-weight:700;
    color:#374151;
    background:rgba(255,255,255,0.9);
    border-radius:999px;
    padding:2px 8px;
    box-shadow:0 1px 4px rgba(0,0,0,0.12);
    white-space:nowrap;
    pointer-events:none;
  ">${label}</div>
`;

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
}) => {
  const skippedMidpoint =
    skippedSegmentPolyline?.length >= 2
      ? getPolylineMidpoint(skippedSegmentPolyline)
      : null;
  const detourMidpoint =
    inferredDetourPolyline?.length >= 2
      ? getPolylineMidpoint(inferredDetourPolyline)
      : null;

  return (
    <>
      {skippedSegmentPolyline?.length >= 2 && (
        <WebRoutePolyline
          coordinates={skippedSegmentPolyline}
          color={skippedColor}
          strokeWidth={5}
          dashArray="10, 8"
          opacity={opacity}
          outlineWidth={1.5}
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
        <WebHtmlMarker
          coordinate={{ latitude: entryPoint.latitude, longitude: entryPoint.longitude }}
          html={makeCircleHtml(16, markerBorderColor, '#ffffff')}
        />
      )}
      {hasFiniteCoordinate(exitPoint) && (
        <WebHtmlMarker
          coordinate={{ latitude: exitPoint.latitude, longitude: exitPoint.longitude }}
          html={makeCircleHtml(12, '#ffffff', markerBorderColor)}
        />
      )}
      {skippedMidpoint && (
        <WebHtmlMarker
          coordinate={{ latitude: skippedMidpoint.latitude, longitude: skippedMidpoint.longitude }}
          html={makeLabelHtml('Skipped')}
        />
      )}
      {detourMidpoint && (
        <WebHtmlMarker
          coordinate={{ latitude: detourMidpoint.latitude, longitude: detourMidpoint.longitude }}
          html={makeLabelHtml('Detour route')}
        />
      )}
    </>
  );
};

export default DetourOverlay;
