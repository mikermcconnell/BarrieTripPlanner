import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  FONT_SIZES,
  FONT_WEIGHTS,
  SHADOWS,
} from '../../config/theme';
import { buildTransitStopProgress } from '../../utils/transitStopUtils';

const formatStopLabel = (stop) => {
  if (!stop) return 'Unknown stop';
  const code = stop.stopCode || stop.stopId;
  return code ? `${stop.name} (#${code})` : stop.name || 'Unknown stop';
};

const TransitStopGuideCard = ({
  leg,
  liveStopsRemaining = null,
  isOnBoard = false,
}) => {
  const progress = useMemo(
    () => buildTransitStopProgress(leg, liveStopsRemaining),
    [leg, liveStopsRemaining]
  );

  if (!progress.boardingStop || !progress.alightingStop) {
    return null;
  }

  const {
    boardingStop,
    alightingStop,
    totalStopsBetween,
    totalStopsAfterBoarding,
    remainingCount,
    nextStop,
  } = progress;

  const headerText = isOnBoard
    ? `${remainingCount} stop${remainingCount !== 1 ? 's' : ''} remaining`
    : `${totalStopsAfterBoarding} stop${totalStopsAfterBoarding !== 1 ? 's' : ''} after boarding`;

  const helperText = isOnBoard
    ? 'The map highlights the next stop, your stop, the bus, and the route ahead.'
    : 'The map highlights the route, the first stop after boarding, and your stop.';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Stop guide</Text>
          <Text style={styles.headerText}>{headerText}</Text>
          <Text style={styles.helperText}>{helperText}</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {totalStopsBetween} stops between
          </Text>
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryPanel}>
          <Text style={styles.summaryLabel}>Board at</Text>
          <Text style={styles.summaryValue} numberOfLines={2}>
            {formatStopLabel(boardingStop)}
          </Text>
        </View>
        <View style={[styles.summaryPanel, styles.summaryPanelNext]}>
          <Text style={styles.summaryLabel}>Next stop</Text>
          <Text style={styles.summaryValue} numberOfLines={2}>
            {formatStopLabel(nextStop || alightingStop)}
          </Text>
        </View>
        <View style={[styles.summaryPanel, styles.summaryPanelExit]}>
          <Text style={styles.summaryLabel}>Your stop</Text>
          <Text style={styles.summaryValue} numberOfLines={2}>
            {formatStopLabel(alightingStop)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.medium,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
  helperText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  countBadge: {
    backgroundColor: COLORS.secondarySubtle,
    borderRadius: BORDER_RADIUS.round,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  countBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.secondary,
  },
  summaryGrid: {
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  summaryPanel: {
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
  },
  summaryPanelNext: {
    backgroundColor: COLORS.secondarySubtle,
  },
  summaryPanelExit: {
    backgroundColor: COLORS.errorSubtle,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
});

export default TransitStopGuideCard;
