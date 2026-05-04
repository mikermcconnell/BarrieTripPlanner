import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';

const LegendLine = ({ variant, color }) => (
  <View style={styles.sampleWrap}>
    {variant === 'dotted' ? (
      <View style={styles.dottedLine}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <View style={[styles.dot, { backgroundColor: color }]} />
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
    ) : variant === 'dashed' ? (
      <View style={styles.dashedLine}>
        <View style={[styles.dash, { backgroundColor: color }]} />
        <View style={[styles.dash, { backgroundColor: color }]} />
      </View>
    ) : (
      <View style={[styles.solidLine, { backgroundColor: color }]} />
    )}
  </View>
);

const TripPreviewMapLegend = ({ visible, style, routeColor = COLORS.primary, variant = 'floating' }) => {
  if (!visible) return null;

  return (
    <View
      style={[
        styles.container,
        variant === 'inline' && styles.inlineContainer,
        style,
      ]}
      accessibilityRole="summary"
      accessibilityLabel="Trip map key"
    >
      <Text style={styles.title}>Trip map key</Text>
      <View style={styles.row}>
        <LegendLine variant="solid" color={routeColor} />
        <Text style={styles.label}>Solid route colour = bus ride</Text>
      </View>
      <View style={styles.row}>
        <LegendLine variant="solid" color="#2563EB" />
        <Text style={styles.label}>Solid blue = walk or transfer</Text>
      </View>
      <View style={styles.row}>
        <LegendLine variant="dashed" color={routeColor} />
        <Text style={styles.label}>Dashed route colour = bus approaching pickup</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    gap: 5,
    ...SHADOWS.small,
  },
  inlineContainer: {
    position: 'relative',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.xs,
    marginTop: SPACING.xs,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  title: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
  },
  sampleWrap: {
    width: 34,
    height: 10,
    justifyContent: 'center',
  },
  solidLine: {
    height: 4,
    borderRadius: 999,
  },
  dottedLine: {
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dashedLine: {
    flexDirection: 'row',
    gap: 5,
  },
  dash: {
    width: 12,
    height: 3,
    borderRadius: 999,
  },
});

export default TripPreviewMapLegend;
