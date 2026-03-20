/**
 * WalkingInstructionCard Component
 *
 * Displays the active walking instruction with a strong visual hierarchy,
 * clear leg context, and lightweight manual controls as a fallback.
 */
import React from 'react';
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

const formatHeaderTitle = (destinationName, streetName, isLastStep) => {
  if (isLastStep && destinationName) {
    return `Walk to ${destinationName}`;
  }
  if (destinationName) {
    return `Walk to ${destinationName}`;
  }
  if (streetName) {
    return `Walk via ${streetName}`;
  }
  return 'Walk to the next stop';
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

const WalkingInstructionCard = ({
  currentStep,
  onNextStep,
  destinationName,
  currentLeg,
  onNextLeg,
  isLastStep,
  currentStepIndex,
  totalSteps,
  nextLegPreview,
}) => {
  if (!currentStep) return null;

  const walkTimeMinutes = currentLeg?.duration ? Math.max(1, Math.ceil(currentLeg.duration / 60)) : null;

  const arrowColor = getArrowColor(currentStep.type, currentStep.modifier);
  const stepDistance = currentStep.distance ? formatDistance(currentStep.distance) : '';
  const stepMinutes = currentStep.duration ? Math.ceil(currentStep.duration / 60) : null;
  const formattedInstruction = formatInstruction(currentStep);

  const streetName = currentStep.name && currentStep.name.trim().length > 0
    ? currentStep.name
    : null;
  const headerTitle = formatHeaderTitle(destinationName, streetName, isLastStep);
  const upcomingInstruction = formatUpcomingInstruction(nextLegPreview);

  const manualAdvanceLabel = isLastStep ? 'At stop' : 'Next';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <View style={styles.kickerRow}>
            <Icon name="Walk" size={14} color={COLORS.primaryDark} />
            <Text style={styles.kickerText}>On foot</Text>
          </View>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {headerTitle}
          </Text>
        </View>
        {walkTimeMinutes != null && (
          <View style={styles.timePill}>
            <Text style={styles.timePillValue}>{walkTimeMinutes} min</Text>
            <Text style={styles.timePillLabel}>walk</Text>
          </View>
        )}
      </View>

      <View style={styles.mainRow}>
        <View style={styles.turnBadge}>
          <TurnIcon type={currentStep.type} modifier={currentStep.modifier} size={36} color={arrowColor} />
        </View>

        <View style={styles.instructionDetails}>
          <Text style={styles.instructionText} numberOfLines={3}>
            {formattedInstruction}
          </Text>

          <View style={styles.metaRow}>
            {stepDistance ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{stepDistance}</Text>
              </View>
            ) : null}
            {stepMinutes != null ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{stepMinutes} min</Text>
              </View>
            ) : null}
            {totalSteps > 1 && currentStepIndex != null ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>Step {currentStepIndex + 1} of {totalSteps}</Text>
              </View>
            ) : null}
          </View>

          {upcomingInstruction ? (
            <View style={styles.upNextPanel}>
              <Text style={styles.upNextLabel}>Up next</Text>
              <Text style={styles.upNextText} numberOfLines={1}>
                {upcomingInstruction}
              </Text>
            </View>
          ) : null}

          <View style={styles.footerRow}>
            {isLastStep ? (
              <TouchableOpacity
                style={[styles.manualAdvanceButton, styles.primaryAdvanceButton]}
                onPress={onNextLeg}
                accessibilityRole="button"
              >
                <Text style={[styles.manualAdvanceButtonText, styles.primaryAdvanceButtonText]}>
                  {manualAdvanceLabel}
                </Text>
              </TouchableOpacity>
            ) : (
              onNextStep && (
                <TouchableOpacity
                  style={styles.manualAdvanceButton}
                  onPress={onNextStep}
                  accessibilityRole="button"
                >
                  <Text style={styles.manualAdvanceButtonText}>{manualAdvanceLabel}</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      </View>
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
  timePill: {
    minWidth: 58,
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  metaChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.grey100,
  },
  metaChipText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.grey800,
    fontWeight: '600',
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
    marginTop: SPACING.sm,
  },
  manualAdvanceButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
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
});

export default WalkingInstructionCard;
