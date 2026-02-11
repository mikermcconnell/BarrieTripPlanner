import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from '../config/theme';
import { formatDuration, formatTimeFromTimestamp, formatDistance } from '../services/tripService';
import DelayBadge from './DelayBadge';

const TripCard = ({ itinerary, onPress, isSelected = false }) => {
  const startTime = formatTimeFromTimestamp(itinerary.startTime);
  const endTime = formatTimeFromTimestamp(itinerary.endTime);
  const duration = formatDuration(itinerary.duration);
  const walkDistance = formatDistance(itinerary.walkDistance);

  // Get transit legs for display
  const transitLegs = itinerary.legs.filter((leg) => leg.mode !== 'WALK');

  // Get delay info from first transit leg
  const firstTransitLeg = transitLegs[0];
  const hasRealtimeInfo = itinerary.hasRealtimeInfo || firstTransitLeg?.isRealtime;
  const delaySeconds = itinerary.totalDelaySeconds ?? firstTransitLeg?.delaySeconds ?? 0;

  return (
    <TouchableOpacity
      style={[styles.container, isSelected && styles.containerSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.durationRow}>
          <Text style={styles.duration}>{duration}</Text>
          {hasRealtimeInfo && (
            <DelayBadge delaySeconds={delaySeconds} isRealtime={hasRealtimeInfo} />
          )}
        </View>
        <Text style={styles.timeRange}>
          {startTime} → {endTime}
        </Text>
      </View>

      {/* Route Summary */}
      <View style={styles.routeSummary}>
        {itinerary.legs.map((leg, index) => (
          <React.Fragment key={index}>
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

      {/* Details */}
      <View style={styles.details}>
        <View style={styles.detailItem}>
          <Text style={styles.detailIcon}>🚶</Text>
          <Text style={styles.detailText}>{walkDistance} walk</Text>
        </View>

        {itinerary.transfers > 0 && (
          <View style={styles.detailItem}>
            <Text style={styles.detailIcon}>🔄</Text>
            <Text style={styles.detailText}>
              {itinerary.transfers} transfer{itinerary.transfers > 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {transitLegs.length > 0 && (
          <View style={styles.detailItem}>
            <Text style={styles.detailIcon}>🚌</Text>
            <Text style={styles.detailText}>
              {transitLegs.map((leg) => leg.route?.shortName || '?').join(', ')}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    ...SHADOWS.small,
  },
  containerSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.grey50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  duration: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  timeRange: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  routeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  connector: {
    width: 20,
    height: 2,
    backgroundColor: COLORS.grey300,
    marginHorizontal: 4,
  },
  walkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.grey200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walkIconText: {
    fontSize: 14,
  },
  busIcon: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  busIconText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  detailText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
});

export default TripCard;
