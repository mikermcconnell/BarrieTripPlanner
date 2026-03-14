/**
 * DetourOverlay (Native)
 *
 * Renders detour geometry on the native MapLibre map:
 * - Red dashed line for the active detour path (or skipped segment fallback)
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
    minWidth: 42,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryStopLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
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
          <RoutePolyline
            key={pathId}
            id={pathId}
            coordinates={activeDetourPath}
            color={detourColor}
            strokeWidth={5}
            lineDashPattern={[10, 8]}
            opacity={opacity}
            outlineWidth={1.5}
          />
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
            kind: 'entry',
            point: segment?.entryPoint ?? null,
            label: 'START',
            fillColor: routeBaseColor,
            borderColor: routeStopFillColor,
            textColor: routeStopFillColor,
          },
          {
            kind: 'exit',
            point: segment?.exitPoint ?? null,
            label: 'END',
            fillColor: routeStopFillColor,
            borderColor: routeBaseColor,
            textColor: routeBaseColor,
          },
        ]
          .filter((anchor) => anchor.point)
          .map((anchor) => {
            const entryExitId = hasMultipleSegments
              ? `detour-${anchor.kind}-point-${routeId}-${segmentIndex}`
              : `detour-${anchor.kind}-point-${routeId}`;

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
                  <Text style={[styles.entryStopLabel, { color: anchor.textColor }]}>
                    {anchor.label}
                  </Text>
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
