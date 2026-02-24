/**
 * DetourOverlay (Native)
 *
 * Renders detour geometry on the native MapLibre map:
 * - Red dashed line for the skipped normal-route segment
 * - Orange line for the inferred detour path
 * - White circle markers at entry/exit points
 *
 * Accepts pre-computed props from useDetourOverlays hook.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import RoutePolyline from './RoutePolyline';

const hasFiniteCoordinate = (point) =>
  Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);

const styles = StyleSheet.create({
  marker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    borderWidth: 3,
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
}) => (
  <>
    {skippedSegmentPolyline?.length >= 2 && (
      <RoutePolyline
        id={`detour-skipped-${routeId}`}
        coordinates={skippedSegmentPolyline}
        color={skippedColor}
        strokeWidth={5}
        lineDashPattern={[8, 6]}
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
        <View style={[styles.marker, { borderColor: markerBorderColor, opacity }]} />
      </MapLibreGL.PointAnnotation>
    )}
    {hasFiniteCoordinate(exitPoint) && (
      <MapLibreGL.PointAnnotation
        id={`detour-exit-${routeId}`}
        coordinate={[exitPoint.longitude, exitPoint.latitude]}
      >
        <View style={[styles.marker, { borderColor: markerBorderColor, opacity }]} />
      </MapLibreGL.PointAnnotation>
    )}
  </>
);

export default DetourOverlay;
