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
import { getContrastTextColor } from '../utils/colorUtils';
import Icon from './Icon';
import WalkingPaceIcon from './navigation/WalkingPaceIcon';

const getTripLegKey = (leg, index) => {
  const routeKey = leg.route?.id || leg.route?.shortName || 'route';
  const fromKey = leg.from?.stopId || leg.from?.name || 'from';
  const toKey = leg.to?.stopId || leg.to?.name || 'to';
  const startKey = leg.startTime || 'start';
  return `${leg.mode || 'mode'}-${routeKey}-${fromKey}-${toKey}-${startKey}-${index}`;
};

const getLabelKey = (label, index) => `${label || 'label'}-${index}`;

const isTransitRideLeg = (leg) => (
  leg?.isOnDemand || leg?.mode === 'BUS' || leg?.mode === 'TRANSIT'
);

export const getTransferWaitSummaries = (legs = []) => {
  const rideLegs = legs
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => isTransitRideLeg(leg));

  return rideLegs.slice(1).map(({ leg }, index) => {
    const previousLeg = rideLegs[index]?.leg;
    const waitSeconds = Number.isFinite(previousLeg?.endTime) && Number.isFinite(leg?.startTime)
      ? Math.max(0, Math.round((leg.startTime - previousLeg.endTime) / 1000))
      : null;
    const nextRoute = leg?.route?.shortName || leg?.zoneName || null;
    const locationName = leg?.from?.name || previousLeg?.to?.name || null;

    return {
      waitSeconds,
      label: waitSeconds == null ? null : `${formatDuration(waitSeconds)} transfer`,
      detail: [
        nextRoute ? `to ${nextRoute}` : null,
        locationName ? `at ${locationName}` : null,
      ].filter(Boolean).join(' · '),
    };
  }).filter((summary) => summary.label);
};

const TransferWaitSummary = ({ summaries }) => {
  if (!summaries?.length) return null;

  const primaryText = summaries.length === 1
    ? summaries[0].label
    : `Transfers: ${summaries.map((summary) => formatDuration(summary.waitSeconds)).join(', ')}`;
  const detailText = summaries.length === 1
    ? summaries[0].detail
    : 'Time between rides';

  return (
    <View style={styles.transferTimeBox}>
      <Icon name="Transfer" size={14} color={COLORS.primaryDark} />
      <View style={styles.transferTimeCopy}>
        <Text style={styles.transferTimeTitle}>{primaryText}</Text>
        {!!detailText && (
          <Text style={styles.transferTimeDetail} numberOfLines={1}>{detailText}</Text>
        )}
      </View>
    </View>
  );
};

const RideRouteSummary = ({ transitLegs, transferWaitSummaries, transfers }) => {
  if (!transitLegs?.length) return null;

  const routeSequence = transitLegs
    .map((leg) => leg?.route?.shortName || leg?.zoneName || 'Bus')
    .join(' → ');
  const transferText = transfers > 0
    ? `${transfers} transfer${transfers === 1 ? '' : 's'}`
    : 'Direct ride';
  const waitText = transferWaitSummaries?.length
    ? `Transfer waits: ${transferWaitSummaries.map((summary) => formatDuration(summary.waitSeconds)).join(', ')}`
    : null;

  return (
    <View style={styles.rideSummaryBox}>
      <Text style={styles.rideSummaryRoutes} numberOfLines={1}>{routeSequence}</Text>
      <Text style={styles.rideSummaryMeta} numberOfLines={1}>
        {transferText}{waitText ? ` · ${waitText}` : ''}
      </Text>
    </View>
  );
};

const getStopClosureNoticeCopy = (notices) => {
  if (notices?.hasTripImpact && notices.impactedStops?.length > 0) {
    const firstStop = notices.impactedStops[0];
    const stopLabel = firstStop.stopCode ? `Stop ${firstStop.stopCode}` : (firstStop.stopName || 'A stop');
    const extraCount = notices.impactedStops.length - 1;
    return {
      tone: 'warning',
      title: `${stopLabel} may be closed for this trip`,
      detail: extraCount > 0
        ? `${extraCount + 1} stops in this trip have reported closures.`
        : firstStop.stopName || 'Check the notice before travelling.',
    };
  }

  const routeNoticeCount = notices?.routeNotices?.length || 0;
  if (routeNoticeCount > 0) {
    return {
      tone: 'minor',
      title: `Route has ${routeNoticeCount} reported stop closure${routeNoticeCount === 1 ? '' : 's'}`,
      detail: 'Your boarding and exit stops are not impacted.',
    };
  }

  return null;
};

const getDetourNoticeCopy = (itinerary) => {
  const impacts = itinerary?.detourImpacts || [];
  if (impacts.length === 0) return null;

  const stopImpact = impacts.find((impact) => impact.severity === 'stop_affected');
  if (stopImpact) {
    return {
      tone: 'warning',
      title: 'Detour may affect this trip',
      detail: stopImpact.affectedStopNames?.length
        ? `Affected: ${stopImpact.affectedStopNames.slice(0, 2).join(', ')}`
        : stopImpact.message,
    };
  }

  return {
    tone: 'minor',
    title: 'Route is currently on detour',
    detail: impacts[0]?.message || 'Check trip details before travelling.',
  };
};

const StopClosureNotice = ({ notice }) => {
  if (!notice) return null;
  const isWarning = notice.tone === 'warning';
  return (
    <View style={[
      styles.stopClosureNotice,
      isWarning ? styles.stopClosureNoticeWarning : styles.stopClosureNoticeMinor,
    ]}>
      <Text style={[
        styles.stopClosureNoticeTitle,
        isWarning ? styles.stopClosureNoticeTitleWarning : styles.stopClosureNoticeTitleMinor,
      ]}>
        {isWarning ? '⚠️ ' : ''}{notice.title}
      </Text>
      <Text style={styles.stopClosureNoticeDetail}>{notice.detail}</Text>
    </View>
  );
};

const TripTimingSummary = ({ startTime, endTime }) => (
  <View style={styles.timingRow}>
    <View style={styles.timingBlock}>
      <Text style={styles.timingLabel}>Depart</Text>
      <Text style={styles.timingValue}>{startTime}</Text>
    </View>
    <View style={styles.timingDivider} />
    <View style={styles.timingBlock}>
      <Text style={styles.timingLabel}>Arrive</Text>
      <Text style={styles.timingValue}>{endTime}</Text>
    </View>
  </View>
);

const TripResultCard = ({ itinerary, onPress, onViewDetails, onStartNavigation, isSelected = false }) => {
  const startTime = formatTimeFromTimestamp(itinerary.startTime);
  const endTime = formatTimeFromTimestamp(itinerary.endTime);
  const duration = formatDuration(itinerary.duration);
  const walkDistance = formatDistance(itinerary.walkDistance);
  const walkTime = itinerary.walkTime ? formatDuration(itinerary.walkTime) : null;

  // Get transit legs for display
  const transitLegs = itinerary.legs.filter((leg) => leg.mode === 'BUS' || leg.mode === 'TRANSIT');
  const onDemandLeg = itinerary.legs.find((leg) => leg.isOnDemand);
  const rideSummary = [
    transitLegs.length > 0 ? `${transitLegs.length} bus${transitLegs.length !== 1 ? 'es' : ''}` : null,
    onDemandLeg ? 'on-demand ride' : null,
  ].filter(Boolean).join(', ') || 'walking only';

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
  const stopClosureNotice = getStopClosureNoticeCopy(itinerary.stopClosureNotices);
  const detourNotice = getDetourNoticeCopy(itinerary);
  const transferWaitSummaries = getTransferWaitSummaries(itinerary.legs);

  // Format "leaves in" text
  const getLeavesInText = () => {
    if (isTomorrow) return null; // Show "Tomorrow" badge instead
    if (minutesUntilDeparture === 0) return 'Depart now';
    if (minutesUntilDeparture === 1) return 'Depart in 1 min';
    return `Depart in ${formatMinutes(minutesUntilDeparture)}`;
  };

  const leavesInText = getLeavesInText();
  const showsInlineActions = isSelected && !!onStartNavigation;
  const containerStyle = [
    styles.container,
    isRecommended && styles.containerRecommended,
    isSelected && styles.containerSelected,
  ];

  if (showsInlineActions) {
    return (
      <View
        style={containerStyle}
        accessibilityLabel={`Trip option: ${duration}, depart ${startTime}, arrive ${endTime}, ${rideSummary}, ${walkDistance} walking`}
        accessibilityState={{ selected: isSelected }}
      >
        {/* Top Row: Labels */}
        {(labels || isTomorrow) && (
          <View style={styles.labelsRow}>
            {labels && labels.map((label, idx) => (
              <View
                key={getLabelKey(label, idx)}
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

        {/* Top Row: Duration + Leave In */}
        <View style={styles.topRow}>
          <View style={styles.topRowHeader}>
            <View style={styles.topRowLeft}>
              <Text style={styles.durationLarge}>{duration}</Text>
              {hasRealtimeInfo && (
                <DelayBadge delaySeconds={delaySeconds} isRealtime={hasRealtimeInfo} compact />
              )}
            </View>
            {leavesInText && (
              <Text style={[
                styles.leaveInText,
                minutesUntilDeparture <= 5 && styles.leavesInSoon,
              ]}>
                {leavesInText}
              </Text>
            )}
          </View>
          <TripTimingSummary startTime={startTime} endTime={endTime} />
          <RideRouteSummary
            transitLegs={transitLegs}
            transferWaitSummaries={transferWaitSummaries}
            transfers={itinerary.transfers || 0}
          />
          <View style={styles.routeSummaryRow}>
            {itinerary.legs.map((leg, index) => (
              <React.Fragment key={getTripLegKey(leg, index)}>
                {index > 0 && <View style={styles.connector} />}
                <View style={styles.legColumn}>
                  {leg.mode === 'WALK' ? (
                    <View style={[styles.walkIcon, styles.routeBadgeInline]}>
                      <WalkingPaceIcon level="on_pace" size={18} />
                    </View>
                  ) : leg.isOnDemand ? (
                    <View style={[styles.busIcon, styles.routeBadgeInline, { backgroundColor: leg.zoneColor || COLORS.primary }]}>
                      <Icon name="Phone" size={14} color={COLORS.white} />
                    </View>
                  ) : (
                    <View
                      style={[styles.busIcon, styles.routeBadgeInline, { backgroundColor: leg.route?.color || COLORS.primary }]}
                    >
                      <Text style={[styles.busIconText, { color: getContrastTextColor(leg.route?.color || COLORS.primary) }]}>{leg.route?.shortName || '?'}</Text>
                    </View>
                  )}
                  <Text style={styles.legDurationText}>{Math.max(1, Math.round(leg.duration / 60))} min</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        <TransferWaitSummary summaries={transferWaitSummaries} />

        {/* On-demand booking note */}
        {onDemandLeg && (
          <View style={[styles.onDemandNote, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Icon name="Phone" size={12} color={COLORS.primary} />
            <Text style={styles.onDemandNoteText}>
              Call {onDemandLeg.bookingPhone || 'transit'} to book
            </Text>
          </View>
        )}

        <StopClosureNotice notice={stopClosureNotice} />
        <StopClosureNotice notice={detourNotice} />

        {/* Bottom Row: Walk/Transfer Details + Action Button */}
        <View style={styles.bottomRow}>
          <View style={styles.bottomRowContent}>
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
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Trip option: ${duration}, depart ${startTime}, arrive ${endTime}, ${rideSummary}, ${walkDistance} walking`}
      accessibilityState={{ selected: isSelected }}
    >
      {/* Top Row: Labels */}
      {(labels || isTomorrow) && (
        <View style={styles.labelsRow}>
          {labels && labels.map((label, idx) => (
            <View
              key={getLabelKey(label, idx)}
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

      {/* Top Row: Duration + Leave In + Route Badge Chain */}
      <View style={styles.topRow}>
        <View style={styles.topRowHeader}>
          <View style={styles.topRowLeft}>
            <Text style={styles.durationLarge}>{duration}</Text>
            {hasRealtimeInfo && (
              <DelayBadge delaySeconds={delaySeconds} isRealtime={hasRealtimeInfo} compact />
            )}
          </View>
          {leavesInText && (
            <Text style={[
              styles.leaveInText,
              minutesUntilDeparture <= 5 && styles.leavesInSoon,
            ]}>
              {leavesInText}
            </Text>
          )}
        </View>
        <TripTimingSummary startTime={startTime} endTime={endTime} />
        <RideRouteSummary
          transitLegs={transitLegs}
          transferWaitSummaries={transferWaitSummaries}
          transfers={itinerary.transfers || 0}
        />
        <View style={styles.routeSummaryRow}>
          {itinerary.legs.map((leg, index) => (
            <React.Fragment key={getTripLegKey(leg, index)}>
              {index > 0 && <View style={styles.connector} />}
              <View style={styles.legColumn}>
                {leg.mode === 'WALK' ? (
                  <View style={[styles.walkIcon, styles.routeBadgeInline]}>
                    <WalkingPaceIcon level="on_pace" size={18} />
                  </View>
                ) : leg.isOnDemand ? (
                  <View style={[styles.busIcon, styles.routeBadgeInline, { backgroundColor: leg.zoneColor || COLORS.primary }]}>
                    <Icon name="Phone" size={14} color={COLORS.white} />
                  </View>
                ) : (
                  <View
                    style={[styles.busIcon, styles.routeBadgeInline, { backgroundColor: leg.route?.color || COLORS.primary }]}
                  >
                    <Text style={[styles.busIconText, { color: getContrastTextColor(leg.route?.color || COLORS.primary) }]}>{leg.route?.shortName || '?'}</Text>
                  </View>
                )}
                <Text style={styles.legDurationText}>{Math.max(1, Math.round(leg.duration / 60))} min</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>

      <TransferWaitSummary summaries={transferWaitSummaries} />

      {/* On-demand booking note */}
      {onDemandLeg && (
        <View style={[styles.onDemandNote, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
          <Icon name="Phone" size={12} color={COLORS.primary} />
          <Text style={styles.onDemandNoteText}>
            Call {onDemandLeg.bookingPhone || 'transit'} to book
          </Text>
        </View>
      )}

      <StopClosureNotice notice={stopClosureNotice} />
      <StopClosureNotice notice={detourNotice} />

      {/* Bottom Row: Walk/Transfer Details + Action Button */}
      <View style={styles.bottomRow}>
        <View style={styles.bottomRowContent}>
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
        <View style={styles.stepsButton} pointerEvents="none">
          <Text style={styles.stepsButtonText}>Select</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    ...SHADOWS.small,
  },
  containerSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySubtle,
    ...SHADOWS.medium,
  },
  containerRecommended: {
    borderColor: 'rgba(76, 175, 80, 0.42)',
  },
  labelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xxs,
    marginBottom: SPACING.xs,
  },
  labelBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.round,
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
  topRow: {
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  topRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  topRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexShrink: 1,
    paddingRight: SPACING.sm,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.grey50,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
    overflow: 'hidden',
  },
  timingBlock: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  timingLabel: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  timingValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  timingDivider: {
    width: 1,
    backgroundColor: COLORS.borderLight,
  },
  routeSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    rowGap: SPACING.xs,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomRowContent: {
    flex: 1,
  },
  durationLarge: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.textPrimary,
    marginRight: SPACING.sm,
    letterSpacing: -0.3,
  },
  leaveInText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primaryDark,
    backgroundColor: COLORS.primarySubtle,
    borderRadius: BORDER_RADIUS.round,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    flexShrink: 0,
    textAlign: 'right',
    overflow: 'hidden',
    maxWidth: '44%',
  },
  routeBadgeInline: {
    marginHorizontal: 2,
  },
  legColumn: {
    alignItems: 'center',
  },
  legDurationText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 1,
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
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  leavesInSoon: {
    color: COLORS.white,
    backgroundColor: COLORS.success,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stepsButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.round,
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
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailsButtonText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  goButton: {
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.round,
  },
  goButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  onDemandNote: {
    backgroundColor: COLORS.primarySubtle,
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.xs,
    marginRight: SPACING.sm,
  },
  onDemandNoteText: {
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  transferTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primarySubtle,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    marginBottom: SPACING.sm,
  },
  transferTimeCopy: {
    flexShrink: 1,
  },
  transferTimeTitle: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  transferTimeDetail: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 1,
    maxWidth: 220,
  },
  rideSummaryBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
  },
  rideSummaryRoutes: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.extrabold,
    letterSpacing: -0.1,
  },
  rideSummaryMeta: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 2,
  },
  stopClosureNotice: {
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  stopClosureNoticeWarning: {
    backgroundColor: COLORS.warningSubtle,
    borderColor: 'rgba(255, 153, 31, 0.35)',
  },
  stopClosureNoticeMinor: {
    backgroundColor: COLORS.grey50,
    borderColor: COLORS.borderLight,
  },
  stopClosureNoticeTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stopClosureNoticeTitleWarning: {
    color: COLORS.textPrimary,
  },
  stopClosureNoticeTitleMinor: {
    color: COLORS.textSecondary,
  },
  stopClosureNoticeDetail: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 2,
  },
});

export default memo(TripResultCard);
