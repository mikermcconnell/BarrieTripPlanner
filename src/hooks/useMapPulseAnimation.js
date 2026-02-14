/**
 * useMapPulseAnimation Hook
 *
 * Creates a looping pulse animation for the live status indicator.
 * Shared between native and web HomeScreens.
 */
import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

export const useMapPulseAnimation = () => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return pulseAnim;
};
