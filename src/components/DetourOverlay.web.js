/**
 * DetourOverlay (Web)
 *
 * Renders detour geometry on the MapLibre web map:
 * - Primary detour reroute in the route color with a green outline
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
import { COLORS } from '../config/theme';

const DETOUR_LINE_STYLE = {
  strokeWidth: 4.5,
  outlineWidth: 1.25,
  outlineColor: COLORS.ctaGreen,
};
const BIDIRECTIONAL_DETOUR_LINE_OFFSETS = [-12, 12];
const DETOUR_DIRECTION_ARROW_COUNT = 2;

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

const scaleLineMetric = (value, scale = 1) => {
  const numericScale = Number(scale);
  return Number.isFinite(numericScale) && numericScale > 0
    ? value * numericScale
    : value;
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
const DIMMED_DETOUR_SEGMENT_OPACITY = 0.26;
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

const hasSelectedSegment = (selectedSegmentIndex) => Number.isInteger(selectedSegmentIndex);

const isSegmentSelected = (segmentIndex, selectedSegmentIndex) => (
  !hasSelectedSegment(selectedSegmentIndex) || segmentIndex === selectedSegmentIndex
);

const getSegmentOpacity = (baseOpacity, segmentIndex, selectedSegmentIndex) => (
  isSegmentSelected(segmentIndex, selectedSegmentIndex)
    ? baseOpacity
    : Math.min(baseOpacity, DIMMED_DETOUR_SEGMENT_OPACITY)
);

const normalizeRoadNameForLabel = (roadName) => String(roadName || '')
  .trim()
  .replace(/\bRoad\b/gi, 'Rd')
  .replace(/\bStreet\b/gi, 'St')
  .replace(/\bDrive\b/gi, 'Dr')
  .replace(/\bAvenue\b/gi, 'Ave')
  .replace(/\bBoulevard\b/gi, 'Blvd')
  .replace(/\bWest\b/gi, 'W')
  .replace(/\bEast\b/gi, 'E')
  .replace(/\bNorth\b/gi, 'N')
  .replace(/\bSouth\b/gi, 'S')
  .replace(/\s+/g, ' ');

const isGenericDetourPathLabel = (label) => {
  const normalized = String(label || '').trim().toLowerCase();
  return !normalized || normalized === 'likely detour path' || normalized === 'detour path';
};

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

const formatSegmentDetourLabel = (routeId, routeLineLabel, segment) => {
  const baseRouteLabel = String(routeLineLabel || routeId || '').trim();
  const friendlyRouteLabel = /^route\b/i.test(baseRouteLabel)
    ? baseRouteLabel
    : `Route ${baseRouteLabel || 'detour'}`;
  const roadNames = Array.isArray(segment?.likelyDetourRoadNames)
    ? segment.likelyDetourRoadNames.map(normalizeRoadNameForLabel).filter(Boolean)
    : [];
  const customLabel = String(segment?.detourPathLabel || '').trim();

  if (roadNames.length > 0) {
    return `${friendlyRouteLabel} detour via ${roadNames[0]}`;
  }

  if (!isGenericDetourPathLabel(customLabel)) {
    return `${friendlyRouteLabel} ${customLabel}`;
  }

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
  selectedSegmentIndex,
}) => {
  const shouldShowClosedLabel = showCallouts && (labelDensity === 'medium' || labelDensity === 'full');
  const labels = [];

  renderableSegments.forEach((segment, segmentIndex) => {
    if (!isSegmentSelected(segmentIndex, selectedSegmentIndex)) return;

    const segmentKey = hasMultipleSegments ? `-${segmentIndex}` : '';

    const detourLabelPath = segment?.detourLabelPath ?? segment?.inferredDetourPath;
    const detourLabel = formatSegmentDetourLabel(routeId, routeLineLabel, segment);

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

const shouldShowSkippedStopCodeLabels = () => true;

const getRoundedStopKey = (stop) => (
  `${getStopNumber(stop) || stop?.id || 'stop'}:${Number(stop?.latitude).toFixed(4)},${Number(stop?.longitude).toFixed(4)}`
);

const CLOSED_STOP_CLUSTER_PROXIMITY_METERS = 35;
const CLOSED_STOP_CLUSTER_OFFSET_METERS = 18;
const METERS_PER_LATITUDE_DEGREE = 111320;

const offsetPointEastWest = (point, offsetMeters) => {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(offsetMeters) || offsetMeters === 0) {
    return point;
  }

  const metersPerLongitudeDegree = METERS_PER_LATITUDE_DEGREE * Math.max(0.25, Math.cos((latitude * Math.PI) / 180));
  return {
    ...point,
    markerLatitude: latitude,
    markerLongitude: longitude + (offsetMeters / metersPerLongitudeDegree),
  };
};

const applySkippedStopMarkerOffsets = (stops = []) => {
  const clusters = [];

  stops.forEach((stop) => {
    const cluster = clusters.find((candidate) =>
      candidate.some((clusterStop) => (
        haversineDistance(
          Number(stop.latitude),
          Number(stop.longitude),
          Number(clusterStop.latitude),
          Number(clusterStop.longitude)
        ) <= CLOSED_STOP_CLUSTER_PROXIMITY_METERS
      ))
    );

    if (cluster) {
      cluster.push(stop);
    } else {
      clusters.push([stop]);
    }
  });

  return clusters.flatMap((cluster) => {
    if (cluster.length < 2) return cluster;
    return cluster.map((stop, index) => {
      const offsetMeters = (index - ((cluster.length - 1) / 2)) * CLOSED_STOP_CLUSTER_OFFSET_METERS;
      return offsetPointEastWest(stop, offsetMeters);
    });
  });
};

const getVisibleSkippedStopPoints = ({ normalizedSegments, shouldRenderClosedStopMarkers, selectedSegmentIndex }) => {
  if (!shouldRenderClosedStopMarkers) return [];

  const sourceSegments = hasSelectedSegment(selectedSegmentIndex)
    ? normalizedSegments.filter((_segment, index) => index === selectedSegmentIndex)
    : normalizedSegments;
  const seen = new Set();

  const skippedStops = sourceSegments
    .flatMap((segment, segmentIndex) => (segment?.skippedStops ?? []).map((stop) => ({
      ...stop,
      detourSegment: segment,
      detourSegmentIndex: hasSelectedSegment(selectedSegmentIndex) ? selectedSegmentIndex : segmentIndex,
    })))
    .filter(isFiniteStopCoordinate)
    .filter((stop) => {
      const key = getRoundedStopKey(stop);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return applySkippedStopMarkerOffsets(skippedStops);
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

const makeSkippedStopHtml = (stop, color, { showLabel = true, labelSide = 'right' } = {}) => {
  const stopNumber = escapeHtml(getStopNumber(stop) || '!');
  const labelMargin = labelSide === 'left' ? 'margin-right:28px;' : 'margin-left:28px;';

  return `
    <div title="Not serviced by this detour" style="
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:3px;
      min-width:76px;
      pointer-events:auto;
    " aria-label="Stop ${stopNumber}. Not serviced by this detour">
      ${showLabel ? `<div style="
        padding:1px 5px;
        ${labelMargin}
        border-radius:7px;
        background:#ffffff;
        border:1px solid ${color};
        box-sizing:border-box;
        box-shadow:0 1px 4px rgba(0,0,0,0.16);
        color:${color};
        font:900 10px/1.2 Avenir, Arial, sans-serif;
        letter-spacing:0.2px;
        white-space:nowrap;
      ">${stopNumber}</div>` : ''}
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
  <div title="Detour direction" style="
    width:30px;
    height:30px;
    border-radius:50%;
    background:${color};
    border:2.5px solid #ffffff;
    box-sizing:border-box;
    box-shadow:0 3px 10px rgba(15,23,42,0.28);
    display:flex;
    align-items:center;
    justify-content:center;
    opacity:${opacity};
    transform:rotate(${bearing}deg);
  ">
    <div style="
      width:16px;
      height:19px;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
    ">
      <div style="
        width:0;
        height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-bottom:11px solid #ffffff;
      "></div>
      <div style="
        width:5px;
        height:8px;
        margin-top:-1px;
        border-radius:3px;
        background:#ffffff;
      "></div>
    </div>
  </div>
`;

const DetourOverlay = ({
  routeId,
  skippedSegmentPolyline,
  inferredDetourPolyline,
  likelyDetourPolyline,
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
  selectedSegmentIndex = null,
  lineStyleScale = 1,
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
        likelyDetourPolyline,
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
      selectedSegmentIndex,
    })
    : [];
  const skippedStopPoints = getVisibleSkippedStopPoints({
    normalizedSegments,
    shouldRenderClosedStopMarkers,
    selectedSegmentIndex,
  });
  const showSkippedStopCodes = shouldShowSkippedStopCodeLabels(currentZoom, selectedSegmentIndex);
  const markerSegments = hasSelectedSegment(selectedSegmentIndex)
    ? normalizedSegments.filter((_segment, index) => index === selectedSegmentIndex)
    : normalizedSegments;

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
        const segmentOpacity = getSegmentOpacity(opacity, index, selectedSegmentIndex);
        const handleSegmentPress = onPress
          ? () => onPress(segment, index)
          : undefined;

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
                  strokeWidth={scaleLineMetric(CLOSED_ROUTE_MASK_STYLE.strokeWidth, lineStyleScale)}
                  opacity={Math.min(segmentOpacity, 0.95) * CLOSED_ROUTE_MASK_STYLE.opacityMultiplier}
                  outlineWidth={0}
                  interactive={Boolean(onPress)}
                  onPress={handleSegmentPress}
                />
                <WebRoutePolyline
                  key={skippedPathId}
                  coordinates={skippedRoutePath}
                  color={skippedColor}
                  strokeWidth={scaleLineMetric(SKIPPED_ROUTE_STYLE.strokeWidth, lineStyleScale)}
                  dashArray={SKIPPED_ROUTE_STYLE.dashArray}
                  opacity={Math.min(segmentOpacity, 0.75) * SKIPPED_ROUTE_STYLE.opacityMultiplier}
                  outlineWidth={scaleLineMetric(SKIPPED_ROUTE_STYLE.outlineWidth, lineStyleScale)}
                  outlineColor={SKIPPED_ROUTE_STYLE.outlineColor}
                  interactive={Boolean(onPress)}
                  onPress={handleSegmentPress}
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
                    strokeWidth={scaleLineMetric(DETOUR_LINE_STYLE.strokeWidth, lineStyleScale)}
                    opacity={segmentOpacity}
                    outlineWidth={scaleLineMetric(DETOUR_LINE_STYLE.outlineWidth, lineStyleScale)}
                    outlineColor={DETOUR_LINE_STYLE.outlineColor}
                    interactive={Boolean(onPress)}
                    onPress={handleSegmentPress}
                    showArrows={lineOffsetIndex === 0}
                  />
                ))}
                {getDirectionalArrowPoints(inferredDetourPath, {
                  mode: directionArrowMode,
                  arrowCount: DETOUR_DIRECTION_ARROW_COUNT,
                  pathOffsetMeters: detourLaneOffsetMeters,
                  bidirectionalOffsetMeters: Math.abs(BIDIRECTIONAL_DETOUR_LINE_OFFSETS[0]),
                  positionOffsetRatio: detourArrowPositionOffsetRatio,
                }).map((arrow, arrowIndex) => (
                  <WebHtmlMarker
                    key={`detour-direction-arrow-${routeId}-${index}-${arrow.direction}-${arrowIndex}`}
                    coordinate={{ latitude: arrow.point.latitude, longitude: arrow.point.longitude }}
                    anchor="center"
                    offset={[0, 0]}
                    html={makeDirectionArrowHtml(detourColor, arrow.bearing, segmentOpacity)}
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

      {shouldRenderMarkers && markerSegments.flatMap((segment, segmentIndex) =>
        getClosureMarkerPoints(segment?.skippedSegmentPolyline ?? null)
          .filter((point) => !isNearSkippedStop(point, skippedStopPoints))
          .map((point, pointIndex) => {
          const sourceSegmentIndex = hasSelectedSegment(selectedSegmentIndex) ? selectedSegmentIndex : segmentIndex;
          const closurePointId = hasMultipleSegments
            ? `detour-closure-marker-${routeId}-${sourceSegmentIndex}-${pointIndex}`
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

      {shouldRenderMarkers && skippedStopPoints.map((stop, stopIndex) => {
          const skippedStopId = hasMultipleSegments
            ? `detour-skipped-stop-${routeId}-${stop.detourSegmentIndex ?? 'segment'}-${stop.id ?? 'stop'}-${stopIndex}`
            : `detour-skipped-stop-${routeId}-${stop.id ?? 'stop'}-${stopIndex}`;
          const stopName = getStopDisplayName(stop);
          const stopNumber = getStopNumber(stop);
          const labelSide = stopIndex % 2 === 0 ? 'right' : 'left';
          const markerLatitude = stop.markerLatitude ?? stop.latitude;
          const markerLongitude = stop.markerLongitude ?? stop.longitude;

          return (
            <WebHtmlMarker
              key={skippedStopId}
              coordinate={{ latitude: markerLatitude, longitude: markerLongitude }}
              anchor="center"
              offset={[0, -12]}
              html={makeSkippedStopHtml(stop, skippedColor, {
                showLabel: showSkippedStopCodes,
                labelSide,
              })}
              zIndexOffset={MARKER_Z_INDEX.SKIPPED_STOP}
              onPress={() => (onStopPress ? onStopPress(stop, { routeId: stop.routeId || routeId, segment: stop.detourSegment ?? null, segmentIndex: stop.detourSegmentIndex ?? null }) : onPress?.())}
              popupHtml={`<strong>${escapeHtml(stopName)}</strong>${stopNumber ? `<br />Stop #${escapeHtml(stopNumber)}` : ''}<br />Not serviced by this detour`}
              accessibilityLabel={`${stopName}, not serviced by this detour`}
            />
          );
        })}
    </>
  );
};

export default DetourOverlay;
