/**
 * DelayBadge - Visual indicator for real-time delay information
 * Shows: "On time" (green), "+X min" (orange/red), or "X min early" (blue)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import { formatDelay } from '../services/tripDelayService';

const DelayBadge = ({ delaySeconds, isRealtime, compact = false }) => {
  // Don't show anything if not real-time data
  if (!isRealtime) {
    return null;
  }

  const { text, status } = formatDelay(delaySeconds);

  // Get colors based on status
  const getColors = () => {
    switch (status) {
      case 'ontime':
        return {
          background: COLORS.successSubtle,
          text: COLORS.success,
        };
      case 'slight':
        return {
          background: COLORS.warningSubtle,
          text: COLORS.warning,
        };
      case 'moderate':
        return {
          background: COLORS.accentSubtle,
          text: COLORS.accent,
        };
      case 'severe':
        return {
          background: COLORS.errorSubtle,
          text: COLORS.error,
        };
      case 'early':
        return {
          background: COLORS.infoSubtle,
          text: COLORS.info,
        };
      default:
        return {
          background: COLORS.grey100,
          text: COLORS.textSecondary,
        };
    }
  };

  const colors = getColors();

  return (
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        { backgroundColor: colors.background },
      ]}
      accessibilityLabel={`Delay status: ${text}`}
      accessibilityLiveRegion="polite"
    >
      {/* Real-time indicator dot */}
      <View style={[styles.dot, { backgroundColor: colors.text }]} />
      <Text
        style={[
          styles.text,
          compact && styles.textCompact,
          { color: colors.text },
        ]}
      >
        {text}
      </Text>
    </View>
  );
};

/**
 * Inline delay indicator (smaller, for use next to times)
 */
export const DelayIndicator = ({ delaySeconds, isRealtime }) => {
  if (!isRealtime || delaySeconds === 0) {
    return null;
  }

  const { text, status } = formatDelay(delaySeconds);

  const getColor = () => {
    switch (status) {
      case 'slight':
      case 'moderate':
        return COLORS.warning;
      case 'severe':
        return COLORS.error;
      case 'early':
        return COLORS.info;
      default:
        return COLORS.textSecondary;
    }
  };

  return (
    <Text style={[styles.inlineText, { color: getColor() }]}>
      {' '}({text})
    </Text>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs,
  },
  containerCompact: {
    paddingVertical: 2,
    paddingHorizontal: SPACING.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  textCompact: {
    fontSize: FONT_SIZES.xxs,
  },
  inlineText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default DelayBadge;
