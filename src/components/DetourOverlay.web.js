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
import { WebHtmlMarker, WebLineLabelLayer, WebRoutePolyline } from './WebMapView';
import { simplifyPath } from '../utils/geometryUtils';
import { getDirectionArrowPoints } from '../utils/detourDirectionArrows';
import { placeDetourLabels } from '../utils/detourLabelPlacement';

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
  DETOUR_DIRECTION_ARROW: 1180,
  CLOSURE_POINT: 690,
  SKIPPED_STOP: 700,
  ENTRY_EXIT_CALLOUT: 1320,
};

const DETOUR_LINE_LABEL_STYLE = {
  color: ['match', ['get', 'kind'], 'closed', '#991B1B', 'detour', '#92400E', '#374151'],
  haloColor: '#FFFBEB',
  haloWidth: 2.4,
  opacity: 0.98,
  size: 12,
  spacing: 420,
  textOffset: [0, 0],
  textPadding: 6,
  textLetterSpacing: 0.015,
  textMaxAngle: 35,
  textAllowOverlap: false,
  textIgnorePlacement: false,
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

const formatRouteLineLabel = (routeId, routeLineLabel) => {
  const rawLabel = String(routeLineLabel || routeId || '').trim();
  if (!rawLabel) return 'Route detour';
  const friendlyRouteLabel = /^route\b/i.test(rawLabel) ? rawLabel : `Route ${rawLabel}`;
  return `${friendlyRouteLabel} detour`;
};

const buildLineLabelDescriptors = ({
  normalizedSegments,
  hasMultipleSegments,
  routeId,
  routeLineLabel,
  showLineLabels,
  showCallouts,
  labelDensity,
}) => {
  const detourLabel = formatRouteLineLabel(routeId, routeLineLabel);
  const shouldShowClosedLabel = showCallouts && (labelDensity === 'medium' || labelDensity === 'full');
  const labels = [];

  normalizedSegments.forEach((segment, segmentIndex) => {
    const likelyDetourPolyline =
      segment?.likelyDetourPolyline?.length >= 2
        ? segment.likelyDetourPolyline
        : segment?.inferredDetourPolyline;
    const segmentKey = hasMultipleSegments ? `-${segmentIndex}` : '';

    if (showLineLabels && likelyDetourPolyline?.length >= 2) {
      labels.push({
        id: `detour-line-label-detour-${routeId}${segmentKey}`,
        coordinates: likelyDetourPolyline,
        label: detourLabel,
        kind: 'detour',
        priority: 100,
        sortKey: 0,
      });
    }

    if (shouldShowClosedLabel && segment?.skippedSegmentPolyline?.length >= 2) {
      labels.push({
        id: `detour-line-label-closed-${routeId}${segmentKey}`,
        coordinates: segment.skippedSegmentPolyline,
        label: 'Route closed',
        kind: 'closed',
        priority: 80,
        sortKey: 20,
      });
    }
  });

  return labels;
};

const buildCalloutLabelPlacements = ({
  normalizedSegments,
  hasMultipleSegments,
  routeId,
  showCallouts,
  routeBaseColor,
  routeStopFillColor,
  currentZoom,
  labelDensity,
}) => {
  const shouldShowEntryExitLabels = labelDensity === 'full';
  const candidates = normalizedSegments.flatMap((segment, segmentIndex) => {
    const segmentKey = hasMultipleSegments ? `-${segmentIndex}` : '';
    const labels = [];

    if (showCallouts && shouldShowEntryExitLabels) {
      labels.push(
        {
          id: `exit${segmentKey}`,
          renderKind: 'entryExit',
          kind: 'exit',
          point: segment?.exitPoint ?? null,
          eyebrow: 'ROUTE',
          label: 'RESUMES',
          priority: 70,
          width: 104,
          height: 32,
          fillColor: routeStopFillColor,
          borderColor: routeBaseColor,
          textColor: routeBaseColor,
          dotColor: routeBaseColor,
        },
        {
          id: `entry${segmentKey}`,
          renderKind: 'entryExit',
          kind: 'entry',
          point: segment?.entryPoint ?? null,
          eyebrow: 'DETOUR',
          label: 'ROUTE',
          priority: 60,
          width: 104,
          height: 32,
          fillColor: routeBaseColor,
          borderColor: routeStopFillColor,
          textColor: routeStopFillColor,
          dotColor: routeStopFillColor,
        }
      );
    }

    return labels;
  }).filter((label) => label.point);

  return placeDetourLabels(candidates, { zoom: currentZoom });
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

const makeDirectionArrowHtml = (color, bearing, opacity = 1) => `
  <div style="
    width:26px;
    height:26px;
    border-radius:50%;
    background:${color};
    border:2px solid #ffffff;
    box-sizing:border-box;
    box-shadow:0 2px 8px rgba(15,23,42,0.22);
    display:flex;
    align-items:center;
    justify-content:center;
    opacity:${opacity};
    transform:rotate(${bearing}deg);
    color:#ffffff;
    font:900 15px/1 Avenir, Arial, sans-serif;
  ">↑</div>
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
  currentZoom,
  labelDensity = 'full',
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
  const calloutLabelPlacements = shouldRenderCallouts
    ? buildCalloutLabelPlacements({
      normalizedSegments,
      hasMultipleSegments,
      routeId,
      showCallouts,
      routeBaseColor,
      routeStopFillColor,
      currentZoom,
      labelDensity,
    })
    : [];
  const lineLabelDescriptors = shouldRenderCallouts
    ? buildLineLabelDescriptors({
      normalizedSegments,
      hasMultipleSegments,
      routeId,
      routeLineLabel,
      showLineLabels,
      showCallouts,
      labelDensity,
    })
    : [];

  return (
    <>
      {shouldRenderCallouts && (
        <WebLineLabelLayer
          labels={lineLabelDescriptors}
          labelStyle={DETOUR_LINE_LABEL_STYLE}
        />
      )}

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
              <>
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
                {getDirectionArrowPoints(inferredDetourPath).map((arrow, arrowIndex) => (
                  <WebHtmlMarker
                    key={`detour-direction-arrow-${routeId}-${index}-${arrowIndex}`}
                    coordinate={{ latitude: arrow.point.latitude, longitude: arrow.point.longitude }}
                    anchor="center"
                    offset={[0, 0]}
                    html={makeDirectionArrowHtml(detourColor, arrow.bearing, opacity)}
                    zIndexOffset={MARKER_Z_INDEX.DETOUR_DIRECTION_ARROW}
                  />
                ))}
              </>
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

      {shouldRenderCallouts && calloutLabelPlacements.filter((label) => label.visible).map((label) => {
        const markerId = `detour-callout-${label.id}-${routeId}`;

        return (
          <WebHtmlMarker
            key={markerId}
            coordinate={{ latitude: label.point.latitude, longitude: label.point.longitude }}
            anchor="center"
            offset={label.offset}
            html={makeEntryStopHtml(
              label.eyebrow,
              label.label,
              label.fillColor,
              label.borderColor,
              label.textColor,
              label.dotColor
            )}
            zIndexOffset={MARKER_Z_INDEX.ENTRY_EXIT_CALLOUT}
          />
        );
      })}

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
