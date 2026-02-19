/**
 * TripResultCard - Compact trip option card for bottom sheet
 *
 * Shows duration, time range, and route summary in a compact format
 * designed for the swipeable bottom sheet.
 *
 * Features:
 * - "Leaves in X min" context
 * - Smart labels (Recommended, Fastest, Less Walking)
 * - Warning badges for long walks and tomorrow's trips
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';
import { formatDuration, formatMinutes, formatTimeFromTimestamp, formatDistance } from '../services/tripService';
import DelayBadge from './DelayBadge';

const TripResultCard = ({ itinerary, onPress, onViewDetails, onStartNavigation, isSelected = false }) => {
  const startTime = formatTimeFromTimestamp(itinerary.startTime);
  const endTime = formatTimeFromTimestamp(itinerary.endTime);
  const duration = formatDuration(itinerary.duration);
  const walkDistance = formatDistance(itinerary.walkDistance);
  const walkTime = itinerary.walkTime ? formatDuration(itinerary.walkTime) : null;

  // Get transit legs for display
  const transitLegs = itinerary.legs.filter((leg) => leg.mode !== 'WALK');

  // Get delay info from first transit leg
  const firstTransitLeg = transitLegs[0];
  const hasRealtimeInfo = itinerary.hasRealtimeInfo || firstTransitLeg?.isRealtime;
  const delaySeconds = itinerary.totalDelaySeconds ?? firstTransitLeg?.delaySeconds ?? 0;

  // Get metadata from enrichment
  const minutesUntilDeparture = itinerary.minutesUntilDeparture ?? 0;
  const isTomorrow = itinerary.isTomorrow ?? false;
  const hasHighWalk = itinerary.hasHighWalk ?? false;
  const labels = itinerary.labels ?? null;
  const isRecommended = itinerary.isRecommended ?? false;

  // Format "leaves in" text
  const getLeavesInText = () => {
    if (isTomorrow) return null; // Show "Tomorrow" badge instead
    if (minutesUntilDeparture === 0) return 'Leave now';
    if (minutesUntilDeparture === 1) return 'Leave in 1 min';
    return `Leave in ${formatMinutes(minutesUntilDeparture)}`;
  };

  const leavesInText = getLeavesInText();

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isSelected && styles.containerSelected,
        isRecommended && styles.containerRecommended,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Trip option: ${duration}, ${startTime} to ${endTime}, ${transitLegs.length} bus${transitLegs.length !== 1 ? 'es' : ''}, ${walkDistance} walking`}
      accessibilityState={{ selected: isSelected }}
    >
      {/* Top Row: Labels */}
      {(labels || isTomorrow) && (
        <View style={styles.labelsRow}>
          {labels && labels.map((label, idx) => (
            <View
              key={idx}
              style={[
                styles.labelBadge,
                label === 'Recommended' && styles.labelRecommended,
                label === 'Fastest' && styles.labelFastest,
                label === 'Less Walking' && styles.labelLessWalking,
                label === 'Direct' && styles.labelDirect,
              ]}
            >
              <Text style={[
                styles.labelText,
                label === 'Recommended' && styles.labelTextRecommended,
              ]}>
                {label === 'Recommended' ? '⭐ ' : ''}{label}
              </Text>
            </View>
          ))}
          {isTomorrow && (
            <View style={styles.tomorrowBadge}>
              <Text style={styles.tomorrowText}>🌙 Tomorrow</Text>
            </View>
          )}
        </View>
      )}

      {/* Main Content Row */}
      <View style={styles.mainRow}>
        {/* Left: Duration and Time */}
        <View style={styles.timeSection}>
          <View style={styles.durationRow}>
            <Text style={styles.duration}>{duration}</Text>
            {hasRealtimeInfo ? (
              <DelayBadge delaySeconds={delaySeconds} isRealtime={hasRealtimeInfo} compact />
            ) : (
              <View style={styles.scheduledBadge}>
                <Text style={styles.scheduledText}>Scheduled</Text>
              </View>
            )}
          </View>
          <Text style={styles.timeRange}>{startTime} - {endTime}</Text>
        </View>

        {/* Center: Route Summary */}
        <View style={styles.routeSection}>
          <View style={styles.routeSummary}>
            {itinerary.legs.map((leg, index) => (
              <React.Fragment key={`leg-${leg.mode}-${leg.from?.name || index}-${leg.startTime || index}`}>
                {index > 0 && <View style={styles.connector} />}
                {leg.mode === 'WALK' ? (
                  <View style={styles.walkIcon}>
                    <Text style={styles.walkIconText}>🚶</Text>
                  </View>
                ) : (
                  <View
                    style={[styles.busIcon, { backgroundColor: leg.route?.color || COLORS.primary }]}
                  >
                    <Text style={styles.busIconText}>{leg.route?.shortName || '?'}</Text>
                  </View>
                )}
              </React.Fragment>
            ))}
          </View>
          <View style={styles.details}>
            <Text style={[styles.detailText, hasHighWalk && styles.detailTextWarning]}>
              {hasHighWalk ? '⚠️ ' : ''}{walkDistance}{walkTime ? ` (${walkTime})` : ''} walk
            </Text>
            {itinerary.transfers > 0 && (
              <Text style={styles.detailText}>
                • {itinerary.transfers} transfer{itinerary.transfers > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        </View>

        {/* Right: Leaves In + Action Buttons */}
        <View style={styles.rightSection}>
          {leavesInText && (
            <Text style={[
              styles.leavesIn,
              minutesUntilDeparture <= 5 && styles.leavesInSoon,
            ]}>
              {leavesInText}
            </Text>
          )}
          {isSelected && onStartNavigation ? (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.detailsButton}
                onPress={() => onViewDetails && onViewDetails(itinerary)}
                accessibilityRole="button"
                accessibilityLabel="View trip details"
              >
                <Text style={styles.detailsButtonText}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.goButton}
                onPress={() => onStartNavigation(itinerary)}
                accessibilityRole="button"
                accessibilityLabel="Start navigation"
              >
                <Text style={styles.goButtonText}>Go</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.stepsButton} onPress={onPress} accessibilityRole="button" accessibilityLabel="Select this trip option">
              <Text style={styles.stepsButtonText}>Select</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 2,
    borderColor: 'transparent',
    ...SHADOWS.small,
  },
  containerSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySubtle,
  },
  containerRecommended: {
    borderColor: COLORS.success,
  },
  labelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xxs,
    marginBottom: SPACING.xs,
  },
  labelBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.grey100,
  },
  labelRecommended: {
    backgroundColor: COLORS.success,
  },
  labelFastest: {
    backgroundColor: COLORS.primary + '20',
  },
  labelLessWalking: {
    backgroundColor: COLORS.warning + '20',
  },
  labelDirect: {
    backgroundColor: COLORS.secondary + '20',
  },
  labelText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelTextRecommended: {
    color: COLORS.white,
  },
  tomorrowBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.grey700,
  },
  tomorrowText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.white,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeSection: {
    marginRight: SPACING.md,
    minWidth: 70,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  duration: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  timeRange: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  routeSection: {
    flex: 1,
  },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  connector: {
    width: 12,
    height: 2,
    backgroundColor: COLORS.grey300,
    marginHorizontal: 2,
  },
  walkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.grey200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walkIconText: {
    fontSize: 12,
  },
  busIcon: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  busIconText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  detailText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  detailTextWarning: {
    color: COLORS.warning,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  rightSection: {
    alignItems: 'flex-end',
    marginLeft: SPACING.sm,
  },
  leavesIn: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    fontWeight: FONT_WEIGHTS.medium,
  },
  leavesInSoon: {
    color: COLORS.success,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stepsButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  stepsButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  detailsButton: {
    backgroundColor: COLORS.grey200,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  detailsButtonText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  goButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  goButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scheduledBadge: {
    backgroundColor: COLORS.grey200,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.xs,
  },
  scheduledText: {
    fontSize: 9,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textSecondary,
  },
});

export default memo(TripResultCard);
