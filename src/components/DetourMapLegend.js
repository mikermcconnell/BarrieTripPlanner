import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';

const CLOSED_DASH_COUNT = 4;
const AUTO_COLLAPSE_MS = 8000;

const DetourMapLegend = ({
  visible = false,
  openColor = COLORS.primary,
  openOutlineColor = COLORS.warning,
  closedColor = COLORS.error,
  autoCollapseSignal = null,
  style,
}) => {
  const [expanded, setExpanded] = useState(true);
  const autoCollapseTimerRef = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;

    setExpanded(true);

    if (autoCollapseSignal === null) return undefined;

    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
    }

    autoCollapseTimerRef.current = setTimeout(() => {
      setExpanded(false);
      autoCollapseTimerRef.current = null;
    }, AUTO_COLLAPSE_MS);

    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current);
        autoCollapseTimerRef.current = null;
      }
    };
  }, [autoCollapseSignal, visible]);

  if (!visible) return null;

  if (!expanded) {
    return (
      <View style={[styles.container, style]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.collapsedCard}
          onPress={() => setExpanded(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Expand detour legend"
        >
          <Text style={styles.collapsedTitle}>Detour legend</Text>
          <Text style={styles.collapsedHint}>Expand</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Detour legend</Text>
          <TouchableOpacity
            onPress={() => setExpanded(false)}
            style={styles.closeButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Close detour legend"
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.swatchWrap}>
            <View style={[styles.openLineOutline, { backgroundColor: openOutlineColor }]}>
              <View style={[styles.openLine, { backgroundColor: openColor }]} />
            </View>
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.label}>Detour route</Text>
            <Text style={styles.caption}>Buses are using this temporary path.</Text>
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
            <Text style={styles.label}>Road closed</Text>
            <Text style={styles.caption}>Regular service is skipping this section.</Text>
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.swatchWrap}>
            <View style={styles.closedStopSwatch}>
              <Text style={[styles.closedStopCode, { borderColor: closedColor, color: closedColor }]}>!</Text>
              <View style={[styles.closedStopMarker, { borderColor: closedColor }]}>
                <View style={[styles.closedStopInnerDot, { backgroundColor: closedColor }]} />
              </View>
            </View>
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.label}>Closed bus stops</Text>
            <Text style={styles.caption}>These stops are not serviced during the detour.</Text>
          </View>
        </View>
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
    width: 226,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(223, 225, 230, 0.92)',
    ...SHADOWS.medium,
  },
  collapsedCard: {
    width: 154,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(223, 225, 230, 0.92)',
    ...SHADOWS.medium,
  },
  collapsedTitle: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textPrimary,
  },
  collapsedHint: {
    marginTop: 2,
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeButton: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surfaceHover,
  },
  closeText: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textSecondary,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  swatchWrap: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openLine: {
    width: 38,
    height: 5,
    borderRadius: BORDER_RADIUS.round,
  },
  openLineOutline: {
    width: 42,
    height: 8,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedLine: {
    width: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closedDash: {
    width: 7,
    height: 5,
    borderRadius: BORDER_RADIUS.round,
  },
  closedStopSwatch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedStopCode: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 2,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: COLORS.white,
    fontSize: 10,
    fontFamily: FONT_FAMILIES.bold,
    lineHeight: 12,
    transform: [{ translateX: 8 }],
  },
  closedStopMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedStopInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  copyWrap: {
    flex: 1,
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONT_FAMILIES.semibold,
    color: COLORS.textPrimary,
  },
  caption: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    lineHeight: 13,
  },
});

export default DetourMapLegend;
