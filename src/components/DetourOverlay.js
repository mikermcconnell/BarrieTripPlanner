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

const DETOUR_LINE_STYLE = {
  strokeWidth: 4.5,
  outlineWidth: 2.5,
  outlineColor: COLORS.white,
};

const SKIPPED_ROUTE_STYLE = {
  strokeWidth: 3,
  outlineWidth: 1.25,
  outlineColor: COLORS.white,
  lineDashPattern: [3, 4],
  opacityMultiplier: 0.8,
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

const styles = StyleSheet.create({
  routeStopMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    backgroundColor: COLORS.white,
  },
  skippedStopMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  skippedStopSlash: {
    width: 12,
    height: 2.5,
    borderRadius: 999,
    transform: [{ rotate: '-45deg' }],
  },
  entryStopMarker: {
    minWidth: 98,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  entryStopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  entryStopLabelWrap: {
    flexShrink: 1,
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
    minWidth: 108,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closureBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.35,
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
        const inferredDetourPath =
          segment?.inferredDetourPolyline?.length >= 2
            ? simplifyOverlayPath(segment.inferredDetourPolyline, 28)
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
            {inferredDetourPath && skippedRoutePath ? (
              <RoutePolyline
                id={skippedPathId}
                coordinates={skippedRoutePath}
                color={skippedColor}
                strokeWidth={SKIPPED_ROUTE_STYLE.strokeWidth}
                lineDashPattern={SKIPPED_ROUTE_STYLE.lineDashPattern}
                opacity={Math.min(opacity, 0.75) * SKIPPED_ROUTE_STYLE.opacityMultiplier}
                outlineWidth={SKIPPED_ROUTE_STYLE.outlineWidth}
                outlineColor={SKIPPED_ROUTE_STYLE.outlineColor}
              />
            ) : null}
            <RoutePolyline
              id={pathId}
              coordinates={activeDetourPath}
              color={detourColor}
              strokeWidth={DETOUR_LINE_STYLE.strokeWidth}
              opacity={opacity}
              outlineWidth={DETOUR_LINE_STYLE.outlineWidth}
              outlineColor={DETOUR_LINE_STYLE.outlineColor}
            />
          </React.Fragment>
        );
      })}

      {showStopMarkers && routeStops.map((stop) => (
        <MapLibreGL.PointAnnotation
          key={`detour-route-stop-${routeId}-${stop.id}`}
          id={`detour-route-stop-${routeId}-${stop.id}`}
          coordinate={[stop.longitude, stop.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
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
        </MapLibreGL.PointAnnotation>
      ))}

      {showCallouts && normalizedSegments.flatMap((segment, segmentIndex) =>
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
            eyebrow: 'BUS DETOUR',
            label: 'OPEN',
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
                <MapLibreGL.PointAnnotation
                  key={entryExitId}
                  id={entryExitId}
                  coordinate={[anchor.point.longitude, anchor.point.latitude]}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View
                    style={[
                      styles.closureBadge,
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
                </MapLibreGL.PointAnnotation>
              );
            }

            return (
              <MapLibreGL.PointAnnotation
                key={entryExitId}
                id={entryExitId}
                coordinate={[anchor.point.longitude, anchor.point.latitude]}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  style={[
                    styles.entryStopMarker,
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
                    <Text style={[styles.entryStopLabel, { color: anchor.textColor }]}>
                      {anchor.label}
                    </Text>
                  </View>
                </View>
              </MapLibreGL.PointAnnotation>
            );
          })
      )}

      {showStopMarkers && normalizedSegments.flatMap((segment, segmentIndex) =>
        (segment?.skippedStops ?? []).map((stop) => {
          const skippedStopId = hasMultipleSegments
            ? `detour-skipped-stop-${routeId}-${segmentIndex}-${stop.id}`
            : `detour-skipped-stop-${routeId}-${stop.id}`;

          return (
            <MapLibreGL.PointAnnotation
              key={skippedStopId}
              id={skippedStopId}
              coordinate={[stop.longitude, stop.latitude]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View
                style={[
                  styles.skippedStopMarker,
                  {
                    borderColor: skippedColor,
                    opacity,
                  },
                ]}
              >
                <View style={[styles.skippedStopSlash, { backgroundColor: skippedColor }]} />
              </View>
            </MapLibreGL.PointAnnotation>
          );
        })
      )}
    </>
  );
};

export default DetourOverlay;
