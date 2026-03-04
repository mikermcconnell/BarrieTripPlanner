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
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../../config/theme';

const BoardingInstructionCard = ({
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

  const stopLabel = stopCode
    ? `Board at ${stopName}, Stop #${stopCode}`
    : stopName
    ? `Board at ${stopName}`
    : null;

  const delayMinutes = delaySeconds !== 0 ? Math.abs(Math.ceil(delaySeconds / 60)) : 0;
  const isLate = delaySeconds > 0;
  const isEarly = delaySeconds < 0;

  return (
    <View style={styles.container}>
      {/* Header: Route Badge + Headsign */}
      <View style={styles.header}>
        <View style={[styles.routeBadge, { backgroundColor: routeColor || COLORS.primary }]}>
          <Text style={styles.routeText}>{routeShortName || '?'}</Text>
        </View>
        <Text style={styles.headsign} numberOfLines={1}>
          {headsign || `Route ${routeShortName}`}
        </Text>
      </View>

      {/* Boarding stop */}
      {stopLabel && (
        <Text style={styles.stopLabel}>{stopLabel}</Text>
      )}

      {/* Departure row */}
      {departureTime && (
        <View style={styles.departureRow}>
          <View style={styles.departureLeft}>
            <Text style={styles.departureLabel}>Departing</Text>
            <Text style={styles.departureTime}>{departureTime}</Text>
          </View>

          <View style={styles.departureRight}>
            {minutesUntilDeparture !== null && (
              <View style={styles.countdownBadge}>
                <Text style={styles.countdownText}>
                  {minutesUntilDeparture === 0 ? 'Now' : `${minutesUntilDeparture} min`}
                </Text>
              </View>
            )}
            {isRealtime && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Delay / early indicator */}
      {isLate && delayMinutes > 0 && (
        <Text style={styles.delayText}>+{delayMinutes} min late</Text>
      )}
      {isEarly && delayMinutes > 0 && (
        <Text style={styles.earlyText}>{delayMinutes} min early</Text>
      )}

      {/* Peek-ahead preview */}
      {peekAheadText && (
        <View style={styles.peekAheadContainer}>
          <Text style={styles.peekAheadText} numberOfLines={2}>
            {peekAheadText}
          </Text>
        </View>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  routeBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
  },
  routeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  headsign: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  stopLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  departureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginTop: SPACING.xs,
  },
  departureLeft: {
    flexDirection: 'column',
  },
  departureLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  departureTime: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  departureRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  countdownBadge: {
    backgroundColor: COLORS.primarySubtle,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
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
    marginTop: SPACING.xs,
  },
  earlyText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.xs,
  },
  peekAheadContainer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  peekAheadText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
});

export default BoardingInstructionCard;
