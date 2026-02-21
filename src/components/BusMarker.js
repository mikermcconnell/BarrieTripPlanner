import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';

const BUS_ICON_PATH =
  'M4 16C4 16.88 4.39 17.67 5 18.22V20C5 20.55 5.45 21 6 21H7C7.55 21 8 20.55 8 20V19H16V20C16 20.55 16.45 21 17 21H18C18.55 21 19 20.55 19 20V18.22C19.61 17.67 20 16.88 20 16V6C20 2.5 16.42 2 12 2C7.58 2 4 2.5 4 6V16ZM7.5 17C6.67 17 6 16.33 6 15.5C6 14.67 6.67 14 7.5 14C8.33 14 9 14.67 9 15.5C9 16.33 8.33 17 7.5 17ZM16.5 17C15.67 17 15 16.33 15 15.5C15 14.67 15.67 14 16.5 14C17.33 14 18 14.67 18 15.5C18 16.33 17.33 17 16.5 17ZM18 11H6V6H18V11Z';

const MARKER_SIZE = 40;
const ARROW_WRAPPER_SIZE = 80;
const markerDebugState = new Map();
const ROUTE_LABEL_DEBUG = __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';

const BusMarker = ({ vehicle, color = '#E53935', onPress, routeLabel: routeLabelProp }) => {
  const { latitude, longitude, bearing, scale } = useAnimatedBusPosition(vehicle);

  if (!latitude || !longitude) {
    return null;
  }

  const routeLabel = routeLabelProp || vehicle.routeId || '?';
  const hasValidBearing = vehicle.bearing !== null && vehicle.bearing !== undefined;
  const showDirectionArrow = hasValidBearing;

  if (ROUTE_LABEL_DEBUG) {
    const raw = String(vehicle.routeId || '').trim();
    if (/^(2|2A|2B|7|7A|7B|12|12A|12B)$/i.test(raw)) {
      const signature = `${raw}|${String(routeLabel)}|${String(routeLabelProp || '')}`;
      if (markerDebugState.get(vehicle.id) !== signature) {
        markerDebugState.set(vehicle.id, signature);
        console.info(
          '[route-label-debug][native-marker] bus=%s raw=%s prop=%s rendered=%s',
          vehicle.id,
          raw || '-',
          routeLabelProp || '-',
          routeLabel
        );
      }
    }
  }

  return (
    <MapLibreGL.MarkerView
      id={`bus-${vehicle.id}`}
      coordinate={[longitude, latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View
        collapsable={false}
        style={[
          styles.wrapper,
          showDirectionArrow ? styles.wrapperWithArrow : styles.wrapperNoArrow,
          scale !== 1 && { transform: [{ scale }] },
        ]}
        onTouchEnd={() => onPress?.(vehicle)}
      >
        {/* Direction arrow rendered as SVG */}
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
              transform={`rotate(${bearing}, 40, 40)`}
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
    </MapLibreGL.MarkerView>
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
    borderWidth: 3,
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
    lineHeight: 12,
    marginTop: 1,
    textAlign: 'center',
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
    prev.color === next.color &&
    prev.routeLabel === next.routeLabel
  );
};

export default BusMarker;
