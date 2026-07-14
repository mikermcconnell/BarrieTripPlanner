import React, { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const PATH_LENGTH = 620;
const TIMELINE_INPUT = [0, 0.18, 0.48, 0.53, 0.62, 0.76, 0.88, 1];

function SideBusIcon() {
  return (
    <Svg width="72%" height="72%" viewBox="-24 -24 48 48" accessible={false}>
      <Path d="M-20-12h31c7 0 11 4 11 11v12h-42z" fill="#FFFFFF" />
      <Path d="M-14-7h8v9h-8zm11 0h8v9h-8zm11 0h8l2 9H8z" fill="#004E80" />
      <Path
        d="M-12 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm25 0a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"
        fill="#172B4D"
      />
      <Path
        d="M-12 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm25 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

export default function StartupDetourAnimation({ imageSource, width, height, timeline: sharedTimeline }) {
  const internalTimeline = useRef(new Animated.Value(0)).current;
  const timeline = sharedTimeline || internalTimeline;
  const markerSize = Math.max(28, Math.min(42, width * 0.105));

  useEffect(() => {
    let active = true;
    let animation;

    const startAnimation = () => {
      if (!active) return;
      timeline.setValue(0);
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(timeline, {
            toValue: 1,
            duration: 4200,
            easing: Easing.linear,
            useNativeDriver: false,
            isInteraction: false,
          }),
          Animated.delay(700),
        ]),
        { resetBeforeIteration: true }
      );
      animation.start();
    };

    Promise.resolve(AccessibilityInfo?.isReduceMotionEnabled?.())
      .then((reduceMotionEnabled) => {
        if (!active) return;
        if (reduceMotionEnabled) {
          timeline.setValue(1);
        } else {
          startAnimation();
        }
      })
      .catch(startAnimation);

    return () => {
      active = false;
      animation?.stop?.();
      timeline.stopAnimation();
    };
  }, [timeline]);

  const animationStyles = useMemo(() => {
    const translateX = timeline.interpolate({
      inputRange: TIMELINE_INPUT,
      outputRange: [0.10, 0.31, 0.31, 0.402, 0.402, 0.68, 0.68, 0.88].map((value) => value * width),
    });
    const translateY = timeline.interpolate({
      inputRange: TIMELINE_INPUT,
      outputRange: [0.50, 0.50, 0.50, 0.50, 0.20, 0.20, 0.50, 0.50].map((value) => value * height),
    });
    return {
      bus: {
        opacity: timeline.interpolate({
          inputRange: [0, 0.03, 0.94, 1],
          outputRange: [0, 1, 1, 0],
        }),
        transform: [{ translateX }, { translateY }],
      },
      closure: {
        opacity: timeline.interpolate({
          inputRange: [0, 0.17, 0.22, 1],
          outputRange: [0, 0, 1, 1],
        }),
        transform: [{
          scale: timeline.interpolate({
            inputRange: [0, 0.17, 0.22, 1],
            outputRange: [0.7, 0.7, 1, 1],
          }),
        }],
      },
      pathOpacity: timeline.interpolate({
        inputRange: [0, 0.24, 0.29, 1],
        outputRange: [0, 0, 1, 1],
      }),
      pathOffset: timeline.interpolate({
        inputRange: [0, 0.24, 0.45, 1],
        outputRange: [PATH_LENGTH, PATH_LENGTH, 0, 0],
      }),
    };
  }, [height, timeline, width]);

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none" accessible={false}>
      <Image source={imageSource} style={styles.mapImage} resizeMode="cover" fadeDuration={0} />

      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 900 520" preserveAspectRatio="none">
        <AnimatedPath
          d="M362 260H612"
          fill="none"
          stroke="#F59E0B"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray="3 22"
          opacity={animationStyles.closure.opacity}
        />
        <AnimatedPath
          d="M362 260V104H612V260"
          fill="none"
          stroke="#8539D6"
          strokeWidth="25"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${PATH_LENGTH} ${PATH_LENGTH}`}
          strokeDashoffset={animationStyles.pathOffset}
          opacity={Animated.multiply(animationStyles.pathOpacity, 0.14)}
        />
        <AnimatedPath
          d="M362 260V104H612V260"
          fill="none"
          stroke="#8539D6"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${PATH_LENGTH} ${PATH_LENGTH}`}
          strokeDashoffset={animationStyles.pathOffset}
          opacity={animationStyles.pathOpacity}
        />
      </Svg>

      <Animated.View
        style={[
          styles.closureMarker,
          {
            left: (488 / 900) * width - 14,
            top: (260 / 520) * height - 14,
          },
          animationStyles.closure,
        ]}
      >
        <View style={styles.closureSlashForward} />
        <View style={styles.closureSlashBackward} />
      </Animated.View>

      <Animated.View
        style={[
          styles.busMarker,
          {
            width: markerSize,
            height: markerSize,
            borderRadius: markerSize / 2,
            left: -markerSize / 2,
            top: -markerSize / 2,
          },
          animationStyles.bus,
        ]}
      >
        <SideBusIcon />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  mapImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  busMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004E80',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#062A53',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  closureMarker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF7E6',
    borderWidth: 2.5,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closureSlashForward: {
    position: 'absolute',
    width: 15,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#D94B2B',
    transform: [{ rotate: '45deg' }],
  },
  closureSlashBackward: {
    position: 'absolute',
    width: 15,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#D94B2B',
    transform: [{ rotate: '-45deg' }],
  },
});
