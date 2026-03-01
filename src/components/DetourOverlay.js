/**
 * DetourOverlay (Native)
 *
 * Renders detour geometry on the native MapLibre map:
 * - Red dashed line for the skipped normal-route segment
 * - Orange line for the inferred detour path
 * - White circle markers at entry/exit points
 * - Midpoint labels ("Skipped" / "Detour route")
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import RoutePolyline from './RoutePolyline';
import { hasFiniteCoordinate } from '../utils/geometryUtils';
import { getPolylineMidpoint } from '../utils/polylineUtils';
import { COLORS } from '../config/theme';

const styles = StyleSheet.create({
  entryMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
  exitMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.white,
    borderWidth: 2,
  },
  labelPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  labelText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '600',
  },
});

const DetourOverlay = ({
  routeId,
  skippedSegmentPolyline,
  inferredDetourPolyline,
  entryPoint,
  exitPoint,
  opacity,
  skippedColor,
  detourColor,
  markerBorderColor,
}) => {
  const skippedMidpoint =
    skippedSegmentPolyline?.length >= 2
      ? getPolylineMidpoint(skippedSegmentPolyline)
      : null;
  const detourMidpoint =
    inferredDetourPolyline?.length >= 2
      ? getPolylineMidpoint(inferredDetourPolyline)
      : null;

  return (
    <>
      {skippedSegmentPolyline?.length >= 2 && (
        <RoutePolyline
          id={`detour-skipped-${routeId}`}
          coordinates={skippedSegmentPolyline}
          color={skippedColor}
          strokeWidth={5}
          lineDashPattern={[10, 8]}
          opacity={opacity}
          outlineWidth={1.5}
        />
      )}
      {inferredDetourPolyline?.length >= 2 && (
        <RoutePolyline
          id={`detour-path-${routeId}`}
          coordinates={inferredDetourPolyline}
          color={detourColor}
          strokeWidth={5}
          opacity={opacity}
          outlineWidth={1.5}
        />
      )}
      {hasFiniteCoordinate(entryPoint) && (
        <MapLibreGL.PointAnnotation
          id={`detour-entry-${routeId}`}
          coordinate={[entryPoint.longitude, entryPoint.latitude]}
        >
          <View style={[styles.entryMarker, { backgroundColor: markerBorderColor, borderColor: COLORS.white, opacity }]} />
        </MapLibreGL.PointAnnotation>
      )}
      {hasFiniteCoordinate(exitPoint) && (
        <MapLibreGL.PointAnnotation
          id={`detour-exit-${routeId}`}
          coordinate={[exitPoint.longitude, exitPoint.latitude]}
        >
          <View style={[styles.exitMarker, { borderColor: markerBorderColor, opacity }]} />
        </MapLibreGL.PointAnnotation>
      )}
      {skippedMidpoint && (
        <MapLibreGL.PointAnnotation
          id={`detour-label-skipped-${routeId}`}
          coordinate={[skippedMidpoint.longitude, skippedMidpoint.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={[styles.labelPill, { backgroundColor: skippedColor }]}>
            <Text style={styles.labelText}>Skipped</Text>
          </View>
        </MapLibreGL.PointAnnotation>
      )}
      {detourMidpoint && (
        <MapLibreGL.PointAnnotation
          id={`detour-label-path-${routeId}`}
          coordinate={[detourMidpoint.longitude, detourMidpoint.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={[styles.labelPill, { backgroundColor: detourColor }]}>
            <Text style={styles.labelText}>Detour route</Text>
          </View>
        </MapLibreGL.PointAnnotation>
      )}
    </>
  );
};

export default DetourOverlay;
