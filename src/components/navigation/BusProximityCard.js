/**
 * BusProximityCard Component
 *
 * Shows live bus tracking information:
 * - While waiting: "Your bus is X stops away"
 * - When arrived: "Board now!" with button
 * - While riding: "X stops until [destination]"
 * - Near stop: "Your stop is next!"
 * - At stop: "Get off now!"
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from '../../config/theme';
import { formatMinutes } from '../../services/tripService';

const BusProximityCard = ({
  routeShortName,
  routeColor,
  stopsAway,
  estimatedArrival,
  isApproaching,
  hasArrived,
  isTracking,
  headsign,
  // New props for on-board state
  isOnBoard = false,
  stopsUntilAlighting = null,
  nearAlightingStop = false,
  shouldGetOff = false,
  onBoardBus,
  onAlightBus,
  alightingStopName,
  // Scheduled departure time props
  scheduledDeparture = null, // timestamp in ms
  isRealtime = false,
  delaySeconds = 0,
}) => {
  // Format scheduled departure time
  const formatDepartureTime = () => {
    if (!scheduledDeparture) return null;
    const time = new Date(scheduledDeparture);
    return time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // Calculate minutes until scheduled departure
  const getMinutesUntilDeparture = () => {
    if (!scheduledDeparture) return null;
    const now = Date.now();
    const minutes = Math.ceil((scheduledDeparture - now) / 60000);
    return Math.max(0, minutes);
  };

  const departureTime = formatDepartureTime();
  const minutesUntilDeparture = getMinutesUntilDeparture();
  // Animation for pulsing effect when bus is arriving
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulse when bus arriving, should board, or should get off
    const shouldPulse = hasArrived || isApproaching || shouldGetOff || nearAlightingStop;

    if (shouldPulse) {
      // Faster pulsing for urgent states
      const duration = shouldGetOff ? 300 : 500;
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: shouldGetOff ? 1.08 : 1.05,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [hasArrived, isApproaching, shouldGetOff, nearAlightingStop, pulseAnim]);

  // Format ETA
  const formatETA = () => {
    if (!estimatedArrival) return null;
    const now = new Date();
    const diff = Math.max(0, Math.floor((estimatedArrival - now) / 60000));
    if (diff === 0) return 'Now';
    return formatMinutes(diff);
  };

  // Get status message
  const getStatusMessage = () => {
    // On-board states
    if (isOnBoard) {
      if (shouldGetOff) return 'Get off now!';
      if (nearAlightingStop) return 'Your stop is next!';
      if (stopsUntilAlighting !== null) {
        if (stopsUntilAlighting === 0) return 'Arriving at your stop';
        if (stopsUntilAlighting === 1) return '1 stop remaining';
        return `${stopsUntilAlighting} stops remaining`;
      }
      return `Riding to ${alightingStopName || 'destination'}`;
    }

    // Waiting states
    if (hasArrived) return 'Bus is here!';
    if (stopsAway === 1) return 'Next stop';
    if (stopsAway !== null && stopsAway > 0) return `${stopsAway} stops away`;
    if (!isTracking) return 'Tracking unavailable';
    return 'Locating bus...';
  };

  // Determine card style based on state
  const cardStyle = [
    styles.container,
    // On-board styles
    isOnBoard && shouldGetOff && styles.containerUrgent,
    isOnBoard && nearAlightingStop && !shouldGetOff && styles.containerWarning,
    isOnBoard && !nearAlightingStop && !shouldGetOff && styles.containerOnBoard,
    // Waiting styles
    !isOnBoard && hasArrived && styles.containerArrived,
    !isOnBoard && isApproaching && !hasArrived && styles.containerApproaching,
  ];

  // Determine header text based on state
  const getHeaderText = () => {
    if (isOnBoard) {
      if (shouldGetOff) return 'Exit now!';
      if (nearAlightingStop) return 'Prepare to exit';
      return 'On board';
    }
    if (hasArrived) return 'Board now!';
    return 'Waiting for';
  };

  // Get icon based on state
  const getIcon = () => {
    if (isOnBoard && shouldGetOff) return '🚪';
    if (isOnBoard) return '🚌';
    return '🚌';
  };

  // Get status text style
  const getStatusTextStyle = () => {
    if (isOnBoard) {
      if (shouldGetOff) return styles.statusTextUrgent;
      if (nearAlightingStop) return styles.statusTextWarning;
      return styles.statusTextOnBoard;
    }
    if (hasArrived) return styles.statusTextArrived;
    if (isApproaching) return styles.statusTextApproaching;
    return null;
  };

  return (
    <Animated.View style={[cardStyle, { transform: [{ scale: pulseAnim }] }]}>
      {/* Route Badge */}
      <View style={styles.header}>
        <View style={[styles.routeBadge, { backgroundColor: routeColor || COLORS.primary }]}>
          <Text style={styles.routeText}>{routeShortName || '?'}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={[
            styles.waitingText,
            isOnBoard && shouldGetOff && styles.waitingTextUrgent,
          ]}>
            {getHeaderText()}
          </Text>
          <Text style={styles.headsign} numberOfLines={1}>
            {isOnBoard ? `To ${alightingStopName || 'destination'}` : (headsign || `Route ${routeShortName}`)}
          </Text>
        </View>
      </View>

      {/* Proximity Indicator */}
      <View style={styles.proximitySection}>
        {/* Bus Icon with animation */}
        <View style={[
          styles.busIconContainer,
          isOnBoard && shouldGetOff && styles.busIconContainerUrgent,
          isOnBoard && nearAlightingStop && !shouldGetOff && styles.busIconContainerWarning,
        ]}>
          <Text style={styles.busIcon}>{getIcon()}</Text>
          {(hasArrived && !isOnBoard) && (
            <View style={styles.arrivedBadge}>
              <Text style={styles.arrivedBadgeText}>!</Text>
            </View>
          )}
          {shouldGetOff && (
            <View style={styles.urgentBadge}>
              <Text style={styles.arrivedBadgeText}>!</Text>
            </View>
          )}
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <Text style={[styles.statusText, getStatusTextStyle()]}>
            {getStatusMessage()}
          </Text>

          {/* ETA for waiting state */}
          {!isOnBoard && !hasArrived && estimatedArrival && (
            <Text style={styles.etaText}>
              ETA: {formatETA()}
            </Text>
          )}

          {/* Destination name when on board */}
          {isOnBoard && !shouldGetOff && !nearAlightingStop && alightingStopName && (
            <Text style={styles.destinationText} numberOfLines={1}>
              {alightingStopName}
            </Text>
          )}
        </View>
      </View>

      {/* Scheduled Departure Time - for waiting state */}
      {!isOnBoard && departureTime && (
        <View style={styles.departureTimeContainer}>
          <View style={styles.departureTimeRow}>
            <Text style={styles.departureTimeLabel}>Scheduled departure</Text>
            <View style={styles.departureTimeBadge}>
              <Text style={styles.departureTimeText}>{departureTime}</Text>
              {isRealtime && (
                <View style={styles.realtimeIndicator}>
                  <Text style={styles.realtimeText}>LIVE</Text>
                </View>
              )}
            </View>
          </View>
          {minutesUntilDeparture !== null && (
            <View style={styles.countdownRow}>
              <Text style={styles.countdownText}>
                {minutesUntilDeparture === 0 ? 'Departing now' : `${formatMinutes(minutesUntilDeparture)} until departure`}
              </Text>
              {delaySeconds > 0 && (
                <Text style={styles.delayText}>+{formatMinutes(Math.ceil(delaySeconds / 60))} late</Text>
              )}
              {delaySeconds < 0 && (
                <Text style={styles.earlyText}>{formatMinutes(Math.abs(Math.ceil(delaySeconds / 60)))} early</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Stops visualization - for waiting */}
      {!isOnBoard && stopsAway !== null && stopsAway > 0 && stopsAway <= 5 && (
        <View style={styles.stopsVisualization}>
          {Array.from({ length: Math.min(stopsAway, 5) }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.stopDot,
                index === 0 && styles.stopDotFirst,
              ]}
            />
          ))}
          <View style={[styles.stopDot, styles.stopDotCurrent]} />
        </View>
      )}

      {/* Stops visualization - for on board */}
      {isOnBoard && stopsUntilAlighting !== null && stopsUntilAlighting > 0 && stopsUntilAlighting <= 5 && (
        <View style={styles.stopsVisualization}>
          <View style={[styles.stopDot, styles.stopDotOnBoard]} />
          {Array.from({ length: Math.min(stopsUntilAlighting, 5) }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.stopDot,
                index === stopsUntilAlighting - 1 && styles.stopDotDestination,
              ]}
            />
          ))}
        </View>
      )}

      {/* Board Bus Button */}
      {!isOnBoard && hasArrived && onBoardBus && (
        <TouchableOpacity style={styles.boardButton} onPress={onBoardBus}>
          <Text style={styles.boardButtonText}>I'm on the bus</Text>
        </TouchableOpacity>
      )}

      {/* Get Off Button */}
      {isOnBoard && shouldGetOff && onAlightBus && (
        <TouchableOpacity style={styles.alightButton} onPress={onAlightBus}>
          <Text style={styles.alightButtonText}>I've exited</Text>
        </TouchableOpacity>
      )}

      {/* No tracking fallback */}
      {!isOnBoard && !isTracking && (
        <View style={styles.noTrackingBanner}>
          <Text style={styles.noTrackingText}>
            Real-time tracking unavailable. Check schedule.
          </Text>
        </View>
      )}
    </Animated.View>
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
  containerApproaching: {
    backgroundColor: COLORS.warningSubtle,
    borderWidth: 2,
    borderColor: COLORS.warning,
  },
  containerArrived: {
    backgroundColor: COLORS.successSubtle,
    borderWidth: 2,
    borderColor: COLORS.success,
  },
  containerOnBoard: {
    backgroundColor: COLORS.primarySubtle || '#E3F2FD',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  containerWarning: {
    backgroundColor: COLORS.warningSubtle || '#FFF3E0',
    borderWidth: 2,
    borderColor: COLORS.warning,
  },
  containerUrgent: {
    backgroundColor: COLORS.errorSubtle || '#FFEBEE',
    borderWidth: 3,
    borderColor: COLORS.error,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  routeBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.md,
  },
  routeText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  waitingText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  waitingTextUrgent: {
    color: COLORS.error,
    fontWeight: '700',
  },
  headsign: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  proximitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  busIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.grey100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    position: 'relative',
  },
  busIconContainerWarning: {
    backgroundColor: COLORS.warningSubtle || '#FFF3E0',
  },
  busIconContainerUrgent: {
    backgroundColor: COLORS.errorSubtle || '#FFEBEE',
  },
  busIcon: {
    fontSize: 28,
  },
  arrivedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  urgentBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrivedBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  statusContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statusTextApproaching: {
    color: COLORS.warning,
  },
  statusTextArrived: {
    color: COLORS.success,
  },
  statusTextOnBoard: {
    color: COLORS.primary,
  },
  statusTextWarning: {
    color: COLORS.warning,
  },
  statusTextUrgent: {
    color: COLORS.error,
    fontSize: FONT_SIZES.xxl || 24,
  },
  etaText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  destinationText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  // Departure time styles
  departureTimeContainer: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  departureTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  departureTimeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  departureTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  departureTimeText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  realtimeIndicator: {
    marginLeft: SPACING.xs,
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.xs || 4,
  },
  realtimeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.white,
  },
  countdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  countdownText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textTertiary || COLORS.grey500,
  },
  delayText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error,
    fontWeight: '600',
  },
  earlyText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    fontWeight: '600',
  },
  stopsVisualization: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.grey300,
  },
  stopDotFirst: {
    backgroundColor: COLORS.primary,
  },
  stopDotCurrent: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  stopDotOnBoard: {
    backgroundColor: COLORS.primary,
  },
  stopDotDestination: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  noTrackingBanner: {
    marginTop: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: COLORS.grey100,
    borderRadius: BORDER_RADIUS.sm,
  },
  noTrackingText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  boardButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  boardButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
  alightButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.error,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  alightButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
});

export default BusProximityCard;
