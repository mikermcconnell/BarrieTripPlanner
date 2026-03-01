import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, SHADOWS } from '../config/theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const PlanTripFAB = ({ onPlanTrip }) => {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(300, withSpring(1, { damping: 12, stiffness: 180 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.fabContainer}>
      <AnimatedTouchable
        style={[styles.fab, animStyle]}
        onPress={onPlanTrip}
        activeOpacity={0.85}
      >
        <Ionicons name="navigate" size={26} color={COLORS.white} />
      </AnimatedTouchable>
    </View>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 32,
    right: SPACING.lg,
    zIndex: 1000,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#388E3C',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.elevated,
    shadowColor: '#388E3C',
  },
});

export default PlanTripFAB;
