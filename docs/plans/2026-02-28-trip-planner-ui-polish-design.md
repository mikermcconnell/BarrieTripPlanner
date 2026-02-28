# Plan My Trip — UI Polish Design

**Date:** 2026-02-28
**Status:** Approved
**Design reference:** Google Maps / Transit apps (card-based, Material Design)
**Platforms:** Native + Web (both)

---

## Context

Comprehensive front-end design review of the Plan My Trip feature identified 20 recommendations across 4 views: search page, trip previews, trip details, and step-by-step navigation. Changes are organized into 3 risk-based phases.

## Phase 1: Zero-Risk Swaps (No behavior change)

Pure cosmetic replacements. No layout shifts, no logic changes.

### 1a. Bus emoji → `<Icon name="Bus" />`
Replace all 🚌 emoji (12 files) with the custom cartoon Bus SVG from CartoonIcons.js.

**Files:**
- `TripPlannerScreen.js:280`
- `TripCard.js:78`
- `BusProximityCard.js:143-144`
- `NavigationHeader.js:55,57`
- `StepOverviewSheet.js:105`
- `ExitConfirmationModal.js:32`
- `TripErrorDisplay.js:21`
- `SignInScreen.js:82`
- `SignUpScreen.js:72`
- `NearbyStopsScreen.js:159`
- `FavoritesScreen.js:112`
- `NavigationScreen.web.js:92`

### 1b. Other emoji → existing Icon components
- 📍 → `<Icon name="MapPin" />` (8 instances)
- 🗺️ → `<Icon name="Map" />` (2 instances)
- ⏰/🕐 → `<Icon name="Clock" />` (4 instances)
- ⚠️ → `<Icon name="Warning" />` (1 instance)

### 1c. Text character icons → Icon components
- Back button `←` in TripDetailsScreen → `<Icon name="X" />` or add ChevronLeft
- Arrow `→` between depart/arrive → SVG arrow
- Close `×` in NavigationHeader → `<Icon name="X" />`

### 1d. Remove "Scheduled" badge
Delete the "Scheduled" badge from TripResultCard that shows on every non-realtime trip. Only real-time trips should get a badge (the exception, not the default).

---

## Phase 2: Layout & Visual Restructuring (Visual changes, same behavior)

### 2a. TripResultCard 2-row layout
Restructure from 3-column to stacked:
- **Row 1:** Duration (bold, large) + route badge chain + "Leave in X min" (right-aligned)
- **Row 2:** Time range + walk/transfer details + action button

### 2b. TripDetailsScreen summary header
Redesign to Google Maps hierarchy:
- Large centered duration (~28px bold)
- Time range with proper arrow icon
- Compact chips for walk distance + transfers
- Remove generic Trip Tips section

### 2c. NavigationHeader: show current leg destination
- Pass `currentLeg.to.name` instead of `finalDestination`
- Remove step counter from header (progress bar handles it)

### 2d. Combine DestinationBanner + WalkingInstructionCard
Merge into single card during walking legs. Add destination/timing header to WalkingInstructionCard.

### 2e. Time mode segmented control
Replace single-tap cycling in TripSearchHeader with visible chip row: "Leave Now | Depart At | Arrive By"

### 2f. Route badge contrast safety
Add `isLightColor()` helper to utils. Flip badge text to dark when route color is light.

### 2g. Map controls → icon-only FABs
Replace text-labeled buttons with 44x44 icon-only circular buttons.

---

## Phase 3: New Components & Features

### 3a. Walk icon component
Wire `assets/icons/walk.svg` into CartoonIcons.js as `Walk`. Add to Icon.js mapping. Replace 6 🚶 instances.

### 3b. Missing icon components
Create or source SVGs for: BusStop, Phone, Door, Hourglass, Celebration, Transfer. Wire into CartoonIcons. Replace remaining emojis.

### 3c. Fix "Next Step" to advance walking turns
Change `onNextStep` from `advanceLeg` to walk-step advance. Add separate "Next Leg" when walking instructions exhausted.

### 3d. Mini map on TripDetailsScreen
Add static map at top showing full route polyline for visual context.

### 3e. Haptic feedback on navigation transitions
Use `expo-haptics` for: bus arrival, approaching stop, departure warnings.

### 3f. Remove "Step X of Y" text from NavigationProgressBar
Visual dots + header already communicate this. Remove redundant text label.

### 3g. Board button contrast fix
When BusProximityCard is in green arrived state, use darker green or white button with green text for "I'm on the bus".

---

## Deferred (Separate Efforts)

- Missing `.web.js` counterparts for navigation components
- Dark mode integration
- WCAG font size audit
- Animated route selection linking card tap to map
