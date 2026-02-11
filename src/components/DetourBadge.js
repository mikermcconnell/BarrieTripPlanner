/**
 * DetourBadge - Visual indicator for auto-detected route detours
 * Shows "Detour Suspected" with subtitle explaining it's auto-generated
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';

// Warning icon SVG
const WarningIcon = ({ size = 18, color = COLORS.warning }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 21H23L12 2L1 21ZM13 18H11V16H13V18ZM13 14H11V10H13V14Z" fill={color}/>
  </Svg>
);

const DetourBadge = ({
  routeId,
  routeName,
  detourCount = 1,
  confidenceLevel = 'suspected',
  confidenceScore = null,
  segmentLabel = null,
  firstDetectedAt = null,
  lastSeenAt = null,
  officialAlert = null,
  onPress,
  style,
  compact = false,
}) => {
  const containerStyle = compact ? styles.containerCompact : styles.container;
  const confidenceLabel =
    confidenceLevel === 'high-confidence'
      ? 'High confidence'
      : confidenceLevel === 'likely'
      ? 'Likely'
      : 'Suspected';

  const confidenceText =
    typeof confidenceScore === 'number'
      ? `${confidenceLabel} (${Math.round(confidenceScore)}%)`
      : confidenceLabel;

  const statusText = officialAlert?.matched
    ? `Correlated with official alert${officialAlert.effect ? `: ${officialAlert.effect}` : ''}`
    : 'Auto-detected from real-time vehicle behavior';

  const recencyText = lastSeenAt
    ? `Last seen ${Math.max(0, Math.floor((Date.now() - lastSeenAt) / 60000))}m ago`
    : null;

  return (
    <View style={[containerStyle, style]}>
      <View style={styles.iconContainer}>
        <WarningIcon size={compact ? 14 : 18} color={COLORS.warning} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, compact && styles.titleCompact]}>
          {confidenceLabel === 'Suspected' ? 'Detour Suspected' : `Detour ${confidenceLabel}`}
          {routeName ? ` - Route ${routeName}` : ''}
        </Text>
        {!compact && (
          <Text style={styles.subtitle}>
            {statusText}
          </Text>
        )}
        {!compact && (
          <Text style={styles.metaText}>
            Confidence: {confidenceText}
            {segmentLabel ? ` • Segment: ${segmentLabel}` : ''}
          </Text>
        )}
        {!compact && recencyText && (
          <Text style={styles.metaSubtleText}>
            {recencyText}
            {firstDetectedAt ? ` • First seen ${Math.max(0, Math.floor((Date.now() - firstDetectedAt) / 60000))}m ago` : ''}
          </Text>
        )}
      </View>
      {detourCount > 1 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{detourCount}</Text>
        </View>
      )}
    </View>
  );
};

/**
 * Compact inline version for use in route lists
 */
export const DetourIndicator = ({ hasDetour }) => {
  if (!hasDetour) return null;

  return (
    <View style={styles.indicator}>
      <WarningIcon size={12} color={COLORS.warning} />
      <Text style={styles.indicatorText}>Detour</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.warningSubtle,
    borderRadius: BORDER_RADIUS.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    ...SHADOWS.small,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(255, 153, 31, 0.15)',
    }),
  },
  containerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.warningSubtle,
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  iconContainer: {
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    letterSpacing: -0.1,
  },
  titleCompact: {
    fontSize: FONT_SIZES.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  metaText: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textPrimary,
    marginTop: 3,
  },
  metaSubtleText: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: COLORS.warning,
    paddingVertical: 2,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
    marginLeft: SPACING.sm,
  },
  countText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  // Inline indicator styles
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningSubtle,
    paddingVertical: 2,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    gap: 3,
  },
  indicatorText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.warning,
  },
});

export default DetourBadge;
