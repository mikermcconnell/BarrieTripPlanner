import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BORDER_RADIUS, COLORS, FONT_FAMILIES, FONT_SIZES, SHADOWS, SPACING } from '../config/theme';

const CLOSED_DASH_COUNT = 4;
const AUTO_COLLAPSE_MS = 12000;

const DETECTION_STEPS = [
  'Bus GPS leaves the regular route',
  'More evidence confirms the pattern',
  'The map shows the detour',
];

const DetourMapLegend = ({
  visible = false,
  openColor = COLORS.primary,
  openOutlineColor = COLORS.ctaGreen,
  closedColor = COLORS.error,
  autoCollapseSignal = null,
  autoHide = false,
  collapsedByDefault = false,
  style,
}) => {
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const [hidden, setHidden] = useState(false);
  const autoCollapseTimerRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      setHidden(false);
      return undefined;
    }

    setHidden(false);
    setExpanded(!collapsedByDefault);

    if (autoCollapseSignal === null) return undefined;

    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
    }

    autoCollapseTimerRef.current = setTimeout(() => {
      if (autoHide) {
        setHidden(true);
      } else {
        setExpanded(false);
      }
      autoCollapseTimerRef.current = null;
    }, AUTO_COLLAPSE_MS);

    return () => {
      if (autoCollapseTimerRef.current) {
        clearTimeout(autoCollapseTimerRef.current);
        autoCollapseTimerRef.current = null;
      }
    };
  }, [autoCollapseSignal, autoHide, collapsedByDefault, visible]);

  if (!visible || hidden) return null;

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
          <Text style={styles.collapsedTitle}>Map key</Text>
          <Text style={styles.collapsedHint}>Lines & stops</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Map key</Text>
          <TouchableOpacity
            onPress={() => (autoHide ? setHidden(true) : setExpanded(false))}
            style={styles.closeButton}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Close detour legend"
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.explainerCard}>
          <View style={styles.explainerEyebrowRow}>
            <View style={styles.liveDot} />
            <Text style={styles.explainerEyebrow}>Live GPS detection</Text>
          </View>
          <Text style={styles.explainerTitle}>Auto-detected detours use live bus GPS.</Text>
          <Text style={styles.explainerBody}>
            We wait for repeated bus GPS evidence before drawing a closure, so brand-new changes may not appear right away.
          </Text>
          <View style={styles.stepRow}>
            {DETECTION_STEPS.map((step, index) => (
              <React.Fragment key={step}>
                <View style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
                {index < DETECTION_STEPS.length - 1 ? <View style={styles.stepConnector} /> : null}
              </React.Fragment>
            ))}
          </View>
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
    width: 286,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(223, 225, 230, 0.92)',
    ...SHADOWS.medium,
  },
  collapsedCard: {
    width: 164,
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
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  explainerCard: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.infoSubtle,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.18)',
  },
  explainerEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.realtime,
  },
  explainerEyebrow: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  explainerTitle: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.textPrimary,
    lineHeight: 17,
  },
  explainerBody: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  stepRow: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(12, 140, 229, 0.22)',
  },
  stepNumberText: {
    fontSize: FONT_SIZES.xxs,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.primaryDark,
  },
  stepText: {
    fontSize: FONT_SIZES.xxs,
    color: COLORS.textSecondary,
    lineHeight: 13,
    textAlign: 'center',
  },
  stepConnector: {
    width: 10,
    height: 1,
    marginTop: 11,
    backgroundColor: 'rgba(12, 140, 229, 0.25)',
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
