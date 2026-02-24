/**
 * DestinationBanner Component
 *
 * Compact banner showing where the user is heading with:
 * - Walking to bus stop: stop name/number + walk time vs bus departure countdown
 * - Walking to destination (final leg): address + walk time
 * - Riding transit: alighting stop + stops remaining
 * - On-demand: pickup/dropoff stop + zone name
 *
 * Sits above WalkingInstructionCard on NavigationScreen.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../../config/theme';
import { formatMinutes } from '../../services/tripService';

// Walking speed: 5 km/h = 83.3 m/min
const WALKING_SPEED_MPM = 83.3;

/**
 * Format a stop label from a leg's `to` object.
 * Returns "Name (#stopCode)" or "Name (#stopId)" as fallback.
 */
const formatStopLabel = (stop) => {
  if (!stop) return 'Unknown';
  const code = stop.stopCode || stop.stopId;
  return code ? `${stop.name} (#${code})` : stop.name || 'Unknown';
};

const DestinationBanner = ({
  currentLeg,
  nextTransitLeg = null,
  distanceRemaining,
  totalLegDistance,
  isLastWalkingLeg = false,
}) => {
  if (!currentLeg) return null;

  const { mode, to, isOnDemand, zoneName } = currentLeg;
  const isWalking = mode === 'WALK';
  const isTransit = mode === 'BUS' || mode === 'TRANSIT';

  // Walk time from distance (ceil to whole minutes)
  const walkTimeMinutes = useMemo(() => {
    const distance = distanceRemaining ?? totalLegDistance ?? currentLeg.distance ?? 0;
    if (distance <= 0) return 0;
    return Math.ceil(distance / WALKING_SPEED_MPM);
  }, [distanceRemaining, totalLegDistance, currentLeg.distance]);

  // Bus departure countdown (minutes until next transit leg departs)
  const busDepartureMinutes = useMemo(() => {
    if (!nextTransitLeg?.startTime) return null;
    return Math.max(0, Math.ceil((nextTransitLeg.startTime - Date.now()) / 60000));
  }, [nextTransitLeg]);

  // Pace coloring: compare walk time to bus departure
  const paceColor = useMemo(() => {
    if (busDepartureMinutes === null) return null;
    const buffer = busDepartureMinutes - walkTimeMinutes;
    if (buffer >= 0) return COLORS.success;
    if (buffer >= -2) return COLORS.warning;
    return COLORS.error;
  }, [busDepartureMinutes, walkTimeMinutes]);

  // Build destination line and timing line based on leg type
  let destinationLine = '';
  let timingLine = '';

  if (isOnDemand) {
    // On-demand leg
    destinationLine = `\u{1F4DE} On-demand to: ${formatStopLabel(to)}`;
    timingLine = zoneName ? `Zone: ${zoneName}` : '';
  } else if (isWalking && isLastWalkingLeg) {
    // Final walking leg (to destination address)
    destinationLine = `\u{1F4CD} Walking to: ${to?.name || 'Destination'}`;
    timingLine = `\u{1F6B6} ${formatMinutes(walkTimeMinutes)} walk`;
  } else if (isWalking && nextTransitLeg) {
    // Walking to a bus stop
    destinationLine = `\u{1F68F} Walking to: ${formatStopLabel(to)}`;
    const walkPart = `\u{1F6B6} ${formatMinutes(walkTimeMinutes)} walk`;
    const busPart = `\u{1F550} Bus departs in ${formatMinutes(busDepartureMinutes)}`;
    timingLine = `${walkPart} \u00B7 ${busPart}`;
  } else if (isWalking) {
    // Walking leg without next transit context
    destinationLine = `\u{1F6B6} Walking to: ${to?.name || 'Destination'}`;
    timingLine = `\u{1F6B6} ${formatMinutes(walkTimeMinutes)} walk`;
  } else if (isTransit) {
    // Riding a bus
    destinationLine = `\u{1F68C} Riding to: ${formatStopLabel(to)}`;
    const stops = currentLeg.intermediateStops;
    if (stops && stops.length > 0) {
      timingLine = `${stops.length} stop${stops.length !== 1 ? 's' : ''} remaining`;
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.destinationText} numberOfLines={1}>
        {destinationLine}
      </Text>
      {timingLine ? (
        <Text
          style={[
            styles.timingText,
            paceColor ? { color: paceColor } : null,
          ]}
          numberOfLines={1}
        >
          {timingLine}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.grey100,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  destinationText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  timingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xxs,
  },
});

export default DestinationBanner;
