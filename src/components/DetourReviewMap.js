import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { OSM_MAP_STYLE } from '../config/constants';
import DetourOverlay from './DetourOverlay';

const DEFAULT_CENTER = [-79.69, 44.39];

function collectPoints(snapshot = {}) {
  return [
    ...(snapshot.skippedSegmentPolyline || []),
    ...(snapshot.likelyDetourPolyline || snapshot.inferredDetourPolyline || []),
  ].filter((point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude));
}

export default function DetourReviewMap({ reviewCase }) {
  const snapshot = reviewCase?.snapshot || {};
  const points = useMemo(() => collectPoints(snapshot), [snapshot]);
  const center = points.length > 0
    ? [points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
      points.reduce((sum, point) => sum + point.latitude, 0) / points.length]
    : DEFAULT_CENTER;

  return (
    <View style={styles.container} accessibilityLabel="Detected detour map">
      <MapLibreGL.MapView style={styles.map} mapStyle={OSM_MAP_STYLE} logoEnabled={false}>
        <MapLibreGL.Camera defaultSettings={{ centerCoordinate: center, zoomLevel: points.length ? 14 : 12 }} />
        <DetourOverlay
          routeId={reviewCase?.routeId}
          {...snapshot}
          segmentStopDetails={snapshot.segments}
          routeStops={[]}
          skippedStops={snapshot.skippedStops || []}
          opacity={1}
          skippedColor="#C2413B"
          detourColor="#167A68"
          routeBaseColor="#49657A"
          routeStopFillColor="#FFFFFF"
          routeStopStrokeColor="#C2413B"
          showLineLabels={false}
          showCallouts
          showStopMarkers
          showClosedStopMarkers
        />
      </MapLibreGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({ container: { height: 330, overflow: 'hidden', borderRadius: 18 }, map: { flex: 1 } });
