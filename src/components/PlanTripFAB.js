/**
 * PlanTripFAB - Premium Floating Action Button for trip planning
 *
 * A modern, polished button that floats above the map to trigger trip planning.
 * Features gradient styling and elevated shadow for premium feel.
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS } from '../config/theme';

// Direction/Route icon SVG
const DirectionsIcon = ({ size = 22, color = COLORS.white }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21.71 11.29L12.71 2.29C12.32 1.9 11.69 1.9 11.3 2.29L2.3 11.29C1.91 11.68 1.91 12.31 2.3 12.7L11.3 21.7C11.5 21.9 11.74 22 12 22C12.26 22 12.5 21.9 12.71 21.71L21.71 12.71C22.1 12.32 22.1 11.68 21.71 11.29ZM14 14.5V12H10V15H8V11C8 10.45 8.45 10 9 10H14V7.5L17.5 11L14 14.5Z"
      fill={color}
    />
  </Svg>
);

const PlanTripFAB = ({ onPress, isActive = false }) => {
  return (
    <TouchableOpacity
      style={[styles.fab, isActive && styles.fabActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <DirectionsIcon size={22} color={isActive ? COLORS.primary : COLORS.white} />
      <Text style={[styles.fabText, isActive && styles.fabTextActive]}>
        {isActive ? 'Close' : 'Plan Trip'}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    marginLeft: -72,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.sm,
    ...SHADOWS.elevated,
    // Web-specific premium styling
    ...(Platform.OS === 'web' && {
      background: 'linear-gradient(135deg, #4CAF50 0%, #388E3C 100%)',
      boxShadow: '0 6px 20px rgba(76, 175, 80, 0.35)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }),
  },
  fabActive: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...(Platform.OS === 'web' && {
      background: COLORS.surface,
      boxShadow: '0 4px 16px rgba(23, 43, 77, 0.15)',
    }),
  },
  fabText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
  },
  fabTextActive: {
    color: COLORS.primary,
  },
});

export default PlanTripFAB;
