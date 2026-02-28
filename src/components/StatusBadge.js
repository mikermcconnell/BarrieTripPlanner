import React from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILIES, FONT_SIZES, SPACING, BORDER_RADIUS } from '../config/theme';

/**
 * Context-aware status badge for the search bar.
 *
 * States:
 *  - Offline:           grey dot + "OFFLINE"
 *  - No route selected: small green pulsing dot only (minimal footprint)
 *  - 1 route selected:  "Rte {name} · {n} active" with green dot
 *  - N routes selected: "{n} routes · {m} active" with green dot
 */
export default function StatusBadge({
  isOffline,
  vehicleCount,
  selectedRouteNames,
  activeVehicleCount,
  pulseAnim,
}) {
  if (isOffline) {
    return (
      <View style={styles.badge}>
        <View style={styles.dotOffline} />
        <Text style={styles.textOffline}>OFFLINE</Text>
      </View>
    );
  }

  const count = selectedRouteNames?.length ?? 0;

  // No selection — just a pulsing green dot, no text
  if (count === 0) {
    return (
      <View style={styles.badgeDotOnly}>
        <Animated.View style={[styles.dotLive, { opacity: pulseAnim }]} />
      </View>
    );
  }

  // 1 route selected
  if (count === 1) {
    return (
      <View style={styles.badge}>
        <Animated.View style={[styles.dotLive, { opacity: pulseAnim }]} />
        <Text style={styles.textLive} numberOfLines={1}>
          Rte {selectedRouteNames[0]} · {activeVehicleCount} active
        </Text>
      </View>
    );
  }

  // Multiple routes selected
  return (
    <View style={styles.badge}>
      <Animated.View style={[styles.dotLive, { opacity: pulseAnim }]} />
      <Text style={styles.textLive} numberOfLines={1}>
        {count} routes · {activeVehicleCount} active
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primarySubtle,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs,
  },
  badgeDotOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xs,
  },
  dotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  dotOffline: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.grey500,
  },
  textLive: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textOffline: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.grey600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
