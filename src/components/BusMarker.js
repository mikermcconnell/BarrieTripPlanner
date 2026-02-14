import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import { useAnimatedMarker } from '../hooks/useAnimatedMarker';

const BUS_ICON_PATH =
  'M4 16C4 16.88 4.39 17.67 5 18.22V20C5 20.55 5.45 21 6 21H7C7.55 21 8 20.55 8 20V19H16V20C16 20.55 16.45 21 17 21H18C18.55 21 19 20.55 19 20V18.22C19.61 17.67 20 16.88 20 16V6C20 2.5 16.42 2 12 2C7.58 2 4 2.5 4 6V16ZM7.5 17C6.67 17 6 16.33 6 15.5C6 14.67 6.67 14 7.5 14C8.33 14 9 14.67 9 15.5C9 16.33 8.33 17 7.5 17ZM16.5 17C15.67 17 15 16.33 15 15.5C15 14.67 15.67 14 16.5 14C17.33 14 18 14.67 18 15.5C18 16.33 17.33 17 16.5 17ZM18 11H6V6H18V11Z';

const MARKER_SIZE = 40;
const ARROW_WRAPPER_SIZE = 80;

const BusMarker = ({ vehicle, color = '#E53935', onPress }) => {
  const animatedCoordinate = useAnimatedMarker(vehicle.coordinate);
  const [tracked, setTracked] = useState(true);
  const freezeTimerRef = useRef(null);
  const isAndroid = Platform.OS === 'android';

  if (!vehicle.coordinate || !vehicle.coordinate.latitude || !vehicle.coordinate.longitude) {
    return null;
  }

  const routeLabel = vehicle.routeId || '?';
  const hasValidBearing = vehicle.bearing !== null && vehicle.bearing !== undefined;
  const showDirectionArrow = hasValidBearing;
  const roundedBearing = hasValidBearing ? Math.round(vehicle.bearing) : null;

  useEffect(() => {
    // Keep tracking view changes long enough for marker snapshot rendering on Android.
    // Freezing too early can produce partially rendered marker bitmaps.
    setTracked(true);
    if (freezeTimerRef.current) {
      clearTimeout(freezeTimerRef.current);
    }
    freezeTimerRef.current = setTimeout(() => {
      setTracked(false);
    }, 1500);

    return () => {
      if (freezeTimerRef.current) {
        clearTimeout(freezeTimerRef.current);
      }
    };
  }, [routeLabel, color, roundedBearing]);

  return (
    <Marker.Animated
      coordinate={animatedCoordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      onPress={() => onPress?.(vehicle)}
      zIndex={10}
      tracksViewChanges={isAndroid ? true : tracked}
    >
      <View
        collapsable={false}
        style={[
          styles.wrapper,
          showDirectionArrow ? styles.wrapperWithArrow : styles.wrapperNoArrow,
        ]}
      >
        {/* Direction arrow rendered as SVG for reliable Android bitmap snapshots */}
        {showDirectionArrow && (
          <Svg
            width={ARROW_WRAPPER_SIZE}
            height={ARROW_WRAPPER_SIZE}
            viewBox="0 0 80 80"
            style={styles.arrowSvg}
          >
            <Path
              d="M40 5 L32 19 L48 19 Z"
              fill={color}
              transform={`rotate(${vehicle.bearing}, 40, 40)`}
            />
          </Svg>
        )}

        {/* Colored circle with bus icon + route number */}
        <View collapsable={false} style={[styles.circle, { backgroundColor: color }]}>
          <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path d={BUS_ICON_PATH} fill="white" />
          </Svg>
          <Text style={styles.routeLabel}>{routeLabel}</Text>
        </View>
      </View>
    </Marker.Animated>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  wrapperWithArrow: {
    width: ARROW_WRAPPER_SIZE,
    height: ARROW_WRAPPER_SIZE,
  },
  wrapperNoArrow: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
  },
  arrowSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  circle: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  routeLabel: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 10,
    marginTop: 2,
  },
});

export const areBusMarkerPropsEqual = (prev, next) => {
  const prevCoord = prev.vehicle.coordinate || {};
  const nextCoord = next.vehicle.coordinate || {};

  return (
    prev.vehicle.id === next.vehicle.id &&
    prevCoord.latitude === nextCoord.latitude &&
    prevCoord.longitude === nextCoord.longitude &&
    prev.vehicle.routeId === next.vehicle.routeId &&
    prev.vehicle.bearing === next.vehicle.bearing &&
    prev.color === next.color
  );
};

export default memo(BusMarker, areBusMarkerPropsEqual);
