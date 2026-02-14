import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import { formatDuration, formatTimeFromTimestamp, formatDistance } from '../services/tripService';
import { DelayIndicator } from './DelayBadge';

/** Format stop name with stop number when available */
const formatStopName = (stop) => {
  if (!stop) return '';
  const code = stop.stopCode || stop.stopId;
  return code ? `${stop.name} (#${code})` : stop.name;
};

const TripStep = ({ leg, isFirst, isLast }) => {
  const startTime = formatTimeFromTimestamp(leg.startTime);
  const endTime = formatTimeFromTimestamp(leg.endTime);
  const duration = formatDuration(leg.duration);
  const distance = formatDistance(leg.distance);

  const isWalk = leg.mode === 'WALK';
  const isBus = leg.mode === 'BUS' || leg.mode === 'TRANSIT';

  // Get delay info
  const isRealtime = leg.isRealtime || false;
  const delaySeconds = leg.delaySeconds || 0;

  return (
    <View style={styles.container}>
      {/* Timeline */}
      <View style={styles.timeline}>
        <View style={[styles.dot, isFirst && styles.dotFirst]} />
        {!isLast && <View style={[styles.line, isBus && { backgroundColor: leg.route?.color || COLORS.primary }]} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Start Location */}
        <View style={styles.locationRow}>
          <View style={styles.timeContainer}>
            <Text style={styles.time}>{startTime}</Text>
            {isBus && <DelayIndicator delaySeconds={delaySeconds} isRealtime={isRealtime} />}
          </View>
          <Text style={styles.location} numberOfLines={1}>
            {formatStopName(leg.from)}
          </Text>
        </View>

        {/* Step Details */}
        <View style={[styles.stepCard, isBus && styles.stepCardBus]}>
          {isWalk ? (
            <View style={styles.walkContent}>
              <Text style={styles.walkIcon}>🚶</Text>
              <View style={styles.walkDetails}>
                <Text style={styles.stepTitle}>Walk {distance}</Text>
                <Text style={styles.stepSubtitle}>{duration}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.busContent}>
              <View
                style={[styles.routeBadge, { backgroundColor: leg.route?.color || COLORS.primary }]}
              >
                <Text style={styles.routeText}>{leg.route?.shortName || '?'}</Text>
              </View>
              <View style={styles.busDetails}>
                <View style={styles.busTitleRow}>
                  <Text style={styles.stepTitle}>{leg.headsign || leg.route?.longName || 'Bus'}</Text>
                  {isRealtime && (
                    <View style={styles.realtimeIndicator}>
                      <View style={styles.realtimeDot} />
                      <Text style={styles.realtimeText}>Live</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.stepSubtitle}>
                  {duration} • {leg.intermediateStops?.length || 0} stops
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Intermediate Stops (for bus) */}
        {isBus && leg.intermediateStops && leg.intermediateStops.length > 0 && (
          <View style={styles.intermediateStops}>
            <Text style={styles.intermediateTitle}>
              Stops: {leg.intermediateStops.map((s) => s.name).slice(0, 3).join(' → ')}
              {leg.intermediateStops.length > 3 && ` + ${leg.intermediateStops.length - 3} more`}
            </Text>
          </View>
        )}

        {/* End Location (only show for last leg) */}
        {isLast && (
          <View style={styles.locationRow}>
            <Text style={styles.time}>{endTime}</Text>
            <Text style={styles.location} numberOfLines={1}>
              {formatStopName(leg.to)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  timeline: {
    width: 24,
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  dotFirst: {
    backgroundColor: COLORS.success,
  },
  line: {
    flex: 1,
    width: 3,
    backgroundColor: COLORS.grey300,
    marginVertical: 4,
  },
  content: {
    flex: 1,
    paddingBottom: SPACING.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 50,
    marginRight: SPACING.xs,
  },
  time: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  location: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  stepCard: {
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginVertical: SPACING.xs,
    marginLeft: 50,
  },
  stepCardBus: {
    backgroundColor: COLORS.grey50,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  walkContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walkIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  walkDetails: {
    flex: 1,
  },
  busContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.sm,
  },
  routeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  busDetails: {
    flex: 1,
  },
  busTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  realtimeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.successSubtle,
    paddingVertical: 2,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.xs,
  },
  realtimeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  realtimeText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.success,
  },
  stepTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  stepSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  intermediateStops: {
    marginLeft: 50,
    marginBottom: SPACING.xs,
  },
  intermediateTitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
});

export default TripStep;
