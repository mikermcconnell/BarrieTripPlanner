import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';

const CLOSED_DASH_COUNT = 4;

const DetourMapLegend = ({
  visible = false,
  openColor = COLORS.ctaGreen,
  closedColor = COLORS.error,
  normalColor = COLORS.textPrimary,
  style,
}) => {
  if (!visible) return null;

  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <View style={styles.card}>
        <Text style={styles.title}>Detour in effect</Text>

        <View style={styles.legendRow}>
          <View style={styles.swatchWrap}>
            <View style={[styles.openLine, { backgroundColor: openColor }]} />
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.label}>Open bus detour</Text>
            <Text style={styles.caption}>Buses are travelling on this path now.</Text>
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.swatchWrap}>
            <View style={styles.dashedLine}>
              {Array.from({ length: CLOSED_DASH_COUNT }).map((_, index) => (
                <View
                  key={`closed-dash-${index}`}
                  style={[styles.closedDash, { backgroundColor: closedColor }]}
                />
              ))}
            </View>
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.label}>Closed regular route</Text>
            <Text style={styles.caption}>Normal bus service is not using this segment.</Text>
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.swatchWrap}>
            <View style={[styles.normalLine, { backgroundColor: normalColor }]} />
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.label}>Regular route still open</Text>
            <Text style={styles.caption}>The route continues normally on this section.</Text>
          </View>
        </View>

        <Text style={styles.footer}>Green shows where the bus goes now. Red dashed shows the closed part it skips.</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 998,
  },
  card: {
    width: 232,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(223, 225, 230, 0.92)',
    ...SHADOWS.medium,
  },
  title: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  swatchWrap: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openLine: {
    width: 52,
    height: 6,
    borderRadius: BORDER_RADIUS.round,
  },
  dashedLine: {
    width: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closedDash: {
    width: 9,
    height: 5,
    borderRadius: BORDER_RADIUS.round,
  },
  normalLine: {
    width: 52,
    height: 5,
    borderRadius: BORDER_RADIUS.round,
  },
  copyWrap: {
    flex: 1,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textPrimary,
  },
  caption: {
    marginTop: 2,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  footer: {
    marginTop: 2,
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
});

export default DetourMapLegend;
