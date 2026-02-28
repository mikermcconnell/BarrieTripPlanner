# Plan My Trip UI Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modernize the Plan My Trip feature UI by replacing emoji icons with custom SVGs, restructuring card layouts for better information hierarchy, adding a bus-approach route line to the trip preview map, and fixing navigation screen UX issues.

**Architecture:** 3 risk-based phases — Phase 1 (zero-risk icon swaps), Phase 2 (layout restructuring + trip preview map enhancement), Phase 3 (new components/features). Each phase gets its own commit(s). All changes must work on both native and web.

**Tech Stack:** React Native, Expo, react-native-svg (CartoonIcons), @gorhom/bottom-sheet, MapLibre GL (native), Leaflet (web)

---

## PHASE 1: Zero-Risk Swaps

### Task 1: Replace 🚌 emoji with `<Icon name="Bus" />` across all files

The app has a custom cartoon Bus SVG at `src/components/CartoonIcons.js` accessible via `<Icon name="Bus" />` from `src/components/Icon.js`. The Icon component accepts `name`, `color`, `size` props.

Files to modify (add `import Icon from '../components/Icon'` or `'../../components/Icon'` where not already imported):

1. `src/screens/TripPlannerScreen.js:280` — Replace `<Text style={styles.emptyIcon}>🚌</Text>` with `<Icon name="Bus" size={48} color={COLORS.grey400} />`
2. `src/components/TripCard.js:78` — Replace `<Text style={styles.detailIcon}>🚌</Text>` with `<Icon name="Bus" size={14} color={COLORS.textSecondary} />`
3. `src/components/navigation/BusProximityCard.js:143-144` — The `getIcon()` function returns emoji strings that are rendered as `<Text>`. Replace the return values to return JSX icon components OR change the rendering approach. Easiest: keep returning strings for now, but change the render to check if it's bus and render Icon instead. Better: Change `getIcon` to return a component.
4. `src/components/navigation/NavigationHeader.js:55,57` — Same pattern as BusProximityCard — `getIcon()` returns emojis. Change bus cases to return null and render `<Icon>` in the JSX.
5. `src/components/navigation/StepOverviewSheet.js:105` — Replace `'🚌'` in the ternary. Import Icon, render `<Icon name="Bus" size={18} color={COLORS.white} />` for bus legs.
6. `src/components/navigation/ExitConfirmationModal.js:32` — Replace `<Text style={styles.icon}>🚌</Text>` with `<Icon name="Bus" size={36} color={COLORS.primary} />`
7. `src/components/TripErrorDisplay.js:21` — In the `getIcon` map, replace `'route': '🚌'` — since this returns text that gets rendered as `<Text>`, change the rendering approach to support Icon components OR keep simple and just replace the emoji character.
8. `src/screens/SignInScreen.js:82` — Replace `<Text style={styles.logo}>🚌</Text>` with `<Icon name="Bus" size={48} color={COLORS.primary} />`
9. `src/screens/SignUpScreen.js:72` — Same as SignInScreen.
10. `src/screens/NearbyStopsScreen.js:159` — Replace `<Text style={styles.emptyIcon}>🚌</Text>` with `<Icon name="Bus" size={48} color={COLORS.grey400} />`
11. `src/screens/FavoritesScreen.js:112` — Replace the bus part of `{activeTab === 'stops' ? '🚏' : '🚌'}` — render Icon component conditionally.
12. `src/screens/NavigationScreen.web.js:92` — This is an HTML template string for Leaflet markers. Cannot use React components here. Keep the emoji or use an inline SVG string. **SKIP for now.**
13. `src/components/TripPreviewModal.js` — No direct 🚌 emoji, but has 🚶. Will be covered in Phase 3.

**Important patterns to follow:**
- For files that already import Icon (like `TripSearchHeader.js`), no new import needed.
- For new imports, use relative path: `import Icon from '../components/Icon'` or `'../../components/Icon'` depending on depth.
- When replacing emoji rendered as `<Text style={styles.icon}>🚌</Text>`, the `<Icon>` component renders an SVG directly — no `<Text>` wrapper needed, but may need a `<View>` wrapper for sizing.
- The `emptyIcon` style has `fontSize: 48` — use `<Icon size={48} />`.
- The `detailIcon` style has `fontSize: 14` — use `<Icon size={14} />`.

---

### Task 2: Replace other emojis with existing Icon components

**📍 → `<Icon name="MapPin" />`:**
1. `src/screens/TripPlannerScreen.js:212` — location button text `📍`
2. `src/components/AddressAutocomplete.js:222` — suggestion icon
3. `src/components/MapTapPopup.js:31` — address icon
4. `src/components/navigation/StepOverviewSheet.js:174` — destination icon
5. `src/screens/NavigationScreen.js:604` — bus stop marker icon `🚏` → MapPin works for now
6. `src/screens/NavigationScreen.js:676` — map control "My Location" icon
7. `src/screens/NavigationScreen.js:798` — error icon
8. `src/components/TripErrorDisplay.js:22` — `'map-marker-off': '📍'`

**🗺️ → `<Icon name="Map" />`:**
1. `src/screens/NavigationScreen.js:687` — "Full Trip" map control

**⏰/🕐 → `<Icon name="Clock" />`:**
1. `src/screens/TripDetailsScreen.js:103` — tip icon `⏰`
2. `src/components/TripBottomSheet.js:101` — recent trip icon `🕐`
3. `src/components/TripBottomSheet.web.js:145` — recent trip icon `🕐`
4. `src/components/TripErrorDisplay.js:23` — `'clock': '⏱️'`

**⚠️ → `<Icon name="Warning" />`:**
1. `src/components/TripErrorDisplay.js:25` — fallback icon
2. `src/components/HomeScreenControls.js:92` — alert header icon `⚠️`

---

### Task 3: Replace text character icons with Icon components

**Pre-requisite:** Add `Route` as a direct alias in `src/components/Icon.js` iconMap. Currently `ArrowUpDown` maps to the Route cartoon icon, but `Route` itself is not a key. Add:
```javascript
Route, // direct alias for the Route cartoon icon (arrow-like shape)
```

1. `src/screens/TripDetailsScreen.js:41` — Back button `←` → `<Icon name="X" size={20} color={COLORS.textPrimary} />` (the X icon rotates `Add` 45deg, giving an X shape; alternatively add a `ChevronLeft` mapping)
2. `src/screens/TripDetailsScreen.js:73` — Arrow `→` between times — replace the `<Text style={styles.arrowText}>→</Text>` with `<Icon name="Route" size={24} color={COLORS.textSecondary} />`
3. `src/components/navigation/NavigationHeader.js:125` — Close button `×` rendered as `<Text>` — replace with `<Icon name="X" size={20} color={COLORS.white} />` (note: line 125, not 126)

---

### Task 4: Remove "Scheduled" badge from TripResultCard

In `src/components/TripResultCard.js:101-107`:
Delete the else branch that renders the "Scheduled" badge. Only the realtime branch should remain.

**Before:**
```jsx
{hasRealtimeInfo ? (
  <DelayBadge delaySeconds={delaySeconds} isRealtime={hasRealtimeInfo} compact />
) : (
  <View style={styles.scheduledBadge}>
    <Text style={styles.scheduledText}>Scheduled</Text>
  </View>
)}
```

**After:**
```jsx
{hasRealtimeInfo && (
  <DelayBadge delaySeconds={delaySeconds} isRealtime={hasRealtimeInfo} compact />
)}
```

Also delete the `scheduledBadge` and `scheduledText` styles (lines 386-396).

---

### Task 5: Phase 1 commit

```bash
git add -A
git commit -m "feat(ui): replace emoji icons with custom SVG components

Phase 1 of trip planner UI polish. Replace 🚌 with <Icon name='Bus' />,
📍 with MapPin, 🗺️ with Map, ⏰ with Clock, and text characters with
proper Icon components. Remove redundant 'Scheduled' badge.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## PHASE 2: Layout & Visual Restructuring

### Task 6: TripResultCard 2-row layout (2a)

Modify `src/components/TripResultCard.js`.

Restructure `mainRow` from 3 horizontal columns to 2 stacked rows:

- **Row 1 (topRow):** Duration (bold, 16px) + route badge chain (walk/bus icons inline) + "Leave in X min" (right-aligned)
- **Row 2 (bottomRow):** Time range + walk distance + transfers + action button (right-aligned)

This means:
- Move `timeSection` (duration, time range) so duration goes to Row 1, time range to Row 2.
- Move `routeSection` (route summary, walk/transfer details) so route icons go to Row 1, details to Row 2.
- Move `rightSection` (leaves-in, buttons) so leaves-in goes to Row 1, buttons to Row 2.
- Remove the `mainRow` wrapper, replace with `topRow` and `bottomRow`.

**New styles to add:**
```javascript
topRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 6,
},
topRowLeft: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
},
bottomRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},
bottomRowContent: {
  flex: 1,
},
durationLarge: {
  fontSize: 16,
  fontWeight: '700',
  color: COLORS.textPrimary,
  marginRight: 8,
},
leaveInText: {
  fontSize: 13,
  fontWeight: '600',
  color: COLORS.primary,
},
routeBadgeInline: {
  marginHorizontal: 2,
},
```

**New JSX structure (replaces existing mainRow content):**

Note: Use existing variable names from the component — `itinerary.legs`, `minutesUntilDeparture`, `walkDistance`, `itinerary.transfers`. The route badges should use the existing inline badge pattern from TripResultCard.js:127-131 (`<View style={[styles.busIcon, { backgroundColor: routeColor }]}><Text>...</Text></View>`), NOT a `RouteBadge` component (which does not exist). For walk legs in the badge chain, use a text `🚶` placeholder until Task 14 adds the Walk icon to Icon.js.

```jsx
{/* Row 1: Duration + route badges + leave-in */}
<View style={styles.topRow}>
  <View style={styles.topRowLeft}>
    <Text style={styles.durationLarge}>{duration}</Text>
    {/* Route badge chain using existing inline badge pattern */}
    {itinerary.legs.map((leg, i) => (
      leg.mode === 'WALK'
        ? <Text key={i} style={styles.routeBadgeInline}>🚶</Text>
        : <View key={i} style={[styles.busIcon, { backgroundColor: leg.route?.color || COLORS.primary }]}>
            <Text style={styles.busIconText}>{leg.route?.shortName || '?'}</Text>
          </View>
    ))}
  </View>
  {minutesUntilDeparture != null && (
    <Text style={styles.leaveInText}>Leave in {minutesUntilDeparture} min</Text>
  )}
</View>

{/* Row 2: Time range + details + action */}
<View style={styles.bottomRow}>
  <View style={styles.bottomRowContent}>
    <Text style={styles.timeRange}>{startTime} – {endTime}</Text>
    <Text style={styles.detailText}>{walkDistance} walk · {itinerary.transfers} transfer{itinerary.transfers !== 1 ? 's' : ''}</Text>
  </View>
  <TouchableOpacity style={styles.detailsBtn} onPress={onPress}>
    <Text style={styles.detailsBtnText}>Details</Text>
  </TouchableOpacity>
</View>
```

**On-demand note handling:** The existing `onDemandNote` block (lines 148-155) sits inside the current `mainRow`. In the new layout, place it between `topRow` and `bottomRow`:
```jsx
{leg.isOnDemand && (
  <View style={styles.onDemandNote}>
    <Text style={styles.onDemandNoteText}>{onDemandText}</Text>
  </View>
)}
```

Verify: Run `npm run web:dev` and confirm card renders correctly at both narrow and wide widths.

---

### Task 7: TripDetailsScreen summary header redesign (2b)

Modify `src/screens/TripDetailsScreen.js`.

Replace the current summary card (lines 49-80) with a redesigned header:

**New JSX for the summary section:**
```jsx
<View style={styles.summaryCard}>
  {/* Hero duration */}
  <Text style={styles.durationHero}>{duration}</Text>

  {/* Time range row */}
  <View style={styles.timeRangeRow}>
    <Text style={styles.timeText}>{startTime}</Text>
    <Icon name="Route" size={20} color={COLORS.textSecondary} />
    <Text style={styles.timeText}>{endTime}</Text>
  </View>

  {/* Compact chips — use text placeholders for Walk/Transfer icons until Phase 3 adds them to Icon.js */}
  <View style={styles.chipsRow}>
    <View style={styles.chip}>
      <Text style={styles.chipIcon}>🚶</Text>
      <Text style={styles.chipText}>{walkDistance} walk</Text>
    </View>
    {transferCount > 0 && (
      <View style={styles.chip}>
        <Text style={styles.chipIcon}>🔄</Text>
        <Text style={styles.chipText}>{transferCount} transfer{transferCount !== 1 ? 's' : ''}</Text>
      </View>
    )}
  </View>
</View>
```

**New styles:**
```javascript
durationHero: {
  fontSize: 28,
  fontWeight: '700',
  color: COLORS.textPrimary,
  textAlign: 'center',
  marginBottom: 8,
},
timeRangeRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 12,
},
timeText: {
  fontSize: 16,
  color: COLORS.textPrimary,
},
chipsRow: {
  flexDirection: 'row',
  justifyContent: 'center',
  gap: 8,
},
chip: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.grey100,
  borderRadius: 12,
  paddingHorizontal: 10,
  paddingVertical: 4,
  gap: 4,
},
chipText: {
  fontSize: 13,
  color: COLORS.textSecondary,
},
```

Also remove the Trip Tips section (lines 99-122) and its associated styles (`tipCard`, `tipIcon`, `tipText`).

---

### Task 8: NavigationHeader — show current leg destination (2c)

**Step 1:** Modify `src/screens/NavigationScreen.js` line 664:
```jsx
// Before:
destinationName={finalDestination}

// After:
destinationName={currentLeg?.to?.name || finalDestination}
```

**Step 2:** Modify `src/components/navigation/NavigationHeader.js`:

Remove the step counter View (lines 149-154):
```jsx
// DELETE this block:
<View style={styles.stepCounter}>
  <Text style={styles.stepCounterText}>
    Step {currentStepIndex + 1} of {totalSteps}
  </Text>
</View>
```

Also delete the `stepCounter` and `stepCounterText` entries from the StyleSheet.

---

### Task 9: Combine DestinationBanner into WalkingInstructionCard (2d)

**Note:** This task and Task 16 (fix "Next Step") both modify the `<WalkingInstructionCard>` invocation in `NavigationScreen.js`. Implement them together to avoid double-editing the same JSX block. When writing the props below, also include `isLastStep` and `onNextLeg` from Task 16.

**Step 1:** Modify `src/components/navigation/WalkingInstructionCard.js`.

Add new props at the top of the component. **Important:** keep existing prop name `currentStep`, not `step`:
```javascript
export default function WalkingInstructionCard({
  currentStep,       // existing prop — keep the name
  onNextStep,        // existing prop
  // New props:
  destinationName,
  currentLeg,        // pass the raw leg object — let the card compute walk time/bus departure
}) {
```

Compute walk/bus timing inside the card (avoids inventing variables in NavigationScreen):
```javascript
// Compute walk time from leg duration (leg.duration is in seconds from OTP)
const walkTimeMinutes = currentLeg?.duration ? Math.round(currentLeg.duration / 60) : null;
```

Add destination header section above the main instruction row:
```jsx
{destinationName && (
  <View style={styles.destinationHeader}>
    <Icon name="MapPin" size={14} color={COLORS.primary} />
    <Text style={styles.destinationText} numberOfLines={1}>
      {destinationName}
    </Text>
    {walkTimeMinutes != null && (
      <Text style={styles.departureText}>{walkTimeMinutes} min walk</Text>
    )}
  </View>
)}
```

New styles:
```javascript
destinationHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingTop: 12,
  paddingBottom: 4,
  gap: 6,
},
destinationText: {
  fontSize: 13,
  fontWeight: '600',
  color: COLORS.textPrimary,
  flex: 1,
},
departureText: {
  fontSize: 13,
  color: COLORS.primary,
  fontWeight: '600',
},
```

**Step 2:** Modify `src/screens/NavigationScreen.js`:

Remove the standalone `<DestinationBanner>` conditional when walking (around lines 694-702) and pass destination props to `<WalkingInstructionCard>`:
```jsx
<WalkingInstructionCard
  currentStep={currentWalkingStep}
  onNextStep={advanceStep}
  destinationName={currentLeg?.to?.name}
  currentLeg={currentLeg}
/>
```

Keep `<DestinationBanner>` only for transit legs.

---

### Task 10: Time mode segmented control (2e)

Modify `src/components/TripSearchHeader.js`.

Replace `cycleTimeMode()` with direct-select handlers and replace the single `timeModeBtn` TouchableOpacity with a row of 3 chips.

**New handler (replaces `cycleTimeMode`):**

Note: `TripSearchHeader` is a controlled component — it receives `timeMode` and `onTimeModeChange` as props. There is no local `setTimeMode`. The handler must call `onTimeModeChange`.

```javascript
const selectTimeMode = (mode) => {
  if (!onTimeModeChange) return;
  onTimeModeChange(mode);
  // When switching to a timed mode, initialize selectedTime if not set
  if (mode !== 'now' && !selectedTime) {
    onSelectedTimeChange && onSelectedTimeChange(new Date());
  }
  // When switching back to 'now', clear stale selectedTime
  if (mode === 'now') {
    onSelectedTimeChange && onSelectedTimeChange(null);
  }
};
```

**Important:** The existing code uses time mode keys `'now'`, `'departAt'`, `'arriveBy'` (see `TIME_MODES` array at line 16). The chip loop must use these same keys.

**New JSX (replaces the timeRow section, lines 162-185):**

The chip row replaces the single cycling button, but the time display and Search button must be preserved below the chips for `departAt`/`arriveBy` modes.

```jsx
{/* Time mode chips */}
<View style={styles.timeModeRow}>
  {['now', 'departAt', 'arriveBy'].map((mode) => {
    const labels = { now: 'Leave Now', departAt: 'Depart At', arriveBy: 'Arrive By' };
    const isActive = timeMode === mode;
    return (
      <TouchableOpacity
        key={mode}
        style={[styles.timeModeChip, isActive && styles.timeModeChipActive]}
        onPress={() => selectTimeMode(mode)}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        <Text style={[styles.timeModeChipText, isActive && styles.timeModeChipTextActive]}>
          {labels[mode]}
        </Text>
      </TouchableOpacity>
    );
  })}
</View>

{/* Time display + Search button (preserved from original, shown for non-'now' modes) */}
{timeMode !== 'now' && (
  <View style={styles.timeRow}>
    {selectedTime && (
      <Text style={styles.timeDisplay}>{formatTimeDisplay(selectedTime)}</Text>
    )}
    {onSearch && (
      <TouchableOpacity style={styles.searchBtn} onPress={onSearch} accessibilityLabel="Search trips" accessibilityRole="button">
        <Text style={styles.searchBtnText}>Search</Text>
      </TouchableOpacity>
    )}
  </View>
)}
```

**New styles:**
```javascript
timeModeRow: {
  flexDirection: 'row',
  gap: 8,
  paddingHorizontal: 16,
  paddingBottom: 12,
},
timeModeChip: {
  flex: 1,
  paddingVertical: 6,
  borderRadius: 16,
  backgroundColor: COLORS.grey100,
  alignItems: 'center',
},
timeModeChipActive: {
  backgroundColor: COLORS.primary,
},
timeModeChipText: {
  fontSize: 12,
  fontWeight: '600',
  color: COLORS.textSecondary,
},
timeModeChipTextActive: {
  color: COLORS.white,
},
```

---

### Task 11: Route badge contrast safety (2f)

**Step 1:** Create `src/utils/colorUtils.js`:
```javascript
/**
 * Determine if a hex color is "light" (needs dark text) or "dark" (needs white text).
 * Uses relative luminance formula (ITU-R BT.601).
 */
export const isLightColor = (hex) => {
  if (!hex || typeof hex !== 'string') return false;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.6;
};

export const getContrastTextColor = (bgColor, lightText = '#FFFFFF', darkText = '#172B4D') => {
  return isLightColor(bgColor) ? darkText : lightText;
};
```

**Step 2:** Add tests. Create `src/utils/__tests__/colorUtils.test.js`:
```javascript
import { isLightColor, getContrastTextColor } from '../colorUtils';

describe('isLightColor', () => {
  it('returns true for white', () => expect(isLightColor('#FFFFFF')).toBe(true));
  it('returns false for black', () => expect(isLightColor('#000000')).toBe(false));
  it('returns false for dark blue', () => expect(isLightColor('#172B4D')).toBe(false));
  it('returns true for yellow', () => expect(isLightColor('#FFD700')).toBe(true));
  it('handles missing #', () => expect(isLightColor('FFFFFF')).toBe(true));
  it('returns false for null', () => expect(isLightColor(null)).toBe(false));
});

describe('getContrastTextColor', () => {
  it('returns dark text for light background', () =>
    expect(getContrastTextColor('#FFFFFF')).toBe('#172B4D'));
  it('returns light text for dark background', () =>
    expect(getContrastTextColor('#000000')).toBe('#FFFFFF'));
});
```

Run: `npm test -- --testPathPattern=colorUtils`

**Step 3:** Update route badge text colors in 4 files:

In each file, add import:
```javascript
import { getContrastTextColor } from '../utils/colorUtils'; // adjust depth as needed
```

Then replace hardcoded white badge text:
```javascript
// Before:
color: COLORS.white

// After (in badge text styles that sit on a route-colored background):
color: getContrastTextColor(leg.route?.color || COLORS.primary)
```

Files to update:
- `src/components/TripResultCard.js` — `busIconText` color
- `src/components/TripCard.js` — `busIconText` color
- `src/components/TripPreviewModal.js` — `busIconText` / `busStepBadgeText` color
- `src/components/TripStep.js` — `routeText` color

---

### Task 12: Map controls → icon-only FABs (2g)

**Modify `src/screens/NavigationScreen.js` lines 670-689:**

Replace text-labeled map control buttons with icon-only circular buttons:

```jsx
{/* Before: text + emoji buttons */}
{/* After: */}
<View style={styles.mapControls}>
  <TouchableOpacity
    style={[styles.mapControlBtn, followMode === 'my-location' && styles.mapControlBtnActive]}
    onPress={() => setFollowMode('my-location')}
    accessibilityLabel="Center on my location"
  >
    <Icon name="MapPin" size={20} color={followMode === 'my-location' ? COLORS.white : COLORS.textPrimary} />
  </TouchableOpacity>
  <TouchableOpacity
    style={[styles.mapControlBtn, followMode === 'full-trip' && styles.mapControlBtnActive]}
    onPress={() => setFollowMode('full-trip')}
    accessibilityLabel="Show full trip"
  >
    <Icon name="Map" size={20} color={followMode === 'full-trip' ? COLORS.white : COLORS.textPrimary} />
  </TouchableOpacity>
</View>
```

**Updated styles (replace existing mapControl* styles):**
```javascript
mapControls: {
  position: 'absolute',
  right: 16,
  bottom: 160,
  gap: 8,
},
mapControlBtn: {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: COLORS.white,
  justifyContent: 'center',
  alignItems: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 4,
  elevation: 4,
},
mapControlBtnActive: {
  backgroundColor: COLORS.primary,
},
```

Remove styles: `mapControlIcon`, `mapControlLabel`, `mapControlLabelActive`, `mapControlButton` (old name).

**Make the same changes in `src/screens/NavigationScreen.web.js` lines 754-768.** Web version uses `cursor: 'pointer'` instead of TouchableOpacity press feedback — add `:hover` via `onMouseEnter`/`onMouseLeave` state or use CSS-in-JS equivalent.

---

### Task 12b: Bus approach dashed line on trip preview map (NEW)

When a trip is selected and a live bus is matched, show a **dashed polyline in the route color** tracing the bus's upcoming path from its current position to the boarding stop. This gives the user visual context for how the bus will reach them — currently the bus marker just floats on the map with no visible route connection.

**Data chain:**
- `tripVehicles[i]` has `{ tripId, coordinate: { latitude, longitude } }` — live bus position
- `selectedItinerary.legs[i]` has `{ tripId, from: { lat, lon }, route: { color } }` — boarding stop + route color
- `tripMapping[tripId].shapeId` → `shapes[shapeId]` — full GTFS shape coordinates for the trip
- `extractShapeSegment(shapeCoords, fromLat, fromLon, toLat, toLon)` from `src/utils/polylineUtils.js` — slices the shape between two points

All data is already available: `shapes` and `tripMapping` are in `HomeScreen.js` from `useTransitStatic()` (lines 100, 105).

**Step 1: Extend `useTripVisualization` hook**

Modify `src/hooks/useTripVisualization.js`:

Add new parameters:
```javascript
export const useTripVisualization = ({
  isTripPlanningMode,
  itineraries,
  selectedItineraryIndex,
  vehicles,
  shapes,        // NEW: GTFS shapes dictionary from TransitContext
  tripMapping,   // NEW: tripId → { routeId, shapeId, ... } from TransitContext
}) => {
```

Update import (already imports `decodePolyline` and `findClosestPointIndex` — just add `extractShapeSegment`):
```javascript
import { decodePolyline, findClosestPointIndex, extractShapeSegment } from '../utils/polylineUtils';
```

Add new `useMemo` block after `tripVehicles` (around line 204):
```javascript
// Dashed approach lines: bus current position → boarding stop (following GTFS shape)
const busApproachLines = useMemo(() => {
  if (!selectedItinerary || tripVehicles.length === 0 || !shapes || !tripMapping) return [];

  const lines = [];
  selectedItinerary.legs.forEach((leg) => {
    if (leg.mode === 'WALK' || leg.isOnDemand || !leg.tripId) return;

    const vehicle = tripVehicles.find(v => v.tripId === leg.tripId);
    if (!vehicle) return;

    const mapping = tripMapping[leg.tripId];
    if (!mapping?.shapeId) return;

    const shapeCoords = shapes[mapping.shapeId];
    if (!shapeCoords || shapeCoords.length === 0) return;

    // Find indices on the shape for bus position and boarding stop
    const busIdx = findClosestPointIndex(shapeCoords, vehicle.coordinate.latitude, vehicle.coordinate.longitude);
    const boardIdx = findClosestPointIndex(shapeCoords, leg.from.lat, leg.from.lon);

    // Guard: if bus is already past the boarding stop (busIdx >= boardIdx),
    // the bus has passed and won't return — don't draw an approach line
    if (busIdx >= boardIdx) return;

    const segment = shapeCoords.slice(busIdx, boardIdx + 1);

    if (segment.length >= 2) {
      lines.push({
        id: `bus-approach-${leg.tripId}`,
        coordinates: segment,
        color: leg.route?.color || COLORS.primary,
      });
    }
  });

  return lines;
}, [selectedItinerary, tripVehicles, shapes, tripMapping]);
```

Add `busApproachLines` to the return object:
```javascript
return {
  tripRouteCoordinates,
  tripMarkers,
  intermediateStopMarkers,
  boardingAlightingMarkers,
  tripVehicles,
  busApproachLines,  // NEW
};
```

**Step 2: Pass shapes + tripMapping into the hook**

Modify `src/screens/HomeScreen.js:212-215`:
```javascript
const {
  tripRouteCoordinates, tripMarkers, intermediateStopMarkers,
  boardingAlightingMarkers, tripVehicles, busApproachLines,
} = useTripVisualization({ isTripPlanningMode, itineraries, selectedItineraryIndex, vehicles, shapes, tripMapping });
```

`shapes` and `tripMapping` are already destructured from `useTransitStatic()` at lines 100 and 105.

Modify `src/screens/HomeScreen.web.js:263-266` identically. Both HomeScreens already have `shapes` and `tripMapping` available from `useTransitStatic()`.

**Step 3: Render the dashed approach line on native map**

In `src/screens/HomeScreen.js`, after the existing `tripRouteCoordinates` polylines (around line 755-765) and before/after the tripVehicles section, add:

```jsx
{/* Bus approach lines — dashed route-colored line from bus to boarding stop */}
{busApproachLines.map((line) => (
  <RoutePolyline
    key={line.id}
    id={line.id}
    coordinates={line.coordinates}
    color={line.color}
    strokeWidth={3}
    lineDashPattern={[8, 6]}
    opacity={0.7}
  />
))}
```

Note: `RoutePolyline` already supports `lineDashPattern` (line 34), `strokeWidth` (line 33), and `opacity` (line 37). No changes needed to RoutePolyline itself.

**Step 4: Render the dashed approach line on web map**

In `src/screens/HomeScreen.web.js`, after the trip polyline rendering section, add:

```jsx
{busApproachLines.map((line) => (
  <Polyline
    key={line.id}
    positions={line.coordinates.map(c => [c.latitude, c.longitude])}
    pathOptions={{
      color: line.color,
      weight: 3,
      dashArray: '8 6',
      opacity: 0.7,
    }}
  />
))}
```

**Step 5: Verify**

Run `npm run web:dev`, plan a trip, and confirm:
1. When a trip result card is selected and a live bus is matched, a dashed line appears from the bus marker to the boarding stop
2. The dashed line follows the actual route shape (curves along roads)
3. The color matches the route badge color
4. When switching between trip results, the dashed line updates
5. When no live bus is matched, no dashed line appears

---

### Task 13: Phase 2 commit(s)

Commit after each sub-task group, or group 6+7 together and 8+9 together:

```bash
git commit -m "feat(ui): restructure TripResultCard and TripDetails to 2-row layout

Phase 2a+2b: TripResultCard now uses stacked rows (duration+badges on top,
time range+details on bottom). TripDetailsScreen uses large hero duration
with compact chip row. Removes generic Trip Tips section.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

```bash
git commit -m "feat(ui): update NavigationHeader and walking card layout

Phase 2c+2d: NavigationHeader shows current leg destination instead of
final destination. Removes redundant step counter from header. Merges
DestinationBanner into WalkingInstructionCard.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

```bash
git commit -m "feat(ui): add time mode segmented control and route badge contrast

Phase 2e+2f+2g: Replace single-tap time mode cycling with visible chip row.
Add colorUtils.js with luminance-based contrast helper. Make map controls
icon-only 44x44 circular FABs.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

```bash
git commit -m "feat(map): add dashed bus approach line on trip preview map

Show a dashed polyline tracing the bus route from its current live
position to the boarding stop. Uses GTFS shape data + extractShapeSegment
utility. Renders on both native (RoutePolyline) and web (Leaflet).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## PHASE 3: New Components & Features

### Task 14: Register Walk icon and replace 🚶 emoji (3a)

The `Walk` component **already exists** in `src/components/CartoonIcons.js` (it was generated as part of the cartoon sprite sheet). No SVG extraction is needed. Only the Icon.js mapping is missing.

**Step 1:** Add `Walk` to `src/components/Icon.js` iconMap:
```javascript
import { ..., Walk } from './CartoonIcons';

const iconMap = {
  // ... existing entries ...
  Walk,
};
```

**Step 2:** Replace 🚶 in 6 locations (and the emoji placeholders from Tasks 6 and 7):
1. `src/components/TripCard.js:47` and `:63` — `<Icon name="Walk" size={16} color={COLORS.textSecondary} />`
2. `src/components/TripResultCard.js:120` — `<Icon name="Walk" size={16} color={COLORS.textSecondary} />`
3. `src/components/TripStep.js:52` — `<Icon name="Walk" size={20} color={COLORS.textSecondary} />`
4. `src/components/TripPreviewModal.js:95` — `<Icon name="Walk" size={18} color={COLORS.white} />`
5. `src/components/navigation/StepOverviewSheet.js:105` — `<Icon name="Walk" size={18} color={COLORS.white} />`
6. `src/components/navigation/NavigationHeader.js:51` — `<Icon name="Walk" size={18} color={COLORS.white} />`

---

### Task 15: Create missing icon components (3b)

Add the following SVG components to `src/components/CartoonIcons.js`. These can be simple geometric SVGs (not from the cartoon sprite sheet) — use clean, minimal path data.

**Icons to create:**

```javascript
// BusStop — vertical pole with horizontal bar at top
export const BusStop = ({ size = 24, color = '#172B4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6m0-12h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6m0-12v12m0 2v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

// Transfer — two arrows forming a cycle
export const Transfer = ({ size = 24, color = '#172B4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Door — rectangle with handle
export const Door = ({ size = 24, color = '#172B4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Circle cx="15" cy="12" r="1" fill={color} />
  </Svg>
);

// Phone — simple handset shape
export const Phone = ({ size = 24, color = '#172B4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.05 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Hourglass
export const Hourglass = ({ size = 24, color = '#172B4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// Celebration — simple star burst
export const Celebration = ({ size = 24, color = '#172B4D' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity="0.15" />
  </Svg>
);
```

Add import for `Circle` from `react-native-svg` at the top of CartoonIcons.js if not already imported.

**Add all to `src/components/Icon.js` iconMap:**
```javascript
import { ..., BusStop, Transfer, Door, Phone, Hourglass, Celebration } from './CartoonIcons';

const iconMap = {
  // ... existing ...
  BusStop,
  Transfer,
  Door,
  Phone,
  Hourglass,
  Celebration,
};
```

**Replace remaining emojis:**

🚏 → BusStop (5 files):
1. `src/screens/FavoritesScreen.js:112` — `{activeTab === 'stops' ? <Icon name="BusStop" size={24} color={COLORS.textSecondary} /> : <Icon name="Bus" size={24} color={COLORS.textSecondary} />}`
2. `src/screens/NearbyStopsScreen.js` — any 🚏 instances
3. `src/components/navigation/StepOverviewSheet.js` — bus stop destination icon
4. `src/screens/NavigationScreen.js:604` — stop marker icon
5. `src/components/TripErrorDisplay.js` — if applicable

📞 → Phone (4 files) — search for `📞` instances across the codebase.

🚪 → Door (2 files) — search for `🚪` instances.

⏳ → Hourglass (1 file) — search for `⏳` instances.

🎉 → Celebration (1 file) — search for `🎉` instances.

🔄 → Transfer (2 files) — search for `🔄` instances.

Before replacing, run a quick grep to confirm exact locations:
```bash
grep -r "🚏\|📞\|🚪\|⏳\|🎉\|🔄" src/ --include="*.js" -l
```

---

### Task 16: Fix "Next Step" to advance walking turns (3c)

**Step 1:** Modify `src/screens/NavigationScreen.js` line 707.

Change `onNextStep` prop passed to `<WalkingInstructionCard>` from `advanceLeg` to `advanceStep`. (This should already be `advanceStep` if Task 9 was done correctly — verify.)

**Step 2:** Modify `src/components/navigation/WalkingInstructionCard.js`.

Add `onNextLeg` prop and conditional rendering:
```javascript
export default function WalkingInstructionCard({
  // ... existing props ...
  onNextStep,
  onNextLeg,       // NEW: called when last walking step is complete
  isLastStep,      // NEW: boolean — is this the final step in the walking leg?
}) {
```

Update the action button:
```jsx
{/* Before: single "Next Step" button */}
{/* After: */}
{isLastStep ? (
  <TouchableOpacity style={styles.nextLegBtn} onPress={onNextLeg} accessibilityRole="button">
    <Text style={styles.nextLegBtnText}>Done Walking</Text>
    <Icon name="Bus" size={16} color={COLORS.white} />
  </TouchableOpacity>
) : (
  <TouchableOpacity style={styles.nextStepBtn} onPress={onNextStep} accessibilityRole="button">
    <Text style={styles.nextStepBtnText}>Next Step</Text>
    <Text style={{ fontSize: 16, color: COLORS.primary }}>›</Text>
  </TouchableOpacity>
)}
```

New styles:
```javascript
nextLegBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.primary,
  borderRadius: 8,
  paddingHorizontal: 16,
  paddingVertical: 8,
  gap: 6,
},
nextLegBtnText: {
  color: COLORS.white,
  fontWeight: '600',
  fontSize: 14,
},
```

**Step 3:** Pass `isLastStep` and `onNextLeg` from `src/screens/NavigationScreen.js`:
```jsx
<WalkingInstructionCard
  // ... existing props ...
  isLastStep={currentStepIndex === currentLegSteps.length - 1}
  onNextStep={advanceStep}
  onNextLeg={advanceLeg}
/>
```

---

### Task 17: Remove "Step X of Y" text from NavigationProgressBar (3f)

Modify `src/components/navigation/NavigationProgressBar.js`.

Delete the step label Text element:
```jsx
// DELETE this entire block:
<Text style={styles.stepLabel}>
  Step {currentStepIndex + 1} of {totalSteps}
</Text>
```

Delete from StyleSheet:
```javascript
// DELETE these styles:
stepLabel: {
  fontSize: 12,
  color: COLORS.textSecondary,
  textAlign: 'center',
  marginTop: 4,
},
```

Verify the progress bar still renders correctly without the label. Run `npm run web:dev` and navigate to confirm.

---

### Task 18: Board button contrast fix (3g)

Modify `src/components/navigation/BusProximityCard.js`.

Change the `boardButton` style so it remains readable when the card background is green (`containerArrived` state):

```javascript
// Before:
boardButton: {
  backgroundColor: COLORS.success,
  // ...
},

// After (white button with green text — always readable regardless of card background):
boardButton: {
  backgroundColor: COLORS.white,
  borderWidth: 1.5,
  borderColor: COLORS.success,
  // keep existing padding/borderRadius
},
boardButtonText: {
  color: COLORS.success,
  fontWeight: '700',
},
```

This ensures the button has sufficient contrast whether the card background is white (normal state) or green (arrived state).

---

### Task 19: Add haptic feedback on navigation transitions (3e)

**Step 1:** `expo-haptics` is already in `package.json` at version `~15.0.8`. No install needed.

**Step 2:** Modify `src/screens/NavigationScreen.js`.

Add import near top:
```javascript
import { useRef } from 'react'; // add useRef to existing React import
import * as Haptics from 'expo-haptics';
```

Add a safe haptic helper with a "fired once" guard to prevent repeated triggers:
```javascript
// Track which haptic events have fired to avoid repeats
const hapticFiredRef = useRef({});

const triggerHapticOnce = async (key, type) => {
  if (hapticFiredRef.current[key]) return;
  hapticFiredRef.current[key] = true;
  try {
    await Haptics.notificationAsync(type);
  } catch (_) {
    // Haptics not available on web — silently ignore
  }
};

// Reset haptic tracking when leg changes
useEffect(() => {
  hapticFiredRef.current = {};
}, [currentLegIndex]);
```

**Step 3:** Add haptic calls in the existing effects.

In the bus arrival effect (around line 289-295 — where `busProximity?.hasArrived` is true):
```javascript
triggerHapticOnce('bus-arrived', Haptics.NotificationFeedbackType.Success);
```

In the alighting soon effect (around line 298-307 — where `busProximity?.shouldGetOff` triggers):
```javascript
triggerHapticOnce('alight-soon', Haptics.NotificationFeedbackType.Warning);
```

**Important:** The bus arrival effect at lines 289-295 currently has no code body (just a comment "No automatic boarding"). Add the haptic call there. The alighting effect at lines 298-307 already has a timeout — add the haptic before the timeout.

Note: `expo-haptics` is a no-op on web automatically — the try/catch is a belt-and-suspenders safety measure. The `triggerHapticOnce` guard prevents repeated haptic events when the effect re-runs due to dependency changes.

---

### Task 20: Phase 3 commits

```bash
git commit -m "feat(ui): register Walk icon and replace walking emoji

Phase 3a: Walk component already existed in CartoonIcons.js — added
Icon.js mapping. Replaces 🚶 in 6 components + Phase 2 placeholders.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

```bash
git commit -m "feat(ui): create BusStop, Transfer, Door, Phone, Hourglass, Celebration icons

Phase 3b: Add 6 new SVG icon components to CartoonIcons.js. Wire into
Icon.js mapping. Replace 🚏 📞 🚪 ⏳ 🎉 🔄 emojis across codebase.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

```bash
git commit -m "feat(nav): fix Next Step to advance walking turns, not legs

Phase 3c: WalkingInstructionCard now shows 'Next Step' for intermediate
steps and 'Done Walking' for the final step. Separate onNextStep and
onNextLeg callbacks prevent premature leg advancement.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

```bash
git commit -m "feat(ui): remove step counter text, fix board button contrast, add haptics

Phase 3f+3g+3e: Remove 'Step X of Y' from NavigationProgressBar.
Board button uses white/green outline for readability in arrived state.
Add expo-haptics feedback on bus arrival and alighting warnings.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Verification

After each phase:
1. Run `npm run web:dev` and verify web rendering.
2. Check native rendering if device available.
3. Run `npm test` if tests exist for modified areas. After Task 11, run: `npm test -- --testPathPattern=colorUtils`
4. Visual regression check: compare before/after for each modified screen.
5. Confirm both native (`.js`) and web (`.web.js`) counterparts are updated for every changed component.
6. For Task 12b (bus approach line): verify dashed line appears only when a live bus is matched, follows route shape (not straight line), and updates when switching trip results.

---

## Deferred (Not In This Plan)

- Missing `.web.js` counterparts for navigation components — these don't exist yet and creating them is a separate effort.
- Dark mode integration.
- WCAG font size audit.
- Animated route selection on map (linking card tap to map zoom).
- Mini map on TripDetailsScreen (3d) — deferred to a separate plan as it requires MapLibre integration inside a ScrollView, which has known z-index and gesture conflicts.
