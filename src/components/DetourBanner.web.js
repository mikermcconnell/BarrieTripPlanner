import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../config/theme';
import { ROUTE_COLORS } from '../config/constants';

const BANNER_HEIGHT = 52;
const BANNER_GAP = 4;
const MAX_VISIBLE = 3;
const BASE_TOP = 140;
const ALERT_OFFSET = 64;

const DetourBanner = ({ activeDetours, onPress, alertBannerVisible, style }) => {
  if (!activeDetours || typeof activeDetours !== 'object') return null;

  const routeIds = Object.keys(activeDetours).filter(
    (id) => activeDetours[id]?.state !== 'cleared'
  );
  if (routeIds.length === 0) return null;

  const topOffset = alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP;
  const visibleIds = routeIds.slice(0, MAX_VISIBLE);
  const overflowCount = routeIds.length - MAX_VISIBLE;

  return (
    <View style={[styles.container, { top: topOffset }, style]} pointerEvents="box-none">
      {visibleIds.map((routeId, index) => (
        <TouchableOpacity
          key={routeId}
          style={[styles.banner, { marginTop: index > 0 ? BANNER_GAP : 0 }]}
          onPress={() => onPress?.(routeId)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Route ${routeId} is on detour, tap for details`}
        >
          <View style={[styles.routeDot, {
            backgroundColor: ROUTE_COLORS[routeId] || ROUTE_COLORS.DEFAULT,
          }]} />
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              Route {routeId} is on detour
            </Text>
            <Text style={styles.subtitle}>Tap for details</Text>
          </View>
        </TouchableOpacity>
      ))}
      {overflowCount > 0 && (
        <View style={[styles.banner, styles.overflowBanner, { marginTop: BANNER_GAP }]}>
          <Text style={styles.overflowText}>+{overflowCount} more route{overflowCount > 1 ? 's' : ''} on detour</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 996,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: BANNER_HEIGHT,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    cursor: 'pointer',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.sm,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  overflowBanner: {
    justifyContent: 'center',
    borderLeftColor: COLORS.grey400,
  },
  overflowText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default DetourBanner;
