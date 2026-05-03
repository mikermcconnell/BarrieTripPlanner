/**
 * BoardingInstructionCard Component
 *
 * Synthesized boarding card shown while the user is waiting for their bus
 * (before it arrives). Displays:
 * - Route badge + headsign
 * - Boarding stop name and stop code
 * - Scheduled departure time with countdown
 * - Real-time delay or early badge
 * - LIVE indicator when real-time data is available
 * - Peek-ahead preview of the next leg
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../../config/theme';
import { buildTransitStopProgress } from '../../utils/transitStopUtils';

const formatStopName = (stop) => {
  if (!stop) return null;
  const code = stop.stopCode || stop.stopId;
  if (code) return `Stop #${code}`;
  return stop.name || null;
};

const BoardingInstructionCard = ({
  leg,
  routeShortName,
  routeColor,
  headsign,
  stopName,
  stopCode,
  scheduledDeparture,
  delaySeconds = 0,
  isRealtime = false,
  peekAheadText = null,
}) => {
  const progress = useMemo(
    () => buildTransitStopProgress(leg),
    [leg]
  );

  const formatDepartureTime = () => {
    if (!scheduledDeparture) return null;
    return new Date(scheduledDeparture).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getMinutesUntilDeparture = () => {
    if (!scheduledDeparture) return null;
    return Math.max(0, Math.ceil((scheduledDeparture - Date.now()) / 60000));
  };

  const departureTime = formatDepartureTime();
  const minutesUntilDeparture = getMinutesUntilDeparture();

  const delayMinutes = delaySeconds !== 0 ? Math.abs(Math.ceil(delaySeconds / 60)) : 0;
  const isLate = delaySeconds > 0;
  const isEarly = delaySeconds < 0;
  const boardingStopLabel = formatStopName(progress.boardingStop) || (stopCode ? `Stop #${stopCode}` : stopName);
  const alightingName = progress.alightingStop?.name || currentLegStopFallback(leg?.to);
  const stopsAfterBoarding = progress.totalStopsAfterBoarding;
  const rideSummary = alightingName && stopsAfterBoarding > 0
    ? `${stopsAfterBoarding} stop${stopsAfterBoarding !== 1 ? 's' : ''} to ${alightingName}`
    : null;
  const timeSummary = departureTime
    ? `Departs ${departureTime}`
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.routeBadge, { backgroundColor: routeColor || COLORS.primary }]}>
          <Text style={styles.routeText}>{routeShortName || '?'}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headsign} numberOfLines={1}>
            {headsign || `Route ${routeShortName}`}
          </Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            {[
              boardingStopLabel ? `Board ${boardingStopLabel}` : null,
              rideSummary,
            ].filter(Boolean).join(' · ')}
          </Text>
          {peekAheadText ? (
            <Text style={styles.peekAheadText} numberOfLines={1}>
              Then: {peekAheadText}
            </Text>
          ) : null}
        </View>

        <View style={styles.statusColumn}>
          {minutesUntilDeparture !== null && (
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownText}>
                {minutesUntilDeparture === 0 ? 'Now' : `${minutesUntilDeparture} min`}
              </Text>
            </View>
          )}
          {timeSummary ? (
            <Text style={styles.departureTime} numberOfLines={1}>{timeSummary}</Text>
          ) : null}
          <View style={styles.badgeRow}>
            {isRealtime && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
            {isLate && delayMinutes > 0 && (
              <Text style={styles.delayText}>+{delayMinutes}</Text>
            )}
            {isEarly && delayMinutes > 0 && (
              <Text style={styles.earlyText}>-{delayMinutes}</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const currentLegStopFallback = (stop) => stop?.name || null;

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    ...SHADOWS.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeBadge: {
    minWidth: 42,
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.sm,
  },
  routeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headsign: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  metaLine: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 2,
  },
  statusColumn: {
    alignItems: 'flex-end',
    marginLeft: SPACING.sm,
  },
  departureTime: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
    marginTop: 2,
  },
  countdownBadge: {
    backgroundColor: COLORS.primarySubtle,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.round,
  },
  countdownText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  liveBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.xs,
  },
  liveText: {
    fontSize: 9,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  delayText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  earlyText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  peekAheadText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});

export default BoardingInstructionCard;
