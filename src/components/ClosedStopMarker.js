import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { COLORS, SHADOWS } from '../config/theme';

const CLOSED_STOP_MARKER_Z_INDEX = 960;

const getClosedStopCode = (stop) => (
  stop?.code ?? stop?.stopCode ?? stop?.id ?? ''
);

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const ClosedStopMarkerComponent = ({
  stop,
  id,
  isSelected = false,
  color = COLORS.warning,
  opacity = 1,
  labelSide = 'right',
  onPress,
  pointerEvents,
}) => {
  const latitude = toFiniteNumber(stop?.latitude);
  const longitude = toFiniteNumber(stop?.longitude);

  if (latitude == null || longitude == null) {
    return null;
  }

  const stopCode = getClosedStopCode(stop);

  const markerContent = (
    <View
      testID="closed-stop-marker-frame"
      collapsable={false}
      pointerEvents="none"
      style={[styles.frame, styles.aboveMapLines]}
    >
      {stopCode ? (
        <Text
          style={[
            styles.codeLabel,
            labelSide === 'left' ? styles.codeLabelLeft : styles.codeLabelRight,
            { borderColor: color, color, opacity },
          ]}
          numberOfLines={1}
        >
          {stopCode}
        </Text>
      ) : null}
      <View style={[
        styles.marker,
        { borderColor: isSelected ? COLORS.accent : color, opacity },
      ]}>
        <View style={[styles.markerDot, { backgroundColor: color }]} />
      </View>
    </View>
  );

  return (
    <MapLibreGL.MarkerView
      id={id || `closed-stop-${stop.id ?? stopCode}`}
      coordinate={[longitude, latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
      allowOverlap
      pointerEvents={pointerEvents || (onPress ? 'box-none' : 'none')}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stop ${stopCode || stop.id || ''}. Not serviced during this detour`}
          onPress={() => onPress(stop)}
          style={styles.touchTarget}
        >
          {markerContent}
        </Pressable>
      ) : markerContent}
    </MapLibreGL.MarkerView>
  );
};

const arePropsEqual = (prev, next) => (
  prev.stop.id === next.stop.id &&
  prev.stop.latitude === next.stop.latitude &&
  prev.stop.longitude === next.stop.longitude &&
  prev.stop.code === next.stop.code &&
  prev.stop.stopCode === next.stop.stopCode &&
  prev.id === next.id &&
  prev.isSelected === next.isSelected &&
  prev.color === next.color &&
  prev.opacity === next.opacity &&
  prev.labelSide === next.labelSide &&
  prev.onPress === next.onPress &&
  prev.pointerEvents === next.pointerEvents
);

const styles = StyleSheet.create({
  frame: {
    minWidth: 76,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  aboveMapLines: {
    zIndex: CLOSED_STOP_MARKER_Z_INDEX,
    elevation: CLOSED_STOP_MARKER_Z_INDEX,
  },
  touchTarget: {
    minWidth: 76,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: CLOSED_STOP_MARKER_Z_INDEX,
    elevation: CLOSED_STOP_MARKER_Z_INDEX,
  },
  codeLabel: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 3,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: COLORS.white,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
    letterSpacing: 0.2,
    textAlign: 'center',
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  codeLabelRight: {
    marginLeft: 28,
  },
  codeLabelLeft: {
    marginRight: 28,
  },
  marker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  markerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});

const ClosedStopMarker = memo(ClosedStopMarkerComponent, arePropsEqual);

export default ClosedStopMarker;
