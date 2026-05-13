/**
 * DetourOverlay (Native)
 *
 * Renders detour geometry on the native MapLibre map:
 * - Primary detour reroute in deep orange-red with a white halo
 * - Secondary skipped-route context as a muted dashed line when available
 * - White route stop markers with dark outlines
 * - Red slashed markers for closed road points
 * - Red outlined markers for stops not serviced by the detour
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import RoutePolyline from './RoutePolyline';
import { COLORS } from '../config/theme';
import { haversineDistance, offsetPath, simplifyPath } from '../utils/geometryUtils';
import { getDirectionalArrowPoints } from '../utils/detourDirectionArrows';

const DETOUR_LINE_STYLE = {
  strokeWidth: 4.5,
  outlineWidth: 1.25,
  outlineColor: COLORS.warning,
};
const BIDIRECTIONAL_DETOUR_LINE_OFFSETS = [-12, 12];

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

const CALLOUT_ANCHOR = { x: 0.5, y: 1.35 };
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

const formatRouteLineLabel = (routeId, routeLineLabel) => {
  const rawLabel = String(routeLineLabel || routeId || '').trim();
  if (!rawLabel) return 'Route detour';
  const friendlyRouteLabel = /^route\b/i.test(rawLabel) ? rawLabel : `Route ${rawLabel}`;
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
}) => {
  const detourLabel = formatRouteLineLabel(routeId, routeLineLabel);
  const shouldShowClosedLabel = showCallouts && (labelDensity === 'medium' || labelDensity === 'full');
  const features = [];

  renderableSegments.forEach((segment, segmentIndex) => {
    const segmentKey = hasMultipleSegments ? `-${segmentIndex}` : '';

    const detourLabelPath = segment?.detourLabelPath ?? segment?.inferredDetourPath;

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
  skippedStopButton: {
    minWidth: 44,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skippedStopCodeLabel: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 3,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: COLORS.white,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    elevation: 4,
    transform: [{ translateX: 14 }],
  },
  skippedStopMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 5,
  },
  skippedStopInnerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  directionArrowText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 17,
  },
  stopMarkerFrame: {
    zIndex: 40,
    elevation: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

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
  const skippedStopPoints = shouldRenderClosedStopMarkers
    ? normalizedSegments
      .flatMap((segment) => segment?.skippedStops ?? [])
      .filter(isFiniteStopCoordinate)
    : [];
  const closedMarkerPoints = normalizedSegments
    .flatMap((segment) => getClosureMarkerPoints(segment?.skippedSegmentPolyline ?? null))
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
                  strokeWidth={CLOSED_ROUTE_MASK_STYLE.strokeWidth}
                  opacity={Math.min(opacity, 0.95) * CLOSED_ROUTE_MASK_STYLE.opacityMultiplier}
                  outlineWidth={0}
                  layerIndex={DETOUR_LAYER_INDEX.CLOSED_MASK}
                  onPress={onPress}
                />
                <RoutePolyline
                  id={skippedPathId}
                  coordinates={skippedRoutePath}
                  color={skippedColor}
                  strokeWidth={SKIPPED_ROUTE_STYLE.strokeWidth}
                  lineDashPattern={SKIPPED_ROUTE_STYLE.lineDashPattern}
                  opacity={Math.min(opacity, 0.75) * SKIPPED_ROUTE_STYLE.opacityMultiplier}
                  outlineWidth={SKIPPED_ROUTE_STYLE.outlineWidth}
                  outlineColor={SKIPPED_ROUTE_STYLE.outlineColor}
                  layerIndex={DETOUR_LAYER_INDEX.CLOSED_LINE}
                  onPress={onPress}
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
                    strokeWidth={DETOUR_LINE_STYLE.strokeWidth}
                    opacity={opacity}
                    outlineWidth={DETOUR_LINE_STYLE.outlineWidth}
                    outlineColor={DETOUR_LINE_STYLE.outlineColor}
                    showArrows={lineOffsetIndex === 0}
                    layerIndex={DETOUR_LAYER_INDEX.DETOUR_LINE + lineOffsetIndex}
                    onPress={onPress}
                  />
                ))}
                {getDirectionalArrowPoints(inferredDetourPath, {
                  mode: directionArrowMode,
                  pathOffsetMeters: detourLaneOffsetMeters,
                  bidirectionalOffsetMeters: Math.abs(BIDIRECTIONAL_DETOUR_LINE_OFFSETS[0]),
                  positionOffsetRatio: detourArrowPositionOffsetRatio,
                }).map((arrow, arrowIndex) => (
                  <MapLibreGL.MarkerView
                    key={`detour-direction-arrow-${routeId}-${index}-${arrow.direction}-${arrowIndex}`}
                    id={`detour-direction-arrow-${routeId}-${index}-${arrow.direction}-${arrowIndex}`}
                    coordinate={[arrow.point.longitude, arrow.point.latitude]}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View
                      collapsable={false}
                      pointerEvents="none"
                      style={[
                        styles.directionArrowMarker,
                        DIRECTION_ARROW_MARKER_STYLE,
                        {
                          backgroundColor: detourColor,
                          opacity,
                          transform: [{ rotate: `${arrow.bearing}deg` }],
                        },
                      ]}
                    >
                      <Text style={styles.directionArrowText}>↑</Text>
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
        const stopLabel = getStopDisplayName(stop);
        const stopMarkerKey = (stop.id ?? stopNumber) || 'stop';

        return (
          <MapLibreGL.MarkerView
            key={`detour-skipped-stop-${routeId}-${stopMarkerKey}-${stopIndex}`}
            id={`detour-skipped-stop-${routeId}-${stopMarkerKey}-${stopIndex}`}
            coordinate={[Number(stop.longitude), Number(stop.latitude)]}
            anchor={{ x: 0.5, y: 0.78 }}
          >
            <View
              collapsable={false}
              style={styles.stopMarkerFrame}
              pointerEvents="box-none"
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${stopLabel}, not serviced by this detour`}
                onPress={() => (onStopPress ? onStopPress(stop) : onPress?.())}
                style={styles.skippedStopButton}
              >
                <Text
                  style={[
                    styles.skippedStopCodeLabel,
                    {
                      borderColor: skippedColor,
                      color: skippedColor,
                      opacity,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {stopNumber || '!'}
                </Text>
                <View
                  style={[
                    styles.skippedStopMarker,
                    {
                      borderColor: skippedColor,
                      opacity,
                    },
                  ]}
                >
                  <View style={[styles.skippedStopInnerDot, { backgroundColor: skippedColor }]} />
                </View>
              </Pressable>
            </View>
          </MapLibreGL.MarkerView>
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
            anchor={CALLOUT_ANCHOR}
          >
            <View style={[styles.calloutOffsetFrame, offsetStyle]} pointerEvents="none">
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
            </View>
          </MapLibreGL.MarkerView>
        );
      })}

    </>
  );
};

export default DetourOverlay;
