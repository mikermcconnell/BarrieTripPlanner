/**
 * WalkingInstructionCard Component
 *
 * Displays turn-by-turn walking instructions with:
 * - Large prominent direction arrow
 * - Current instruction with street name context
 * - Distance to next turn
 * - ETA display
 * - Preview of next instruction with street name
 * - Pace indicator when walking to catch a bus
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';
import { formatDistance, formatMinutes } from '../../services/tripService';

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

// Calculate ETA based on distance and walking speed
const calculateETA = (distanceMeters) => {
  if (!distanceMeters || distanceMeters <= 0) return null;

  // Average walking speed: 5 km/h = 83.3 m/min
  const walkingSpeedMpm = 83.3;
  const minutesRemaining = Math.ceil(distanceMeters / walkingSpeedMpm);

  const now = new Date();
  const eta = new Date(now.getTime() + minutesRemaining * 60000);

  return {
    minutes: minutesRemaining,
    time: eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    timestamp: eta.getTime(),
  };
};

// Calculate pace status when walking to catch transit
const calculatePaceStatus = (distanceRemaining, nextLegDepartureTime) => {
  if (!distanceRemaining || !nextLegDepartureTime) return null;

  const now = Date.now();
  const timeUntilBus = (nextLegDepartureTime - now) / 60000; // minutes until bus

  // Walking speed: 5 km/h = 83.3 m/min
  const walkingSpeedMpm = 83.3;
  const walkingTimeNeeded = distanceRemaining / walkingSpeedMpm;

  // Add 1 minute buffer for safety
  const timeNeededWithBuffer = walkingTimeNeeded + 1;

  const timeDifference = timeUntilBus - timeNeededWithBuffer;

  if (timeUntilBus <= 0) {
    return { status: 'missed', message: 'Bus may have departed', color: COLORS.error };
  } else if (timeDifference < -2) {
    return { status: 'late', message: 'Hurry! You might miss the bus', color: COLORS.error };
  } else if (timeDifference < 0) {
    return { status: 'rushing', message: 'Pick up the pace', color: COLORS.warning };
  } else if (timeDifference < 3) {
    return { status: 'ontime', message: 'On track', color: COLORS.success };
  } else {
    return { status: 'early', message: `${formatMinutes(Math.floor(timeDifference))} buffer`, color: COLORS.success };
  }
};

const WalkingInstructionCard = ({
  currentStep,
  nextStep,
  distanceRemaining,
  totalLegDistance,
  // New props for pace tracking
  nextTransitLeg = null, // The next transit leg (if walking to a bus stop)
}) => {
  if (!currentStep) return null;

  const directionArrow = getDirectionArrow(currentStep.type, currentStep.modifier);
  const arrowColor = getArrowColor(currentStep.type, currentStep.modifier);
  const stepDistance = currentStep.distance ? formatDistance(currentStep.distance) : '';
  const formattedInstruction = formatInstruction(currentStep);
  const eta = calculateETA(distanceRemaining);

  // Calculate pace status if walking to catch a bus
  // Use the same distance logic as busDepartureInfo for consistency
  const paceStatus = useMemo(() => {
    if (!nextTransitLeg) return null;
    const departureTime = nextTransitLeg.startTime;

    // Use same distance estimation logic as busDepartureInfo
    let walkingDistance = totalLegDistance || distanceRemaining || 0;
    if (totalLegDistance > 0 && distanceRemaining !== null && distanceRemaining < totalLegDistance) {
      walkingDistance = distanceRemaining;
    } else if (totalLegDistance > 0) {
      walkingDistance = totalLegDistance;
    }

    return calculatePaceStatus(walkingDistance, departureTime);
  }, [nextTransitLeg, distanceRemaining, totalLegDistance]);

  // Format bus departure time and walking time
  const busDepartureInfo = useMemo(() => {
    if (!nextTransitLeg) return null;
    const departureTime = new Date(nextTransitLeg.startTime);
    const now = new Date();
    const minutesUntil = Math.max(0, Math.ceil((departureTime - now) / 60000));

    // Calculate walking time based on distance (5 km/h = 83.3 m/min)
    // Use totalLegDistance (the planned route distance) for more accurate time estimate
    // distanceRemaining is straight-line distance which can be misleading
    const walkingSpeedMpm = 83.3;

    // Prefer totalLegDistance (actual walking route) over distanceRemaining (straight-line)
    // If we have both, estimate remaining route distance based on progress
    let walkingDistance = totalLegDistance || distanceRemaining || 0;

    // If we have both distances, estimate remaining route distance
    // by using the ratio of straight-line remaining to total straight-line distance
    if (totalLegDistance > 0 && distanceRemaining !== null && distanceRemaining < totalLegDistance) {
      // User has made progress - estimate remaining based on straight-line progress ratio
      // This is approximate but better than using raw straight-line distance
      walkingDistance = distanceRemaining;
    } else if (totalLegDistance > 0) {
      // User hasn't started or just started - use planned route distance
      walkingDistance = totalLegDistance;
    }

    const walkingMinutes = walkingDistance ? Math.ceil(walkingDistance / walkingSpeedMpm) : 0;

    return {
      time: departureTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      minutesUntil,
      walkingMinutes,
      routeName: nextTransitLeg.route?.shortName || 'Bus',
      isRealtime: nextTransitLeg.isRealtime || false,
    };
  }, [nextTransitLeg, distanceRemaining, totalLegDistance]);

  // Format next step instruction with street name
  const formatNextInstruction = () => {
    if (!nextStep) return '';
    const nextArrow = getDirectionArrow(nextStep.type, nextStep.modifier);
    let text = nextStep.instruction || `Turn ${nextStep.modifier || 'right'}`;
    if (nextStep.name && !text.includes(nextStep.name)) {
      text += ` onto ${nextStep.name}`;
    }
    return text;
  };

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

        {/* ETA Badge */}
        {eta && (
          <View style={styles.etaContainer}>
            <Text style={styles.etaTime}>{eta.time}</Text>
            <Text style={styles.etaLabel}>{formatMinutes(eta.minutes)}</Text>
          </View>
        )}
      </View>

      {/* Bus Catch Indicator - shows when walking to catch a bus */}
      {busDepartureInfo && (
        <View style={[styles.busCatchContainer, paceStatus && { borderLeftColor: paceStatus.color }]}>
          {/* Header with bus info */}
          <View style={styles.busCatchHeader}>
            <Text style={styles.busIcon}>🚌</Text>
            <Text style={styles.busCatchLabel}>CATCH BUS {busDepartureInfo.routeName}</Text>
            {busDepartureInfo.isRealtime && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            )}
          </View>

          {/* Time comparison row */}
          <View style={styles.timeComparisonRow}>
            {/* Walking time */}
            <View style={styles.timeBlock}>
              <Text style={styles.timeBlockIcon}>🚶</Text>
              <View>
                <Text style={styles.timeBlockValue}>{formatMinutes(busDepartureInfo.walkingMinutes)}</Text>
                <Text style={styles.timeBlockLabel}>walk to stop</Text>
              </View>
            </View>

            {/* Divider with status */}
            <View style={[styles.timeDivider, { backgroundColor: paceStatus?.color || COLORS.grey300 }]}>
              <Text style={styles.timeDividerText}>
                {paceStatus?.status === 'late' || paceStatus?.status === 'rushing' ? '⚠️' : '✓'}
              </Text>
            </View>

            {/* Bus departure */}
            <View style={styles.timeBlock}>
              <Text style={styles.timeBlockIcon}>🕐</Text>
              <View>
                <Text style={styles.timeBlockValue}>{formatMinutes(busDepartureInfo.minutesUntil)}</Text>
                <Text style={styles.timeBlockLabel}>until departure</Text>
              </View>
            </View>
          </View>

          {/* Departure time */}
          <Text style={styles.departureTimeSmall}>
            Bus departs at {busDepartureInfo.time}
          </Text>

          {/* Pace status message */}
          {paceStatus && (
            <View style={[styles.paceIndicator, { backgroundColor: paceStatus.color + '20' }]}>
              <View style={[styles.paceIndicatorDot, { backgroundColor: paceStatus.color }]} />
              <Text style={[styles.paceIndicatorText, { color: paceStatus.color }]}>
                {paceStatus.message}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Next Instruction Preview */}
      {nextStep && (
        <View style={styles.nextInstruction}>
          <View style={styles.nextIconContainer}>
            <Text style={styles.nextIcon}>
              {getDirectionArrow(nextStep.type, nextStep.modifier)}
            </Text>
          </View>
          <View style={styles.nextTextContainer}>
            <Text style={styles.nextLabel}>THEN</Text>
            <Text style={styles.nextText} numberOfLines={1}>
              {formatNextInstruction()}
            </Text>
          </View>
          {nextStep.distance && (
            <Text style={styles.nextDistance}>
              {formatDistance(nextStep.distance)}
            </Text>
          )}
        </View>
      )}

      {/* Progress indicator */}
      {distanceRemaining !== null && totalLegDistance > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressInfo}>
            <Text style={styles.progressLabel}>Trip Progress</Text>
            <Text style={styles.remainingText}>
              {formatDistance(distanceRemaining)} remaining
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.max(0, Math.min(100, ((totalLegDistance - distanceRemaining) / totalLegDistance) * 100))}%`,
                },
              ]}
            />
          </View>
        </View>
      )}
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
  etaContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.grey100,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: SPACING.sm,
  },
  etaTime: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  etaLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // Bus catch indicator styles
  busCatchContainer: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.primarySubtle || '#E3F2FD',
    borderRadius: BORDER_RADIUS.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  busCatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  busIcon: {
    fontSize: 20,
    marginRight: SPACING.xs,
  },
  busCatchLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
    flex: 1,
  },
  liveBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.white,
  },
  timeComparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
  },
  timeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timeBlockIcon: {
    fontSize: 20,
    marginRight: SPACING.xs,
  },
  timeBlockValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  timeBlockLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  timeDivider: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: SPACING.sm,
  },
  timeDividerText: {
    fontSize: 14,
  },
  departureTimeSmall: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  paceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  paceIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.xs,
  },
  paceIndicatorText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  nextInstruction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.grey50 || '#FAFAFA',
    marginHorizontal: -SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    marginBottom: -SPACING.md,
    borderBottomLeftRadius: BORDER_RADIUS.lg,
    borderBottomRightRadius: BORDER_RADIUS.lg,
  },
  nextIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.grey200,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  nextIcon: {
    fontSize: 18,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  nextTextContainer: {
    flex: 1,
  },
  nextLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textTertiary || COLORS.grey500,
    letterSpacing: 0.5,
  },
  nextText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  nextDistance: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary || COLORS.grey500,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  progressLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary || COLORS.grey500,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.grey200,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  remainingText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});

export default WalkingInstructionCard;
