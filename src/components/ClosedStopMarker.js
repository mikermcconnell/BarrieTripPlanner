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
  showStopCode = true,
  onPress,
  pointerEvents,
  accessibilityLabel,
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
      {showStopCode && stopCode ? (
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
      <View
        testID="closed-stop-marker-icon"
        style={[
        styles.marker,
        { borderColor: isSelected ? COLORS.accent : color, opacity },
      ]}>
        <View testID="closed-stop-marker-dot" style={[styles.markerDot, { backgroundColor: color }]} />
      </View>
    </View>
  );

  return (
    <MapLibreGL.MarkerView
      id={id || `closed-stop-${stop.id ?? stopCode}`}
      coordinate={[longitude, latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
      allowOverlap
      pointerEvents={pointerEvents || (onPress ? 'auto' : 'none')}
    >
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel || `Stop ${stopCode || stop.id || ''}. Not served by this route during the detour`}
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
    prev.showStopCode === next.showStopCode &&
    prev.onPress === next.onPress &&
  prev.pointerEvents === next.pointerEvents &&
  prev.accessibilityLabel === next.accessibilityLabel
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
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1.5,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  markerDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
  },
});

const ClosedStopMarker = memo(ClosedStopMarkerComponent, arePropsEqual);

export default ClosedStopMarker;
