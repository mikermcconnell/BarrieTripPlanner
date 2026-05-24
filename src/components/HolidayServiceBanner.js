import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from './Icon';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const HolidayServiceBanner = ({ holidayServiceInfo, onPress, style }) => {
  if (!holidayServiceInfo) return null;

  const isNoService = holidayServiceInfo.status === 'no_service';
  const accentColor = isNoService ? COLORS.error : COLORS.warning;
  const subtleColor = isNoService ? COLORS.errorSubtle : COLORS.warningSubtle;

  return (
    <TouchableOpacity
      style={[styles.container, { borderLeftColor: accentColor, backgroundColor: subtleColor }, style]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${holidayServiceInfo.title}. ${holidayServiceInfo.shortMessage}`}
    >
      <View style={[styles.iconBadge, { backgroundColor: accentColor }]}>
        <Icon name={isNoService ? 'Warning' : 'Celebration'} size={16} color={COLORS.white} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.badge}>{holidayServiceInfo.badgeLabel}</Text>
          {holidayServiceInfo.relativeLabel ? (
            <Text style={styles.relative}>{holidayServiceInfo.relativeLabel}</Text>
          ) : null}
        </View>
        <Text style={styles.title}>{holidayServiceInfo.title}</Text>
        <Text style={styles.message} numberOfLines={2}>{holidayServiceInfo.shortMessage}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    ...SHADOWS.medium,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: 1,
  },
  badge: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  relative: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textSecondary,
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  message: {
    marginTop: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  chevron: {
    fontSize: 26,
    lineHeight: 28,
    color: COLORS.textSecondary,
  },
});

export default HolidayServiceBanner;
