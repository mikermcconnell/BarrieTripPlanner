/**
 * BottomActionBar - Frosted glass bottom bar with Stops toggle + Plan Trip
 *
 * Replaces the old centered PlanTripFAB with a unified bottom action bar
 * matching the web version's design.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_FAMILIES } from '../config/theme';

// Stop/pin icon — filled variant
const StopIconFilled = ({ size = 18, color = COLORS.textPrimary }) => <Icon name="MapPin" size={size} color={color} fill={color} />;

// Stop/pin icon — outline variant
const StopIconOutline = ({ size = 18, color = COLORS.textPrimary }) => <Icon name="MapPin" size={size} color={color} />;

// Direction/Route icon
const DirectionsIcon = ({ size = 18, color = COLORS.white }) => <Icon name="Navigation" size={size} color={color} fill={color} />;

const BottomActionBar = ({ onPlanTrip, showStops, onToggleStops }) => {
  return (
    <View style={styles.bottomActionBar}>
      <BlurView intensity={85} tint="light" style={styles.bottomActionCard}>
        {/* Stops Toggle */}
        <TouchableOpacity
          style={[styles.bottomActionButton, showStops && styles.bottomActionButtonActive]}
          onPress={onToggleStops}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={showStops ? 'Hide bus stops' : 'Show bus stops'}
          accessibilityState={{ checked: showStops }}
        >
          {showStops
            ? <StopIconFilled size={18} color={COLORS.white} />
            : <StopIconOutline size={18} color={COLORS.textPrimary} />
          }
          <Text style={[styles.bottomActionText, showStops && styles.bottomActionTextActive]}>
            Stops
          </Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.bottomActionDivider} />

        {/* Plan Trip Button */}
        <TouchableOpacity
          onPress={onPlanTrip}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Plan a trip"
        >
          <View style={styles.planTripButton}>
            <DirectionsIcon size={18} color={COLORS.white} />
            <Text style={styles.planTripButtonText}>Plan Trip</Text>
          </View>
        </TouchableOpacity>
      </BlurView>
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
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: BORDER_RADIUS.round,
    padding: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    gap: SPACING.xs,
    overflow: 'hidden',
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
    fontFamily: FONT_FAMILIES.semibold,
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
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg + 4,
    gap: 6,
    backgroundColor: COLORS.primary,
    ...SHADOWS.small,
  },
  planTripButtonText: {
    fontSize: FONT_SIZES.md,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.white,
    letterSpacing: -0.2,
  },
});

// Export as both default and named for backwards compatibility
export default BottomActionBar;
