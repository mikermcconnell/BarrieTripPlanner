import React, { useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';

const CLOSED_DASH_COUNT = 4;

const MiniSwatches = ({ openColor, openOutlineColor, closedColor, normalColor }) => (
  <View style={styles.compactRows}>
    <View style={styles.compactLegendRow}>
      <View style={[styles.miniOpenOutline, { backgroundColor: openOutlineColor }]}>
        <View style={[styles.miniOpenLine, { backgroundColor: openColor }]} />
      </View>
      <Text style={styles.compactLabel}>Likely path buses are using.</Text>
    </View>
    <View style={styles.compactLegendRow}>
      <View style={styles.miniDashedLine}>
        {Array.from({ length: 3 }).map((_, index) => (
          <View
            key={`mini-closed-dash-${index}`}
            style={[styles.miniClosedDash, { backgroundColor: closedColor }]}
          />
        ))}
      </View>
      <Text style={styles.compactLabel}>Closed regular route section.</Text>
    </View>
    <View style={styles.compactLegendRow}>
      <View style={[styles.miniNormalLine, { backgroundColor: normalColor }]} />
      <Text style={styles.compactLabel}>Regular route still open.</Text>
    </View>
  </View>
);

const DetourMapLegend = ({
  visible = false,
  openColor = COLORS.primary,
  openOutlineColor = COLORS.warning,
  closedColor = COLORS.error,
  normalColor = COLORS.textPrimary,
  style,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;

  if (!expanded) {
    return (
      <View style={[styles.container, style]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.compactCard}
          onPress={() => setExpanded(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Expand detour legend"
        >
          <Text style={styles.compactTitle}>Detour legend</Text>
          <MiniSwatches
            openColor={openColor}
            openOutlineColor={openOutlineColor}
            closedColor={closedColor}
            normalColor={normalColor}
          />
          <Text style={styles.compactHint}>Expand</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Detour in effect</Text>
          <TouchableOpacity
            onPress={() => setExpanded(false)}
            style={styles.minimizeButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Minimize detour legend"
          >
            <Text style={styles.minimizeText}>Minimize</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.swatchWrap}>
            <View style={[styles.openLineOutline, { backgroundColor: openOutlineColor }]}>
              <View style={[styles.openLine, { backgroundColor: openColor }]} />
            </View>
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.label}>Likely detour path</Text>
            <Text style={styles.caption}>Buses appear to be using this path.</Text>
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

        <Text style={styles.footer}>Route colour with orange outline shows the likely detour path. Red dashed shows the closed part it skips.</Text>
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
  compactCard: {
    width: 208,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(223, 225, 230, 0.92)',
    ...SHADOWS.medium,
  },
  compactTitle: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textPrimary,
  },
  compactHint: {
    marginTop: 2,
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
  },
  compactRows: {
    marginTop: 6,
    gap: 5,
  },
  compactLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  compactLabel: {
    flex: 1,
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    lineHeight: 13,
  },
  miniOpenOutline: {
    width: 32,
    height: 7,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniOpenLine: {
    width: 28,
    height: 4,
    borderRadius: BORDER_RADIUS.round,
  },
  miniDashedLine: {
    width: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  miniClosedDash: {
    width: 7,
    height: 4,
    borderRadius: BORDER_RADIUS.round,
  },
  miniNormalLine: {
    width: 30,
    height: 4,
    borderRadius: BORDER_RADIUS.round,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  minimizeButton: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surfaceHover,
  },
  minimizeText: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textSecondary,
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
    width: 49,
    height: 5,
    borderRadius: BORDER_RADIUS.round,
  },
  openLineOutline: {
    width: 54,
    height: 8,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
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
