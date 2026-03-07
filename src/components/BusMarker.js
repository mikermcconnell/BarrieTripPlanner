import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';

const MARKER_SIZE = 44;
const WRAPPER_SIZE = 80;
const BORDER_WIDTH = 2.5;

const markerDebugState = new Map();
const ROUTE_LABEL_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';

const BusMarkerComponent = ({ vehicle, color = '#E53935', onPress, routeLabel: routeLabelProp, snapPath = null }) => {
  const { latitude, longitude, bearing, scale } = useAnimatedBusPosition(vehicle, { snapPath });

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const routeLabel = routeLabelProp || vehicle.routeId || '?';
  const hasValidBearing = vehicle.bearing !== null && vehicle.bearing !== undefined;

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

  const cx = WRAPPER_SIZE / 2;
  const cy = WRAPPER_SIZE / 2;

  return (
    <MapLibreGL.MarkerView
      id={`bus-${vehicle.id}`}
      coordinate={[longitude, latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View
        collapsable={false}
        style={[styles.wrapper, { transform: [{ scale }] }]}
        onTouchEnd={() => onPress?.(vehicle)}
      >
        {/* Direction arrow — notched arrowhead, rotates behind the pill */}
        {hasValidBearing && (
          <Svg
            width={WRAPPER_SIZE}
            height={WRAPPER_SIZE}
            viewBox={`0 0 ${WRAPPER_SIZE} ${WRAPPER_SIZE}`}
            style={styles.arrowSvg}
          >
            <Path
              d={`M${cx} 2 L${cx - 10} 32 L${cx} 22 L${cx + 10} 32 Z`}
              fill="#222222"
              stroke="white"
              strokeWidth={2}
              strokeLinejoin="round"
              transform={`rotate(${bearing}, ${cx}, ${cy})`}
            />
          </Svg>
        )}

        {/* Circle body */}
        <View style={[styles.circle, { backgroundColor: color }]}>
          {/* Top highlight — subtle gradient effect */}
          <View style={styles.highlight} />
          {/* Top edge gleam — glass-like rim */}
          <View style={styles.edgeGleam} />
          {/* Route number — the hero */}
          <Text style={styles.routeLabel}>{routeLabel}</Text>
        </View>
      </View>
    </MapLibreGL.MarkerView>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: WRAPPER_SIZE,
    height: WRAPPER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
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
    borderWidth: BORDER_WIDTH,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // Dual-layer shadow: contact + ambient
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: MARKER_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderTopLeftRadius: MARKER_SIZE / 2,
    borderTopRightRadius: MARKER_SIZE / 2,
  },
  edgeGleam: {
    position: 'absolute',
    top: 0,
    left: 6,
    right: 6,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 0.5,
  },
  routeLabel: {
    color: 'white',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,0,0,0.25)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
      android: {
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
      },
    }),
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
    prev.routeLabel === next.routeLabel &&
    prev.snapPath === next.snapPath
  );
};

const BusMarker = memo(BusMarkerComponent, areBusMarkerPropsEqual);

export default BusMarker;
