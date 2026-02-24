import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { COLORS } from '../config/theme';

const StopMarkerComponent = ({ stop, onPress, isSelected = false }) => {
  return (
    <MapLibreGL.PointAnnotation
      id={`stop-${stop.id}`}
      coordinate={[stop.longitude, stop.latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
      onSelected={() => onPress?.(stop)}
    >
      <View style={[styles.marker, isSelected && styles.markerSelected]} />
    </MapLibreGL.PointAnnotation>
  );
};

const areStopMarkerPropsEqual = (prev, next) => (
  prev.stop.id === next.stop.id &&
  prev.stop.latitude === next.stop.latitude &&
  prev.stop.longitude === next.stop.longitude &&
  prev.isSelected === next.isSelected
);

const StopMarker = memo(StopMarkerComponent, areStopMarkerPropsEqual);

const styles = StyleSheet.create({
  marker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  markerSelected: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    borderWidth: 3,
  },
});

export default StopMarker;
