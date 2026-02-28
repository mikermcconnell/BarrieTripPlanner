import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import Icon from './Icon';
import { COLORS, SPACING, SHADOWS, BORDER_RADIUS, FONT_SIZES, FONT_FAMILIES } from '../config/theme';

// Direction/Route icon
const DirectionsIcon = ({ size = 20, color = COLORS.white }) => <Icon name="Navigation" size={size} color={color} fill={color} />;

const PlanTripFAB = ({ onPlanTrip }) => {
  return (
    <View style={styles.fabContainer}>
      <TouchableOpacity
        onPress={onPlanTrip}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Plan a trip"
      >
        <View style={styles.planTripButton}>
          <DirectionsIcon size={30} color={COLORS.white} />
          <Text style={styles.planTripButtonText}>Plan Trip</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 32,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  planTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    gap: 10,
    backgroundColor: COLORS.ctaGreen,
    ...SHADOWS.elevated,
  },
  planTripButtonText: {
    fontSize: FONT_SIZES.lg,
    fontFamily: FONT_FAMILIES.bold,
    color: COLORS.white,
    letterSpacing: 0.3,
  },
});

export default PlanTripFAB;
