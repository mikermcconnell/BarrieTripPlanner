import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebMapView from './WebMapView';
import DetourOverlay from './DetourOverlay';

const DEFAULT_REGION = {
  latitude: 44.39,
  longitude: -79.69,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function collectPoints(snapshot = {}) {
  return [
    ...(snapshot.skippedSegmentPolyline || []),
    ...(snapshot.likelyDetourPolyline || snapshot.inferredDetourPolyline || []),
  ].filter((point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude));
}

export default function DetourReviewMap({ reviewCase }) {
  const mapRef = useRef(null);
  const snapshot = reviewCase?.snapshot || {};
  const points = useMemo(() => collectPoints(snapshot), [snapshot]);
  useEffect(() => {
    if (points.length > 0) {
      setTimeout(() => mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, maxZoom: 15,
      }), 150);
    }
  }, [points]);

  return (
    <View style={styles.container} accessibilityLabel="Detected detour map">
      <WebMapView ref={mapRef} initialRegion={DEFAULT_REGION}>
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
      </WebMapView>
    </View>
  );
}

const styles = StyleSheet.create({ container: { height: 360, overflow: 'hidden', borderRadius: 18 } });
