import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from './Icon';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const HolidayServiceBanner = ({ holidayServiceInfo, onPress, onDismiss, inline = false, style }) => {
  if (!holidayServiceInfo) return null;

  const isNoService = holidayServiceInfo.status === 'no_service';
  const accentColor = isNoService ? COLORS.error : COLORS.warning;
  const subtleColor = isNoService ? COLORS.errorSubtle : COLORS.warningSubtle;

  const handleDismiss = (event) => {
    event?.stopPropagation?.();
    onDismiss?.();
  };

  return (
    <View
      style={[styles.container, inline && styles.containerInline, { borderLeftColor: accentColor, backgroundColor: subtleColor }, style]}
    >
      <TouchableOpacity
        style={styles.content}
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
          <Text style={styles.message} numberOfLines={1}>{holidayServiceInfo.shortMessage}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
      {onDismiss ? (
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Hide holiday service notice"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.dismissText}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    ...SHADOWS.medium,
  },
  containerInline: {
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
    fontSize: FONT_SIZES.sm,
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
  dismissButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  dismissText: {
    fontSize: FONT_SIZES.md,
    lineHeight: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default HolidayServiceBanner;
