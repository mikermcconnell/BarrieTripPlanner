/**
 * DetourOverlay (Web)
 *
 * Renders detour geometry on the MapLibre web map:
 * - Red dashed line for the active detour path (or skipped segment fallback)
 * - White route stop markers with dark outlines
 * - Red slashed markers for skipped stops
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { WebHtmlMarker, WebRoutePolyline } from './WebMapView';

const makeCircleHtml = (diameter, fillColor, borderColor, borderWidth = 2) => `
  <div style="
    width:${diameter}px;
    height:${diameter}px;
    border-radius:50%;
    background:${fillColor};
    border:${borderWidth}px solid ${borderColor};
    box-sizing:border-box;
    box-shadow:0 1px 3px rgba(0,0,0,0.15);
  "></div>
`;

const makeSkippedStopHtml = (color) => `
  <div style="
    width:18px;
    height:18px;
    border-radius:50%;
    background:#ffffff;
    border:2.5px solid ${color};
    box-sizing:border-box;
    box-shadow:0 1px 4px rgba(0,0,0,0.12);
    position:relative;
  ">
    <div style="
      position:absolute;
      top:7px;
      left:2px;
      width:10px;
      height:2.5px;
      border-radius:999px;
      background:${color};
      transform:rotate(-45deg);
      transform-origin:center;
    "></div>
  </div>
`;

const makeEntryStopHtml = (eyebrow, label, fillColor, borderColor, textColor, dotColor) => `
  <div style="
    min-width:80px;
    min-height:34px;
    padding:5px 10px;
    border-radius:14px;
    background:${fillColor};
    border:2px solid ${borderColor};
    box-sizing:border-box;
    box-shadow:0 1px 4px rgba(0,0,0,0.12);
    display:flex;
    align-items:center;
    justify-content:flex-start;
    gap:6px;
    color:${textColor};
  ">
    <div style="
      width:8px;
      height:8px;
      border-radius:50%;
      background:${dotColor};
      flex:0 0 auto;
    "></div>
    <div style="display:flex; flex-direction:column; align-items:flex-start;">
      <span style="font:800 8px/1 Avenir, Arial, sans-serif; letter-spacing:0.45px;">${eyebrow}</span>
      <span style="font:800 10px/1.1 Avenir, Arial, sans-serif; letter-spacing:0.3px;">${label}</span>
    </div>
  </div>
`;

const DetourOverlay = ({
  routeId,
  skippedSegmentPolyline,
  inferredDetourPolyline,
  routeStops,
  skippedStops,
  entryStop,
  exitStop,
  entryPoint,
  exitPoint,
  segmentStopDetails,
  opacity,
  skippedColor,
  detourColor,
  routeBaseColor,
  routeStopFillColor,
  routeStopStrokeColor,
  showCallouts,
  showStopMarkers,
}) => {
  const normalizedSegments =
    Array.isArray(segmentStopDetails) && segmentStopDetails.length > 0
      ? segmentStopDetails
      : [{
        skippedSegmentPolyline,
        inferredDetourPolyline,
        entryPoint: entryPoint ?? null,
        exitPoint: exitPoint ?? null,
        skippedStops: Array.isArray(skippedStops) ? skippedStops : [],
        entryStop: entryStop ?? null,
        exitStop: exitStop ?? null,
      }];
  const hasMultipleSegments = normalizedSegments.length > 1;

  return (
    <>
      {normalizedSegments.map((segment, index) => {
        const activeDetourPath =
          segment?.inferredDetourPolyline?.length >= 2
            ? segment.inferredDetourPolyline
            : segment?.skippedSegmentPolyline?.length >= 2
              ? segment.skippedSegmentPolyline
              : null;

        if (!activeDetourPath) return null;

        const pathId = hasMultipleSegments
          ? `detour-path-${routeId}-${index}`
          : `detour-path-${routeId}`;

        return (
          <WebRoutePolyline
            key={pathId}
            coordinates={activeDetourPath}
            color={detourColor}
            strokeWidth={5}
            dashArray="10, 8"
            opacity={opacity}
            outlineWidth={1.5}
            interactive={false}
          />
        );
      })}

      {showStopMarkers && routeStops.map((stop) => (
        <WebHtmlMarker
          key={`detour-route-stop-${routeId}-${stop.id}`}
          coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
          html={makeCircleHtml(14, routeStopFillColor, routeStopStrokeColor, 2.5)}
          zIndexOffset={400}
        />
      ))}

      {showCallouts && normalizedSegments.flatMap((segment, segmentIndex) =>
        [
          {
            kind: 'entry',
            point: segment?.entryPoint ?? null,
            eyebrow: 'DETOUR',
            label: 'START',
            fillColor: routeBaseColor,
            borderColor: routeStopFillColor,
            textColor: routeStopFillColor,
            dotColor: routeStopFillColor,
          },
          {
            kind: 'exit',
            point: segment?.exitPoint ?? null,
            eyebrow: 'DETOUR',
            label: 'END',
            fillColor: routeStopFillColor,
            borderColor: routeBaseColor,
            textColor: routeBaseColor,
            dotColor: routeBaseColor,
          },
        ]
          .filter((anchor) => anchor.point)
          .map((anchor) => {
            const entryExitId = hasMultipleSegments
              ? `detour-${anchor.kind}-point-${routeId}-${segmentIndex}`
              : `detour-${anchor.kind}-point-${routeId}`;

            return (
              <WebHtmlMarker
                key={entryExitId}
                coordinate={{ latitude: anchor.point.latitude, longitude: anchor.point.longitude }}
                html={makeEntryStopHtml(
                  anchor.eyebrow,
                  anchor.label,
                  anchor.fillColor,
                  anchor.borderColor,
                  anchor.textColor,
                  anchor.dotColor
                )}
                zIndexOffset={425}
              />
            );
          })
      )}

      {showStopMarkers && normalizedSegments.flatMap((segment, segmentIndex) =>
        (segment?.skippedStops ?? []).map((stop) => {
          const skippedStopId = hasMultipleSegments
            ? `detour-skipped-stop-${routeId}-${segmentIndex}-${stop.id}`
            : `detour-skipped-stop-${routeId}-${stop.id}`;

          return (
            <WebHtmlMarker
              key={skippedStopId}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              html={makeSkippedStopHtml(skippedColor)}
              zIndexOffset={450}
            />
          );
        })
      )}
    </>
  );
};

export default DetourOverlay;
