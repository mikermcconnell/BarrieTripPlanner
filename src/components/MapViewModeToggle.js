import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, FONT_FAMILIES, BORDER_RADIUS, SHADOWS } from '../config/theme';
import { ALERT_OFFSET, BASE_TOP } from '../hooks/useDetourAlertStrip';

const MapViewModeToggle = ({
  visible,
  mode,
  onChange,
  detourCount = 0,
  alertBannerVisible = false,
  style,
  inline = false,
}) => {
  if (!visible) return null;

  const topOffset = (alertBannerVisible ? BASE_TOP + ALERT_OFFSET : BASE_TOP) + 42;

  return (
    <View
      style={[
        styles.container,
        !inline && { top: topOffset },
        inline && styles.containerInline,
        style,
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.card, inline && styles.cardInline]}>
        {!inline && <Text style={styles.label}>Map View</Text>}
        <View style={[styles.segmented, inline && styles.segmentedInline]}>
          <TouchableOpacity
            style={[styles.segment, mode === 'regular' && styles.segmentActive]}
            onPress={() => onChange?.('regular')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Switch to regular map view"
          >
            <Text style={[styles.segmentText, mode === 'regular' && styles.segmentTextActive]}>Regular</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, mode === 'detour' && styles.segmentDetourActive]}
            onPress={() => onChange?.('detour')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Switch to detour-focused map view"
          >
            <Text style={[styles.segmentText, mode === 'detour' && styles.segmentTextActive]}>Detours</Text>
            <View style={[styles.countBadge, mode === 'detour' && styles.countBadgeActive]}>
              <Text style={[styles.countText, mode === 'detour' && styles.countTextActive]}>{detourCount}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 995,
  },
  containerInline: {
    position: 'relative',
    left: undefined,
    right: undefined,
  },
  card: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.small,
  },
  cardInline: {
    padding: 2,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(247, 248, 250, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(223, 225, 230, 0.7)',
  },
  label: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  segmented: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.round,
    padding: 2,
    gap: 2,
  },
  segmentedInline: {
    backgroundColor: 'transparent',
    padding: 0,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs,
  },
  segmentActive: {
    backgroundColor: COLORS.surface,
  },
  segmentDetourActive: {
    backgroundColor: COLORS.warningSubtle,
  },
  segmentText: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.textPrimary,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    backgroundColor: COLORS.grey200,
  },
  countBadgeActive: {
    backgroundColor: COLORS.warning,
  },
  countText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textSecondary,
  },
  countTextActive: {
    color: COLORS.white,
  },
});

export default MapViewModeToggle;
