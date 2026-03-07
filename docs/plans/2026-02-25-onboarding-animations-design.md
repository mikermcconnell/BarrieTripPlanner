# Onboarding Animated Scene Design

**Date:** 2026-02-25
**Status:** Approved

## Summary

Replace the static emoji icons on the onboarding screen with a continuous, looping transit-themed animated illustration in the top ~50% of each slide. Built entirely with SVG + Reanimated v4 — no new dependencies.

## Visual Elements

| Element | Animation | Color |
|---|---|---|
| Bus | Drives left→right, loops seamlessly; wheels rotate | `#4CAF50` (primary) |
| Route line | Dashed line draws itself, fades, redraws | `#0066CC` (secondary) |
| Bus stop signs (2-3) | Gentle vertical bob (±4px, 3s cycle) | `#FF991F` (accent) |
| Map pins (2-3) | Pulse scale 1.0→1.15→1.0 with opacity (2s) | `#4CAF50` + white center |
| Clouds (2-3) | Slow drift right→left, varied speeds (15-25s) | `#DFE1E6` (grey 300) |
| Ground/road | Static flat strip with dashed center line | `#EBECF0` / `#C1C7D0` |

## Color Palette

- Sky/background: `#E6F2FF` (secondary subtle)
- Bus body: `#4CAF50` (primary)
- Route line: `#0066CC` (secondary)
- Bus stops: `#FF991F` (accent)
- Map pins: `#4CAF50` with `#FFFFFF` center
- Clouds: `#DFE1E6`
- Road: `#EBECF0` with `#C1C7D0` dashes

## Layout

```
┌──────────────────────────┐
│  ☁        ☁         ☁   │  clouds drift slowly
│      📍          📍      │  map pins pulse
│                          │
│   🚏      🚏       🚏   │  bus stops bob
│───🚌─ ─ ─ ─ ─ ─ ─ ─ ───│  bus drives on route line
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  road
├──────────────────────────┤
│     Slide text content   │  changes per slide
│     ● ○ ○ ○    [Next]   │  dots + button
└──────────────────────────┘
```

## Animation Timing

| Element | Duration | Easing |
|---|---|---|
| Bus traverse | ~8s per loop | linear |
| Wheel rotation | continuous | linear |
| Cloud drift | 15-25s (varied) | linear |
| Bus stop bob | 3s per cycle | ease-in-out |
| Map pin pulse | 2s per cycle | ease-in-out |
| Route line dash | 4s draw cycle | ease-in-out |

## Architecture

- **New file:** `src/components/OnboardingScene.js` — animated SVG scene
- **Modified:** `src/screens/OnboardingScreen.js` — replace emoji area with `<OnboardingScene />`
- No `.web.js` variant needed (Reanimated v4 + react-native-svg are cross-platform)
- No new dependencies

## Motion Style

Moderate & playful — noticeable movement with personality. Bus clearly driving, clouds moving, elements bouncing lightly. Not overwhelming or distracting from the text content.

## Technical Approach

- All shapes rendered with `react-native-svg` (`Svg`, `Rect`, `Circle`, `Path`, `G`)
- Animations via `react-native-reanimated` v4 (`useSharedValue`, `useAnimatedStyle`, `withRepeat`, `withTiming`, `withSequence`)
- Bus seamless loop: translate from off-screen left to off-screen right, reset instantly
- Clouds: staggered start positions and speeds for natural parallax feel
- Pin/stop animations: `withRepeat` + `withSequence` for continuous cycling
