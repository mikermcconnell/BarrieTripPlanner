# Trip Directions Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the step-by-step trip navigation to Google Maps quality — better walking instructions, boarding/transfer previews, schedule-based ETA, smart map zoom, polyline trimming, compass heading, OTP step adapter, off-route detection, and missed bus handling.

**Architecture:** All changes target the existing NavigationScreen and its child components/hooks. No new screens. The data model already supports most features — we thread existing data to new UI, add an OTP step adapter, and enhance map camera behavior. Both native (.js) and web (.web.js) files must be updated in parallel.

**Tech Stack:** React Native, Expo, MapLibreGL (native), Leaflet (web), react-native-svg, expo-location

**Design doc:** `docs/plans/2026-03-03-trip-directions-upgrade-design.md`

---

## Task 1: OTP Walk Step Adapter

The foundational data fix. Without this, all walking improvements are unreliable when LocationIQ enrichment fails.

**Files:**
- Modify: `src/services/walkingService.js` (add adapter function)
- Modify: `src/services/tripService.js:337` (normalize steps in `formatLeg`)

**Step 1: Add `normalizeOtpSteps` function to walkingService.js**

Add after the existing `formatWalkingSteps` function (~line 148):

```js
/**
 * Normalize OTP walk steps to OSRM format used by WalkingInstructionCard.
 * OTP uses relativeDirection/absoluteDirection; our cards expect type/modifier.
 */
const OTP_DIRECTION_MAP = {
  DEPART: { type: 'depart', modifier: null },
  CONTINUE: { type: 'continue', modifier: 'straight' },
  LEFT: { type: 'turn', modifier: 'left' },
  RIGHT: { type: 'turn', modifier: 'right' },
  SLIGHTLY_LEFT: { type: 'turn', modifier: 'slight left' },
  SLIGHTLY_RIGHT: { type: 'turn', modifier: 'slight right' },
  HARD_LEFT: { type: 'turn', modifier: 'sharp left' },
  HARD_RIGHT: { type: 'turn', modifier: 'sharp right' },
  UTURN_LEFT: { type: 'turn', modifier: 'uturn' },
  UTURN_RIGHT: { type: 'turn', modifier: 'uturn' },
};

export const normalizeOtpSteps = (steps) => {
  if (!Array.isArray(steps) || steps.length === 0) return steps;
  // Already in OSRM format (has type/modifier from LocationIQ enrichment)
  if (steps[0].type || steps[0].modifier) return steps;
  // OTP format — has relativeDirection
  if (!steps[0].relativeDirection) return steps;

  return steps.map((step) => {
    const mapped = OTP_DIRECTION_MAP[step.relativeDirection] || { type: 'continue', modifier: 'straight' };
    return {
      type: mapped.type,
      modifier: mapped.modifier,
      name: step.streetName || '',
      instruction: step.streetName
        ? `${mapped.type === 'depart' ? 'Head' : mapped.modifier === 'straight' ? 'Continue' : `Turn ${mapped.modifier}`} on ${step.streetName}`
        : `${mapped.type === 'depart' ? 'Start walking' : mapped.modifier === 'straight' ? 'Continue straight' : `Turn ${mapped.modifier}`}`,
      distance: step.distance || 0,
      duration: step.duration || 0,
    };
  });
};
```

**Step 2: Apply normalization in tripService.js formatLeg**

At `tripService.js:337`, change `steps: leg.steps` to:

```js
steps: leg.mode === 'WALK' ? normalizeOtpSteps(leg.steps) : undefined,
```

Import `normalizeOtpSteps` from `walkingService.js` at the top of `tripService.js`.

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/services/walkingService.js src/services/tripService.js
git commit -m "fix: normalize OTP walk steps to OSRM format for WalkingInstructionCard"
```

---

## Task 2: SVG Turn Icons for Walking Instructions

Replace unicode arrow characters with proper SVG turn-arrow icons.

**Files:**
- Create: `src/components/navigation/TurnIcon.js` (shared SVG icon component)
- Modify: `src/components/navigation/WalkingInstructionCard.js:17-28, 116-118`

**Step 1: Create TurnIcon component**

Create `src/components/navigation/TurnIcon.js` — an SVG icon component that renders turn arrows based on OSRM `type`/`modifier`. Use `react-native-svg` (`<Svg>`, `<Path>`) for cross-platform compatibility. Each icon is a filled arrow in a colored circle.

Icon variants needed: `turn-left`, `turn-right`, `slight-left`, `slight-right`, `sharp-left`, `sharp-right`, `uturn`, `straight`, `depart`, `arrive`. Use mirrored/rotated versions of a base arrow path to minimize SVG paths.

Props: `type`, `modifier`, `size` (default 40), `color` (default COLORS.primary).

**Step 2: Replace unicode arrows in WalkingInstructionCard**

- Remove the `DIRECTION_ARROWS` map (lines 17-28)
- Remove the `getDirectionArrow` function (lines 39-43)
- Import `TurnIcon` component
- Replace the arrow character `<Text>` at lines 116-118 with `<TurnIcon type={currentStep.type} modifier={currentStep.modifier} size={40} color={arrowColor} />`
- Keep `getArrowColor` (lines 46-52) for the color prop

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/components/navigation/TurnIcon.js src/components/navigation/WalkingInstructionCard.js
git commit -m "feat(nav): replace unicode arrows with SVG turn icons in walking instructions"
```

---

## Task 3: Enhanced Walking Instruction Card Content

Add time per step, street name, step counter, and peek-ahead preview.

**Files:**
- Modify: `src/components/navigation/WalkingInstructionCard.js`
- Modify: `src/screens/NavigationScreen.js:765-774` (pass new props)
- Modify: `src/screens/NavigationScreen.web.js:861-870` (pass new props)

**Step 1: Update WalkingInstructionCard props and layout**

Add new props: `currentStepIndex`, `totalSteps`, `nextLegPreview` (string or null).

Update the card layout:
- **Street name** — Large text at top of card showing `currentStep.name` (when non-empty and not bogusName). Replaces the `destinationHeader` section.
- **Time + distance** — Change `"{stepDistance} to next turn"` to `"{stepMinutes} · {stepDistance}"` using `Math.ceil(currentStep.duration / 60)` for minutes.
- **Step counter** — Small "Step {currentStepIndex + 1} of {totalSteps}" text below the instruction.
- **Peek-ahead preview** — When `nextLegPreview` is provided, show a subtle one-line preview: e.g., "Then board Route 8 at 2:45 PM". Shown below the step counter in muted text.

**Step 2: Thread new props from NavigationScreen.js**

At lines 765-774, add:
```js
currentStepIndex={currentStepIndex}
totalSteps={(currentLeg?.steps || []).length}
nextLegPreview={nextLegPreviewText}
```

Compute `nextLegPreviewText` in the screen component: if the next leg is a transit leg, format as "Then board Route {shortName} at {stopName} (#{stopCode}) at {time}".

**Step 3: Same changes in NavigationScreen.web.js**

Mirror the prop threading at lines 861-870.

**Step 4: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add src/components/navigation/WalkingInstructionCard.js src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): add time per step, street name, step counter, and peek-ahead to walking card"
```

---

## Task 4: BoardingInstructionCard + BusProximityCard Peek-Ahead

Create the synthesized boarding card and add peek-ahead preview to the alighting state.

**Files:**
- Create: `src/components/navigation/BoardingInstructionCard.js`
- Modify: `src/components/navigation/BusProximityCard.js` (add peek-ahead to alighting state)
- Modify: `src/screens/NavigationScreen.js:777-798` (conditionally render BoardingInstructionCard)
- Modify: `src/screens/NavigationScreen.web.js:872-893` (same)

**Step 1: Create BoardingInstructionCard**

A new card shown when the user is in `waiting` transit status (before the bus arrives). Synthesized instruction:

```
┌──────────────────────────────────────────┐
│  [Route Badge 8]  Georgian Mall          │
│                                          │
│  Board at Bay Terminal, Stop #42         │
│  Departing 2:15 PM          ⏱ 3 min     │
│  [+2 min late]               [LIVE]      │
│                                          │
│  Next: Ride 12 min (5 stops) to Dunlop  │
└──────────────────────────────────────────┘
```

Props: `routeShortName`, `routeColor`, `headsign`, `stopName`, `stopCode`, `scheduledDeparture`, `delaySeconds`, `isRealtime`, `peekAheadText`.

**Step 2: Add peek-ahead text to BusProximityCard alighting state**

Add a `nextLegPreview` prop to `BusProximityCard`. When `isOnBoard && (nearAlightingStop || stopsUntilAlighting <= 3)` and `nextLegPreview` is provided, show a one-line preview below the stop info: "Next: Walk 2 min to Dunlop & Bayfield (#38) for Route 3".

**Step 3: Update NavigationScreen.js rendering**

At lines 777-798, split the transit card rendering:
- When `transitStatus === 'waiting'` and bus has NOT arrived: render `<BoardingInstructionCard>` instead of `<BusProximityCard>`
- When bus has arrived or user is on board: render `<BusProximityCard>` as before, with the new `nextLegPreview` prop

Compute `nextLegPreviewText` for the bus card: if the next leg after current is WALK, format "Walk {distance} to {stopName} (#{stopCode}) for Route {nextTransitShortName}".

**Step 4: Same changes in NavigationScreen.web.js**

**Step 5: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 6: Commit**

```bash
git add src/components/navigation/BoardingInstructionCard.js src/components/navigation/BusProximityCard.js src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): add BoardingInstructionCard and peek-ahead previews for transfers"
```

---

## Task 5: Three-Tier Alighting Warnings + Monotonic Stop Counter

**Files:**
- Modify: `src/hooks/useBusProximity.js:162-195, 227-233`
- Modify: `src/components/navigation/BusProximityCard.js:97-116`

**Step 1: Implement monotonic stop counter in useBusProximity**

Replace `calculateStopsUntilAlighting` (lines 162-195) with a version that:
- Only decrements when the user is definitively closer to stop N+1 than stop N AND >100m from stop N
- Uses a ref to track the last confirmed stop count (never increments)
- Returns `{ stopsRemaining, nearAlighting, atAlighting }` — same shape

Add `lastConfirmedStopsRef = useRef(null)` to the hook. On each calculation, only update if new count <= last confirmed count (or last is null).

**Step 2: Add three-tier warning states to BusProximityCard**

Update `getStatusMessage()` (lines 97-116) and card styles (lines 119-128):

- `stopsUntilAlighting === 3`: info style — "Your stop: {alightingStopName} in 3 stops"
- `stopsUntilAlighting === 2`: warning style (yellow) — "Prepare to exit at {alightingStopName}"
- `stopsUntilAlighting === 1` / `nearAlightingStop`: urgent warning — "Your stop is next!"
- `shouldGetOff`: red alert — "Get off now!" (existing)

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/hooks/useBusProximity.js src/components/navigation/BusProximityCard.js
git commit -m "feat(nav): three-tier alighting warnings with monotonic stop counter"
```

---

## Task 6: Schedule-Based ETA in NavigationHeader

**Files:**
- Modify: `src/components/navigation/NavigationHeader.js:15-36, 38-47`
- Modify: `src/screens/NavigationScreen.js:722-731` (pass new props)
- Modify: `src/screens/NavigationScreen.web.js:814-823` (same)

**Step 1: Replace distance-based ETA with schedule-based**

In `NavigationHeader.js`:
- Add new props: `scheduledArrivalTime` (timestamp ms), `delaySeconds` (number), `isRealtime` (boolean)
- Replace `calculateETA(totalDistanceRemaining, currentMode)` with a simple formatter:
  - If `scheduledArrivalTime`: compute `arrivalTime = scheduledArrivalTime + (delaySeconds * 1000)`, display as "Arriving ~{time}"
  - Fallback to distance-based only when `scheduledArrivalTime` is null
- Show real-time indicator when `isRealtime` is true

**Step 2: Thread props from NavigationScreen.js**

At lines 722-731, add:
```js
scheduledArrivalTime={itinerary?.legs?.[itinerary.legs.length - 1]?.endTime || null}
delaySeconds={currentLeg?.delaySeconds || 0}
isRealtime={currentLeg?.isRealtime || false}
```

**Step 3: Same in NavigationScreen.web.js**

**Step 4: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add src/components/navigation/NavigationHeader.js src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): schedule-based ETA in navigation header"
```

---

## Task 7: Auto-Zoom — Initial Fit Only, Then Hands-Off

**Files:**
- Modify: `src/screens/NavigationScreen.js:241-282` (camera effects)
- Modify: `src/screens/NavigationScreen.web.js:137-154` (MapController effects)
- Modify: `src/config/constants.js` (add MIN_NAV_ZOOM constant)

**Step 1: Add constant**

In `constants.js`, add: `export const MIN_NAV_ZOOM = 16;`

**Step 2: Per-leg auto-zoom (native)**

In `NavigationScreen.js`:
- Add `legZoomedRef = useRef(new Set())` to track which legs have been zoomed to
- Add a `useEffect` watching `currentLegIndex` that:
  - Checks `if (legZoomedRef.current.has(currentLegIndex)) return;`
  - Computes bounds from `currentLeg.from` and `currentLeg.to` coordinates (+ intermediate stops if available)
  - Calls `cameraRef.current.setCamera({ bounds, padding: { top: 100, bottom: 300, left: 50, right: 50 } })`
  - Caps zoom at `MIN_NAV_ZOOM` using `maxZoomLevel` in the camera config
  - Adds `currentLegIndex` to the Set
- Remove or gate the existing `followMode` camera effect (lines 273-282) so it doesn't fight the per-leg zoom. The user can re-enable follow mode by tapping the location button, which should set a `userOverrodeCamera` flag that prevents per-leg zoom from firing again on this leg.

**Step 3: Per-leg auto-zoom (web)**

In `NavigationScreen.web.js` `MapController` component:
- Same logic: `legZoomedRef`, per-leg fitBounds on `currentLegIndex` change
- Use `map.fitBounds(..., { padding: [50, 50], maxZoom: MIN_NAV_ZOOM })` — Leaflet's `fitBounds` supports `maxZoom` option natively
- Gate the follow-user fly-to (lines 147-154) with the same `userOverrodeCamera` approach

**Step 4: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js src/config/constants.js
git commit -m "feat(nav): auto-zoom per-leg initial fit only, then hands-off"
```

---

## Task 8: Polyline Trimming — Grey Completed, Colored Remaining

**Files:**
- Modify: `src/screens/NavigationScreen.js:334-398` (routePolylines useMemo)
- Modify: `src/screens/NavigationScreen.web.js:457-526` (same)
- Modify: `src/utils/polylineUtils.js` (add splitPolylineAtIndex helper if needed)

**Step 1: Update routePolylines useMemo (native)**

In `NavigationScreen.js`, update the `routePolylines` useMemo (lines 334-398):
- Add `userLocation` to the dependency array
- For the current leg (`index === currentLegIndex`):
  - Use `findClosestPointIndex(legCoords, userLocation.latitude, userLocation.longitude)` to find the split point
  - Emit TWO polyline entries: one for `coords.slice(0, splitIdx + 1)` with grey/dimmed styling, one for `coords.slice(splitIdx)` with full route color
- For completed legs: keep grey styling (already done)
- For future legs: keep full color (already done)

**Step 2: Same for web (NavigationScreen.web.js)**

Mirror the split logic in the web `routePolylines` useMemo (lines 457-526). Use Leaflet's `[lat, lng]` format.

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): trim polyline to show completed vs remaining path"
```

---

## Task 9: Map Heading Rotation During Walking Legs

**Files:**
- Modify: `src/screens/NavigationScreen.js` (camera heading, compass toggle button)
- Modify: `src/screens/NavigationScreen.web.js` (Leaflet map rotation, compass toggle)

**Step 1: Native — heading-up camera mode**

In `NavigationScreen.js`:
- Add state: `const [isHeadingUp, setIsHeadingUp] = useState(false);`
- In the camera `useEffect`: when `isHeadingUp && isWalkingLeg && userLocation?.heading != null`:
  - Set `cameraRef.current.setCamera({ heading: userLocation.heading, centerCoordinate: [userLocation.longitude, userLocation.latitude], zoomLevel: 17 })`
- When not walking (transit leg): force `heading: 0` (north-up)
- Add a compass toggle button (small circular button near the existing location/overview buttons). Icon: a compass SVG that rotates to show current heading. Tap toggles `isHeadingUp`.

**Step 2: Web — Leaflet rotation**

In `NavigationScreen.web.js` `MapController`:
- When `isHeadingUp && isWalkingLeg && userLocation?.heading != null`:
  - Use `map.setBearing(userLocation.heading)` (Leaflet with `leaflet-rotate` or CSS transform)
  - Note: standard Leaflet doesn't support rotation natively. Use CSS `transform: rotate(-${heading}deg)` on the map container as a simpler approach, or skip rotation on web and just hide the compass toggle on desktop browsers.
- Fallback for desktop: hide compass button, keep north-up

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): heading-up map rotation during walking legs with compass toggle"
```

---

## Task 10: Off-Route Detection During Walking

**Files:**
- Modify: `src/screens/NavigationScreen.js` (off-route detection effect + UI)
- Modify: `src/screens/NavigationScreen.web.js` (same)
- Modify: `src/services/walkingService.js` (re-route function)

**Step 1: Add off-route detection effect**

In both NavigationScreen files, add:
- State: `const [isOffRoute, setIsOffRoute] = useState(false);`
- Ref: `const offRouteTimerRef = useRef(null);`
- `useEffect` watching `[userLocation, currentLeg, isWalkingLeg]`:
  - If not walking leg or no user location, clear timer and return
  - Compute distance from user to the current leg's polyline using `pointToPolylineDistance()` from `geometryUtils.js`
  - If distance > 50m: start a 30-second timer. When timer fires, set `isOffRoute = true`
  - If distance <= 50m: clear timer, set `isOffRoute = false`

**Step 2: Add off-route banner UI**

Render a dismissible banner when `isOffRoute`:
```
┌─────────────────────────────────────┐
│ ⚠ You appear to be off-route       │
│ [Recalculate]        [Dismiss]      │
└─────────────────────────────────────┘
```

- "Recalculate" calls a new `reroute()` function that fetches walking directions from current position to `currentLeg.to` via `walkingService.getWalkingDirections()`, then replaces the current leg's steps and geometry
- "Dismiss" hides the banner and resets the off-route state

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js src/services/walkingService.js
git commit -m "feat(nav): off-route detection with recalculate option during walking"
```

---

## Task 11: Missed Bus & Stale Itinerary Checks

**Files:**
- Modify: `src/screens/NavigationScreen.js` (mount check + missed bus detection)
- Modify: `src/screens/NavigationScreen.web.js` (same)

**Step 1: Stale itinerary check on mount**

In both NavigationScreen files, add a check after the enrichment effect:
- If `Date.now() - itinerary.legs[0].startTime > 30 * 60 * 1000` (30 minutes):
  - Show a dismissible warning banner: "This trip was planned a while ago. Times may have changed."
  - Offer "Re-plan trip" button that navigates back to HomeScreen trip planning mode with the same origin/destination

**Step 2: Missed bus detection**

Add a `useEffect` in both files watching `[transitStatus, scheduledDeparture, busProximity.isTracking]`:
- When `transitStatus === 'waiting'` AND `Date.now() > currentLeg.startTime + 5 * 60 * 1000` AND `!busProximity.vehicle`:
  - Show banner: "Your bus may have departed. Search for the next trip?"
  - "Re-plan" button returns to trip planning

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/screens/NavigationScreen.js src/screens/NavigationScreen.web.js
git commit -m "feat(nav): stale itinerary warning and missed bus detection"
```

---

## Task 12: Trip Planning Auto-Zoom Fix (HomeScreen)

This addresses the user's separate request: initial auto-zoom to trip extent, then hands-off.

**Files:**
- Modify: `src/screens/HomeScreen.js` (trip planning zoom behavior)
- Modify: `src/screens/HomeScreen.web.js` (same)

**Step 1: Gate the trip planning auto-zoom (native)**

In `HomeScreen.js`, find the effect that zooms to trip bounds when entering trip planning mode. Add a `tripZoomedRef = useRef(false)` flag:
- On first entry to trip planning mode with results: zoom to trip bounds, set flag to true
- On subsequent renders: skip zoom (user controls map)
- Reset flag when exiting trip planning mode or when a NEW trip search is performed

**Step 2: Same for web**

In `HomeScreen.web.js`, same approach.

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/screens/HomeScreen.js src/screens/HomeScreen.web.js
git commit -m "feat(map): initial-only auto-zoom in trip planning mode"
```

---

## Execution Order and Dependencies

```
Task 1 (OTP adapter) ─── no deps, foundational
Task 2 (SVG icons) ───── no deps, UI only
Task 3 (walking card) ── depends on Task 2 (uses TurnIcon)
Task 4 (boarding card) ─ depends on Task 3 (peek-ahead pattern)
Task 5 (stop warnings) ─ depends on Task 4 (BusProximityCard changes)
Task 6 (ETA header) ──── no deps
Task 7 (auto-zoom) ───── no deps
Task 8 (polyline trim) ─ no deps
Task 9 (compass) ─────── depends on Task 7 (camera logic)
Task 10 (off-route) ──── no deps
Task 11 (missed bus) ─── no deps
Task 12 (HomeScreen zoom) no deps
```

**Parallel-safe groups:**
- Group A: Tasks 1, 2, 6, 7, 8, 10, 11, 12 (all independent)
- Group B: Task 3 (after 2), Task 4 (after 3), Task 5 (after 4)
- Group C: Task 9 (after 7)
