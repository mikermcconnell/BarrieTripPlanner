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

// Large direction arrows for prominent display
const DIRECTION_ARROWS = {
  left: '←',
  right: '→',
  'sharp left': '↰',
  'sharp right': '↱',
  'slight left': '↖',
  'slight right': '↗',
  straight: '↑',
  uturn: '↩',
  depart: '↑',
  arrive: '◉',
};

// Get compass direction from bearing
const getCompassDirection = (bearing) => {
  if (bearing === null || bearing === undefined) return '';
  const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
};

// Map maneuver types/modifiers to arrow display
const getDirectionArrow = (type, modifier) => {
  if (type === 'arrive') return DIRECTION_ARROWS.arrive;
  if (type === 'depart') return DIRECTION_ARROWS.depart;
  return DIRECTION_ARROWS[modifier] || DIRECTION_ARROWS.straight;
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
}) => {
  if (!currentStep) return null;

  const directionArrow = getDirectionArrow(currentStep.type, currentStep.modifier);
  const arrowColor = getArrowColor(currentStep.type, currentStep.modifier);
  const stepDistance = currentStep.distance ? formatDistance(currentStep.distance) : '';
  const formattedInstruction = formatInstruction(currentStep);

  return (
    <View style={styles.container}>
      {/* Main Instruction Row */}
      <View style={styles.mainRow}>
        {/* Large Direction Arrow */}
        <View style={[styles.arrowContainer, { backgroundColor: arrowColor }]}>
          <Text style={styles.directionArrow}>{directionArrow}</Text>
        </View>

        {/* Instruction Details */}
        <View style={styles.instructionDetails}>
          <Text style={styles.instructionText} numberOfLines={2}>
            {formattedInstruction}
          </Text>

          {/* Distance to next action */}
          <View style={styles.distanceRow}>
            <Text style={styles.stepDistance}>
              {stepDistance ? `${stepDistance} to next turn` : 'Starting point'}
            </Text>
          </View>
        </View>

        {/* Next Step Button */}
        {onNextStep && (
          <TouchableOpacity style={styles.nextStepButton} onPress={onNextStep}>
            <Text style={styles.nextStepButtonText}>Next Step</Text>
          </TouchableOpacity>
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
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  directionArrow: {
    fontSize: 36,
    color: COLORS.white,
    fontWeight: '700',
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
  nextStepButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    marginLeft: SPACING.sm,
  },
  nextStepButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
});

export default WalkingInstructionCard;
