/**
 * BottomActionBar - Frosted glass bottom bar with Stops toggle + Plan Trip
 *
 * Replaces the old centered PlanTripFAB with a unified bottom action bar
 * matching the web version's design.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';

// Stop/pin icon
const StopIcon = ({ size = 18, color = COLORS.textPrimary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z"
      fill={color}
    />
  </Svg>
);

// Direction/Route icon
const DirectionsIcon = ({ size = 18, color = COLORS.white }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21.71 11.29L12.71 2.29C12.32 1.9 11.69 1.9 11.3 2.29L2.3 11.29C1.91 11.68 1.91 12.31 2.3 12.7L11.3 21.7C11.5 21.9 11.74 22 12 22C12.26 22 12.5 21.9 12.71 21.71L21.71 12.71C22.1 12.32 22.1 11.68 21.71 11.29ZM14 14.5V12H10V15H8V11C8 10.45 8.45 10 9 10H14V7.5L17.5 11L14 14.5Z"
      fill={color}
    />
  </Svg>
);

const BottomActionBar = ({ onPlanTrip, showStops, onToggleStops }) => {
  return (
    <View style={styles.bottomActionBar}>
      <View style={styles.bottomActionCard}>
        {/* Stops Toggle */}
        <TouchableOpacity
          style={[styles.bottomActionButton, showStops && styles.bottomActionButtonActive]}
          onPress={onToggleStops}
          activeOpacity={0.8}
        >
          <StopIcon size={18} color={showStops ? COLORS.white : COLORS.textPrimary} />
          <Text style={[styles.bottomActionText, showStops && styles.bottomActionTextActive]}>
            Stops
          </Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.bottomActionDivider} />

        {/* Plan Trip Button */}
        <TouchableOpacity
          style={styles.planTripButton}
          onPress={onPlanTrip}
          activeOpacity={0.8}
        >
          <DirectionsIcon size={18} color={COLORS.white} />
          <Text style={styles.planTripButtonText}>Plan Trip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomActionBar: {
    position: 'absolute',
    bottom: 32,
    left: 80,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  bottomActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: BORDER_RADIUS.round,
    padding: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(235, 236, 240, 0.8)',
    gap: SPACING.xs,
    ...SHADOWS.large,
  },
  bottomActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    gap: 6,
  },
  bottomActionButtonActive: {
    backgroundColor: COLORS.primary,
  },
  bottomActionText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  bottomActionTextActive: {
    color: COLORS.white,
  },
  bottomActionDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.grey300,
  },
  planTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg + 4,
    gap: 6,
    ...SHADOWS.small,
  },
  planTripButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
    letterSpacing: -0.2,
  },
});

// Export as both default and named for backwards compatibility
export default BottomActionBar;
