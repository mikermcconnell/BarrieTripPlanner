/**
 * DetourOverlay (Web)
 *
 * Renders detour geometry on the MapLibre web map:
 * - Primary detour reroute in deep orange-red with a white halo
 * - Secondary skipped-route context as a muted dashed line when available
 * - White route stop markers with dark outlines
 * - Red slashed markers for skipped stops
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { WebHtmlMarker, WebRoutePolyline } from './WebMapView';
import { simplifyPath } from '../utils/geometryUtils';

const DETOUR_LINE_STYLE = {
  strokeWidth: 4.5,
  outlineWidth: 1.25,
  outlineColor: '#FF991F',
};

const SKIPPED_ROUTE_STYLE = {
  strokeWidth: 3,
  outlineWidth: 1.25,
  outlineColor: '#FFFFFF',
  dashArray: '3, 4',
  opacityMultiplier: 0.8,
};

const CLOSED_ROUTE_MASK_STYLE = {
  strokeWidth: 11,
  color: '#FFFFFF',
  opacityMultiplier: 0.95,
};

const MARKER_Z_INDEX = {
  ROUTE_STOP: 660,
  CLOSURE_POINT: 690,
  SKIPPED_STOP: 700,
  ENTRY_EXIT_CALLOUT: 710,
  ROUTE_LINE_LABEL: 1200,
  CLOSED_CALLOUT: 720,
};

const simplifyOverlayPath = (path, minDistanceMeters = 28) => {
  if (!Array.isArray(path) || path.length < 2) {
    return null;
  }

  return simplifyPath(path, minDistanceMeters);
};

const getPolylineMidpoint = (path) => {
  if (!Array.isArray(path) || path.length === 0) {
    return null;
  }

  return path[Math.floor(path.length / 2)] ?? null;
};

const getClosureMarkerPoints = (path) => {
  if (!Array.isArray(path) || path.length < 2) {
    return [];
  }

  const indexes = [0, Math.floor((path.length - 1) / 2), path.length - 1];
  const seen = new Set();

  return indexes
    .map((index) => path[index])
    .filter((point) => {
      if (!point) return false;
      const key = `${point.latitude?.toFixed?.(6) ?? point.latitude}:${point.longitude?.toFixed?.(6) ?? point.longitude}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

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

const makeNoEntryHtml = (color, size = 20) => `
  <div style="
    width:${size}px;
    height:${size}px;
    border-radius:50%;
    background:${color};
    border:2px solid #ffffff;
    box-sizing:border-box;
    box-shadow:0 1px 5px rgba(0,0,0,0.22);
    position:relative;
  ">
    <div style="
      position:absolute;
      top:${Math.round(size / 2) - 2}px;
      left:${Math.round(size * 0.2)}px;
      width:${Math.round(size * 0.6)}px;
      height:3px;
      border-radius:999px;
      background:#ffffff;
    "></div>
  </div>
`;

const makeEntryStopHtml = (eyebrow, label, fillColor, borderColor, textColor, dotColor) => `
  <div style="
    width:104px;
    min-height:32px;
    padding:5px 10px;
    border-radius:16px;
    background:${fillColor};
    border:2px solid ${borderColor};
    box-sizing:border-box;
    box-shadow:0 2px 8px rgba(0,0,0,0.14);
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
    <div style="display:flex; flex-direction:column; align-items:flex-start; min-width:0;">
      <span style="font:800 8px/1 Avenir, Arial, sans-serif; letter-spacing:0.45px;">${eyebrow}</span>
      <span style="font:800 10px/1.1 Avenir, Arial, sans-serif; letter-spacing:0.3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:72px;">${label}</span>
    </div>
  </div>
`;

const makeClosureBadgeHtml = (label, fillColor, borderColor, textColor) => `
  <div style="
    width:104px;
    min-height:28px;
    padding:5px 10px;
    border-radius:999px;
    background:${fillColor};
    border:2px solid ${borderColor};
    box-sizing:border-box;
    box-shadow:0 2px 8px rgba(0,0,0,0.12);
    display:flex;
    align-items:center;
    justify-content:center;
    color:${textColor};
    font:800 10px/1 Avenir, Arial, sans-serif;
    letter-spacing:0.35px;
    white-space:nowrap;
  ">
    ${label}
  </div>
`;

const makeLineLabelHtml = (label, fillColor, borderColor, textColor) => `
  <div style="
    min-width:72px;
    max-width:136px;
    padding:5px 9px;
    border-radius:999px;
    background:${fillColor};
    border:2px solid ${borderColor};
    box-sizing:border-box;
    box-shadow:0 2px 8px rgba(15,23,42,0.18);
    color:${textColor};
    font:900 10px/1 Avenir, Arial, sans-serif;
    letter-spacing:0.35px;
    text-align:center;
    text-transform:uppercase;
    white-space:nowrap;
  ">
    ${label}
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
  routeLineLabel,
  showLineLabels,
  showCallouts,
  showStopMarkers,
  onPress,
  renderMode = 'all',
}) => {
  const shouldRenderGeometry = renderMode === 'all' || renderMode === 'geometry';
  const shouldRenderCallouts = renderMode === 'all' || renderMode === 'callouts';
  const shouldRenderMarkers = renderMode === 'all' || renderMode === 'markers';
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
      {shouldRenderGeometry && normalizedSegments.map((segment, index) => {
        const likelyDetourPolyline =
          segment?.likelyDetourPolyline?.length >= 2
            ? segment.likelyDetourPolyline
            : segment?.inferredDetourPolyline;
        const inferredDetourPath =
          likelyDetourPolyline?.length >= 2
            ? simplifyOverlayPath(likelyDetourPolyline, 28)
            : null;
        const skippedRoutePath =
          segment?.skippedSegmentPolyline?.length >= 2
            ? simplifyOverlayPath(segment.skippedSegmentPolyline, 18)
            : null;
        const activeDetourPath = inferredDetourPath || skippedRoutePath;

        if (!activeDetourPath) return null;

        const pathId = hasMultipleSegments
          ? `detour-path-${routeId}-${index}`
          : `detour-path-${routeId}`;
        const skippedPathId = hasMultipleSegments
          ? `detour-context-${routeId}-${index}`
          : `detour-context-${routeId}`;

        return (
          <React.Fragment key={pathId}>
            {skippedRoutePath ? (
              <>
                <WebRoutePolyline
                  key={`${skippedPathId}-mask`}
                  coordinates={skippedRoutePath}
                  color={CLOSED_ROUTE_MASK_STYLE.color}
                  strokeWidth={CLOSED_ROUTE_MASK_STYLE.strokeWidth}
                  opacity={Math.min(opacity, 0.95) * CLOSED_ROUTE_MASK_STYLE.opacityMultiplier}
                  outlineWidth={0}
                  interactive={Boolean(onPress)}
                  onPress={onPress}
                />
                <WebRoutePolyline
                  key={skippedPathId}
                  coordinates={skippedRoutePath}
                  color={skippedColor}
                  strokeWidth={SKIPPED_ROUTE_STYLE.strokeWidth}
                  dashArray={SKIPPED_ROUTE_STYLE.dashArray}
                  opacity={Math.min(opacity, 0.75) * SKIPPED_ROUTE_STYLE.opacityMultiplier}
                  outlineWidth={SKIPPED_ROUTE_STYLE.outlineWidth}
                  outlineColor={SKIPPED_ROUTE_STYLE.outlineColor}
                  interactive={Boolean(onPress)}
                  onPress={onPress}
                />
              </>
            ) : null}
            {inferredDetourPath ? (
              <WebRoutePolyline
                coordinates={inferredDetourPath}
                color={detourColor}
                strokeWidth={DETOUR_LINE_STYLE.strokeWidth}
                opacity={opacity}
                outlineWidth={DETOUR_LINE_STYLE.outlineWidth}
                outlineColor={DETOUR_LINE_STYLE.outlineColor}
                interactive={Boolean(onPress)}
                onPress={onPress}
                showArrows
              />
            ) : null}
          </React.Fragment>
        );
      })}

      {shouldRenderMarkers && showStopMarkers && routeStops.map((stop, stopIndex) => (
        <WebHtmlMarker
          key={`detour-route-stop-${routeId}-${stop.id ?? 'stop'}-${stopIndex}`}
          coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
          html={makeCircleHtml(14, routeStopFillColor, routeStopStrokeColor, 2.5)}
          zIndexOffset={MARKER_Z_INDEX.ROUTE_STOP}
        />
      ))}

      {shouldRenderCallouts && showLineLabels && normalizedSegments.flatMap((segment, segmentIndex) => {
        const likelyDetourPolyline =
          segment?.likelyDetourPolyline?.length >= 2
            ? segment.likelyDetourPolyline
            : segment?.inferredDetourPolyline;
        const detourLabelPoint = getPolylineMidpoint(likelyDetourPolyline);
        const labelPrefix = routeLineLabel || routeId;

        return [
          {
            key: 'detour',
            point: detourLabelPoint,
            label: `${labelPrefix} DETOUR`,
            fillColor: routeBaseColor,
            borderColor: routeStopFillColor,
            textColor: routeStopFillColor,
          },
        ]
          .filter((item) => item.point)
          .map((item) => (
            <WebHtmlMarker
              key={`detour-line-label-${item.key}-${routeId}-${segmentIndex}`}
              coordinate={{ latitude: item.point.latitude, longitude: item.point.longitude }}
              anchor="center"
              offset={[0, 0]}
              html={makeLineLabelHtml(
                item.label,
                item.fillColor,
                item.borderColor,
                item.textColor
              )}
              zIndexOffset={MARKER_Z_INDEX.ROUTE_LINE_LABEL}
            />
          ));
      })}

      {shouldRenderCallouts && showCallouts && normalizedSegments.flatMap((segment, segmentIndex) =>
        [
          {
            kind: 'closed',
            point: getPolylineMidpoint(segment?.skippedSegmentPolyline ?? null),
            label: 'ROUTE CLOSED',
            fillColor: '#FFEBE6',
            borderColor: skippedColor,
            textColor: skippedColor,
          },
          {
            kind: 'entry',
            point: segment?.entryPoint ?? null,
            eyebrow: 'DETOUR',
            label: 'PATH',
            fillColor: routeBaseColor,
            borderColor: routeStopFillColor,
            textColor: routeStopFillColor,
            dotColor: routeStopFillColor,
          },
          {
            kind: 'exit',
            point: segment?.exitPoint ?? null,
            eyebrow: 'ROUTE',
            label: 'RESUMES',
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

            if (anchor.kind === 'closed') {
              return (
                <WebHtmlMarker
                  key={entryExitId}
                  coordinate={{ latitude: anchor.point.latitude, longitude: anchor.point.longitude }}
                  anchor="bottom"
                  offset={[0, -22]}
                  html={makeClosureBadgeHtml(
                    anchor.label,
                    anchor.fillColor,
                    anchor.borderColor,
                    anchor.textColor
                  )}
                  zIndexOffset={MARKER_Z_INDEX.CLOSED_CALLOUT}
                />
              );
            }

            return (
              <WebHtmlMarker
                key={entryExitId}
                coordinate={{ latitude: anchor.point.latitude, longitude: anchor.point.longitude }}
                anchor="bottom"
                offset={[0, -22]}
                html={makeEntryStopHtml(
                  anchor.eyebrow,
                  anchor.label,
                  anchor.fillColor,
                  anchor.borderColor,
                  anchor.textColor,
                  anchor.dotColor
                )}
                zIndexOffset={MARKER_Z_INDEX.ENTRY_EXIT_CALLOUT}
              />
            );
          })
      )}

      {shouldRenderMarkers && showCallouts && normalizedSegments.flatMap((segment, segmentIndex) =>
        getClosureMarkerPoints(segment?.skippedSegmentPolyline ?? null).map((point, pointIndex) => {
          const closurePointId = hasMultipleSegments
            ? `detour-closure-marker-${routeId}-${segmentIndex}-${pointIndex}`
            : `detour-closure-marker-${routeId}-${pointIndex}`;

          return (
            <WebHtmlMarker
              key={closurePointId}
              coordinate={{ latitude: point.latitude, longitude: point.longitude }}
              html={makeNoEntryHtml(skippedColor, 22)}
              zIndexOffset={MARKER_Z_INDEX.CLOSURE_POINT}
            />
          );
        })
      )}

      {shouldRenderMarkers && showStopMarkers && normalizedSegments.flatMap((segment, segmentIndex) =>
        (segment?.skippedStops ?? []).map((stop, stopIndex) => {
          const skippedStopId = hasMultipleSegments
            ? `detour-skipped-stop-${routeId}-${segmentIndex}-${stop.id ?? 'stop'}-${stopIndex}`
            : `detour-skipped-stop-${routeId}-${stop.id ?? 'stop'}-${stopIndex}`;

          return (
            <WebHtmlMarker
              key={skippedStopId}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              html={makeNoEntryHtml(skippedColor, 20)}
              zIndexOffset={MARKER_Z_INDEX.SKIPPED_STOP}
            />
          );
        })
      )}
    </>
  );
};

export default DetourOverlay;
