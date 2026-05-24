import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { BORDER_RADIUS, COLORS, SPACING } from '../config/theme';

const DOT_COUNT = 3;
const STEP_MS = 320;

const useReducedMotion = () => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    let nativeSubscription = null;
    let webQuery = null;
    let webListener = null;

    if (AccessibilityInfo?.isReduceMotionEnabled) {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          if (mounted) setReduceMotion(Boolean(enabled));
        })
        .catch(() => {});
    }

    if (AccessibilityInfo?.addEventListener) {
      nativeSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    }

    if (typeof window !== 'undefined' && window.matchMedia) {
      webQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduceMotion(webQuery.matches);
      webListener = (event) => setReduceMotion(event.matches);
      if (webQuery.addEventListener) {
        webQuery.addEventListener('change', webListener);
      } else if (webQuery.addListener) {
        webQuery.addListener(webListener);
      }
    }

    return () => {
      mounted = false;
      nativeSubscription?.remove?.();
      if (webQuery && webListener) {
        if (webQuery.removeEventListener) {
          webQuery.removeEventListener('change', webListener);
        } else if (webQuery.removeListener) {
          webQuery.removeListener(webListener);
        }
      }
    };
  }, []);

  return reduceMotion;
};

const TripPlanningLoadingDots = () => {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return undefined;

    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % DOT_COUNT);
    }, STEP_MS);

    return () => clearInterval(interval);
  }, [reduceMotion]);

  return (
    <View
      style={styles.container}
      testID="trip-planning-loading-animation"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {Array.from({ length: DOT_COUNT }).map((_, index) => {
        const isActive = !reduceMotion && index === activeIndex;
        return (
          <View
            key={`trip-planning-dot-${index}`}
            style={[
              styles.dot,
              isActive && styles.dotActive,
              reduceMotion && styles.dotReducedMotion,
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: SPACING.xxs,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primary,
    opacity: 0.35,
    transform: [{ scale: 0.85 }],
  },
  dotActive: {
    opacity: 1,
    transform: [{ scale: 1.18 }],
  },
  dotReducedMotion: {
    opacity: 0.75,
    transform: [{ scale: 1 }],
  },
});

export default TripPlanningLoadingDots;
