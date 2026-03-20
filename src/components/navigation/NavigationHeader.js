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
import Icon from '../Icon';

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

// Compute ETA from a scheduled arrival timestamp plus optional real-time delay
const computeScheduledETA = (scheduledArrivalTime, delaySeconds = 0) => {
  if (!scheduledArrivalTime) return null;
  const adjustedArrival = scheduledArrivalTime + delaySeconds * 1000;
  const minutesRemaining = Math.max(0, Math.ceil((adjustedArrival - Date.now()) / 60000));
  const time = new Date(adjustedArrival).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { minutes: minutesRemaining, time };
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
  scheduledArrivalTime = null,
  delaySeconds = 0,
  isRealtime = false,
}) => {
  // Get icon based on navigation state type
  const getIcon = () => {
    switch (navigationState?.type) {
      case 'walking':
        return <Icon name="Walk" size={28} color={COLORS.white} />;
      case 'waiting':
        return <Icon name="Hourglass" size={28} color={COLORS.white} />;
      case 'boarding':
        return <Icon name="Bus" size={28} color={COLORS.white} />;
      case 'transit':
        return <Icon name="Bus" size={28} color={COLORS.white} />;
      case 'alighting':
      case 'alighting_soon':
        return <Icon name="Door" size={28} color={COLORS.white} />;
      case 'on_demand':
        return <Icon name="Phone" size={28} color={COLORS.white} />;
      case 'complete':
        return <Icon name="Celebration" size={28} color={COLORS.white} />;
      default:
        return <Icon name="MapPin" size={28} color={COLORS.white} />;
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

  const eta = scheduledArrivalTime
    ? computeScheduledETA(scheduledArrivalTime, delaySeconds)
    : calculateETA(totalDistanceRemaining, currentMode);

  return (
    <View style={[styles.container, { backgroundColor: getBackgroundColor() }]}>
      <View style={styles.content}>
        {/* Close Button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Icon name="X" size={20} color={COLORS.white} />
        </TouchableOpacity>

        {/* Main Content */}
        <View style={styles.mainContent}>
          <View style={styles.instructionContainer}>
            <View style={styles.iconWrapper}>{getIcon()}</View>
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
              <View style={styles.etaTimeRow}>
                <Text style={styles.etaTime}>~{eta.time}</Text>
                {isRealtime && scheduledArrivalTime && (
                  <Text style={styles.liveIndicator}>LIVE</Text>
                )}
              </View>
              <Text style={styles.etaMinutes}>{eta.minutes} min</Text>
            </View>
          )}
        </View>

      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
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
  iconWrapper: {
    marginRight: SPACING.sm,
  },
  icon: {
    fontSize: 28,
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
  etaTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  liveIndicator: {
    color: COLORS.white,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
});

export default NavigationHeader;
