# Detour UI Design — Banner, Details Sheet, Affected Stops

> Design for the rider-facing detour notification UI.
> Approved: 2026-02-27

---

## Overview

Three new components + HomeScreen wiring to let riders know when a route is on detour. The backend detection and map overlay already exist — this adds the notification and details layer.

**What riders get:**
1. A banner on the map screen per detoured route ("Route 1 is on detour")
2. Tap the banner → bottom sheet showing skipped stops, timing, and a "View on Map" button
3. Banners stack below existing AlertBanner, capped at 3 visible

---

## Components

### 1. `useAffectedStops` hook

**File:** `src/hooks/useAffectedStops.js` (shared, no platform split)

**Input:** `{ routeId, entryPoint, exitPoint }` + `stops` and `routeStopsMapping` from TransitContext.

**Algorithm:**
1. Get ordered stop IDs for the route from `routeStopsMapping[routeId]`
2. Resolve each stop ID to its `{ latitude, longitude }` via the stops array
3. Find the stop closest to `entryPoint` (haversine) → `entryIndex`
4. Find the stop closest to `exitPoint` (haversine) → `exitIndex`
5. Return the slice `stops[entryIndex..exitIndex]` (inclusive)
6. If entry/exit are null or route has no stops, return empty array

**Returns:** `{ affectedStops: [{ id, name, code, latitude, longitude }], entryStopName, exitStopName }`

**Dependencies:** `haversineDistance` from `src/utils/geometryUtils.js` (existing).

Pure derivation function exported for testing (same pattern as `deriveDetourOverlays`), wrapped in `useMemo` for the hook version.

---

### 2. `DetourBanner` component

**Files:** `src/components/DetourBanner.js` + `DetourBanner.web.js`

**Visual design:** Follows `AlertBanner` pattern:
- Orange left border (`borderLeftWidth: 4`, color: `COLORS.warning`)
- White background with subtle shadow
- Route color dot + "Route X is on detour" text
- "Tap for details" secondary text
- Positioned absolute, below AlertBanner
- `zIndex: 996`

**Props:**
```
DetourBanner({
  activeDetours,       // Object from TransitContext
  onPress,             // (routeId) => void — opens details sheet
  alertBannerVisible,  // Boolean — whether AlertBanner is showing (for stacking offset)
})
```

**Behavior:**
- One banner per active detour, stacked vertically
- Capped at 3 visible — last one shows "+N more routes on detour" if overflow
- Hidden during `isTripPlanningMode`
- Route color dot from `ROUTE_COLORS`
- Fade-in on appear, fade-out on clear
- Accessible: `accessibilityRole="button"`, label "Route X is on detour, tap for details"

**Stacking:** Base position `top: 140`. If AlertBanner visible, shift down by banner height + 8px gap. Each subsequent detour banner offsets by own height + 4px.

---

### 3. `DetourDetailsSheet` component

**Files:** `src/components/DetourDetailsSheet.js` + `DetourDetailsSheet.web.js`

**Visual design:** Follows `StopBottomSheet` pattern:
- Native: `@gorhom/bottom-sheet` with snap points `['35%', '60%']`
- Web: Fixed-position panel at bottom with CSS height transitions

**Props:**
```
DetourDetailsSheet({
  routeId,         // Which route
  detour,          // Object from getRouteDetour(routeId)
  affectedStops,   // Array from useAffectedStops
  onClose,         // Dismiss callback
  onViewOnMap,     // Zooms map to detour area
})
```

**Content layout:**
```
┌──────────────────────────────┐
│         ── (drag handle)     │
│                              │
│  ● Route 1 — Detour Active   │  route color dot + bold title
│  Since 2:35 PM               │  relative time from detectedAt
│                              │
│  ─────────────────────────   │  divider
│                              │
│  Skipped Stops:              │  section header
│  ✕ Downtown Terminal          │  each with ✕ icon
│  ✕ Bayfield & Dunlop         │
│  ✕ Five Points Mall           │
│                              │
│  [ View on Map ]             │  primary button
└──────────────────────────────┘
```

**Behavior:**
- Opens when user taps a DetourBanner
- "Since X:XX PM" from `detour.detectedAt`; "Since N min ago" if older than 1 hour
- `onViewOnMap` calculates bounding box from entryPoint + exitPoint, calls map fitBounds
- Close: swipe down (native), click outside / X / Escape (web)
- Empty state: "Detour detected — stop details pending" when `affectedStops` is empty
- Accessible: sheet announced on open, stop list uses `accessibilityRole="list"`

---

### 4. HomeScreen wiring

**Changes to:** `HomeScreen.js` and `HomeScreen.web.js`

**New state:**
```javascript
const [detourSheetRouteId, setDetourSheetRouteId] = useState(null);
```

**Derived data:**
```javascript
const selectedDetour = detourSheetRouteId ? getRouteDetour(detourSheetRouteId) : null;
const { affectedStops } = useAffectedStops({
  routeId: detourSheetRouteId,
  entryPoint: selectedDetour?.entryPoint,
  exitPoint: selectedDetour?.exitPoint,
});
```

**JSX insertion:**
- `DetourBanner` after `SurveyNudgeBanner`, before `HomeScreenControls`
- `DetourDetailsSheet` after existing bottom sheets

**No changes to:** `TransitContext.js`, `useDetourOverlays.js`, `DetourOverlay.js`, or any backend code.

---

## Files to create

| File | Type | Platform |
|---|---|---|
| `src/hooks/useAffectedStops.js` | Hook | Shared |
| `src/components/DetourBanner.js` | Component | Native |
| `src/components/DetourBanner.web.js` | Component | Web |
| `src/components/DetourDetailsSheet.js` | Component | Native |
| `src/components/DetourDetailsSheet.web.js` | Component | Web |

## Files to modify

| File | Change |
|---|---|
| `src/screens/HomeScreen.js` | Add state, imports, banner + sheet JSX |
| `src/screens/HomeScreen.web.js` | Same changes, web variant |

## Decision log

| Decision | Choice | Reason |
|---|---|---|
| Banner stacking | Vertical below AlertBanner | Consistent with existing banner pattern, both visible simultaneously |
| Multi-detour display | One banner per route, cap at 3 | Tappable, direct, no extra navigation step |
| Detail level | Focused MVP | Ship fast, add confidence/vehicle count later if needed |
| Affected stops algorithm | Geometry-based (entry/exit haversine) | Accurate, uses existing utilities, ~20 lines |
