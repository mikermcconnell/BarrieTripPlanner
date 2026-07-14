import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useAnimatedBusPosition } from '../hooks/useAnimatedBusPosition';
import BusDirectionArrow from './BusDirectionArrow';

const MARKER_SIZE = 44;
const WRAPPER_SIZE = 88;
const BORDER_WIDTH = 2.5;

const markerDebugState = new Map();
const ROUTE_LABEL_DEBUG = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_ROUTE_LABEL_DEBUG === 'true';

const BusMarkerComponent = ({
  vehicle,
  color = '#E53935',
  routeLabel: routeLabelProp,
  routeDirectionLabel,
  snapPath = null,
  dimmed = false,
}) => {
  const { latitude, longitude, bearing, scale } = useAnimatedBusPosition(vehicle, { snapPath });

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const routeLabel = routeLabelProp || vehicle.routeId || '?';
  const hasDirectionBearing =
    Number.isFinite(bearing) &&
    (Number.isFinite(Number(vehicle.bearing)) || (Array.isArray(snapPath) && snapPath.length >= 2));

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
      pointerEvents="none"
    >
      <View
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.wrapper,
          {
            opacity: 1,
            transform: [{ scale: scale * (dimmed ? 0.84 : 1) }],
          },
        ]}
      >
        {hasDirectionBearing && (
          <BusDirectionArrow
            bearing={bearing}
            size={WRAPPER_SIZE}
            topOffset={3}
            arrowWidth={7}
            arrowHeight={16}
            color="#111111"
            dimmed={false}
          />
        )}

        {/* Circle body */}
        <View
          style={[
            styles.circle,
            {
              width: MARKER_SIZE,
              height: MARKER_SIZE,
              borderRadius: MARKER_SIZE / 2,
              borderWidth: BORDER_WIDTH,
              backgroundColor: color,
            },
          ]}
        >
          {/* Top highlight — subtle gradient effect */}
          <View
            style={[
              styles.highlight,
              {
                height: MARKER_SIZE / 2,
                borderTopLeftRadius: MARKER_SIZE / 2,
                borderTopRightRadius: MARKER_SIZE / 2,
              },
            ]}
          />
          {/* Top edge gleam — glass-like rim */}
          <View style={styles.edgeGleam} />
          <View style={styles.labelStack}>
            <Text style={[styles.routeLabel, routeDirectionLabel && styles.routeLabelStacked]}>
              {routeLabel}
            </Text>
            {routeDirectionLabel ? (
              <Text style={styles.routeDirectionLabel}>{routeDirectionLabel}</Text>
            ) : null}
          </View>
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
  circle: {
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
    zIndex: 1,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.10)',
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
  labelStack: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
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
  routeLabelStacked: {
    fontSize: 14,
    lineHeight: 15,
  },
  routeDirectionLabel: {
    color: 'white',
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
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
    prev.vehicle.shapeId === next.vehicle.shapeId &&
    prev.vehicle.headsign === next.vehicle.headsign &&
    prev.vehicle.bearing === next.vehicle.bearing &&
    prev.color === next.color &&
    prev.routeLabel === next.routeLabel &&
    prev.routeDirectionLabel === next.routeDirectionLabel &&
    prev.snapPath === next.snapPath &&
    prev.dimmed === next.dimmed
  );
};

const BusMarker = memo(BusMarkerComponent, areBusMarkerPropsEqual);

export default BusMarker;
