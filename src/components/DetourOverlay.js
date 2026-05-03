/**
 * DetourOverlay (Native)
 *
 * Renders detour geometry on the native MapLibre map:
 * - Primary detour reroute in deep orange-red with a white halo
 * - Secondary skipped-route context as a muted dashed line when available
 * - White route stop markers with dark outlines
 * - Red slashed markers for skipped stops
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import RoutePolyline from './RoutePolyline';
import { COLORS } from '../config/theme';
import { simplifyPath } from '../utils/geometryUtils';
import { getDirectionArrowPoints } from '../utils/detourDirectionArrows';

const DETOUR_LINE_STYLE = {
  strokeWidth: 4.5,
  outlineWidth: 1.25,
  outlineColor: COLORS.warning,
};

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

const LINE_LABEL_MARKER_STYLE = {
  zIndex: 150,
  elevation: 150,
};

const DIRECTION_ARROW_MARKER_STYLE = {
  zIndex: 110,
  elevation: 110,
};

const DETOUR_LAYER_INDEX = {
  CLOSED_MASK: 300,
  CLOSED_LINE: 304,
  DETOUR_LINE: 320,
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

const isFiniteStopCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude)) &&
  Number.isFinite(Number(point?.longitude))
);

const styles = StyleSheet.create({
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
  closureBadge: {
    width: 104,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  closureBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  lineLabelBadge: {
    minWidth: 72,
    maxWidth: 136,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  lineLabelText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
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
  const closedMarkerPoints = normalizedSegments.flatMap((segment) => ([
    ...(showCallouts ? getClosureMarkerPoints(segment?.skippedSegmentPolyline ?? null) : []),
    ...(showStopMarkers ? (segment?.skippedStops ?? []) : []),
  ])).filter(isFiniteStopCoordinate);
  const openStopPoints = showStopMarkers
    ? (Array.isArray(routeStops) ? routeStops.filter(isFiniteStopCoordinate) : [])
    : [];

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
                <RoutePolyline
                  id={pathId}
                  coordinates={inferredDetourPath}
                  color={detourColor}
                  strokeWidth={DETOUR_LINE_STYLE.strokeWidth}
                  opacity={opacity}
                  outlineWidth={DETOUR_LINE_STYLE.outlineWidth}
                  outlineColor={DETOUR_LINE_STYLE.outlineColor}
                  showArrows
                  layerIndex={DETOUR_LAYER_INDEX.DETOUR_LINE}
                  onPress={onPress}
                />
                {getDirectionArrowPoints(inferredDetourPath).map((arrow, arrowIndex) => (
                  <MapLibreGL.MarkerView
                    key={`detour-direction-arrow-${routeId}-${index}-${arrowIndex}`}
                    id={`detour-direction-arrow-${routeId}-${index}-${arrowIndex}`}
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
            <MapLibreGL.MarkerView
              key={`detour-line-label-${item.key}-${routeId}-${segmentIndex}`}
              id={`detour-line-label-${item.key}-${routeId}-${segmentIndex}`}
              coordinate={[item.point.longitude, item.point.latitude]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View
                style={[
                  styles.lineLabelBadge,
                  LINE_LABEL_MARKER_STYLE,
                  {
                    backgroundColor: item.fillColor,
                    borderColor: item.borderColor,
                    opacity,
                  },
                ]}
              >
                <Text style={[styles.lineLabelText, { color: item.textColor }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            </MapLibreGL.MarkerView>
          ));
      })}

      {shouldRenderCallouts && showCallouts && normalizedSegments.flatMap((segment, segmentIndex) =>
        [
          {
            kind: 'closed',
            point: getPolylineMidpoint(segment?.skippedSegmentPolyline ?? null),
            label: 'ROUTE CLOSED',
            fillColor: COLORS.errorSubtle,
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
                <MapLibreGL.MarkerView
                  key={entryExitId}
                  id={entryExitId}
                  coordinate={[anchor.point.longitude, anchor.point.latitude]}
                  anchor={CALLOUT_ANCHOR}
                >
                  <View
                    style={[
                      styles.closureBadge,
                      CALLOUT_MARKER_STYLE,
                      {
                        backgroundColor: anchor.fillColor,
                        borderColor: anchor.borderColor,
                        opacity,
                      },
                    ]}
                  >
                    <Text style={[styles.closureBadgeText, { color: anchor.textColor }]}>
                      {anchor.label}
                    </Text>
                  </View>
                </MapLibreGL.MarkerView>
              );
            }

            return (
              <MapLibreGL.MarkerView
                key={entryExitId}
                id={entryExitId}
                coordinate={[anchor.point.longitude, anchor.point.latitude]}
                anchor={CALLOUT_ANCHOR}
              >
                <View
                  style={[
                    styles.entryStopMarker,
                    CALLOUT_MARKER_STYLE,
                    {
                      backgroundColor: anchor.fillColor,
                      borderColor: anchor.borderColor,
                      opacity,
                    },
                  ]}
                >
                  <View style={[styles.entryStopDot, { backgroundColor: anchor.dotColor }]} />
                  <View style={styles.entryStopLabelWrap}>
                    <Text style={[styles.entryStopEyebrow, { color: anchor.textColor }]}>
                      {anchor.eyebrow}
                    </Text>
                    <Text style={[styles.entryStopLabel, { color: anchor.textColor }]} numberOfLines={1}>
                      {anchor.label}
                    </Text>
                  </View>
                </View>
              </MapLibreGL.MarkerView>
            );
          })
      )}

    </>
  );
};

export default DetourOverlay;
