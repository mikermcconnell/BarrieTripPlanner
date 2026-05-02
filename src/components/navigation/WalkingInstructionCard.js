/**
 * WalkingInstructionCard Component
 *
 * Displays the active walking instruction with a strong visual hierarchy,
 * clear leg context, and lightweight manual controls as a fallback.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';
import { formatDistance } from '../../services/tripService';
import { buildWalkPaceStatus } from '../../utils/walkPaceStatus';
import TurnIcon from './TurnIcon';
import WalkingPaceIcon from './WalkingPaceIcon';

// Get arrow background color based on turn type
const getArrowColor = (type, modifier) => {
  if (type === 'arrive') return COLORS.success;
  if (modifier === 'left' || modifier === 'sharp left') return COLORS.warning;
  if (modifier === 'right' || modifier === 'sharp right') return COLORS.warning;
  if (modifier === 'uturn') return COLORS.error;
  return COLORS.primary;
};

// Format instruction to be more descriptive
const formatInstruction = (step) => {
  if (!step) return '';

  const { type, modifier, name, instruction } = step;

  // If we have a good instruction already, use it
  if (instruction && instruction.length > 0) {
    // But enhance "Head" instructions with compass direction
    if (instruction.toLowerCase().startsWith('head') && name) {
      return instruction;
    }
    return instruction;
  }

  // Build instruction from parts
  if (type === 'depart') {
    return name ? `Head on ${name}` : 'Start walking';
  }
  if (type === 'arrive') {
    return name ? `Arrive at ${name}` : 'Arrive at destination';
  }

  const turnWord = modifier === 'straight' ? 'Continue' : `Turn ${modifier || 'right'}`;
  return name ? `${turnWord} onto ${name}` : turnWord;
};

const formatUpcomingInstruction = (nextLegPreview) => {
  if (!nextLegPreview) return null;
  return nextLegPreview
    .replace(/^then\s+/i, '')
    .replace(/^board route\s+/i, 'Bus ')
    .replace(/^board\s+/i, '')
    .replace(/\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)$/i, ' · $1')
    .trim();
};

const getStopCode = (stop) => stop?.stopCode || stop?.stopId || stop?.code || null;

const getStopName = (stop, fallback = 'your stop') => stop?.name || fallback;

const getDestinationCopy = ({ currentLeg, destinationName, nextTransitLeg }) => {
  const destination = currentLeg?.to || nextTransitLeg?.from || {};
  const stopCode = getStopCode(destination) || getStopCode(nextTransitLeg?.from);
  const stopName = getStopName(destination, destinationName || 'your stop');
  const isBusStop = Boolean(nextTransitLeg || stopCode);

  if (isBusStop) {
    return {
      kicker: 'Walk to bus stop',
      title: stopCode ? `Walk to Stop #${stopCode}` : `Walk to ${stopName}`,
      subtitle: stopCode && stopName ? stopName : null,
      actionLabel: 'I’m at the stop',
    };
  }

  return {
    kicker: 'On foot',
    title: `Walk to ${destinationName || stopName || 'your destination'}`,
    subtitle: null,
    actionLabel: 'I’ve arrived',
  };
};

const getWalkSummary = (currentLeg) => {
  const parts = [];
  if (currentLeg?.duration) {
    parts.push(`${Math.max(1, Math.ceil(currentLeg.duration / 60))} min walk`);
  }
  if (currentLeg?.distance) {
    parts.push(formatDistance(currentLeg.distance));
  }
  return parts.join(' • ');
};

const getInstructionText = (destinationCopy) => (
  destinationCopy.actionLabel === 'I’m at the stop'
    ? 'Follow the walking line on the map to this stop.'
    : 'Follow the walking line on the map to your destination.'
);

const getPacePanelStyle = (level) => {
  switch (level) {
    case 'plenty':
      return styles.pacePanelPlenty;
    case 'on_pace':
      return styles.pacePanelOnPace;
    case 'hurry':
      return styles.pacePanelHurry;
    case 'behind':
      return styles.pacePanelBehind;
    default:
      return null;
  }
};

const getPaceHeadlineStyle = (level) => {
  switch (level) {
    case 'plenty':
      return styles.paceHeadlinePlenty;
    case 'on_pace':
      return styles.paceHeadlineOnPace;
    case 'hurry':
      return styles.paceHeadlineHurry;
    case 'behind':
      return styles.paceHeadlineBehind;
    default:
      return null;
  }
};

const WalkingInstructionCard = ({
  currentStep,
  destinationName,
  currentLeg,
  distanceToDestination,
  onNextLeg,
  nextLegPreview,
  nextTransitLeg,
  nextTransitProximity,
  onFindNextTrip,
  paceStatus: paceStatusProp,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [dismissedBusDepartureWarning, setDismissedBusDepartureWarning] = useState(false);
  const detailSteps = useMemo(
    () => (Array.isArray(currentLeg?.steps) ? currentLeg.steps.filter((step) => step?.instruction) : []),
    [currentLeg?.steps]
  );
  const computedPaceStatus = useMemo(
    () => buildWalkPaceStatus({
      currentLeg,
      distanceToDestination,
      nextTransitLeg,
      nextTransitProximity,
    }),
    [currentLeg, distanceToDestination, nextTransitLeg, nextTransitProximity]
  );
  const paceStatus = paceStatusProp || computedPaceStatus;
  const busDepartureStatus = nextTransitProximity?.boardingBusStatus;

  useEffect(() => {
    if (busDepartureStatus !== 'likely_departed') {
      setDismissedBusDepartureWarning(false);
    }
  }, [busDepartureStatus]);

  if (!currentLeg && !currentStep) return null;

  const destinationCopy = getDestinationCopy({ currentLeg, destinationName, nextTransitLeg });
  const walkSummary = getWalkSummary(currentLeg);
  const [walkTimeLabel, walkDistanceLabel] = walkSummary.split(' • ');
  const upcomingInstruction = formatUpcomingInstruction(nextLegPreview);
  const hasDetails = detailSteps.length > 0;

  const primaryStep = currentStep || detailSteps[0] || null;
  const arrowColor = getArrowColor(primaryStep?.type, primaryStep?.modifier);
  const paceIconLevel = paceStatus?.level || 'on_pace';
  const bufferLabel = paceStatus?.bufferLabel || paceStatus?.headline || null;
  const showBusDepartureWarning = busDepartureStatus === 'likely_departed' && !dismissedBusDepartureWarning;

  const renderBusDepartureWarning = () => (
    <View style={styles.departureWarningPanel} accessibilityLiveRegion="polite">
      <View style={styles.departureWarningCopy}>
        <Text style={styles.departureWarningHeadline}>Bus may have left</Text>
        <Text style={styles.departureWarningDetail}>
          Real-time bus movement suggests it passed this stop.
        </Text>
      </View>
      <View style={styles.departureWarningActions}>
        {onFindNextTrip ? (
          <TouchableOpacity
            style={styles.departurePrimaryButton}
            onPress={onFindNextTrip}
            accessibilityRole="button"
            accessibilityLabel="Find next trip"
          >
            <Text style={styles.departurePrimaryButtonText}>Find next trip</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.departureSecondaryButton}
          onPress={() => setDismissedBusDepartureWarning(true)}
          accessibilityRole="button"
          accessibilityLabel="Keep watching"
        >
          <Text style={styles.departureSecondaryButtonText}>Keep watching</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <View style={styles.kickerRow}>
            <Text style={styles.kickerText}>{destinationCopy.kicker}</Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {destinationCopy.title}
          </Text>
          {destinationCopy.subtitle ? (
            <Text style={styles.destinationSubtitle} numberOfLines={2}>
              {destinationCopy.subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          {walkSummary ? (
            <View style={styles.timePill}>
              <Text style={styles.timePillValue}>{walkTimeLabel}</Text>
              {walkDistanceLabel ? (
                <Text style={styles.timePillLabel}>{walkDistanceLabel}</Text>
              ) : null}
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.minimizeButton}
            onPress={() => setIsMinimized((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={isMinimized ? 'Expand walking instructions' : 'Minimize walking instructions'}
          >
            <Text style={styles.minimizeButtonText}>{isMinimized ? 'Expand' : 'Minimize'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isMinimized && showBusDepartureWarning ? renderBusDepartureWarning() : null}

      {isMinimized && !showBusDepartureWarning ? (
        <View style={styles.minimizedRow}>
          <WalkingPaceIcon level={paceIconLevel} size={28} />
          <View style={styles.minimizedCopy}>
            {bufferLabel ? (
              <Text style={[styles.minimizedBufferText, getPaceHeadlineStyle(paceStatus?.level)]}>
                {bufferLabel}
              </Text>
            ) : null}
            {paceStatus?.detail ? (
              <Text style={styles.minimizedDetailText} numberOfLines={1}>
                {paceStatus.detail}
              </Text>
            ) : (
              <Text style={styles.minimizedDetailText} numberOfLines={1}>
                Tap expand for walking details.
              </Text>
            )}
          </View>
        </View>
      ) : null}

      {!isMinimized && showBusDepartureWarning ? renderBusDepartureWarning() : null}

      {!isMinimized && paceStatus && !showBusDepartureWarning ? (
        <View
          style={[styles.pacePanel, getPacePanelStyle(paceStatus.level)]}
          accessibilityLiveRegion="polite"
        >
          <WalkingPaceIcon level={paceStatus.level} size={52} style={styles.pacePanelIcon} />
          <View style={styles.paceCopy}>
            <View style={styles.paceTitleRow}>
              <Text style={styles.paceEyebrow}>Buffer to bus</Text>
              <Text style={[styles.paceHeadline, getPaceHeadlineStyle(paceStatus.level)]}>
                {paceStatus.headline}
              </Text>
              {paceStatus.isRealtime ? (
                <View style={styles.paceLiveBadge}>
                  <Text style={styles.paceLiveText}>LIVE</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.paceDetail}>{paceStatus.detail}</Text>
          </View>
        </View>
      ) : null}

      {!isMinimized ? (
      <View style={styles.mainRow}>
        <View style={styles.turnBadge}>
          <TurnIcon type={primaryStep?.type || 'depart'} modifier={primaryStep?.modifier} size={36} color={arrowColor} />
        </View>

        <View style={styles.instructionDetails}>
          <Text style={styles.instructionText} numberOfLines={3}>
            {getInstructionText(destinationCopy)}
          </Text>

          {upcomingInstruction ? (
            <View style={styles.upNextPanel}>
              <Text style={styles.upNextLabel}>Up next</Text>
              <Text style={styles.upNextText} numberOfLines={2}>
                {upcomingInstruction}
              </Text>
            </View>
          ) : null}

          <View style={styles.footerRow}>
            {hasDetails ? (
              <TouchableOpacity
                style={styles.detailsButton}
                onPress={() => setShowDetails((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel={showDetails ? 'Hide walking details' : 'Show walking details'}
              >
                <Text style={styles.detailsButtonText}>
                  {showDetails ? 'Hide details' : 'Walking details'}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.manualAdvanceButton, styles.primaryAdvanceButton]}
              onPress={onNextLeg}
              accessibilityRole="button"
              accessibilityLabel={destinationCopy.actionLabel}
            >
              <Text style={[styles.manualAdvanceButtonText, styles.primaryAdvanceButtonText]}>
                {destinationCopy.actionLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      ) : null}

      {!isMinimized && showDetails && hasDetails ? (
        <View style={styles.detailsPanel}>
          {detailSteps.map((step, index) => (
            <View key={`${step.instruction}-${index}`} style={styles.detailRow}>
              <View style={styles.detailDot} />
              <Text style={styles.detailText}>
                {formatInstruction(step)}
                {step.distance ? ` • ${formatDistance(step.distance)}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xxl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(23, 43, 77, 0.06)',
    ...SHADOWS.large,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  headerContent: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  kickerText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    lineHeight: 24,
  },
  destinationSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: SPACING.xxs,
  },
  timePill: {
    minWidth: 58,
    flexShrink: 0,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primarySubtle,
    alignItems: 'center',
  },
  timePillValue: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  timePillLabel: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headerActions: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  minimizeButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.grey100,
  },
  minimizeButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
  },
  minimizedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.grey50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  minimizedCopy: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  minimizedBufferText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '900',
  },
  minimizedDetailText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    marginTop: 1,
  },
  departureWarningPanel: {
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.errorSubtle,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  departureWarningCopy: {
    marginBottom: SPACING.sm,
  },
  departureWarningHeadline: {
    color: COLORS.error,
    fontSize: FONT_SIZES.md,
    fontWeight: '900',
  },
  departureWarningDetail: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 2,
  },
  departureWarningActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  departurePrimaryButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.error,
  },
  departurePrimaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: '900',
  },
  departureSecondaryButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  departureSecondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
  },
  pacePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  pacePanelPlenty: {
    backgroundColor: COLORS.successSubtle,
    borderColor: COLORS.success,
  },
  pacePanelOnPace: {
    backgroundColor: COLORS.infoSubtle,
    borderColor: COLORS.info,
  },
  pacePanelHurry: {
    backgroundColor: COLORS.warningSubtle,
    borderColor: COLORS.warning,
  },
  pacePanelBehind: {
    backgroundColor: COLORS.errorSubtle,
    borderColor: COLORS.error,
  },
  paceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  paceEyebrow: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xxs,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pacePanelIcon: {
    marginRight: SPACING.sm,
  },
  paceCopy: {
    flex: 1,
  },
  paceHeadline: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
  },
  paceHeadlinePlenty: {
    color: COLORS.ctaGreen,
  },
  paceHeadlineOnPace: {
    color: COLORS.info,
  },
  paceHeadlineHurry: {
    color: COLORS.accentDark,
  },
  paceHeadlineBehind: {
    color: COLORS.error,
  },
  paceDetail: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 2,
  },
  paceLiveBadge: {
    backgroundColor: COLORS.ctaGreen,
    borderRadius: BORDER_RADIUS.xs,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  paceLiveText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  turnBadge: {
    width: 50,
    height: 50,
    borderRadius: 15,
    marginRight: SPACING.md,
    backgroundColor: COLORS.grey50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionDetails: {
    flex: 1,
  },
  instructionText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  upNextPanel: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.grey50,
  },
  upNextLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  upNextText: {
    marginTop: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  detailsButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
  },
  detailsButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  manualAdvanceButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  primaryAdvanceButton: {
    backgroundColor: COLORS.primary,
  },
  manualAdvanceButtonText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
  },
  primaryAdvanceButtonText: {
    color: COLORS.white,
  },
  detailsPanel: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.grey200,
    gap: SPACING.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.grey400,
    marginTop: 7,
    marginRight: SPACING.sm,
  },
  detailText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});

export default WalkingInstructionCard;
