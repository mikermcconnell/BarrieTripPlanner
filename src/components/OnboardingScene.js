import React, { useEffect } from 'react';
import { Dimensions } from 'react-native';
import Svg, { Rect, Circle, G, Path, Line, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../config/theme';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCENE_HEIGHT = 310;
const VIEWBOX_WIDTH = 390;
const VIEWBOX_HEIGHT = 310;

const BRAND_BLUE = COLORS.primary;
const BRAND_BLUE_LIGHT = COLORS.primaryLight;
const BRAND_BLUE_DARK = COLORS.primaryDark;
const DETOUR_ORANGE = COLORS.accent;
const SKIPPED_RED = COLORS.error;

const OnboardingScene = ({ slideIndex = 0 }) => {
  const pulse = useSharedValue(1);
  const busOffset = useSharedValue(0);
  const dashOffset = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    busOffset.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    dashOffset.value = withRepeat(
      withTiming(18, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
  }, [busOffset, dashOffset, pulse]);

  const pulseProps = useAnimatedProps(() => ({
    transform: [{ translateX: 118 }, { translateY: 151 }, { scale: pulse.value }],
  }));

  const busProps = useAnimatedProps(() => ({
    transform: [{ translateX: 212 + busOffset.value }, { translateY: 94 }],
  }));

  const routeDashProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const renderBrandHeader = () => (
    <G>
      <Circle cx="40" cy="40" r="22" fill={COLORS.white} opacity="0.95" />
      <SvgText x="40" y="49" textAnchor="middle" fontSize="27" fontWeight="800" fill={BRAND_BLUE}>
        B
      </SvgText>
      <SvgText x="74" y="37" fontSize="13" fontWeight="800" fill={COLORS.white}>
        MY BARRIE TRANSIT
      </SvgText>
      <SvgText x="74" y="55" fontSize="11" fontWeight="600" fill="#DFF3FF">
        Built for Barrie. Built for detours.
      </SvgText>
    </G>
  );

  const renderMapBase = () => (
    <G>
      <Rect x="24" y="76" width="342" height="176" rx="28" fill={COLORS.white} />
      <Rect x="24" y="76" width="342" height="176" rx="28" fill="#EAF7FF" />
      <Line x1="38" y1="126" x2="350" y2="82" stroke={COLORS.white} strokeWidth="22" strokeLinecap="round" />
      <Line x1="42" y1="221" x2="350" y2="176" stroke={COLORS.white} strokeWidth="20" strokeLinecap="round" />
      <Line x1="73" y1="82" x2="342" y2="235" stroke={COLORS.white} strokeWidth="18" strokeLinecap="round" />
      <Line x1="42" y1="126" x2="350" y2="82" stroke={COLORS.grey300} strokeWidth="1.5" opacity="0.55" />
      <Line x1="42" y1="221" x2="350" y2="176" stroke={COLORS.grey300} strokeWidth="1.5" opacity="0.55" />
      <Line x1="73" y1="82" x2="342" y2="235" stroke={COLORS.grey300} strokeWidth="1.5" opacity="0.55" />
    </G>
  );

  const renderBus = () => (
    <AnimatedG animatedProps={busProps}>
      <Rect x="0" y="0" width="54" height="32" rx="9" fill={BRAND_BLUE} />
      <Rect x="8" y="7" width="9" height="8" rx="2" fill="#DFF3FF" />
      <Rect x="21" y="7" width="9" height="8" rx="2" fill="#DFF3FF" />
      <Rect x="34" y="7" width="11" height="8" rx="2" fill="#DFF3FF" />
      <Circle cx="13" cy="29" r="5" fill={COLORS.grey900} />
      <Circle cx="41" cy="29" r="5" fill={COLORS.grey900} />
      <SvgText x="27" y="24" textAnchor="middle" fontSize="8" fontWeight="800" fill={COLORS.white}>
        LIVE
      </SvgText>
    </AnimatedG>
  );

  const renderDetourMap = () => (
    <G>
      {renderMapBase()}
      <Path d="M58 203 C96 172 128 151 166 129 C205 106 244 92 318 88" stroke={BRAND_BLUE} strokeWidth="9" fill="none" strokeLinecap="round" />
      <Path d="M113 160 C132 148 149 138 168 128" stroke={SKIPPED_RED} strokeWidth="14" fill="none" strokeLinecap="round" />
      <AnimatedPath d="M120 151 C152 102 205 78 248 93 C278 104 291 126 306 142" stroke={DETOUR_ORANGE} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="14 9" animatedProps={routeDashProps} />
      <AnimatedG animatedProps={pulseProps}>
        <Circle cx="0" cy="0" r="13" fill={COLORS.errorSubtle} />
        <Circle cx="0" cy="0" r="7" fill={SKIPPED_RED} />
      </AnimatedG>
      <Circle cx="154" cy="136" r="13" fill={COLORS.errorSubtle} />
      <Circle cx="154" cy="136" r="7" fill={SKIPPED_RED} />
      {renderBus()}
      <Rect x="42" y="220" width="252" height="46" rx="18" fill={COLORS.white} />
      <Circle cx="66" cy="243" r="10" fill={COLORS.warningSubtle} />
      <SvgText x="66" y="248" textAnchor="middle" fontSize="15" fontWeight="900" fill={DETOUR_ORANGE}>!</SvgText>
      <SvgText x="84" y="239" fontSize="13" fontWeight="900" fill={COLORS.textPrimary}>Route 1 is on detour</SvgText>
      <SvgText x="84" y="255" fontSize="10" fontWeight="600" fill={COLORS.textSecondary}>Two stops may be skipped nearby</SvgText>
    </G>
  );

  const renderAlertScene = () => (
    <G>
      {renderMapBase()}
      <Path d="M62 202 C110 168 166 132 315 97" stroke={BRAND_BLUE} strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.35" />
      <Path d="M118 151 C154 105 211 78 260 98 C286 109 305 132 320 151" stroke={DETOUR_ORANGE} strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray="12 8" />
      <Rect x="48" y="103" width="294" height="102" rx="24" fill={COLORS.white} />
      <Rect x="68" y="123" width="46" height="46" rx="15" fill={COLORS.warningSubtle} />
      <SvgText x="91" y="154" textAnchor="middle" fontSize="28" fontWeight="900" fill={DETOUR_ORANGE}>!</SvgText>
      <SvgText x="132" y="137" fontSize="17" fontWeight="900" fill={COLORS.textPrimary}>Detour detected</SvgText>
      <SvgText x="132" y="158" fontSize="12" fontWeight="700" fill={COLORS.textSecondary}>Route change near downtown Barrie</SvgText>
      <SvgText x="132" y="178" fontSize="11" fontWeight="700" fill={BRAND_BLUE_DARK}>View affected stops</SvgText>
    </G>
  );

  const renderLiveScene = () => (
    <G>
      {renderMapBase()}
      <Path d="M55 204 C99 163 145 136 193 119 C235 104 278 96 328 88" stroke={BRAND_BLUE} strokeWidth="8" fill="none" strokeLinecap="round" />
      <G transform="translate(86 174)"><Rect width="48" height="28" rx="8" fill={BRAND_BLUE} /><SvgText x="24" y="19" textAnchor="middle" fontSize="9" fontWeight="900" fill={COLORS.white}>LIVE</SvgText></G>
      <G transform="translate(180 116)"><Rect width="48" height="28" rx="8" fill={BRAND_BLUE_LIGHT} /><SvgText x="24" y="19" textAnchor="middle" fontSize="9" fontWeight="900" fill={COLORS.white}>LIVE</SvgText></G>
      <G transform="translate(276 83)"><Rect width="48" height="28" rx="8" fill={BRAND_BLUE_DARK} /><SvgText x="24" y="19" textAnchor="middle" fontSize="9" fontWeight="900" fill={COLORS.white}>LIVE</SvgText></G>
      <Rect x="64" y="219" width="214" height="34" rx="17" fill={COLORS.white} />
      <SvgText x="84" y="241" fontSize="12" fontWeight="800" fill={COLORS.textPrimary}>Live buses on the Barrie map</SvgText>
    </G>
  );

  const renderFavoritesScene = () => (
    <G>
      <Rect x="34" y="82" width="322" height="176" rx="28" fill={COLORS.white} />
      <Rect x="58" y="107" width="274" height="46" rx="18" fill="#EAF7FF" />
      <Circle cx="82" cy="130" r="13" fill={BRAND_BLUE} />
      <SvgText x="82" y="135" textAnchor="middle" fontSize="13" fontWeight="900" fill={COLORS.white}>1</SvgText>
      <SvgText x="106" y="126" fontSize="14" fontWeight="900" fill={COLORS.textPrimary}>Route 1</SvgText>
      <SvgText x="106" y="143" fontSize="10" fontWeight="700" fill={COLORS.textSecondary}>Saved route alerts</SvgText>
      <SvgText x="306" y="137" textAnchor="middle" fontSize="24" fontWeight="900" fill={DETOUR_ORANGE}>★</SvgText>
      <Rect x="58" y="166" width="274" height="46" rx="18" fill={COLORS.grey50} />
      <Circle cx="82" cy="189" r="13" fill={BRAND_BLUE_LIGHT} />
      <SvgText x="82" y="194" textAnchor="middle" fontSize="13" fontWeight="900" fill={COLORS.white}>S</SvgText>
      <SvgText x="106" y="185" fontSize="14" fontWeight="900" fill={COLORS.textPrimary}>Downtown Terminal</SvgText>
      <SvgText x="106" y="202" fontSize="10" fontWeight="700" fill={COLORS.textSecondary}>Saved stop</SvgText>
      <SvgText x="306" y="196" textAnchor="middle" fontSize="24" fontWeight="900" fill={DETOUR_ORANGE}>★</SvgText>
    </G>
  );

  const renderStartScene = () => (
    <G>
      <Rect x="38" y="78" width="314" height="184" rx="30" fill={COLORS.white} />
      <Rect x="58" y="98" width="274" height="82" rx="24" fill="#EAF7FF" />
      <Path d="M78 156 C116 130 166 116 229 112 C263 110 291 105 318 96" stroke={BRAND_BLUE} strokeWidth="7" fill="none" strokeLinecap="round" />
      <Circle cx="122" cy="136" r="8" fill={BRAND_BLUE} />
      <Circle cx="206" cy="115" r="8" fill={BRAND_BLUE_LIGHT} />
      <Rect x="72" y="196" width="112" height="42" rx="18" fill={BRAND_BLUE} />
      <SvgText x="128" y="222" textAnchor="middle" fontSize="13" fontWeight="900" fill={COLORS.white}>Plan a trip</SvgText>
      <Rect x="200" y="196" width="112" height="42" rx="18" fill={COLORS.warningSubtle} />
      <SvgText x="256" y="222" textAnchor="middle" fontSize="13" fontWeight="900" fill={DETOUR_ORANGE}>Check alerts</SvgText>
    </G>
  );

  const scenes = [renderDetourMap, renderAlertScene, renderLiveScene, renderFavoritesScene, renderStartScene];
  const renderScene = scenes[Math.min(Math.max(slideIndex, 0), scenes.length - 1)] || renderDetourMap;

  return (
    <Svg width={SCREEN_WIDTH} height={SCENE_HEIGHT} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
      <Rect x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill={BRAND_BLUE} />
      <Circle cx="342" cy="20" r="112" fill={BRAND_BLUE_LIGHT} opacity="0.35" />
      <Circle cx="-20" cy="265" r="125" fill={BRAND_BLUE_DARK} opacity="0.3" />
      {renderBrandHeader()}
      {renderScene()}
    </Svg>
  );
};

export default OnboardingScene;
