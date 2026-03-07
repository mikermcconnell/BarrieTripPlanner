# Onboarding Animated Scene Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace static emoji icons on the onboarding screen with a continuous, looping transit-themed animated SVG scene in the top half of the screen.

**Architecture:** Single new component `OnboardingScene.js` renders an SVG canvas with animated transit elements (bus, route line, bus stops, map pins, clouds). All animations use Reanimated v4 `withRepeat` loops. The existing `OnboardingScreen.js` is restructured to show the scene in the top half with text content below.

**Tech Stack:** react-native-reanimated v4 (installed), react-native-svg (installed), no new dependencies.

---

### Task 1: Create OnboardingScene component with static SVG elements

**Files:**
- Create: `src/components/OnboardingScene.js`

**Step 1: Create the component with all static SVG shapes**

Create `src/components/OnboardingScene.js` with the full scene layout — sky background, road, route line, bus, bus stops, map pins, and clouds. All static (no animation yet). Use theme colors from `src/config/theme.js`.

```jsx
import React, { useEffect } from 'react';
import { Dimensions } from 'react-native';
import Svg, { Rect, Circle, G, Path, Line } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '../config/theme';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCENE_HEIGHT = 280;

// Scene layout constants
const SKY_COLOR = COLORS.secondarySubtle;    // #E6F2FF
const ROAD_Y = SCENE_HEIGHT - 40;            // road near bottom
const ROAD_HEIGHT = 40;
const ROUTE_LINE_Y = ROAD_Y - 5;             // route line sits on road
const BUS_Y = ROAD_Y - 28;                   // bus sits on road
const BUS_WIDTH = 60;
const BUS_HEIGHT = 30;

const OnboardingScene = () => {
  // --- Shared values (animations wired in Task 2) ---
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
  const dashOffset = useSharedValue(0);

  // --- Animated props ---
  const busAnimatedProps = useAnimatedProps(() => ({
    transform: [{ translateX: busX.value }, { translateY: BUS_Y }],
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
    transform: [
      { translateX: SCREEN_WIDTH * 0.3 },
      { translateY: 90 },
      { scale: pin1Scale.value },
    ],
    opacity: pin1Opacity.value,
  }));
  const pin2Props = useAnimatedProps(() => ({
    transform: [
      { translateX: SCREEN_WIDTH * 0.7 },
      { translateY: 110 },
      { scale: pin2Scale.value },
    ],
    opacity: pin2Opacity.value,
  }));

  return (
    <Svg
      width={SCREEN_WIDTH}
      height={SCENE_HEIGHT}
      viewBox={`0 0 ${SCREEN_WIDTH} ${SCENE_HEIGHT}`}
    >
      {/* Sky */}
      <Rect x="0" y="0" width={SCREEN_WIDTH} height={SCENE_HEIGHT} fill={SKY_COLOR} />

      {/* Clouds */}
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

      {/* Map pins */}
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

      {/* Bus stop signs */}
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

      {/* Road */}
      <Rect x="0" y={ROAD_Y} width={SCREEN_WIDTH} height={ROAD_HEIGHT} fill={COLORS.grey200} />
      {/* Road dashes */}
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

      {/* Route line (dashed, on road) */}
      <Line
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

      {/* Bus */}
      <AnimatedG animatedProps={busAnimatedProps}>
        {/* Bus body */}
        <Rect x="0" y="0" width={BUS_WIDTH} height={BUS_HEIGHT - 6} rx="4" fill={COLORS.primary} />
        {/* Windshield */}
        <Rect x={BUS_WIDTH - 14} y="3" width="10" height="12" rx="2" fill={COLORS.secondarySubtle} />
        {/* Windows */}
        <Rect x="6" y="4" width="8" height="8" rx="1.5" fill={COLORS.secondarySubtle} opacity={0.9} />
        <Rect x="18" y="4" width="8" height="8" rx="1.5" fill={COLORS.secondarySubtle} opacity={0.9} />
        <Rect x="30" y="4" width="8" height="8" rx="1.5" fill={COLORS.secondarySubtle} opacity={0.9} />
        {/* Wheels */}
        <Circle cx="14" cy={BUS_HEIGHT - 6} r="5" fill={COLORS.grey800} />
        <Circle cx="14" cy={BUS_HEIGHT - 6} r="2.5" fill={COLORS.grey500} />
        <Circle cx={BUS_WIDTH - 14} cy={BUS_HEIGHT - 6} r="5" fill={COLORS.grey800} />
        <Circle cx={BUS_WIDTH - 14} cy={BUS_HEIGHT - 6} r="2.5" fill={COLORS.grey500} />
        {/* Headlight */}
        <Circle cx={BUS_WIDTH - 3} cy="16" r="2.5" fill={COLORS.accent} opacity={0.9} />
      </AnimatedG>
    </Svg>
  );
};

export default OnboardingScene;
```

**Step 2: Verify build**

Run: `npx expo export --platform web 2>&1 | head -5` or equivalent quick build check.
Expected: No import/syntax errors.

**Step 3: Commit**

```bash
git add src/components/OnboardingScene.js
git commit -m "feat(onboarding): add OnboardingScene component with static SVG transit scene"
```

---

### Task 2: Wire up all animations

**Files:**
- Modify: `src/components/OnboardingScene.js`

**Step 1: Add useEffect with all animation loops**

Add a single `useEffect` inside `OnboardingScene` that starts all animation loops:

```jsx
useEffect(() => {
  // Bus: drive left to right in 8s, loop
  busX.value = withRepeat(
    withTiming(SCREEN_WIDTH + BUS_WIDTH, { duration: 8000, easing: Easing.linear }),
    -1, // infinite
    false // don't reverse — snap back
  );

  // Clouds: drift right to left at different speeds
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

  // Bus stop bob: ±4px, 3s cycle, staggered starts
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

  // Map pin pulse: scale 1.0 → 1.15 → 1.0, 2s cycle
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
}, []);
```

**Important note on bus loop:** `withRepeat` with `false` for `reverse` will snap the value back to its initial value after each iteration. Since `busX` starts at `-BUS_WIDTH`, it will animate to `SCREEN_WIDTH + BUS_WIDTH`, then snap back to `-BUS_WIDTH` and repeat — creating seamless drive-across.

**Important note on cloud loops:** Each cloud starts at its initial X position and drifts left to `-60`/`-70`/`-50` (off-screen left). `withRepeat` snaps back to the starting position. The different durations create a parallax feel.

**Step 2: Verify build and visual check**

Run web dev server and navigate to onboarding (clear AsyncStorage `ONBOARDING_KEY` if needed):
```bash
npx expo start --web
```
Expected: All elements animate smoothly. Bus drives across, clouds drift, stops bob, pins pulse.

**Step 3: Commit**

```bash
git add src/components/OnboardingScene.js
git commit -m "feat(onboarding): wire up all animation loops for transit scene"
```

---

### Task 3: Integrate OnboardingScene into OnboardingScreen

**Files:**
- Modify: `src/screens/OnboardingScreen.js:73-79` (renderSlide function)
- Modify: `src/screens/OnboardingScreen.js:81-99` (main layout)
- Modify: `src/screens/OnboardingScreen.js:132-161` (styles)

**Step 1: Restructure the layout**

The current layout is a full-screen FlatList with centered emoji + text per slide. The new layout:
- Top half: `<OnboardingScene />` (fixed, not scrolling)
- Bottom half: FlatList with text only (no icons)

Changes to `OnboardingScreen.js`:

1. Add import at top:
```jsx
import OnboardingScene from '../components/OnboardingScene';
```

2. Remove `icon` rendering from `renderSlide` — only show title + description:
```jsx
const renderSlide = ({ item }) => (
  <View style={styles.slide}>
    <Text style={styles.slideTitle}>{item.title}</Text>
    <Text style={styles.slideDescription}>{item.description}</Text>
  </View>
);
```

3. Restructure main return to have scene above FlatList:
```jsx
return (
  <View style={styles.container}>
    {/* Animated scene — top half */}
    <OnboardingScene />

    {/* Slide text — bottom half */}
    <View style={styles.contentArea}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
    </View>

    {/* Dots */}
    <View style={styles.dotsContainer}>
      {SLIDES.map((_, index) => (
        <View
          key={index}
          style={[styles.dot, currentIndex === index && styles.dotActive]}
        />
      ))}
    </View>

    {/* Bottom buttons */}
    <View style={styles.bottomBar}>
      {/* ... unchanged ... */}
    </View>
  </View>
);
```

4. Update styles:
```jsx
// Remove slideIcon style entirely

// Update slide to be text-only, no centering vertically
slide: {
  width: SCREEN_WIDTH,
  justifyContent: 'flex-start',
  alignItems: 'center',
  paddingHorizontal: SPACING.xxl,
  paddingTop: SPACING.xl,
},

// Add contentArea wrapper
contentArea: {
  flex: 1,
},
```

**Step 2: Verify build and visual check**

Run: `npx expo start --web`
Expected: Animated scene fills top ~280px. Text slides scroll below. Dots and buttons at bottom. No layout overflow.

**Step 3: Commit**

```bash
git add src/screens/OnboardingScreen.js
git commit -m "feat(onboarding): integrate animated transit scene, replace emoji icons"
```

---

### Task 4: Polish and edge cases

**Files:**
- Modify: `src/components/OnboardingScene.js` (if needed)
- Modify: `src/screens/OnboardingScreen.js` (if needed)

**Step 1: Test on narrow screens**

Check that `Dimensions.get('window').width` is used everywhere (not hardcoded widths). The scene should scale to any screen width since all positions use `SCREEN_WIDTH` multipliers.

**Step 2: Test that onboarding completion still works**

1. Swipe through all 4 slides — verify text changes correctly
2. Tap "Get Started" on last slide — verify `onComplete` fires
3. Tap "Skip" — verify `onComplete` fires with analytics event
4. Kill and reopen app — onboarding should NOT show again (AsyncStorage key)

**Step 3: Verify no performance issues**

Check that animations don't cause dropped frames. All animations use Reanimated's worklet thread (not JS thread) via `useAnimatedProps`. If any jank is observed:
- Ensure `useAnimatedProps` is used (not `useAnimatedStyle` with inline transforms)
- Ensure no JS-thread work in animation callbacks

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(onboarding): polish animated transit scene, verify edge cases"
```

---

### Summary

| Task | What | Files | ~Time |
|------|------|-------|-------|
| 1 | Static SVG scene | Create `OnboardingScene.js` | 5 min |
| 2 | Wire animations | Modify `OnboardingScene.js` | 5 min |
| 3 | Integrate into screen | Modify `OnboardingScreen.js` | 5 min |
| 4 | Polish & edge cases | Both files if needed | 3 min |
