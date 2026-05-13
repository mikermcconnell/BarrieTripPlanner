/**
 * DetourOverlay (Web)
 *
 * Renders detour geometry on the MapLibre web map:
 * - Primary detour reroute in deep orange-red with a white halo
 * - Secondary skipped-route context as a muted dashed line when available
 * - White route stop markers with dark outlines
 * - Red slashed markers for closed road points
 * - Red outlined markers for stops not serviced by the detour
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { WebHtmlMarker, WebLineLabelLayer, WebRoutePolyline } from './WebMapView';
import { haversineDistance, offsetPath, simplifyPath } from '../utils/geometryUtils';
import { getDirectionalArrowPoints } from '../utils/detourDirectionArrows';

const DETOUR_LINE_STYLE = {
  strokeWidth: 4.5,
  outlineWidth: 1.25,
  outlineColor: '#FF991F',
};
const BIDIRECTIONAL_DETOUR_LINE_OFFSETS = [-12, 12];

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
  symbolPlacement: 'line-center',
  color: ['match', ['get', 'kind'], 'closed', '#991B1B', 'detour', '#92400E', '#374151'],
  haloColor: '#FFFBEB',
  haloWidth: 2.4,
  opacity: 0.98,
  size: 12,
  textOffset: [0, 0],
  textPadding: 6,
  textLetterSpacing: 0.015,
  textMaxAngle: 35,
  textAllowOverlap: false,
  textIgnorePlacement: false,
};

const DETOUR_LINE_LABEL_MIN_ZOOM = 14.5;
const DETOUR_LABEL_BASE_PADDING_PX = 28;
const DETOUR_LABEL_APPROX_CHAR_WIDTH_PX = 7;
const DETOUR_LABEL_SAFE_FIT_BUFFER_PX = 18;
const WEB_MERCATOR_EQUATOR_METERS_PER_PIXEL = 156543.03392;

const simplifyOverlayPath = (path, minDistanceMeters = 28) => {
  if (!Array.isArray(path) || path.length < 2) {
    return null;
  }

  return simplifyPath(path, minDistanceMeters);
};

const getClosureMarkerPoints = (path) => {
  if (!Array.isArray(path) || path.length < 2) {
    return [];
  }

  const indexes = [0, path.length - 1];
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

const isFiniteStopCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude)) &&
  Number.isFinite(Number(point?.longitude))
);

const CLOSURE_MARKER_STOP_PROXIMITY_METERS = 22;

const isNearSkippedStop = (point, skippedStops = []) => skippedStops.some((stop) => {
  const distance = haversineDistance(
    Number(point.latitude),
    Number(point.longitude),
    Number(stop.latitude),
    Number(stop.longitude)
  );
  return Number.isFinite(distance) && distance <= CLOSURE_MARKER_STOP_PROXIMITY_METERS;
});

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getStopNumber = (stop) => {
  const raw = stop?.code ?? stop?.stopCode ?? stop?.stopId ?? stop?.stop_id ?? stop?.id ?? '';
  return String(raw).trim();
};

const getStopDisplayName = (stop) => {
  const stopNumber = getStopNumber(stop);
  return stop?.name || (stopNumber ? `Stop #${stopNumber}` : 'Stop');
};

const getPathDistanceMeters = (path) => {
  const points = Array.isArray(path)
    ? path.filter(isFiniteStopCoordinate)
    : [];

  if (points.length < 2) return 0;

  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    const distance = haversineDistance(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude
    );
    return Number.isFinite(distance) ? total + distance : total;
  }, 0);
};

const getAverageLatitude = (path) => {
  const points = Array.isArray(path)
    ? path.filter(isFiniteStopCoordinate)
    : [];

  if (points.length === 0) return 44.39;

  return points.reduce((sum, point) => sum + Number(point.latitude), 0) / points.length;
};

const getMetersPerPixelAtZoom = (zoom, latitude) => (
  (WEB_MERCATOR_EQUATOR_METERS_PER_PIXEL * Math.cos((latitude * Math.PI) / 180)) /
  Math.pow(2, zoom)
);

const estimateLabelWidthPx = (label) => (
  DETOUR_LABEL_BASE_PADDING_PX + (String(label || '').length * DETOUR_LABEL_APPROX_CHAR_WIDTH_PX)
);

const canPlaceLineCenterLabel = (path, label, currentZoom) => {
  if (!Number.isFinite(currentZoom) || currentZoom < DETOUR_LINE_LABEL_MIN_ZOOM) {
    return false;
  }

  const distanceMeters = getPathDistanceMeters(path);
  if (distanceMeters <= 0) return false;

  const metersPerPixel = getMetersPerPixelAtZoom(currentZoom, getAverageLatitude(path));
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return false;

  const screenLengthPx = distanceMeters / metersPerPixel;
  return screenLengthPx >= estimateLabelWidthPx(label) + DETOUR_LABEL_SAFE_FIT_BUFFER_PX;
};

const formatRouteLineLabel = (routeId, routeLineLabel) => {
  const rawLabel = String(routeLineLabel || routeId || '').trim();
  if (!rawLabel) return 'Route detour';
  const friendlyRouteLabel = /^route\b/i.test(rawLabel) ? rawLabel : `Route ${rawLabel}`;
  return `${friendlyRouteLabel} detour`;
};

const buildLineLabelDescriptors = ({
  renderableSegments,
  hasMultipleSegments,
  routeId,
  routeLineLabel,
  showLineLabels,
  showCallouts,
  labelDensity,
  currentZoom,
}) => {
  const detourLabel = formatRouteLineLabel(routeId, routeLineLabel);
  const shouldShowClosedLabel = showCallouts && (labelDensity === 'medium' || labelDensity === 'full');
  const labels = [];

  renderableSegments.forEach((segment, segmentIndex) => {
    const segmentKey = hasMultipleSegments ? `-${segmentIndex}` : '';

    const detourLabelPath = segment?.detourLabelPath ?? segment?.inferredDetourPath;

    if (showLineLabels && canPlaceLineCenterLabel(detourLabelPath, detourLabel, currentZoom)) {
      labels.push({
        id: `detour-line-label-detour-${routeId}${segmentKey}`,
        coordinates: detourLabelPath,
        label: detourLabel,
        kind: 'detour',
        priority: 100,
        sortKey: 0,
      });
    }

    if (shouldShowClosedLabel && canPlaceLineCenterLabel(segment?.skippedRoutePath, 'Route closed', currentZoom)) {
      labels.push({
        id: `detour-line-label-closed-${routeId}${segmentKey}`,
        coordinates: segment.skippedRoutePath,
        label: 'Route closed',
        kind: 'closed',
        priority: 80,
        sortKey: 20,
      });
    }
  });

  return labels;
};

const buildCalloutLabelPlacements = () => [];

const getDetourLineOffsets = (directionArrowMode, detourLaneOffsetMeters) => (
  directionArrowMode === 'both'
    ? BIDIRECTIONAL_DETOUR_LINE_OFFSETS
    : [detourLaneOffsetMeters]
);

const buildOffsetDetourLinePaths = (path, directionArrowMode, detourLaneOffsetMeters) => (
  getDetourLineOffsets(directionArrowMode, detourLaneOffsetMeters).map((offsetMeters) => ({
    offsetMeters,
    path: offsetMeters ? offsetPath(path, offsetMeters) : path,
  }))
);

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

const makeSkippedStopHtml = (stop, color) => {
  const stopNumber = escapeHtml(getStopNumber(stop) || '!');

  return `
    <div title="Not serviced by this detour" style="
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:3px;
      pointer-events:auto;
    " aria-label="Stop ${stopNumber}. Not serviced by this detour">
      <div style="
        padding:1px 5px;
        border-radius:7px;
        background:#ffffff;
        border:1px solid ${color};
        box-sizing:border-box;
        box-shadow:0 1px 4px rgba(0,0,0,0.16);
        color:${color};
        font:900 10px/1.2 Avenir, Arial, sans-serif;
        letter-spacing:0.2px;
        white-space:nowrap;
        transform:translateX(14px);
      ">${stopNumber}</div>
      <div style="
        width:22px;
        height:22px;
        border-radius:50%;
        background:#ffffff;
        border:3px solid ${color};
        box-sizing:border-box;
        box-shadow:0 1px 5px rgba(0,0,0,0.2);
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        <div style="
          width:7px;
          height:7px;
          border-radius:50%;
          background:${color};
        "></div>
      </div>
    </div>
  `;
};

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
  canShowDetourPath,
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
  showClosedStopMarkers = false,
  onPress,
  onStopPress,
  renderMode = 'all',
  currentZoom,
  labelDensity = 'full',
  directionArrowMode = 'forward',
  detourLaneOffsetMeters = 0,
  detourArrowPositionOffsetRatio = 0,
}) => {
  const shouldRenderGeometry = renderMode === 'all' || renderMode === 'geometry';
  const shouldRenderCallouts = renderMode === 'all' || renderMode === 'callouts';
  const shouldRenderMarkers = renderMode === 'all' || renderMode === 'markers';
  const shouldRenderClosedStopMarkers = showStopMarkers || showClosedStopMarkers;
  const normalizedSegments =
    Array.isArray(segmentStopDetails) && segmentStopDetails.length > 0
      ? segmentStopDetails
      : [{
        skippedSegmentPolyline,
        inferredDetourPolyline,
        canShowDetourPath,
        entryPoint: entryPoint ?? null,
        exitPoint: exitPoint ?? null,
        skippedStops: Array.isArray(skippedStops) ? skippedStops : [],
        entryStop: entryStop ?? null,
        exitStop: exitStop ?? null,
      }];
  const hasMultipleSegments = normalizedSegments.length > 1;
  const renderableSegments = normalizedSegments.map((segment) => {
    const canRenderDetourPath = segment?.canShowDetourPath !== false;
    const likelyDetourPolyline =
      canRenderDetourPath && segment?.likelyDetourPolyline?.length >= 2
        ? segment.likelyDetourPolyline
        : canRenderDetourPath
          ? segment?.inferredDetourPolyline
          : null;
    const inferredDetourPath =
      likelyDetourPolyline?.length >= 2
        ? simplifyOverlayPath(likelyDetourPolyline, 28)
        : null;
    const skippedRoutePath =
      segment?.skippedSegmentPolyline?.length >= 2
        ? simplifyOverlayPath(segment.skippedSegmentPolyline, 18)
        : null;
    const detourLinePaths = inferredDetourPath
      ? buildOffsetDetourLinePaths(inferredDetourPath, directionArrowMode, detourLaneOffsetMeters)
      : [];

    return {
      ...segment,
      likelyDetourPolyline,
      inferredDetourPath,
      detourLinePaths,
      detourLabelPath: detourLinePaths[0]?.path ?? inferredDetourPath,
      skippedRoutePath,
    };
  });
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
      renderableSegments,
      hasMultipleSegments,
      routeId,
      routeLineLabel,
      showLineLabels,
      showCallouts,
      labelDensity,
      currentZoom,
    })
    : [];
  const skippedStopPoints = shouldRenderClosedStopMarkers
    ? normalizedSegments
      .flatMap((segment) => segment?.skippedStops ?? [])
      .filter(isFiniteStopCoordinate)
    : [];

  return (
    <>
      {shouldRenderCallouts && (
        <WebLineLabelLayer
          labels={lineLabelDescriptors}
          labelStyle={DETOUR_LINE_LABEL_STYLE}
        />
      )}

      {shouldRenderGeometry && renderableSegments.map((segment, index) => {
        const inferredDetourPath = segment?.inferredDetourPath;
        const skippedRoutePath = segment?.skippedRoutePath;
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
                {segment.detourLinePaths.map((line, lineOffsetIndex) => (
                  <WebRoutePolyline
                    key={`${pathId}-line-${lineOffsetIndex}`}
                    coordinates={line.path}
                    color={detourColor}
                    strokeWidth={DETOUR_LINE_STYLE.strokeWidth}
                    opacity={opacity}
                    outlineWidth={DETOUR_LINE_STYLE.outlineWidth}
                    outlineColor={DETOUR_LINE_STYLE.outlineColor}
                    interactive={Boolean(onPress)}
                    onPress={onPress}
                    showArrows={lineOffsetIndex === 0}
                  />
                ))}
                {getDirectionalArrowPoints(inferredDetourPath, {
                  mode: directionArrowMode,
                  pathOffsetMeters: detourLaneOffsetMeters,
                  bidirectionalOffsetMeters: Math.abs(BIDIRECTIONAL_DETOUR_LINE_OFFSETS[0]),
                  positionOffsetRatio: detourArrowPositionOffsetRatio,
                }).map((arrow, arrowIndex) => (
                  <WebHtmlMarker
                    key={`detour-direction-arrow-${routeId}-${index}-${arrow.direction}-${arrowIndex}`}
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

      {shouldRenderMarkers && normalizedSegments.flatMap((segment, segmentIndex) =>
        getClosureMarkerPoints(segment?.skippedSegmentPolyline ?? null)
          .filter((point) => !isNearSkippedStop(point, skippedStopPoints))
          .map((point, pointIndex) => {
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

      {shouldRenderMarkers && shouldRenderClosedStopMarkers && normalizedSegments.flatMap((segment, segmentIndex) =>
        (segment?.skippedStops ?? []).filter(isFiniteStopCoordinate).map((stop, stopIndex) => {
          const skippedStopId = hasMultipleSegments
            ? `detour-skipped-stop-${routeId}-${segmentIndex}-${stop.id ?? 'stop'}-${stopIndex}`
            : `detour-skipped-stop-${routeId}-${stop.id ?? 'stop'}-${stopIndex}`;
          const stopName = getStopDisplayName(stop);
          const stopNumber = getStopNumber(stop);

          return (
            <WebHtmlMarker
              key={skippedStopId}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              anchor="center"
              offset={[0, -12]}
              html={makeSkippedStopHtml(stop, skippedColor)}
              zIndexOffset={MARKER_Z_INDEX.SKIPPED_STOP}
              onPress={() => (onStopPress ? onStopPress(stop) : onPress?.())}
              popupHtml={`<strong>${escapeHtml(stopName)}</strong>${stopNumber ? `<br />Stop #${escapeHtml(stopNumber)}` : ''}<br />Not serviced by this detour`}
              accessibilityLabel={`${stopName}, not serviced by this detour`}
            />
          );
        })
      )}
    </>
  );
};

export default DetourOverlay;
