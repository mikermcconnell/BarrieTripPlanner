/**
 * NavigationHeader Component
 *
 * Displays navigation status at the top of the screen with:
 * - Destination name (not current instruction - that's in the card)
 * - ETA and time remaining
 * - Step counter and close button
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';

// Calculate ETA based on distance and mode
const calculateETA = (distanceMeters, mode = 'WALK') => {
  if (!distanceMeters || distanceMeters <= 0) return null;

  // Speed in meters per minute
  const speeds = {
    WALK: 83.3,    // 5 km/h
    BUS: 333.3,    // 20 km/h average with stops
    TRANSIT: 333.3,
    ON_DEMAND: 416.7, // 25 km/h average
  };

  const speedMpm = speeds[mode] || speeds.WALK;
  const minutesRemaining = Math.ceil(distanceMeters / speedMpm);

  const now = new Date();
  const eta = new Date(now.getTime() + minutesRemaining * 60000);

  return {
    minutes: minutesRemaining,
    time: eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  };
};

const NavigationHeader = ({
  instruction,
  navigationState,
  currentLegIndex,
  totalLegs,
  onClose,
  destinationName,
  totalDistanceRemaining,
  currentMode = 'WALK',
}) => {
  // Get icon based on navigation state type
  const getIcon = () => {
    switch (navigationState?.type) {
      case 'walking':
        return '🚶';
      case 'waiting':
        return '⏳';
      case 'boarding':
        return '🚌';
      case 'transit':
        return '🚌';
      case 'alighting':
      case 'alighting_soon':
        return '🚪';
      case 'on_demand':
        return '📞';
      case 'complete':
        return '🎉';
      default:
        return '📍';
    }
  };

  // Get background color based on state
  const getBackgroundColor = () => {
    switch (navigationState?.type) {
      case 'walking':
        return COLORS.primary;
      case 'waiting':
        return COLORS.warning;
      case 'boarding':
        return COLORS.success;
      case 'transit':
        return COLORS.secondary;
      case 'alighting':
        return COLORS.error;
      case 'alighting_soon':
        return COLORS.warning;
      case 'on_demand':
        return COLORS.secondary;
      case 'complete':
        return COLORS.success;
      default:
        return COLORS.primary;
    }
  };

  // Get header label (what stage of the trip)
  const getHeaderLabel = () => {
    switch (navigationState?.type) {
      case 'walking':
        return 'WALKING TO';
      case 'waiting':
        return 'WAITING AT';
      case 'boarding':
        return 'BOARDING';
      case 'transit':
        return 'RIDING TO';
      case 'alighting':
        return 'GET OFF AT';
      case 'alighting_soon':
        return 'NEXT STOP';
      case 'on_demand':
        return 'ON-DEMAND RIDE TO';
      case 'complete':
        return 'ARRIVED AT';
      default:
        return 'HEADING TO';
    }
  };

  const eta = calculateETA(totalDistanceRemaining, currentMode);

  return (
    <View style={[styles.container, { backgroundColor: getBackgroundColor() }]}>
      <View style={styles.content}>
        {/* Close Button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>

        {/* Main Content */}
        <View style={styles.mainContent}>
          <View style={styles.instructionContainer}>
            <Text style={styles.icon}>{getIcon()}</Text>
            <View style={styles.textContainer}>
              <Text style={styles.stateLabel}>{getHeaderLabel()}</Text>
              <Text style={styles.destination} numberOfLines={1}>
                {destinationName || navigationState?.label || 'Destination'}
              </Text>
            </View>
          </View>

          {/* ETA Display */}
          {eta && (
            <View style={styles.etaContainer}>
              <Text style={styles.etaTime}>{eta.time}</Text>
              <Text style={styles.etaMinutes}>{eta.minutes} min</Text>
            </View>
          )}
        </View>

        {/* Step Counter */}
        <View style={styles.stepCounter}>
          <Text style={styles.stepCounterText}>
            {currentLegIndex + 1}/{totalLegs}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 50,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.medium,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  closeButtonText: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 26,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instructionContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 28,
    marginRight: SPACING.sm,
  },
  textContainer: {
    flex: 1,
  },
  stateLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  destination: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    marginTop: 2,
  },
  etaContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: SPACING.sm,
  },
  etaTime: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  etaMinutes: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '600',
  },
  stepCounter: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
    marginLeft: SPACING.sm,
  },
  stepCounterText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
});

export default NavigationHeader;
