# Navigation Screen Enterprise-Level Improvements

**Date:** 2026-03-01
**Status:** Approved

## Goal

Bring the NavigationScreen (trip instruction/turn-by-turn experience) to enterprise-level quality comparable to Google Maps. Nine improvements addressing bugs, visual quality, UX gaps, and missing features.

## Design Decisions

- **Direction arrows:** Clean geometric SVG arrows (not cartoon-style) for instant readability
- **Trip completion:** Full-screen summary with trip stats, 5-star rating, optional feedback
- **Navigation flow:** User hits "Go" -> NavigationScreen (fullScreenModal) — tab bar must be hidden

---

## 1. Fix Error Leaking to UI

**Problem:** Raw JS error "Walking directions error: TypeError: Network re..." shown to user.
**Root cause:** Error surfaces from walkingService.js or upstream caller, bypassing the silent catch in NavigationScreen.
**Fix:** Audit walkingService.js for toast/console calls that surface raw errors. Ensure all walking direction errors are caught silently with graceful fallback. Remove or suppress any error banner/toast for walking enrichment failures.
**Files:** `src/services/walkingService.js`, `src/screens/HomeScreen.js` (check for error state rendering)

## 2. Replace Emoji Arrows with Geometric SVG Icons

**Problem:** Unicode arrows (arrows like the up arrow, left arrow, etc.) at 36px are not enterprise-grade.
**Fix:** Create `DirectionArrows.js` with 10 clean SVG arrow components using react-native-svg:
- `ArrowStraight` - bold up arrow
- `ArrowLeft` / `ArrowRight` - 90-degree turn arrows
- `ArrowSharpLeft` / `ArrowSharpRight` - tight turn arrows
- `ArrowSlightLeft` / `ArrowSlightRight` - gentle curve arrows
- `ArrowUturn` - U-turn loop
- `ArrowArrive` - checkmark in circle
- `ArrowDepart` - up arrow with base dot

Style: White fill on colored background, 2-3px stroke weight, rounded line caps. Viewbox 24x24, scales to container.
**Files:** New `src/components/navigation/DirectionArrows.js`, modify `src/components/navigation/WalkingInstructionCard.js`

## 3. Improve Walking Fallback When API Fails

**Problem:** When LocationIQ fails, user sees "Walk to your destination" with no useful detail.
**Fix:** Enhanced fallback step generation:
- Show destination address/name prominently
- Calculate compass bearing from origin to destination (N/NE/E/SE/S/SW/W/NW)
- Show straight-line distance
- Instruction: "Head [direction] toward [destination name]"
- Subtitle: "Detailed turn-by-turn unavailable - follow the route on map"
- Keep the distance and basic arrow (depart arrow pointing in compass direction)

Uses existing data: leg.from.lat/lon, leg.to.lat/lon, leg.to.name
**Files:** `src/services/walkingService.js` (improve fallback generation), `src/components/navigation/WalkingInstructionCard.js` (render fallback notice)

## 4. Step Counter + Enhanced Progress Bar

**Problem:** Progress dots give zero context about what each leg is or how long it takes.

### Progress Bar Redesign (NavigationProgressBar.js)
Replace dots with mode-aware leg indicators:
- Each leg shows: mode icon (Walk/Bus/Phone) + duration text
- Bus legs also show route short name in colored badge
- Current leg: highlighted with primary border, slightly larger
- Completed legs: green checkmark overlay, dimmed
- Connectors: solid line for completed, dashed for upcoming

Layout: Horizontal row, each leg is an icon+label pill connected by lines.

### Step Counter in WalkingInstructionCard
Add "Step X of Y" text below the distance indicator when walking leg has multiple steps.
Only shown when totalSteps > 1.

**Files:** `src/components/navigation/NavigationProgressBar.js`, `src/components/navigation/WalkingInstructionCard.js`

## 5. StepOverviewSheet Improvements

**Problem:** Users don't know the expandable sheet exists. Handle bar is the only affordance.
**Fix:**
- Default to expanded on mount: `useState(true)` instead of `useState(false)`
- Add "All steps" text label + leg count next to handle bar
- Add chevron icon that rotates on expand/collapse
- Add subtle "tap to collapse/expand" hint on first use

**Files:** `src/components/navigation/StepOverviewSheet.js`

## 6. Trip Completion Screen

**Problem:** `Alert.alert('Trip Complete!')` is not enterprise-grade.
**Fix:** New `TripCompletionScreen.js` component rendered as an overlay when `isNavigationComplete` is true.

### Layout (top to bottom):
1. **Animated checkmark** - green circle with animated checkmark drawing in (using Animated API)
2. **"You've arrived!"** heading - large, centered
3. **Trip summary card:**
   - Total trip time (from navigation start to completion)
   - Total distance (sum of all leg distances)
   - Legs completed (e.g., "2 walks, 1 bus ride")
   - Route taken (brief: "Route 8A via Bayfield St")
4. **5-star rating row** - 5 star icons, tap to rate, stars fill on selection
5. **Feedback input** - collapsed by default, "Add feedback" link expands a TextInput
6. **"Done" button** - primary CTA, navigates back to HomeScreen (MapMain with exitTripPlanning flag)

Rating/feedback stored via AsyncStorage for later submission or analytics.

**Files:** New `src/components/navigation/TripCompletionScreen.js`, modify `src/screens/NavigationScreen.js` (replace Alert with component render)

## 7. Walked-Portion Polyline Dimming

**Problem:** No visual indication of progress along the current leg's route.
**Fix:** In the `routePolylines` useMemo:
- For the current leg, use `findClosestPointIndex(coordinates, userLocation)` to find split point
- Split coordinates into two arrays: traveled (0..splitIndex) and remaining (splitIndex..end)
- Render traveled portion at 0.25 opacity, remaining at 1.0 opacity
- Already-completed legs: reduce from 0.5 to 0.25 opacity for stronger contrast

Requires `userLocation` as a dependency in the useMemo.
Uses existing `findClosestPointIndex` from `src/utils/polylineUtils.js`.

**Files:** `src/screens/NavigationScreen.js` (routePolylines useMemo), `src/screens/NavigationScreen.web.js` (same logic)

## 8. Intermediate Stop Names in BusProximityCard

**Problem:** Users see "3 stops remaining" but not which stops.
**Fix:** Add expandable intermediate stop list when on board:

### Layout:
- "Show X stops" / "Hide stops" toggle button below the status section
- When expanded, vertical list with timeline visualization:
  - Passed stops: dimmed text + checkmark
  - Current position: highlighted blue dot + "You are here"
  - Upcoming stops: normal text
  - Destination: red dot + bold text
- Smooth height animation on expand/collapse

Data source: `currentLeg.intermediateStops[]` array (already available in the leg object).
Each stop has: `name`, `stopCode`, `stopId`, `arrival`, `departure`.

**Files:** `src/components/navigation/BusProximityCard.js`

## 9. Hide Tab Bar on NavigationScreen

**Problem:** Tab bar (Map/Search/Profile) bleeds through on Android because `fullScreenModal` in a nested stack doesn't hide it.
**Fix:** In NavigationScreen's mount useEffect, call `navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } })`. On unmount, restore it: `navigation.getParent()?.setOptions({ tabBarStyle: undefined })`.

This is the standard React Navigation pattern for hiding tabs on specific screens in a nested stack.

**Files:** `src/screens/NavigationScreen.js`, `src/screens/NavigationScreen.web.js`

---

## Files Summary

| File | Action | Improvements |
|---|---|---|
| `src/services/walkingService.js` | Modify | #1, #3 |
| `src/screens/HomeScreen.js` | Modify | #1 |
| `src/components/navigation/DirectionArrows.js` | **Create** | #2 |
| `src/components/navigation/WalkingInstructionCard.js` | Modify | #2, #3, #4 |
| `src/components/navigation/NavigationProgressBar.js` | Modify | #4 |
| `src/components/navigation/StepOverviewSheet.js` | Modify | #5 |
| `src/components/navigation/TripCompletionScreen.js` | **Create** | #6 |
| `src/screens/NavigationScreen.js` | Modify | #6, #7, #9 |
| `src/screens/NavigationScreen.web.js` | Modify | #7, #9 |
| `src/components/navigation/BusProximityCard.js` | Modify | #8 |
| `src/navigation/TabNavigator.js` | Modify (if needed) | #9 |
