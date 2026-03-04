# Trip Directions Upgrade — Design

**Date:** 2026-03-03
**Status:** Approved

## Goal

Bring the step-by-step trip navigation experience up to Google Maps quality. Covers walking instructions, transit guidance, map behavior, and robustness improvements.

## Architecture

All changes target the existing NavigationScreen and its child components/hooks. No new screens. The data model already supports most proposals — gaps are noted per section.

---

## 1. Walking Instruction Cards Upgrade

**File:** `src/components/navigation/WalkingInstructionCard.js`

### Changes

- **SVG turn icons** — Replace unicode arrow characters (`←`, `→`, `↰`) with vector SVG icons using `react-native-svg`. Clean filled-style arrows in a colored circle. Map from OSRM `type`/`modifier` to icon variants: turn-left, turn-right, slight-left, slight-right, sharp-left, sharp-right, u-turn, continue-straight, arrive, depart.

- **Time + distance per step** — Display "2 min · 172m" using both `step.duration` and `step.distance` (both already available from LocationIQ enrichment). Replace the current "172m to next turn" text.

- **Street name integrated into card** — Show the upcoming street name (`step.name`) as large prominent text at the top of the card, not as a separate banner (avoids vertical space competition on small screens). Fallback: hide street name line when `step.name` is empty or `step.bogusName` is true.

- **Step counter** — "Step 3 of 7" indicator. Requires threading `currentStepIndex` and `currentLeg.steps.length` from `useStepProgress` through to the card (currently only `currentStep` is passed).

### Data threading needed

- `useStepProgress.js` already tracks `currentStepIndex` — pass it as prop to `WalkingInstructionCard`
- Add `totalSteps` computed from `currentLeg.steps.length`

---

## 2. Board & Transfer Peek-Ahead Previews

Rather than a combined TransferCard, enhance each existing card with a one-line preview of what's next. Simpler, less disruptive, follows sequential card pattern like Google Maps.

### BoardingInstructionCard

**New component** replacing the waiting-state portion of `BusProximityCard`. Synthesized instruction:

> **Board Route 8** (Georgian Mall)
> Bay Terminal, Stop #42 — Departing 2:15 PM

Shows: route badge (colored), headsign, stop name + stop code, departure time with countdown, real-time delay indicator.

### Peek-ahead on existing cards

- **BusProximityCard alighting state** — Add one-line preview: "Next: Walk 2 min to Dunlop & Bayfield (#38) for Route 3"
- **WalkingInstructionCard during transfer walks** — Add preview: "Then board Route 8 at Bay Terminal (#42) at 2:45 PM"

### Alighting reminder — Three-tier escalation

- **3 stops away:** Subtle info banner — "Your stop: Bayfield & Dunlop (#38) in 3 stops"
- **2 stops away:** Yellow warning — "Prepare to exit at Bayfield & Dunlop (#38)"
- **Next stop / arrived:** Red alert with haptic (existing behavior, keep it)

Requires monotonically decreasing stop counter in `useBusProximity.js` — current implementation can bounce due to GPS jitter. Add logic: only decrement when user definitively passes a stop (closer to N+1 than N, and >100m from N).

### Data needed

- `stopCode` on stops — verify local RAPTOR router emits this (OTP does via `formatLeg`)
- Peek-ahead: read `legs[currentLegIndex + 1]` for preview text (partial lookahead already exists as `nextTransitLeg` in NavigationScreen)

---

## 3. Better Transit Leg Guidance

### Schedule-based ETA

Replace the distance-based `calculateETA` in `NavigationHeader.js` with schedule-based arrival:
- Use `lastLeg.endTime + (delaySeconds * 1000)` from the itinerary
- Display as "Arriving ~2:47 PM"
- After actual boarding (confirmed via "I'm on the bus"), recalculate: `currentTime + (scheduledEndTime - scheduledStartTime) + delaySeconds` to account for late boarding

### Proactive stop warnings

Three-tier system as described in Section 2 above. Key implementation detail: monotonic stop counter that doesn't bounce with GPS jitter.

---

## 4. Map Improvements

### Auto-zoom: initial fit only, then hands-off

- **Trip planning mode (HomeScreen):** Auto-zoom to trip extent on initial load only. Set a flag `hasInitialZoomed` that prevents re-triggering.
- **Leg transitions (NavigationScreen):** When `currentLegIndex` changes, auto-zoom once to fit the current leg's extent (from/to coordinates + intermediate stops). Then hands-off until next leg change.
- **Minimum zoom cap:** Never zoom tighter than zoom level 16, even for short legs (50m walks). Prevents disorienting street-level zoom.

### Polyline trimming

As user progresses, split the current leg's polyline at the closest point to user position:
- **Behind user:** Grey, lower opacity (completed)
- **Ahead of user:** Full route color (remaining)

Implementation:
- Use existing `findClosestPointIndex()` from `polylineUtils.js`
- `coordinates.slice(0, closestIdx + 1)` → grey polyline
- `coordinates.slice(closestIdx)` → colored polyline
- Add `userLocation` to the `routePolylines` useMemo dependency array
- Re-runs every location update (~3s/10m) — O(n) with n=50-100 points, negligible cost

Works for both walking (enriched polylines) and transit legs (split at closest stop).

### Map heading rotation (walking legs only)

- Use `heading` from `expo-location` (already captured in `useNavigationLocation.js` but never used). Movement-based heading — works when the user is walking.
- Set `Camera` heading prop during WALK legs; revert to north-up (heading=0) during transit legs.
- Toggle-able: compass icon button, **defaults to OFF** (north-up). User can tap to enable heading-up mode.
- **Web:** Use `DeviceOrientationEvent` where available; hide the compass toggle on desktop browsers.
- **No `expo-sensors` needed** for this iteration — save magnetometer (at-rest compass) for future work.

---

## 5. OTP Walk Step Adapter

**Bug confirmed:** When LocationIQ enrichment fails and OTP fallback steps are used, the `WalkingInstructionCard` receives OTP format (`relativeDirection`, `absoluteDirection`, `streetName`) but expects OSRM format (`type`, `modifier`, `name`). All directions silently default to "straight."

### Adapter mapping (in `walkingService.js`)

| OTP `relativeDirection` | OSRM `type` | OSRM `modifier` |
|---|---|---|
| DEPART | depart | — |
| CONTINUE | continue | straight |
| LEFT | turn | left |
| RIGHT | turn | right |
| SLIGHTLY_LEFT | turn | slight left |
| SLIGHTLY_RIGHT | turn | slight right |
| HARD_LEFT | turn | sharp left |
| HARD_RIGHT | turn | sharp right |
| UTURN_LEFT | turn | uturn |
| UTURN_RIGHT | turn | uturn |

Apply in `tripService.js:formatLeg()` to normalize OTP steps before storing, so `WalkingInstructionCard` always receives a consistent format.

---

## 6. Off-Route Detection (Walking Legs)

During walking legs, check `pointToPolylineDistance()` (already in `geometryUtils.js`) between user position and the walking polyline.

- **Threshold:** >50m off-route for >30 seconds
- **UI:** Banner overlay: "You appear to be off-route. Recalculate?"
- **Action:** Re-fetches walking directions from LocationIQ for the remaining distance (current position → leg destination)
- **Dismiss:** User can dismiss to continue with current directions

---

## 7. Missed Bus & Stale Itinerary

### Missed bus escape hatch

When at a bus stop in `waiting` state and:
- Current time > scheduled departure + 5 minutes, AND
- No vehicle detected for the trip

Show: "Your bus may have departed. Search for the next trip?" with a re-plan button that returns to trip planning mode with the same origin/destination.

### Stale itinerary check

On NavigationScreen mount, if `Date.now() - itinerary.startTime > 30 minutes`:
- Show warning: "This trip was planned a while ago. Times may have changed."
- Offer "Re-plan trip" button

---

## Files to Change

| File | Changes |
|---|---|
| `WalkingInstructionCard.js` | SVG icons, time+distance, street name, step counter, off-route banner, peek-ahead preview |
| `BusProximityCard.js` | Extract boarding state → BoardingInstructionCard, add peek-ahead, 3-tier alighting warnings |
| `BoardingInstructionCard.js` | **New** — synthesized boarding instruction |
| `NavigationHeader.js` | Schedule-based ETA replacing distance heuristic |
| `NavigationScreen.js` | Auto-zoom per-leg, polyline trimming, compass toggle, off-route detection, stale check |
| `NavigationScreen.web.js` | Same as above for web platform |
| `useStepProgress.js` | Thread `currentStepIndex`/`totalSteps`, peek-ahead leg data |
| `useBusProximity.js` | Monotonic stop counter, missed bus detection |
| `useNavigationLocation.js` | Expose heading for compass rotation |
| `walkingService.js` | OTP step adapter function |
| `tripService.js` | Apply OTP step normalization in `formatLeg()` |
| `polylineUtils.js` | Helper: split polyline at index (if not trivial inline) |
| `constants.js` | Auto-zoom min zoom level constant |

## Dependencies

- No new packages required for this iteration
- `expo-sensors` deferred to future iteration (magnetometer compass at rest)

## Out of Scope

- Voice guidance / text-to-speech
- Background location tracking (screen-off alerts)
- Magnetometer compass heading at rest
- On-demand leg improvements (keep existing card)
