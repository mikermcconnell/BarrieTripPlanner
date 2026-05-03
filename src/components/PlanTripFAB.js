import React, { useEffect } from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING, SHADOWS } from '../config/theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const PlanTripFAB = ({ onPlanTrip, bottomInset = 0 }) => {
  // Keep the primary CTA visible immediately. The spring gives a subtle
  // "ready" feel without delaying the button from appearing.
  const scale = useSharedValue(0.98);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 180 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.fabContainer, { bottom: 32 + bottomInset }]}>
      <AnimatedTouchable
        style={[styles.fab, animStyle]}
        onPress={onPlanTrip}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Plan manually"
      >
        <Ionicons name="navigate" size={18} color={COLORS.primaryDark} />
        <Text style={styles.fabText}>Plan</Text>
      </AnimatedTouchable>
    </View>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 32,
    right: SPACING.md,
    zIndex: 1000,
  },
  fab: {
    minWidth: 84,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.xs,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primarySubtle,
    ...SHADOWS.medium,
  },
  fabText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

export default PlanTripFAB;
