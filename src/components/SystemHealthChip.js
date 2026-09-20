import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILIES, FONT_SIZES, SPACING, BORDER_RADIUS } from '../config/theme';
import { getSystemHealthChipState } from '../utils/systemHealthUI';
import { useGpsRefreshCountdown } from '../hooks/useGpsRefreshCountdown';

export default function SystemHealthChip({ diagnostics, nextVehicleRefreshAt = null }) {
  const display = useMemo(() => getSystemHealthChipState(diagnostics), [diagnostics]);
  const gpsCountdown = useGpsRefreshCountdown(nextVehicleRefreshAt);
  const primaryDisplay = display.label === 'LIVE' && gpsCountdown
    ? { ...display, ...gpsCountdown }
    : display;

  return (
    <View
      accessible={true}
      accessibilityLabel={primaryDisplay.accessibilityLabel}
      style={[styles.chip, { backgroundColor: primaryDisplay.backgroundColor }]}
    >
      <View style={[styles.dot, { backgroundColor: primaryDisplay.dotColor }]} />
      <Text style={[styles.text, { color: primaryDisplay.textColor }]} numberOfLines={1}>
        {primaryDisplay.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.semibold,
    letterSpacing: 0.4,
  },
});
