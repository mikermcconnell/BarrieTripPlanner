import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import { Marker } from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAnimatedMarker } from '../hooks/useAnimatedMarker';
import { COLORS, FONT_SIZES, SHADOWS } from '../config/theme';

const BusMarker = ({ vehicle, color = COLORS.primary, onPress }) => {
  // Use the animated coordinate hook
  const animatedCoordinate = useAnimatedMarker(vehicle.coordinate);

  // Get route short name for display
  const routeLabel = vehicle.routeId || '?';

  // Get bearing for direction arrow
  const rotation = vehicle.bearing || 0;
  const hasHeading = vehicle.bearing != null;

  // Validate coordinate
  if (!vehicle.coordinate || !vehicle.coordinate.latitude || !vehicle.coordinate.longitude) {
    return null;
  }

  return (
    <Marker.Animated
      coordinate={animatedCoordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      onPress={() => onPress?.(vehicle)}
      zIndex={10}
    >
      <View style={styles.container}>
        {/* Direction Arrow - orbits around pill edge */}
        {hasHeading && (
          <View
            style={[
              styles.arrowContainer,
              {
                transform: [{ rotate: `${rotation}deg` }],
              },
            ]}
          >
            <View style={[styles.directionArrow, { borderBottomColor: color }]} />
          </View>
        )}
        {/* Circle with bus icon and route number */}
        <View style={[styles.circle, { backgroundColor: color }]}>
          <Ionicons name="bus" size={12} color={COLORS.white} />
          <Text style={styles.routeText}>{routeLabel}</Text>
        </View>
      </View>
    </Marker.Animated>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
  },
  arrowContainer: {
    position: 'absolute',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 0,
    zIndex: 1,
  },
  directionArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  circle: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.white,
    ...SHADOWS.medium,
    zIndex: 2,
  },
  routeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

// Memoize to prevent re-renders unless vehicle data changes
export default memo(BusMarker, (prev, next) => {
  return (
    prev.vehicle.id === next.vehicle.id &&
    prev.vehicle.latitude === next.vehicle.latitude &&
    prev.vehicle.longitude === next.vehicle.longitude &&
    prev.vehicle.bearing === next.vehicle.bearing &&
    prev.vehicle.routeId === next.vehicle.routeId &&
    prev.color === next.color
  );
});
