import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../config/theme';
import { formatMinutes } from '../services/tripService';

const ArrivalRow = ({ arrival, routeColor }) => {
  const isRealtime = arrival.isRealtime;
  const minutesAway = arrival.minutesAway;

  const getTimeDisplay = () => {
    if (minutesAway <= 0) return 'Now';
    if (minutesAway === 1) return '1 min';
    return formatMinutes(minutesAway);
  };

  const getTimeStyle = () => {
    if (minutesAway <= 2) return styles.timeUrgent;
    if (minutesAway <= 5) return styles.timeSoon;
    return styles.timeNormal;
  };

  return (
    <View style={styles.container} accessibilityLabel={`Route ${arrival.routeShortName}, ${arrival.headsign || 'Unknown'}, ${getTimeDisplay()}${isRealtime ? ', real-time' : ', scheduled'}`} accessibilityLiveRegion="polite">
      <View style={[styles.routeBadge, { backgroundColor: routeColor || COLORS.primary }]}>
        <Text style={styles.routeText}>{arrival.routeShortName}</Text>
      </View>

      <View style={styles.destinationContainer}>
        <Text style={styles.destination} numberOfLines={1}>
          {arrival.headsign || arrival.tripHeadsign || 'Unknown'}
        </Text>
        {arrival.stopSequence && (
          <Text style={styles.stopInfo}>Stop #{arrival.stopSequence}</Text>
        )}
      </View>

      <View style={styles.timeContainer}>
        <Text style={[styles.time, getTimeStyle()]}>{getTimeDisplay()}</Text>
        <View style={styles.realtimeIndicator}>
          {isRealtime ? (
            <View style={styles.realtimeDot} />
          ) : (
            <Text style={styles.scheduledText}>scheduled</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  routeBadge: {
    width: 40,
    height: 28,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  routeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  destinationContainer: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  destination: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  stopInfo: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  timeContainer: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  time: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  timeNormal: {
    color: COLORS.textPrimary,
  },
  timeSoon: {
    color: COLORS.warning,
  },
  timeUrgent: {
    color: COLORS.error,
  },
  realtimeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  realtimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.realtime,
  },
  scheduledText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.scheduled,
  },
});

export default ArrivalRow;
