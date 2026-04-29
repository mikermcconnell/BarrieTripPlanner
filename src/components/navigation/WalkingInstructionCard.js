/**
 * WalkingInstructionCard Component
 *
 * Displays the active walking instruction with a strong visual hierarchy,
 * clear leg context, and lightweight manual controls as a fallback.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';
import { formatDistance } from '../../services/tripService';
import Icon from '../Icon';
import TurnIcon from './TurnIcon';

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

const WalkingInstructionCard = ({
  currentStep,
  destinationName,
  currentLeg,
  onNextLeg,
  nextLegPreview,
  nextTransitLeg,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const detailSteps = useMemo(
    () => (Array.isArray(currentLeg?.steps) ? currentLeg.steps.filter((step) => step?.instruction) : []),
    [currentLeg?.steps]
  );

  if (!currentLeg && !currentStep) return null;

  const destinationCopy = getDestinationCopy({ currentLeg, destinationName, nextTransitLeg });
  const walkSummary = getWalkSummary(currentLeg);
  const [walkTimeLabel, walkDistanceLabel] = walkSummary.split(' • ');
  const upcomingInstruction = formatUpcomingInstruction(nextLegPreview);
  const hasDetails = detailSteps.length > 0;

  const primaryStep = currentStep || detailSteps[0] || null;
  const arrowColor = getArrowColor(primaryStep?.type, primaryStep?.modifier);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <View style={styles.kickerRow}>
            <Icon name="Walk" size={14} color={COLORS.primaryDark} />
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
        {walkSummary ? (
          <View style={styles.timePill}>
            <Text style={styles.timePillValue}>{walkTimeLabel}</Text>
            {walkDistanceLabel ? (
              <Text style={styles.timePillLabel}>{walkDistanceLabel}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

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

      {showDetails && hasDetails ? (
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
