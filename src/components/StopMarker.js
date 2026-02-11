import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { COLORS } from '../config/theme';

const StopMarker = ({ stop, onPress, isSelected = false }) => {
  return (
    <Marker
      coordinate={{
        latitude: stop.latitude,
        longitude: stop.longitude,
      }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      onPress={() => onPress?.(stop)}
      zIndex={1} // Lower than buses (zIndex=10) so buses render on top
    >
      <View style={[styles.marker, isSelected && styles.markerSelected]} />
    </Marker>
  );
};

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
