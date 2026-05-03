import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';
import { formatDuration, formatTimeFromTimestamp, formatDistance } from '../services/tripService';
import Icon from './Icon';
import { DelayIndicator } from './DelayBadge';
import { getContrastTextColor } from '../utils/colorUtils';
import { buildTransitStopProgress } from '../utils/transitStopUtils';

/** Format stop name with stop number when available */
const formatStopName = (stop) => {
  if (!stop) return '';
  const code = stop.stopCode || stop.stopId;
  const name = stop.name || 'this stop';
  return code ? `${name} (#${code})` : name;
};

const isTransitMode = (leg) => leg.mode === 'BUS' || leg.mode === 'TRANSIT';
const isOnDemandMode = (leg) => leg.mode === 'ON_DEMAND' || leg.isOnDemand;

const getStopCountLabel = (count) => {
  if (!Number.isFinite(count)) return 'ride to your stop';
  if (count === 0) return 'direct to your stop';
  if (count === 1) return '1 stop before yours';
  return `${count} stops before yours`;
};

const getWalkingTitle = (leg) => {
  const code = leg?.to?.stopCode || leg?.to?.stopId || leg?.to?.code;
  if (code) return `Walk to Stop #${code}`;
  return `Walk to ${leg?.to?.name || 'your destination'}`;
};

const getWalkingIconName = (leg) => (
  leg?.to?.stopCode || leg?.to?.stopId || leg?.to?.code ? 'BusStop' : 'Walk'
);

const getDetourWarningTone = (detourImpact) => (
  detourImpact?.severity === 'stop_affected'
    ? {
      backgroundColor: COLORS.errorSubtle,
      borderColor: COLORS.error,
      color: COLORS.error,
    }
    : {
      backgroundColor: COLORS.warningSubtle,
      borderColor: COLORS.warning,
      color: COLORS.warning,
    }
);

const TripStep = ({ leg, isFirst, isLast }) => {
  const startTime = formatTimeFromTimestamp(leg.startTime);
  const endTime = formatTimeFromTimestamp(leg.endTime);
  const duration = formatDuration(leg.duration);
  const distance = formatDistance(leg.distance);

  const isWalk = leg.mode === 'WALK';
  const isBus = isTransitMode(leg);
  const isOnDemand = isOnDemandMode(leg);
  const routeColor = leg.route?.color || COLORS.primary;
  const transitStopProgress = isBus ? buildTransitStopProgress(leg) : null;
  const destinationName = leg.to?.name || 'your destination';
  const originName = leg.from?.name || (isOnDemand ? 'Pickup' : 'your start point');
  const routeShortName = leg.route?.shortName || 'Bus';
  const routeDirection = leg.headsign || leg.route?.longName;
  const rideStopCount = transitStopProgress?.totalStopsBetween ?? 0;
  const detourTone = getDetourWarningTone(leg.detourImpact);

  // Get delay info
  const isRealtime = leg.isRealtime || false;
  const delaySeconds = leg.delaySeconds || 0;

  return (
    <View style={styles.container}>
      {/* Timeline */}
      <View style={styles.timeline}>
        <View style={[styles.dot, isFirst && styles.dotFirst]} />
        {!isLast && <View style={[styles.line, isBus && { backgroundColor: routeColor }]} />}
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
            {formatStopName(leg.from) || originName}
          </Text>
        </View>

        {/* Step Details */}
        <View
          style={[
            styles.stepCard,
            isBus && styles.stepCardBus,
            isBus && { borderLeftColor: routeColor },
            isOnDemand && styles.stepCardOnDemand,
          ]}
        >
          {isWalk ? (
            <View>
              <View style={styles.walkContent}>
                <Icon name={getWalkingIconName(leg)} size={22} color={COLORS.textSecondary} />
                <View style={styles.walkDetails}>
                  <Text style={styles.stepTitle}>{getWalkingTitle(leg)}</Text>
                  <Text style={styles.stepSubtitle}>{distance} • about {duration}</Text>
                  {leg.to?.name && (leg.to?.stopCode || leg.to?.stopId || leg.to?.code) ? (
                    <Text style={styles.stepMetaLine} numberOfLines={1}>
                      {leg.to.name}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : isOnDemand ? (
            <View style={styles.busContent}>
              <View style={[styles.routeBadge, { backgroundColor: leg.zoneColor || COLORS.primary }]}>
                <Icon name="Phone" size={16} color={COLORS.white} />
              </View>
              <View style={styles.busDetails}>
                <Text style={styles.stepTitle}>Book on-demand ride</Text>
                <Text style={styles.stepSubtitle}>
                  {duration} • {leg.zoneName || 'on-demand zone'}
                </Text>
                <Text style={styles.stepMetaLine} numberOfLines={1}>
                  Pickup at {formatStopName(leg.from) || originName}
                </Text>
                <Text style={styles.stepMetaLine} numberOfLines={1}>
                  Drop off at {formatStopName(leg.to) || destinationName}
                </Text>
                {leg.bookingPhone ? (
                  <Text style={styles.stepMetaLine}>Call {leg.bookingPhone} to book</Text>
                ) : null}
              </View>
            </View>
          ) : isBus ? (
            <View style={styles.busContent}>
              <View
                style={[styles.routeBadge, { backgroundColor: routeColor }]}
              >
                <Text style={[styles.routeText, { color: getContrastTextColor(routeColor) }]}>{routeShortName}</Text>
              </View>
              <View style={styles.busDetails}>
                <View style={styles.busTitleRow}>
                  <Text style={styles.stepTitle}>Board Route {routeShortName}</Text>
                  {isRealtime && (
                    <View style={styles.realtimeIndicator}>
                      <View style={styles.realtimeDot} />
                      <Text style={styles.realtimeText}>Live</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.stepSubtitle}>
                  {routeDirection ? `Toward ${routeDirection} • ` : ''}{duration}
                </Text>
                {leg.from?.name ? (
                  <Text style={styles.stepMetaLine} numberOfLines={1}>
                    Board at {formatStopName(leg.from)}
                  </Text>
                ) : null}
                <Text style={styles.stepMetaLine} numberOfLines={1}>
                  Stay on bus: {getStopCountLabel(rideStopCount)}
                </Text>
                {leg.to?.name ? (
                  <Text style={styles.stepMetaLine} numberOfLines={1}>
                    Get off at {formatStopName(leg.to)}
                  </Text>
                ) : null}
                {leg.detourImpact ? (
                  <View style={[
                    styles.detourWarning,
                    {
                      backgroundColor: detourTone.backgroundColor,
                      borderColor: detourTone.borderColor,
                    },
                  ]}>
                    <Icon name="Warning" size={14} color={detourTone.color} />
                    <View style={styles.detourWarningTextWrap}>
                      <Text style={[styles.detourWarningText, { color: detourTone.color }]}>
                        {leg.detourImpact.message}
                      </Text>
                      {leg.detourImpact.affectedStopNames?.length ? (
                        <Text
                          style={[styles.detourWarningMeta, { color: detourTone.color }]}
                          numberOfLines={2}
                        >
                          Affected: {leg.detourImpact.affectedStopNames.slice(0, 2).join(', ')}
                          {leg.detourImpact.affectedStopNames.length > 2 ? ' +' : ''}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.walkContent}>
              <Icon name="Route" size={20} color={COLORS.textSecondary} />
              <View style={styles.walkDetails}>
                <Text style={styles.stepTitle}>Continue to {destinationName}</Text>
                <Text style={styles.stepSubtitle}>{duration}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Intermediate Stops (for bus) */}
        {isBus && leg.intermediateStops && leg.intermediateStops.length > 0 && (
          <View style={styles.intermediateStops}>
            <Text style={styles.intermediateTitle}>
              On bus: {leg.intermediateStops.map((s) => formatStopName(s)).slice(0, 3).join(' → ')}
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
  stepCardOnDemand: {
    backgroundColor: COLORS.primarySubtle,
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
    alignItems: 'flex-start',
  },
  routeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.sm,
  },
  routeText: {
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
  stepMetaLine: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  intermediateStops: {
    marginLeft: 50,
    marginBottom: SPACING.xs,
  },
  intermediateTitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  detourWarning: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
  },
  detourWarningTextWrap: {
    flex: 1,
  },
  detourWarningText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  detourWarningMeta: {
    fontSize: FONT_SIZES.xxs,
    marginTop: 2,
  },
});

export default TripStep;
