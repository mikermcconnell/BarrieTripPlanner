import React, { useEffect } from 'react';
import { Dimensions } from 'react-native';
import Svg, { Rect, Circle, G, Path, Line } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../config/theme';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCENE_HEIGHT = 280;

const SKY_COLOR = COLORS.secondarySubtle;
const ROAD_Y = SCENE_HEIGHT - 40;
const ROAD_HEIGHT = 40;
const ROUTE_LINE_Y = ROAD_Y - 5;
const BUS_Y = ROAD_Y - 28;
const BUS_WIDTH = 60;
const BUS_HEIGHT = 30;

const OnboardingScene = () => {
  const busX = useSharedValue(-BUS_WIDTH);
  const wheel1Rotation = useSharedValue(0);
  const wheel2Rotation = useSharedValue(0);
  const cloud1X = useSharedValue(SCREEN_WIDTH * 0.1);
  const cloud2X = useSharedValue(SCREEN_WIDTH * 0.5);
  const cloud3X = useSharedValue(SCREEN_WIDTH * 0.8);
  const stop1Y = useSharedValue(0);
  const stop2Y = useSharedValue(0);
  const stop3Y = useSharedValue(0);
  const pin1Scale = useSharedValue(1);
  const pin2Scale = useSharedValue(1);
  const pin1Opacity = useSharedValue(0.7);
  const pin2Opacity = useSharedValue(0.7);
  const routeDashOffset = useSharedValue(0);

  useEffect(() => {
    busX.value = withRepeat(
      withTiming(SCREEN_WIDTH + BUS_WIDTH, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );

    wheel1Rotation.value = withRepeat(
      withTiming(360, { duration: 700, easing: Easing.linear }),
      -1,
      false
    );
    wheel2Rotation.value = withRepeat(
      withTiming(360, { duration: 700, easing: Easing.linear }),
      -1,
      false
    );

    cloud1X.value = withRepeat(
      withTiming(-60, { duration: 20000, easing: Easing.linear }),
      -1,
      false
    );
    cloud2X.value = withRepeat(
      withTiming(-70, { duration: 25000, easing: Easing.linear }),
      -1,
      false
    );
    cloud3X.value = withRepeat(
      withTiming(-50, { duration: 15000, easing: Easing.linear }),
      -1,
      false
    );

    const bobAnimation = (delay = 0) =>
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(-4, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
            withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );

    stop1Y.value = bobAnimation(0);
    stop2Y.value = bobAnimation(500);
    stop3Y.value = bobAnimation(1000);

    const pinPulse = (delay = 0) =>
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );

    const pinFade = (delay = 0) =>
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );

    pin1Scale.value = pinPulse(0);
    pin2Scale.value = pinPulse(700);
    pin1Opacity.value = pinFade(0);
    pin2Opacity.value = pinFade(700);

    routeDashOffset.value = withRepeat(
      withTiming(14, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const busAnimatedProps = useAnimatedProps(() => ({
    transform: [{ translateX: busX.value }, { translateY: BUS_Y }],
  }));

  const wheel1Props = useAnimatedProps(() => ({
    transform: [
      { translateX: 14 },
      { translateY: BUS_HEIGHT - 6 },
      { rotate: `${wheel1Rotation.value}deg` },
    ],
  }));

  const wheel2Props = useAnimatedProps(() => ({
    transform: [
      { translateX: BUS_WIDTH - 14 },
      { translateY: BUS_HEIGHT - 6 },
      { rotate: `${wheel2Rotation.value}deg` },
    ],
  }));

  const cloud1Props = useAnimatedProps(() => ({
    transform: [{ translateX: cloud1X.value }, { translateY: 30 }],
  }));
  const cloud2Props = useAnimatedProps(() => ({
    transform: [{ translateX: cloud2X.value }, { translateY: 55 }],
  }));
  const cloud3Props = useAnimatedProps(() => ({
    transform: [{ translateX: cloud3X.value }, { translateY: 20 }],
  }));

  const stop1Props = useAnimatedProps(() => ({
    transform: [
      { translateX: SCREEN_WIDTH * 0.2 },
      { translateY: ROAD_Y - 45 + stop1Y.value },
    ],
  }));
  const stop2Props = useAnimatedProps(() => ({
    transform: [
      { translateX: SCREEN_WIDTH * 0.5 },
      { translateY: ROAD_Y - 45 + stop2Y.value },
    ],
  }));
  const stop3Props = useAnimatedProps(() => ({
    transform: [
      { translateX: SCREEN_WIDTH * 0.8 },
      { translateY: ROAD_Y - 45 + stop3Y.value },
    ],
  }));

  const pin1Props = useAnimatedProps(() => ({
    transform: [{ translateX: SCREEN_WIDTH * 0.3 }, { translateY: 90 }, { scale: pin1Scale.value }],
    opacity: pin1Opacity.value,
  }));
  const pin2Props = useAnimatedProps(() => ({
    transform: [{ translateX: SCREEN_WIDTH * 0.7 }, { translateY: 110 }, { scale: pin2Scale.value }],
    opacity: pin2Opacity.value,
  }));

  const routeProps = useAnimatedProps(() => ({
    strokeDashoffset: routeDashOffset.value,
  }));

  return (
    <Svg
      width={SCREEN_WIDTH}
      height={SCENE_HEIGHT}
      viewBox={`0 0 ${SCREEN_WIDTH} ${SCENE_HEIGHT}`}
    >
      <Rect x="0" y="0" width={SCREEN_WIDTH} height={SCENE_HEIGHT} fill={SKY_COLOR} />

      <AnimatedG animatedProps={cloud1Props}>
        <Circle cx="0" cy="0" r="18" fill={COLORS.grey300} opacity={0.6} />
        <Circle cx="14" cy="-5" r="14" fill={COLORS.grey300} opacity={0.6} />
        <Circle cx="-12" cy="-3" r="12" fill={COLORS.grey300} opacity={0.6} />
      </AnimatedG>
      <AnimatedG animatedProps={cloud2Props}>
        <Circle cx="0" cy="0" r="22" fill={COLORS.grey300} opacity={0.5} />
        <Circle cx="18" cy="-6" r="16" fill={COLORS.grey300} opacity={0.5} />
        <Circle cx="-15" cy="-4" r="13" fill={COLORS.grey300} opacity={0.5} />
      </AnimatedG>
      <AnimatedG animatedProps={cloud3Props}>
        <Circle cx="0" cy="0" r="15" fill={COLORS.grey300} opacity={0.55} />
        <Circle cx="12" cy="-4" r="11" fill={COLORS.grey300} opacity={0.55} />
        <Circle cx="-10" cy="-2" r="10" fill={COLORS.grey300} opacity={0.55} />
      </AnimatedG>

      <AnimatedG animatedProps={pin1Props}>
        <Path
          d="M0,-15 C-8,-15 -12,-8 -12,-4 C-12,4 0,15 0,15 C0,15 12,4 12,-4 C12,-8 8,-15 0,-15 Z"
          fill={COLORS.primary}
        />
        <Circle cx="0" cy="-4" r="4" fill={COLORS.white} />
      </AnimatedG>
      <AnimatedG animatedProps={pin2Props}>
        <Path
          d="M0,-15 C-8,-15 -12,-8 -12,-4 C-12,4 0,15 0,15 C0,15 12,4 12,-4 C12,-8 8,-15 0,-15 Z"
          fill={COLORS.primary}
        />
        <Circle cx="0" cy="-4" r="4" fill={COLORS.white} />
      </AnimatedG>

      <AnimatedG animatedProps={stop1Props}>
        <Rect x="-1.5" y="0" width="3" height="20" fill={COLORS.grey600} rx="1" />
        <Rect x="-8" y="-2" width="16" height="12" rx="2" fill={COLORS.accent} />
        <Rect x="-4" y="1" width="8" height="2" fill={COLORS.white} rx="0.5" />
        <Rect x="-3" y="5" width="6" height="2" fill={COLORS.white} rx="0.5" />
      </AnimatedG>
      <AnimatedG animatedProps={stop2Props}>
        <Rect x="-1.5" y="0" width="3" height="20" fill={COLORS.grey600} rx="1" />
        <Rect x="-8" y="-2" width="16" height="12" rx="2" fill={COLORS.accent} />
        <Rect x="-4" y="1" width="8" height="2" fill={COLORS.white} rx="0.5" />
        <Rect x="-3" y="5" width="6" height="2" fill={COLORS.white} rx="0.5" />
      </AnimatedG>
      <AnimatedG animatedProps={stop3Props}>
        <Rect x="-1.5" y="0" width="3" height="20" fill={COLORS.grey600} rx="1" />
        <Rect x="-8" y="-2" width="16" height="12" rx="2" fill={COLORS.accent} />
        <Rect x="-4" y="1" width="8" height="2" fill={COLORS.white} rx="0.5" />
        <Rect x="-3" y="5" width="6" height="2" fill={COLORS.white} rx="0.5" />
      </AnimatedG>

      <Rect x="0" y={ROAD_Y} width={SCREEN_WIDTH} height={ROAD_HEIGHT} fill={COLORS.grey200} />
      {Array.from({ length: Math.ceil(SCREEN_WIDTH / 30) }).map((_, i) => (
        <Rect
          key={`dash-${i}`}
          x={i * 30 + 5}
          y={ROAD_Y + ROAD_HEIGHT / 2 - 1}
          width="15"
          height="2"
          fill={COLORS.grey400}
          rx="1"
        />
      ))}

      <AnimatedLine
        animatedProps={routeProps}
        x1="0"
        y1={ROUTE_LINE_Y}
        x2={SCREEN_WIDTH}
        y2={ROUTE_LINE_Y}
        stroke={COLORS.secondary}
        strokeWidth="3"
        strokeDasharray="8,6"
        strokeLinecap="round"
        opacity={0.7}
      />

      <AnimatedG animatedProps={busAnimatedProps}>
        <Rect x="0" y="0" width={BUS_WIDTH} height={BUS_HEIGHT - 6} rx="4" fill={COLORS.primary} />
        <Rect
          x={BUS_WIDTH - 14}
          y="3"
          width="10"
          height="12"
          rx="2"
          fill={COLORS.secondarySubtle}
        />
        <Rect x="6" y="4" width="8" height="8" rx="1.5" fill={COLORS.secondarySubtle} opacity={0.9} />
        <Rect x="18" y="4" width="8" height="8" rx="1.5" fill={COLORS.secondarySubtle} opacity={0.9} />
        <Rect x="30" y="4" width="8" height="8" rx="1.5" fill={COLORS.secondarySubtle} opacity={0.9} />

        <AnimatedG animatedProps={wheel1Props}>
          <Circle cx="0" cy="0" r="5" fill={COLORS.grey800} />
          <Circle cx="0" cy="0" r="2.5" fill={COLORS.grey500} />
          <Line x1="0" y1="-4" x2="0" y2="4" stroke={COLORS.grey500} strokeWidth="1" />
          <Line x1="-4" y1="0" x2="4" y2="0" stroke={COLORS.grey500} strokeWidth="1" />
        </AnimatedG>

        <AnimatedG animatedProps={wheel2Props}>
          <Circle cx="0" cy="0" r="5" fill={COLORS.grey800} />
          <Circle cx="0" cy="0" r="2.5" fill={COLORS.grey500} />
          <Line x1="0" y1="-4" x2="0" y2="4" stroke={COLORS.grey500} strokeWidth="1" />
          <Line x1="-4" y1="0" x2="4" y2="0" stroke={COLORS.grey500} strokeWidth="1" />
        </AnimatedG>

        <Circle cx={BUS_WIDTH - 3} cy="16" r="2.5" fill={COLORS.accent} opacity={0.9} />
      </AnimatedG>
    </Svg>
  );
};

export default OnboardingScene;
