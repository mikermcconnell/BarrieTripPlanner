/**
 * WalkingInstructionCard Component
 *
 * Displays turn-by-turn walking instructions with:
 * - Large prominent direction arrow
 * - Current instruction with street name context
 * - Distance to next turn
 * - Next Step button to advance to the next trip leg
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';
import { formatDistance } from '../../services/tripService';
import Icon from '../Icon';
import TurnIcon from './TurnIcon';

// Get compass direction from bearing
const getCompassDirection = (bearing) => {
  if (bearing === null || bearing === undefined) return '';
  const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
};

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

  const walkTimeMinutes = currentLeg?.duration ? Math.round(currentLeg.duration / 60) : null;

  const arrowColor = getArrowColor(currentStep.type, currentStep.modifier);
  const stepDistance = currentStep.distance ? formatDistance(currentStep.distance) : '';
  const stepMinutes = currentStep.duration ? Math.ceil(currentStep.duration / 60) : null;
  const formattedInstruction = formatInstruction(currentStep);

  // Street name: use currentStep.name if present and non-empty, else fall back to destinationName
  const streetName = currentStep.name && currentStep.name.trim().length > 0
    ? currentStep.name
    : null;

  // Time + distance label
  let timeDistanceLabel = '';
  if (stepMinutes != null && stepDistance) {
    timeDistanceLabel = `${stepMinutes} min · ${stepDistance}`;
  } else if (stepDistance) {
    timeDistanceLabel = `${stepDistance} to next turn`;
  } else {
    timeDistanceLabel = 'Starting point';
  }

  return (
    <View style={styles.container}>
      {/* Destination / Street Name Header */}
      <View style={styles.destinationHeader}>
        <Icon name="MapPin" size={14} color={COLORS.primary} />
        <Text style={styles.destinationText} numberOfLines={1}>
          {streetName || destinationName || ''}
        </Text>
        {walkTimeMinutes != null && (
          <Text style={styles.departureText}>{walkTimeMinutes} min walk</Text>
        )}
      </View>

      {/* Main Instruction Row */}
      <View style={styles.mainRow}>
        {/* Large Direction Arrow */}
        <View style={styles.arrowContainer}>
          <TurnIcon type={currentStep.type} modifier={currentStep.modifier} size={40} color={arrowColor} />
        </View>

        {/* Instruction Details */}
        <View style={styles.instructionDetails}>
          <Text style={styles.instructionText} numberOfLines={2}>
            {formattedInstruction}
          </Text>

          {/* Time + Distance per step */}
          <View style={styles.distanceRow}>
            <Text style={styles.stepDistance}>
              {timeDistanceLabel}
            </Text>
          </View>

          {/* Step counter */}
          {totalSteps > 1 && currentStepIndex != null && (
            <Text style={styles.stepCounter}>
              Step {currentStepIndex + 1} of {totalSteps}
            </Text>
          )}

          {/* Peek-ahead preview */}
          {nextLegPreview != null && (
            <Text style={styles.peekAheadText} numberOfLines={2}>
              {nextLegPreview}
            </Text>
          )}
        </View>

        {/* Next Step / Done Walking Button */}
        {isLastStep ? (
          <TouchableOpacity style={styles.nextLegBtn} onPress={onNextLeg} accessibilityRole="button">
            <Text style={styles.nextLegBtnText}>Done Walking</Text>
            <Icon name="Bus" size={16} color={COLORS.white} />
          </TouchableOpacity>
        ) : (
          onNextStep && (
            <TouchableOpacity style={styles.nextStepButton} onPress={onNextStep} accessibilityRole="button">
              <Text style={styles.nextStepButtonText}>Next Step</Text>
              <Text style={{ fontSize: 16, color: COLORS.primary }}>›</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    ...SHADOWS.medium,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowContainer: {
    marginRight: SPACING.md,
  },
  instructionDetails: {
    flex: 1,
  },
  instructionText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  stepDistance: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  stepCounter: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  peekAheadText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  nextStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    marginLeft: SPACING.sm,
    gap: 4,
  },
  nextStepButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  nextLegBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    marginLeft: SPACING.sm,
  },
  nextLegBtnText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 14,
  },
  destinationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 6,
  },
  destinationText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
  },
  departureText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
});

export default WalkingInstructionCard;
