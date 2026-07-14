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
import { getNoticeStartText } from '../utils/noticeTimingUtils';
import {
  getEffectiveTransferCount,
  getRouteDisplayName,
  getSameBusContinuationPairs,
  getTransitRideLegsWithIndexes,
  isTransitRideLeg,
} from '../utils/routeContinuity';
import { getItineraryNavigationBlock } from '../utils/tripNavigationSafety';

const getTripLegKey = (leg, index) => {
  const routeKey = leg.route?.id || leg.route?.shortName || 'route';
  const fromKey = leg.from?.stopId || leg.from?.name || 'from';
  const toKey = leg.to?.stopId || leg.to?.name || 'to';
  const startKey = leg.startTime || 'start';
  return `${leg.mode || 'mode'}-${routeKey}-${fromKey}-${toKey}-${startKey}-${index}`;
};

const getLabelKey = (label, index) => `${label || 'label'}-${index}`;
const TOMORROW_BADGE_TEXT = '📅 Tomorrow';

export const getTransferWaitSummaries = (legs = []) => {
  const rideLegs = getTransitRideLegsWithIndexes(legs);
  const sameBusKeys = new Set(
    getSameBusContinuationPairs(legs).map((pair) => `${pair.previousIndex}-${pair.nextIndex}`)
  );

  return rideLegs.slice(1).map(({ leg, index: legIndex }, index) => {
    const previousEntry = rideLegs[index];
    const previousLeg = previousEntry?.leg;
    if (sameBusKeys.has(`${previousEntry?.index}-${legIndex}`)) {
      return null;
    }
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
  }).filter((summary) => summary?.label);
};

export const getStayOnBusDisplay = (legs = []) => {
  const continuations = getSameBusContinuationPairs(legs);
  if (!continuations.length) return null;

  const first = continuations[0];
  if (continuations.length === 1) {
    return `Stay on the bus — route changes to ${first.nextRoute}`;
  }

  return 'Stay on the bus through route changes';
};

const getLegDurationMinutes = (legs = []) => (
  Math.max(1, Math.round(
    legs.reduce((total, leg) => total + (Number.isFinite(leg?.duration) ? Number(leg.duration) : 0), 0) / 60
  ))
);

const getRoutePreviewItems = (legs = []) => {
  const continuationsByStart = new Map(
    getSameBusContinuationPairs(legs).map((pair) => [pair.previousIndex, pair])
  );
  const items = [];

  for (let index = 0; index < legs.length; index += 1) {
    const continuation = continuationsByStart.get(index);
    if (!continuation) {
      items.push({
        type: 'leg',
        key: getTripLegKey(legs[index], index),
        legs: [legs[index]],
        leg: legs[index],
      });
      continue;
    }

    const groupedLegs = [legs[index]];
    const routeLabels = [getRouteDisplayName(legs[index])];
    let lastIndex = continuation.nextIndex;

    groupedLegs.push(legs[lastIndex]);
    routeLabels.push(getRouteDisplayName(legs[lastIndex]));

    while (continuationsByStart.has(lastIndex)) {
      const chainedContinuation = continuationsByStart.get(lastIndex);
      lastIndex = chainedContinuation.nextIndex;
      groupedLegs.push(legs[lastIndex]);
      routeLabels.push(getRouteDisplayName(legs[lastIndex]));
    }

    items.push({
      type: 'same_bus',
      key: `same-bus-${index}-${lastIndex}`,
      legs: groupedLegs,
      leg: legs[index],
      label: routeLabels.join(' → '),
    });
    index = lastIndex;
  }

  return items;
};

const RoutePreviewItem = ({ item }) => {
  const leg = item.leg;
  const durationMinutes = getLegDurationMinutes(item.legs);

  return (
    <View style={styles.legColumn}>
      {item.type === 'same_bus' ? (
        <View
          style={[styles.busIcon, styles.sameBusIcon, styles.routeBadgeInline, { backgroundColor: leg.route?.color || COLORS.primary }]}
        >
          <Text style={[styles.busIconText, { color: getContrastTextColor(leg.route?.color || COLORS.primary) }]}>
            {item.label}
          </Text>
        </View>
      ) : leg.mode === 'WALK' ? (
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
      <Text style={styles.legDurationText}>{durationMinutes} min</Text>
    </View>
  );
};

export const getTransferWaitDisplay = (summaries = []) => {
  if (!summaries.length) {
    return { text: null, tone: null };
  }

  if (summaries.length > 1) {
    const hasNoBuffer = summaries.some((summary) => summary.waitSeconds === 0);
    const hasVeryTightTransfer = summaries.some((summary) => summary.waitSeconds > 0 && summary.waitSeconds <= 120);
    const hasTightTransfer = summaries.some((summary) => summary.waitSeconds > 120 && summary.waitSeconds <= 300);
    const tone = hasNoBuffer || hasVeryTightTransfer ? 'urgent' : hasTightTransfer ? 'warning' : null;

    return {
      text: `${tone ? '⚠️ ' : ''}waits ${summaries.map((summary) => formatDuration(summary.waitSeconds)).join(', ')}`,
      tone,
    };
  }

  const waitSeconds = summaries[0].waitSeconds;
  if (waitSeconds === 0) {
    return { text: '⚠️ No transfer buffer', tone: 'urgent' };
  }
  if (waitSeconds <= 120) {
    return { text: `⚠️ Very tight transfer: ${formatDuration(waitSeconds)} between buses`, tone: 'urgent' };
  }
  if (waitSeconds <= 300) {
    return { text: `Tight transfer: ${formatDuration(waitSeconds)} between buses`, tone: 'warning' };
  }

  return { text: `${formatDuration(waitSeconds)} between buses`, tone: null };
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
    const appliesToTrip = firstStop.timingStatus === 'applies_to_trip';
    return {
      tone: 'warning',
      title: appliesToTrip
        ? `This trip may be affected by ${stopLabel} closure`
        : `${stopLabel} may be closed for this trip`,
      detail: extraCount > 0
        ? `${extraCount + 1} stops in this trip have reported closures.`
        : [
          appliesToTrip ? getNoticeStartText(firstStop, null) : null,
          firstStop.stopName || 'Check the notice before travelling.',
        ].filter(Boolean).join(' · '),
    };
  }

  const routeNoticeCount = notices?.routeNotices?.length || 0;
  if (routeNoticeCount > 0) {
    const firstRouteNotice = notices.routeNotices[0];
    const appliesToTrip = notices.routeNotices.some((notice) => notice.timingStatus === 'applies_to_trip');
    return {
      tone: appliesToTrip ? 'warning' : 'minor',
      title: appliesToTrip
        ? 'This trip may be affected by a scheduled stop closure'
        : `Your route has ${routeNoticeCount === 1 ? 'one stop closure' : `${routeNoticeCount} stop closures`}`,
      detail: appliesToTrip
        ? getNoticeStartText(firstRouteNotice, 'Check the notice before travelling.')
        : 'Your trip is not impacted.',
    };
  }

  if (notices?.hasUpcomingImpact && notices.upcomingImpactedStops?.length > 0) {
    const firstStop = notices.upcomingImpactedStops[0];
    const stopLabel = firstStop.stopCode ? `Stop ${firstStop.stopCode}` : (firstStop.stopName || 'A stop');
    return {
      tone: 'upcoming',
      title: `${stopLabel} closure scheduled`,
      detail: [
        getNoticeStartText(firstStop, null),
        firstStop.stopName || 'Check the notice before travelling.',
      ].filter(Boolean).join(' · '),
    };
  }

  const upcomingRouteNoticeCount = notices?.upcomingRouteNotices?.length || 0;
  if (upcomingRouteNoticeCount > 0) {
    const firstRouteNotice = notices.upcomingRouteNotices[0];
    return {
      tone: 'upcoming',
      title: `Upcoming ${upcomingRouteNoticeCount === 1 ? 'stop closure' : 'stop closures'} on your route`,
      detail: getNoticeStartText(firstRouteNotice, 'Check the notice before travelling.'),
    };
  }

  return null;
};

const getDetourNoticeCopy = (itinerary) => {
  const impacts = itinerary?.detourImpacts || [];
  if (impacts.length === 0) return null;

  const stopImpact = impacts.find((impact) => impact.severity === 'stop_affected');
  if (stopImpact) {
    const titleByScope = {
      boarding_stop: 'Boarding stop may be missed',
      exit_stop: 'Exit stop may be missed',
      boarding_and_exit_stops: 'Boarding and exit stops may be missed',
      ride_stops: 'Stops during this ride may be missed',
    };

    return {
      tone: 'warning',
      title: titleByScope[stopImpact.impactScope] || 'Detour may affect this trip',
      detail: stopImpact.affectedStopNames?.length
        ? `Affected: ${stopImpact.affectedStopNames.slice(0, 2).join(', ')}`
        : stopImpact.guidance || stopImpact.message,
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
  const isUpcoming = notice.tone === 'upcoming';
  const noticeText = notice.detail ? `${notice.title} · ${notice.detail}` : notice.title;

  return (
    <View style={[
      styles.stopClosureNotice,
      isWarning ? styles.stopClosureNoticeWarning : isUpcoming ? styles.stopClosureNoticeUpcoming : styles.stopClosureNoticeMinor,
    ]}>
      <Text style={[
        styles.stopClosureNoticeTitle,
        isWarning ? styles.stopClosureNoticeTitleWarning : isUpcoming ? styles.stopClosureNoticeTitleUpcoming : styles.stopClosureNoticeTitleMinor,
      ]} numberOfLines={1}>
        {isWarning ? '⚠️ ' : isUpcoming ? '📅 ' : ''}{noticeText}
      </Text>
    </View>
  );
};

export const getChoiceExplanationMessages = (itinerary, context = {}) => {
  const messages = [];
  const transferRisk = itinerary?.transferRisk;
  const similarOptionsHidden = Number(itinerary?.similarOptionsHidden) || 0;

  if (itinerary?.hasMissedDeparture) {
    messages.push('Why not this one: first bus likely already left.');
  }

  if (itinerary?.hasMissedTransfer || transferRisk?.status === 'missed') {
    messages.push('Transfer risk: connection may be missed after live delays.');
  } else if (transferRisk?.status === 'tight' || transferRisk?.status === 'warning') {
    const bufferSeconds = Math.max(0, Number(transferRisk.bufferSeconds) || 0);
    messages.push(`Transfer risk: only ${formatDuration(bufferSeconds)} buffer after live updates.`);
  }

  if (itinerary?.isRecommended) {
    if (context.hasRealtimeInfo || itinerary?.hasRealtimeInfo) {
      messages.push('Why this route: best live option right now.');
    } else if (itinerary?.isWalkingOnly) {
      messages.push('Why this route: walking is the simplest option for this trip.');
    } else if ((context.effectiveTransfers ?? getEffectiveTransferCount(itinerary?.legs || [])) === 0) {
      messages.push('Why this route: direct ride with a good arrival time.');
    } else {
      messages.push('Why this route: best balance of arrival time, walking, and transfers.');
    }
  }

  if (similarOptionsHidden > 0) {
    messages.push(`${similarOptionsHidden} similar option${similarOptionsHidden === 1 ? '' : 's'} hidden`);
  }

  return messages;
};

const ChoiceExplanation = ({ messages, warning = false }) => {
  if (!messages?.length) return null;

  return (
    <View style={[
      styles.choiceExplanation,
      warning && styles.choiceExplanationWarning,
    ]}>
      {messages.map((message, index) => (
        <Text
          key={`${message}-${index}`}
          style={[
            styles.choiceExplanationText,
            warning && styles.choiceExplanationTextWarning,
          ]}
        >
          {message}
        </Text>
      ))}
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
  const transitLegs = itinerary.legs.filter((leg) => isTransitRideLeg(leg));
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
  const effectiveTransfers = getEffectiveTransferCount(itinerary);
  const transferText = effectiveTransfers > 0
    ? `${effectiveTransfers} transfer${effectiveTransfers > 1 ? 's' : ''}`
    : null;
  const transferWaitDisplay = getTransferWaitDisplay(transferWaitSummaries);
  const stayOnBusDisplay = getStayOnBusDisplay(itinerary.legs);
  const routePreviewItems = getRoutePreviewItems(itinerary.legs);
  const choiceExplanationMessages = getChoiceExplanationMessages(itinerary, {
    effectiveTransfers,
    hasRealtimeInfo,
  });
  const hasChoiceWarning = itinerary.hasMissedDeparture || itinerary.hasMissedTransfer;
  const navigationBlock = getItineraryNavigationBlock(itinerary);

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
                  label === 'Avoids Detour' && styles.labelAvoidsDetour,
                  (label === 'Likely departed' || label === 'Missed transfer' || label === 'Tight transfer') && styles.labelRisk,
                ]}
              >
                <Text style={[
                  styles.labelText,
                  label === 'Recommended' && styles.labelTextRecommended,
                  label === 'Avoids Detour' && styles.labelTextAvoidsDetour,
                  (label === 'Likely departed' || label === 'Missed transfer' || label === 'Tight transfer') && styles.labelTextRisk,
                ]}>
                  {label === 'Recommended' ? '⭐ ' : ''}{label}
                </Text>
              </View>
            ))}
            {isTomorrow && (
              <View style={styles.tomorrowBadge}>
                <Text style={styles.tomorrowText}>{TOMORROW_BADGE_TEXT}</Text>
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
          <View style={styles.routeSummaryRow}>
            {routePreviewItems.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 && <View style={styles.connector} />}
                <RoutePreviewItem item={item} />
              </React.Fragment>
            ))}
          </View>
        </View>

        <ChoiceExplanation messages={choiceExplanationMessages} warning={hasChoiceWarning} />

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
              {transferText && (
                <Text style={styles.detailText}>• {transferText}</Text>
              )}
              {!transferText && stayOnBusDisplay && (
                <Text style={styles.detailText}>• {stayOnBusDisplay}</Text>
              )}
              {transferWaitDisplay.text && (
                <Text
                  style={[
                    styles.detailText,
                    transferWaitDisplay.tone === 'warning' && styles.transferWaitWarningText,
                    transferWaitDisplay.tone === 'urgent' && styles.transferWaitUrgentText,
                  ]}
                >
                  • {transferWaitDisplay.text}
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
              style={[styles.goButton, navigationBlock && styles.goButtonDisabled]}
              onPress={() => onStartNavigation(itinerary)}
              disabled={Boolean(navigationBlock)}
              accessibilityRole="button"
              accessibilityLabel={navigationBlock ? navigationBlock.title : 'Start navigation'}
              accessibilityHint={navigationBlock?.message}
              accessibilityState={{ disabled: Boolean(navigationBlock) }}
            >
              <Text style={[styles.goButtonText, navigationBlock && styles.goButtonTextDisabled]}>
                {navigationBlock ? 'Re-plan needed' : 'Go'}
              </Text>
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
                label === 'Avoids Detour' && styles.labelAvoidsDetour,
                (label === 'Likely departed' || label === 'Missed transfer' || label === 'Tight transfer') && styles.labelRisk,
              ]}
            >
              <Text style={[
                styles.labelText,
                label === 'Recommended' && styles.labelTextRecommended,
                label === 'Avoids Detour' && styles.labelTextAvoidsDetour,
                (label === 'Likely departed' || label === 'Missed transfer' || label === 'Tight transfer') && styles.labelTextRisk,
              ]}>
                {label === 'Recommended' ? '⭐ ' : ''}{label}
              </Text>
            </View>
          ))}
          {isTomorrow && (
            <View style={styles.tomorrowBadge}>
              <Text style={styles.tomorrowText}>{TOMORROW_BADGE_TEXT}</Text>
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
        <View style={styles.routeSummaryRow}>
          {routePreviewItems.map((item, index) => (
            <React.Fragment key={item.key}>
              {index > 0 && <View style={styles.connector} />}
              <RoutePreviewItem item={item} />
            </React.Fragment>
          ))}
        </View>
      </View>

      <ChoiceExplanation messages={choiceExplanationMessages} warning={hasChoiceWarning} />

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
            {transferText && (
              <Text style={styles.detailText}>• {transferText}</Text>
            )}
            {!transferText && stayOnBusDisplay && (
              <Text style={styles.detailText}>• {stayOnBusDisplay}</Text>
            )}
            {transferWaitDisplay.text && (
              <Text
                style={[
                  styles.detailText,
                  transferWaitDisplay.tone === 'warning' && styles.transferWaitWarningText,
                  transferWaitDisplay.tone === 'urgent' && styles.transferWaitUrgentText,
                ]}
              >
                • {transferWaitDisplay.text}
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
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    marginHorizontal: SPACING.sm,
    marginBottom: SPACING.xs,
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
    marginBottom: SPACING.xxs,
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
  labelAvoidsDetour: {
    backgroundColor: COLORS.success + '20',
  },
  labelRisk: {
    backgroundColor: COLORS.error + '18',
    borderWidth: 1,
    borderColor: COLORS.error + '35',
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
  labelTextAvoidsDetour: {
    color: COLORS.success,
  },
  labelTextRisk: {
    color: COLORS.error,
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
    gap: SPACING.xxs,
    marginBottom: SPACING.xxs,
  },
  choiceExplanation: {
    backgroundColor: COLORS.grey50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.xs,
    gap: 2,
  },
  choiceExplanationWarning: {
    backgroundColor: COLORS.warningSubtle,
    borderColor: 'rgba(255, 153, 31, 0.35)',
  },
  choiceExplanationText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  choiceExplanationTextWarning: {
    color: COLORS.textPrimary,
    fontWeight: FONT_WEIGHTS.bold,
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
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginTop: SPACING.xxs,
    marginBottom: SPACING.xxs,
    overflow: 'hidden',
  },
  timingBlock: {
    flex: 1,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
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
    fontSize: FONT_SIZES.md,
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
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.textPrimary,
    marginRight: SPACING.sm,
    letterSpacing: -0.3,
  },
  leaveInText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primaryDark,
    backgroundColor: COLORS.primarySubtle,
    borderRadius: BORDER_RADIUS.round,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
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
    marginTop: 0,
  },
  connector: {
    width: 12,
    height: 2,
    backgroundColor: COLORS.grey300,
    marginHorizontal: 2,
  },
  walkIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.grey200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walkIconText: {
    fontSize: 12,
  },
  busIcon: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sameBusIcon: {
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
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
  transferWaitWarningText: {
    color: COLORS.warning,
    fontWeight: FONT_WEIGHTS.bold,
  },
  transferWaitUrgentText: {
    color: COLORS.error,
    fontWeight: FONT_WEIGHTS.bold,
  },
  leavesInSoon: {
    color: COLORS.white,
    backgroundColor: COLORS.success,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stepsButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
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
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
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
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.round,
  },
  goButtonDisabled: {
    backgroundColor: COLORS.grey300,
  },
  goButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  goButtonTextDisabled: {
    color: COLORS.textSecondary,
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
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.xs,
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
  stopClosureNoticeUpcoming: {
    backgroundColor: COLORS.infoSubtle,
    borderColor: COLORS.primarySubtle,
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
  stopClosureNoticeTitleUpcoming: {
    color: COLORS.primaryDark,
  },
  stopClosureNoticeDetail: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xxs,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 2,
  },
});

export default memo(TripResultCard);
