/**
 * DetourOverlay (Native)
 *
 * Renders detour geometry on the native MapLibre map:
 * - Primary detour reroute in the route color with a green outline
 * - Secondary skipped-route context as a muted dashed line when available
 * - White route stop markers with dark outlines
 * - Red slashed markers for closed road points
 * - Amber markers for stops not served by the selected detoured route
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import RoutePolyline from './RoutePolyline';
import ClosedStopMarker from './ClosedStopMarker';
import { COLORS } from '../config/theme';
import { haversineDistance, offsetPath, simplifyPath } from '../utils/geometryUtils';
import { getDirectionalArrowPoints } from '../utils/detourDirectionArrows';
import { formatDetourMapLabel } from '../utils/detourLabeling';
import {
  canPlaceLineCenterLabel as canFitLineCenterLabel,
  getClosureMarkerPoints,
} from '../utils/detourOverlayDisplay';

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
  outlineColor: COLORS.white,
  lineDashPattern: [3, 4],
  opacityMultiplier: 0.8,
};

const CLOSED_ROUTE_MASK_STYLE = {
  strokeWidth: 11,
  color: COLORS.white,
  opacityMultiplier: 0.95,
};

const scaleLineMetric = (value, scale = 1) => {
  const numericScale = Number(scale);
  return Number.isFinite(numericScale) && numericScale > 0
    ? value * numericScale
    : value;
};

const CALLOUT_ANCHOR = { x: 0.5, y: 1.35 };
const DETOUR_MAP_LABEL_ANCHOR = { x: 0.5, y: 0.5 };
const CALLOUT_MARKER_STYLE = {
  zIndex: 140,
  elevation: 140,
};

const DIRECTION_ARROW_MARKER_STYLE = {
  zIndex: 110,
  elevation: 110,
};

const DETOUR_LAYER_INDEX = {
  CLOSED_MASK: 300,
  CLOSED_LINE: 304,
  DETOUR_LINE: 320,
  LINE_LABELS: 340,
};

const DETOUR_LINE_LABEL_STYLE = {
  symbolPlacement: 'line-center',
  color: ['match', ['get', 'kind'], 'closed', '#991B1B', 'detour', '#92400E', '#374151'],
  haloColor: '#FFFBEB',
  haloWidth: 2.4,
  opacity: 0.98,
  size: 12,
  offset: [0, 0],
  padding: 6,
  letterSpacing: 0.015,
  maxAngle: 35,
};

const DETOUR_LINE_LABEL_MIN_ZOOM = 14.5;
const DETOUR_MAP_LABEL_MIN_ZOOM = 13.25;
const DIMMED_DETOUR_SEGMENT_OPACITY = 0.26;
const simplifyOverlayPath = (path, minDistanceMeters = 28) => {
  if (!Array.isArray(path) || path.length < 2) {
    return null;
  }

  return simplifyPath(path, minDistanceMeters);
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

const getStopNumber = (stop) => {
  const raw = stop?.code ?? stop?.stopCode ?? stop?.stopId ?? stop?.stop_id ?? stop?.id ?? '';
  return String(raw).trim();
};

const normalizeRouteLabel = (routeId) => (
  routeId == null ? null : String(routeId).trim().toUpperCase()
);

const getStopRouteLabels = (stop, fallbackRouteId) => {
  const seen = new Set();
  return [
    ...(Array.isArray(stop?.affectedRouteIds) ? stop.affectedRouteIds : []),
    ...(Array.isArray(stop?.routeIds) ? stop.routeIds : []),
    stop?.routeId,
    fallbackRouteId,
  ]
    .map(normalizeRouteLabel)
    .filter((routeLabel) => {
      if (!routeLabel || seen.has(routeLabel)) return false;
      seen.add(routeLabel);
      return true;
    });
};

const formatRouteList = (routes = []) => {
  if (routes.length === 0) return 'this route';
  if (routes.length === 1) return `Route ${routes[0]}`;
  if (routes.length === 2) return `Routes ${routes[0]} and ${routes[1]}`;
  return `Routes ${routes.slice(0, -1).join(', ')}, and ${routes[routes.length - 1]}`;
};

const getSkippedStopAccessibilityLabel = (stop, routeId) => {
  const stopNumber = getStopNumber(stop);
  const routeLabel = formatRouteList(getStopRouteLabels(stop, routeId));
  return `Stop ${stopNumber || stop?.name || ''}. Not served by ${routeLabel} during this detour.`;
};

const canPlaceLineCenterLabel = (path, label, currentZoom) => (
  Number.isFinite(currentZoom) &&
  currentZoom >= DETOUR_LINE_LABEL_MIN_ZOOM &&
  canFitLineCenterLabel(path, label, currentZoom)
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

const toLineStringFeature = ({ id, path, label, kind, priority, sortKey }) => {
  const coordinates = Array.isArray(path)
    ? path
        .filter((point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
        .map((point) => [point.longitude, point.latitude])
    : [];

  if (coordinates.length < 2) {
    return null;
  }

  return {
    type: 'Feature',
    id,
    properties: {
      id,
      label,
      kind,
      priority,
      sortKey,
    },
    geometry: {
      type: 'LineString',
      coordinates,
    },
  };
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

const buildLineLabelFeatures = ({
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
  const features = [];

  renderableSegments.forEach((segment, segmentIndex) => {
    if (!isSegmentSelected(segmentIndex, selectedSegmentIndex)) return;

    const segmentKey = hasMultipleSegments ? `-${segmentIndex}` : '';

    const detourLabelPath = segment?.detourLabelPath ?? segment?.inferredDetourPath;
    const detourLabel = formatSegmentDetourLabel(routeId, routeLineLabel, segment);

    if (showLineLabels && canPlaceLineCenterLabel(detourLabelPath, detourLabel, currentZoom)) {
      const feature = toLineStringFeature({
        id: `detour-line-label-detour-${routeId}${segmentKey}`,
        path: detourLabelPath,
        label: detourLabel,
        kind: 'detour',
        priority: 100,
        sortKey: 0,
      });
      if (feature) features.push(feature);
    }

    if (shouldShowClosedLabel && canPlaceLineCenterLabel(segment?.skippedRoutePath, 'Route closed', currentZoom)) {
      const feature = toLineStringFeature({
        id: `detour-line-label-closed-${routeId}${segmentKey}`,
        path: segment?.skippedRoutePath ?? null,
        label: 'Route closed',
        kind: 'closed',
        priority: 80,
        sortKey: 20,
      });
      if (feature) features.push(feature);
    }
  });

  return features;
};

const DetourLineLabelLayer = ({ routeId, features }) => {
  if (!Array.isArray(features) || features.length === 0) {
    return null;
  }

  const sourceId = `detour-line-labels-${routeId}`;

  return (
    <MapLibreGL.ShapeSource
      id={sourceId}
      shape={{
        type: 'FeatureCollection',
        features,
      }}
    >
      <MapLibreGL.SymbolLayer
        id={`${sourceId}-symbols`}
        layerIndex={DETOUR_LAYER_INDEX.LINE_LABELS}
        style={{
          symbolPlacement: DETOUR_LINE_LABEL_STYLE.symbolPlacement,
          symbolSortKey: ['get', 'sortKey'],
          textField: ['get', 'label'],
          textSize: DETOUR_LINE_LABEL_STYLE.size,
          textColor: DETOUR_LINE_LABEL_STYLE.color,
          textHaloColor: DETOUR_LINE_LABEL_STYLE.haloColor,
          textHaloWidth: DETOUR_LINE_LABEL_STYLE.haloWidth,
          textOpacity: DETOUR_LINE_LABEL_STYLE.opacity,
          textOffset: DETOUR_LINE_LABEL_STYLE.offset,
          textPadding: DETOUR_LINE_LABEL_STYLE.padding,
          textLetterSpacing: DETOUR_LINE_LABEL_STYLE.letterSpacing,
          textMaxAngle: DETOUR_LINE_LABEL_STYLE.maxAngle,
          textKeepUpright: true,
          textAllowOverlap: false,
          textIgnorePlacement: false,
          textRotationAlignment: 'map',
          textPitchAlignment: 'viewport',
        }}
      />
    </MapLibreGL.ShapeSource>
  );
};

const buildCalloutLabelPlacements = () => [];

const getMiddlePoint = (path) => {
  const points = Array.isArray(path) ? path.filter(isFiniteStopCoordinate) : [];
  if (points.length === 0) return null;
  return points[Math.floor(points.length / 2)];
};

const buildDetourMapLabelPlacements = ({
  renderableSegments,
  hasMultipleSegments,
  routeId,
  routeLineLabel,
  showCallouts,
  labelDensity,
  currentZoom,
  selectedSegmentIndex,
  detourColor,
}) => {
  if (!showCallouts || labelDensity === 'minimal') return [];
  if (Number.isFinite(currentZoom) && currentZoom < DETOUR_MAP_LABEL_MIN_ZOOM) return [];

  return renderableSegments
    .map((segment, segmentIndex) => {
      if (!isSegmentSelected(segmentIndex, selectedSegmentIndex)) return null;
      const path = segment?.detourLabelPath ?? segment?.inferredDetourPath;
      const point = getMiddlePoint(path);
      if (!point) return null;

      const segmentKey = hasMultipleSegments ? `-${segmentIndex}` : '';
      return {
        id: `detour-map-label-${routeId}${segmentKey}`,
        type: 'detour-map-label',
        visible: true,
        point,
        offset: [0, 0],
        label: formatDetourMapLabel({
          routeId,
          routeLineLabel,
          roadNames: segment?.likelyDetourRoadNames,
          title: segment?.eventLocationLabel || segment?.title || segment?.description,
        }),
        borderColor: detourColor,
        dotColor: detourColor,
        fillColor: '#FFFBEB',
        textColor: COLORS.textPrimary,
      };
    })
    .filter(Boolean);
};

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

const shouldShowSkippedStopCodeLabels = ({ showSkippedStopCodes = true } = {}) => showSkippedStopCodes;

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

const styles = StyleSheet.create({
  calloutOffsetFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStopMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    backgroundColor: COLORS.white,
  },
  noEntryMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.error,
    borderColor: COLORS.white,
  },
  noEntryBar: {
    width: 12,
    height: 3,
    borderRadius: 999,
    backgroundColor: COLORS.white,
  },
  closureMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  entryStopMarker: {
    width: 104,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
  entryStopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  entryStopLabelWrap: {
    flexShrink: 1,
    maxWidth: 74,
  },
  entryStopEyebrow: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.45,
    lineHeight: 10,
  },
  entryStopLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 12,
  },
  directionArrowMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 10,
  },
  directionArrowGlyph: {
    width: 16,
    height: 19,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  directionArrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.white,
  },
  directionArrowStem: {
    width: 5,
    height: 8,
    marginTop: -1,
    borderRadius: 2.5,
    backgroundColor: COLORS.white,
  },
  stopMarkerFrame: {
    zIndex: 40,
    elevation: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detourMapLabel: {
    minHeight: 30,
    maxWidth: 176,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 12,
  },
  detourMapLabelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  detourMapLabelText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.15,
    lineHeight: 14,
  },
});

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
  showSkippedStopCodes = true,
  showClosedRouteMask = true,
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
  const skippedStopPoints = getVisibleSkippedStopPoints({
    normalizedSegments,
    shouldRenderClosedStopMarkers,
    selectedSegmentIndex,
  });
  const shouldShowSkippedStopCodes = shouldShowSkippedStopCodeLabels({ showSkippedStopCodes });
  const markerSegments = hasSelectedSegment(selectedSegmentIndex)
    ? normalizedSegments.filter((_segment, index) => index === selectedSegmentIndex)
    : normalizedSegments;
  const closedMarkerPoints = markerSegments
    .flatMap((segment, segmentIndex) => getClosureMarkerPoints(segment?.skippedSegmentPolyline ?? null).map((point) => ({
      ...point,
      detourSegmentIndex: hasSelectedSegment(selectedSegmentIndex) ? selectedSegmentIndex : segmentIndex,
    })))
    .filter(isFiniteStopCoordinate)
    .filter((point) => !isNearSkippedStop(point, skippedStopPoints));
  const openStopPoints = showStopMarkers
    ? (Array.isArray(routeStops) ? routeStops.filter(isFiniteStopCoordinate) : [])
    : [];
  const renderableSegments = normalizedSegments.map((segment) => {
    const canRenderDetourPath = segment?.canShowDetourPath !== false;
    const likelyDetourPolyline =
      canRenderDetourPath && segment?.likelyDetourPolyline?.length >= 2
        ? segment.likelyDetourPolyline
        : null;
    const trustedInferredDetourPolyline =
      !likelyDetourPolyline &&
      segment?.canShowDetourPath === true &&
      segment?.inferredDetourPolyline?.length >= 2
        ? segment.inferredDetourPolyline
        : null;
    const renderableDetourPolyline = likelyDetourPolyline ?? trustedInferredDetourPolyline;
    const inferredDetourPath =
      renderableDetourPolyline?.length >= 2
        ? simplifyOverlayPath(renderableDetourPolyline, 28)
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
    ? [
      ...buildCalloutLabelPlacements({
        normalizedSegments,
        hasMultipleSegments,
        routeId,
        showCallouts,
        routeBaseColor,
        routeStopFillColor,
        currentZoom,
        labelDensity,
      }),
      ...buildDetourMapLabelPlacements({
        renderableSegments,
        hasMultipleSegments,
        routeId,
        routeLineLabel,
        showCallouts,
        labelDensity,
        currentZoom,
        selectedSegmentIndex,
        detourColor,
      }),
    ]
    : [];
  const lineLabelFeatures = shouldRenderCallouts
    ? buildLineLabelFeatures({
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

  return (
    <>
      {shouldRenderCallouts && (
        <DetourLineLabelLayer
          routeId={routeId}
          features={lineLabelFeatures}
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
        const skippedMaskPathId = `${skippedPathId}-mask`;

        return (
          <React.Fragment key={pathId}>
            {skippedRoutePath ? (
              <>
                <RoutePolyline
                  id={skippedMaskPathId}
                  coordinates={skippedRoutePath}
                  color={CLOSED_ROUTE_MASK_STYLE.color}
                  strokeWidth={scaleLineMetric(CLOSED_ROUTE_MASK_STYLE.strokeWidth, lineStyleScale)}
                  opacity={
                    showClosedRouteMask
                      ? Math.min(segmentOpacity, 0.95) * CLOSED_ROUTE_MASK_STYLE.opacityMultiplier
                      : 0
                  }
                  outlineWidth={0}
                  layerIndex={DETOUR_LAYER_INDEX.CLOSED_MASK}
                  onPress={showClosedRouteMask ? handleSegmentPress : undefined}
                />
                <RoutePolyline
                  id={skippedPathId}
                  coordinates={skippedRoutePath}
                  color={skippedColor}
                  strokeWidth={scaleLineMetric(SKIPPED_ROUTE_STYLE.strokeWidth, lineStyleScale)}
                  lineDashPattern={SKIPPED_ROUTE_STYLE.lineDashPattern}
                  opacity={Math.min(segmentOpacity, 0.75) * SKIPPED_ROUTE_STYLE.opacityMultiplier}
                  outlineWidth={scaleLineMetric(SKIPPED_ROUTE_STYLE.outlineWidth, lineStyleScale)}
                  outlineColor={SKIPPED_ROUTE_STYLE.outlineColor}
                  layerIndex={DETOUR_LAYER_INDEX.CLOSED_LINE}
                  onPress={handleSegmentPress}
                />
              </>
            ) : null}
            {inferredDetourPath ? (
              <>
                {segment.detourLinePaths.map((line, lineOffsetIndex) => (
                  <RoutePolyline
                    key={`${pathId}-line-${lineOffsetIndex}`}
                    id={lineOffsetIndex === 0 ? pathId : `${pathId}-${lineOffsetIndex}`}
                    coordinates={line.path}
                    color={detourColor}
                    strokeWidth={scaleLineMetric(DETOUR_LINE_STYLE.strokeWidth, lineStyleScale)}
                    opacity={segmentOpacity}
                    outlineWidth={scaleLineMetric(DETOUR_LINE_STYLE.outlineWidth, lineStyleScale)}
                    outlineColor={DETOUR_LINE_STYLE.outlineColor}
                    showArrows={lineOffsetIndex === 0}
                    layerIndex={DETOUR_LAYER_INDEX.DETOUR_LINE + lineOffsetIndex}
                    onPress={handleSegmentPress}
                  />
                ))}
                {getDirectionalArrowPoints(inferredDetourPath, {
                  mode: directionArrowMode,
                  arrowCount: DETOUR_DIRECTION_ARROW_COUNT,
                  pathOffsetMeters: detourLaneOffsetMeters,
                  bidirectionalOffsetMeters: Math.abs(BIDIRECTIONAL_DETOUR_LINE_OFFSETS[0]),
                  positionOffsetRatio: detourArrowPositionOffsetRatio,
                }).map((arrow, arrowIndex) => (
                  <MapLibreGL.MarkerView
                    key={`detour-direction-arrow-${routeId}-${index}-${arrow.direction}-${arrowIndex}`}
                    id={`detour-direction-arrow-${routeId}-${index}-${arrow.direction}-${arrowIndex}`}
                    coordinate={[arrow.point.longitude, arrow.point.latitude]}
                    anchor={{ x: 0.5, y: 0.5 }}
                    pointerEvents="none"
                  >
                    <View
                      collapsable={false}
                      pointerEvents="none"
                      style={[
                        styles.directionArrowMarker,
                        DIRECTION_ARROW_MARKER_STYLE,
                        {
                          backgroundColor: detourColor,
                          opacity: segmentOpacity,
                          transform: [{ rotate: `${arrow.bearing}deg` }],
                        },
                      ]}
                    >
                      <View style={styles.directionArrowGlyph}>
                        <View style={styles.directionArrowHead} />
                        <View style={styles.directionArrowStem} />
                      </View>
                    </View>
                  </MapLibreGL.MarkerView>
                ))}
              </>
            ) : null}
          </React.Fragment>
        );
      })}

      {shouldRenderMarkers && openStopPoints.map((stop, stopIndex) => (
        <MapLibreGL.MarkerView
          key={`detour-route-stop-${routeId}-${stop.id ?? 'stop'}-${stopIndex}`}
          id={`detour-route-stop-${routeId}-${stop.id ?? 'stop'}-${stopIndex}`}
          coordinate={[Number(stop.longitude), Number(stop.latitude)]}
          anchor={{ x: 0.5, y: 0.5 }}
          pointerEvents="none"
        >
          <View
            collapsable={false}
            style={styles.stopMarkerFrame}
            pointerEvents="none"
          >
            <View
              style={[
                styles.routeStopMarker,
                {
                  backgroundColor: routeStopFillColor,
                  borderColor: routeStopStrokeColor,
                  opacity,
                },
              ]}
            />
          </View>
        </MapLibreGL.MarkerView>
      ))}

      {shouldRenderMarkers && closedMarkerPoints.map((point, pointIndex) => (
        <MapLibreGL.MarkerView
          key={`detour-closed-stop-${routeId}-${point.id ?? 'point'}-${pointIndex}`}
          id={`detour-closed-stop-${routeId}-${point.id ?? 'point'}-${pointIndex}`}
          coordinate={[Number(point.longitude), Number(point.latitude)]}
          anchor={{ x: 0.5, y: 0.5 }}
          pointerEvents="none"
        >
          <View
            collapsable={false}
            style={styles.stopMarkerFrame}
            pointerEvents="none"
          >
            <View
              style={[
                styles.noEntryMarker,
                {
                  backgroundColor: skippedColor,
                  opacity,
                },
              ]}
            >
              <View style={styles.noEntryBar} />
            </View>
          </View>
        </MapLibreGL.MarkerView>
      ))}

      {shouldRenderMarkers && skippedStopPoints.map((stop, stopIndex) => {
        const stopNumber = getStopNumber(stop);
        const stopMarkerKey = (stop.id ?? stopNumber) || 'stop';
        const labelSide = stopIndex % 2 === 0 ? 'right' : 'left';
        const displayStop = {
          ...stop,
          latitude: stop.markerLatitude ?? stop.latitude,
          longitude: stop.markerLongitude ?? stop.longitude,
        };

        return (
          <ClosedStopMarker
            key={`detour-skipped-stop-${routeId}-${stopMarkerKey}-${stopIndex}`}
            id={`detour-skipped-stop-${routeId}-${stopMarkerKey}-${stopIndex}`}
            stop={displayStop}
            showStopCode={shouldShowSkippedStopCodes}
            color={skippedColor}
            opacity={opacity}
            labelSide={labelSide}
            pointerEvents="box-none"
            accessibilityLabel={getSkippedStopAccessibilityLabel(stop, stop.routeId || routeId)}
            onPress={() => (
              onStopPress
                ? onStopPress(stop, { routeId: stop.routeId || routeId, segment: stop.detourSegment ?? null, segmentIndex: stop.detourSegmentIndex ?? null })
                : onPress?.()
            )}
          />
        );
      })}

      {shouldRenderCallouts && calloutLabelPlacements.filter((label) => label.visible).map((label) => {
        const markerId = label.markerId || `detour-callout-${label.id}-${routeId}`;
        const offsetStyle = {
          transform: [
            { translateX: label.offset?.[0] ?? 0 },
            { translateY: label.offset?.[1] ?? 0 },
          ],
        };

        return (
          <MapLibreGL.MarkerView
            key={markerId}
            id={markerId}
            coordinate={[label.point.longitude, label.point.latitude]}
            anchor={label.type === 'detour-map-label' ? DETOUR_MAP_LABEL_ANCHOR : CALLOUT_ANCHOR}
            pointerEvents="none"
          >
            <View style={[styles.calloutOffsetFrame, offsetStyle]} pointerEvents="none">
              {label.type === 'detour-map-label' ? (
                <View
                  style={[
                    styles.detourMapLabel,
                    CALLOUT_MARKER_STYLE,
                    {
                      backgroundColor: label.fillColor,
                      borderColor: label.borderColor,
                      opacity,
                    },
                  ]}
                >
                  <View style={[styles.detourMapLabelDot, { backgroundColor: label.dotColor }]} />
                  <Text style={[styles.detourMapLabelText, { color: label.textColor }]} numberOfLines={1}>
                    {label.label}
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.entryStopMarker,
                    CALLOUT_MARKER_STYLE,
                    {
                      backgroundColor: label.fillColor,
                      borderColor: label.borderColor,
                      opacity,
                    },
                  ]}
                >
                  <View style={[styles.entryStopDot, { backgroundColor: label.dotColor }]} />
                  <View style={styles.entryStopLabelWrap}>
                    <Text style={[styles.entryStopEyebrow, { color: label.textColor }]}>
                      {label.eyebrow}
                    </Text>
                    <Text style={[styles.entryStopLabel, { color: label.textColor }]} numberOfLines={1}>
                      {label.label}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </MapLibreGL.MarkerView>
        );
      })}

    </>
  );
};

export default DetourOverlay;
