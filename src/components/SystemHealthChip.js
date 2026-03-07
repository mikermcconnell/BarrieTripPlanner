import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILIES, FONT_SIZES, SPACING, BORDER_RADIUS } from '../config/theme';
import { getSystemHealthChipState } from '../utils/systemHealthUI';

export default function SystemHealthChip({ diagnostics }) {
  const display = useMemo(() => getSystemHealthChipState(diagnostics), [diagnostics]);

  return (
    <View
      accessible={true}
      accessibilityLabel={display.accessibilityLabel}
      style={[styles.chip, { backgroundColor: display.backgroundColor }]}
    >
      <View style={[styles.dot, { backgroundColor: display.dotColor }]} />
      <Text style={[styles.text, { color: display.textColor }]} numberOfLines={1}>
        {display.label}
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
