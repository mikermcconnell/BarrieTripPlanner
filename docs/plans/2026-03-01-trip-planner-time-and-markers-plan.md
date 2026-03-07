# Trip Planner: Time Picker + Marker Info Labels — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up the existing TimePicker component for native time selection, and add stop info labels (name, number, walk distance) to origin/destination markers on the trip preview map.

**Architecture:** Feature 1 integrates the existing `TimePicker.js` into `TripSearchHeader.js`, replacing the static time display with a full time picker. Feature 2 extends `useTripVisualization` to enrich origin/destination markers with stop metadata and walking distance, then renders labels in both native and web HomeScreens following the existing `boardingAlightingMarkers` pattern.

**Tech Stack:** React Native, Expo, MapLibreGL (native), Leaflet (web), existing `haversineDistance` from `geometryUtils.js`

---

## Task 1: Integrate TimePicker into TripSearchHeader (Native)

**Files:**
- Modify: `src/components/TripSearchHeader.js`

**Step 1: Import TimePicker**

Add import at top of file:

```javascript
import TimePicker from './TimePicker';
```

**Step 2: Replace time mode chips and time display with TimePicker**

Replace the `{/* Time mode chips */}` section (lines 152-185) — the three chip buttons, the time display row, and the Search button — with the `TimePicker` component plus Search button.

The key mapping between TimePicker modes (`'now'`, `'depart'`, `'arrive'`) and the hook modes (`'now'`, `'departAt'`, `'arriveBy'`):

```javascript
// Mode key mapping: TimePicker ↔ useTripPlanner hook
const PICKER_TO_HOOK = { now: 'now', depart: 'departAt', arrive: 'arriveBy' };
const HOOK_TO_PICKER = { now: 'now', departAt: 'depart', arriveBy: 'arrive' };
```

Replace lines 152-185 with:

```jsx
{/* Time picker (Leave Now / Depart At / Arrive By) */}
<TimePicker
  value={selectedTime || new Date()}
  mode={HOOK_TO_PICKER[timeMode] || 'now'}
  onChange={(newTime, pickerMode) => {
    const hookMode = PICKER_TO_HOOK[pickerMode] || 'now';
    if (onTimeModeChange) onTimeModeChange(hookMode);
    if (hookMode === 'now') {
      onSelectedTimeChange && onSelectedTimeChange(null);
    } else {
      onSelectedTimeChange && onSelectedTimeChange(newTime);
    }
  }}
/>

{/* Search button (shown for non-'now' modes) */}
{timeMode !== 'now' && onSearch && (
  <TouchableOpacity style={styles.searchBtn} onPress={onSearch} accessibilityLabel="Search trips" accessibilityRole="button">
    <Text style={styles.searchBtnText}>Search</Text>
  </TouchableOpacity>
)}
```

**Step 3: Clean up unused styles**

Remove these now-unused styles from the StyleSheet: `timeModeRow`, `timeModeChip`, `timeModeChipActive`, `timeModeChipText`, `timeModeChipTextActive`, `timeRow`, `timeDisplay`.

Also remove the `formatTimeDisplay` function at the top (line 16-24) and the `selectTimeMode` function (lines 53-62) — TimePicker handles both.

**Step 4: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`
Expected: "Exported: dist" with no errors

**Step 5: Commit**

```bash
git add src/components/TripSearchHeader.js
git commit -m "feat(trip): integrate TimePicker into TripSearchHeader for native time selection"
```

---

## Task 2: Enrich Origin/Destination Markers with Stop Info

**Files:**
- Modify: `src/hooks/useTripVisualization.js`

**Step 1: Import haversineDistance**

Add at top:

```javascript
import { haversineDistance } from '../utils/geometryUtils';
```

**Step 2: Accept tripFrom/tripTo props**

Add `tripFrom` and `tripTo` to the destructured params (these are the user's entered address locations `{ lat, lon }`):

```javascript
export const useTripVisualization = ({
  isTripPlanningMode,
  itineraries,
  selectedItineraryIndex,
  vehicles,
  shapes,
  tripMapping,
  tripFrom,  // { lat, lon } - user's entered origin address
  tripTo,    // { lat, lon } - user's entered destination address
}) => {
```

**Step 3: Extend tripMarkers with stop info and walk distance**

Replace the current `tripMarkers` useMemo (lines 88-115) with:

```javascript
// Origin + destination markers with stop info
const tripMarkers = useMemo(() => {
  if (!selectedItinerary?.legs) return [];

  const markers = [];
  const firstLeg = selectedItinerary.legs[0];
  const lastLeg = selectedItinerary.legs[selectedItinerary.legs.length - 1];

  if (firstLeg?.from) {
    const walkDist = tripFrom
      ? Math.round(haversineDistance(tripFrom.lat, tripFrom.lon, firstLeg.from.lat, firstLeg.from.lon))
      : null;
    markers.push({
      id: 'origin',
      coordinate: { latitude: firstLeg.from.lat, longitude: firstLeg.from.lon },
      type: 'origin',
      title: 'Start',
      stopName: firstLeg.from.name || null,
      stopCode: firstLeg.from.stopCode || firstLeg.from.stopId || null,
      walkDistance: walkDist,
    });
  }

  if (lastLeg?.to) {
    const walkDist = tripTo
      ? Math.round(haversineDistance(lastLeg.to.lat, lastLeg.to.lon, tripTo.lat, tripTo.lon))
      : null;
    markers.push({
      id: 'destination',
      coordinate: { latitude: lastLeg.to.lat, longitude: lastLeg.to.lon },
      type: 'destination',
      title: 'End',
      stopName: lastLeg.to.name || null,
      stopCode: lastLeg.to.stopCode || lastLeg.to.stopId || null,
      walkDistance: walkDist,
    });
  }

  return markers;
}, [selectedItinerary, tripFrom, tripTo]);
```

Note: `haversineDistance` returns meters. Walk distances under 1000m show as "312m walk", 1000m+ show as "1.1km walk".

**Step 4: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`
Expected: clean export

**Step 5: Commit**

```bash
git add src/hooks/useTripVisualization.js
git commit -m "feat(trip): enrich origin/destination markers with stop info and walk distance"
```

---

## Task 3: Pass tripFrom/tripTo to useTripVisualization in Both HomeScreens

**Files:**
- Modify: `src/screens/HomeScreen.js`
- Modify: `src/screens/HomeScreen.web.js`

**Step 1: Update native HomeScreen**

In `HomeScreen.js`, find the `useTripVisualization` call (line ~217) and add `tripFrom` and `tripTo`:

```javascript
const {
  tripRouteCoordinates, tripMarkers, intermediateStopMarkers,
  boardingAlightingMarkers, tripVehicles, busApproachLines,
} = useTripVisualization({
  isTripPlanningMode, itineraries, selectedItineraryIndex, vehicles, shapes, tripMapping,
  tripFrom: tripFromLocation,
  tripTo: tripToLocation,
});
```

**Step 2: Update web HomeScreen**

Find the equivalent `useTripVisualization` call in `HomeScreen.web.js` and add the same two props. The web HomeScreen destructures `from: tripFromLocation` and `to: tripToLocation` from `tripState` the same way.

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/screens/HomeScreen.js src/screens/HomeScreen.web.js
git commit -m "feat(trip): pass user origin/destination to trip visualization hook"
```

---

## Task 4: Render Origin/Destination Labels on Native Map

**Files:**
- Modify: `src/screens/HomeScreen.js`

**Step 1: Replace passive trip marker rendering with labeled markers**

Find the trip markers rendering block (lines 743-758). Replace it with a version that includes info labels below the circle, following the `boardingAlightingMarkers` pattern.

Replace:

```jsx
{/* Trip planning markers */}
{tripMarkers.map((marker) => (
  <MapLibreGL.MarkerView
    key={marker.id}
    coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
  >
    <View style={[
      styles.tripMarker,
      marker.type === 'origin' ? styles.tripMarkerOrigin : styles.tripMarkerDestination
    ]}>
      <View style={[
        styles.tripMarkerInner,
        marker.type === 'origin' ? styles.tripMarkerInnerOrigin : styles.tripMarkerInnerDestination
      ]} />
    </View>
  </MapLibreGL.MarkerView>
))}
```

With:

```jsx
{/* Trip planning markers with stop info labels */}
{tripMarkers.map((marker) => (
  <MapLibreGL.MarkerView
    key={marker.id}
    coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
  >
    <View style={styles.tripMarkerLabelContainer}>
      <View style={[
        styles.tripMarker,
        marker.type === 'origin' ? styles.tripMarkerOrigin : styles.tripMarkerDestination
      ]}>
        <View style={[
          styles.tripMarkerInner,
          marker.type === 'origin' ? styles.tripMarkerInnerOrigin : styles.tripMarkerInnerDestination
        ]} />
      </View>
      {marker.stopName && (
        <View style={[styles.tripMarkerLabel, marker.type === 'origin' ? styles.tripMarkerLabelOrigin : styles.tripMarkerLabelDest]}>
          <Text style={styles.tripMarkerLabelName} numberOfLines={1}>
            {marker.stopCode ? `#${marker.stopCode} - ` : ''}{marker.stopName}
          </Text>
          {marker.walkDistance != null && (
            <Text style={styles.tripMarkerLabelWalk}>
              {marker.walkDistance >= 1000
                ? `${(marker.walkDistance / 1000).toFixed(1)}km walk`
                : `${marker.walkDistance}m walk`}
              {marker.type === 'origin' ? ' from start' : ' to destination'}
            </Text>
          )}
        </View>
      )}
    </View>
  </MapLibreGL.MarkerView>
))}
```

**Step 2: Add styles**

Add these styles to the StyleSheet in HomeScreen.js:

```javascript
tripMarkerLabelContainer: {
  alignItems: 'center',
},
tripMarkerLabel: {
  backgroundColor: COLORS.white,
  borderRadius: 6,
  paddingVertical: 3,
  paddingHorizontal: 6,
  marginTop: 4,
  maxWidth: 180,
  borderWidth: 1.5,
  ...SHADOWS.small,
},
tripMarkerLabelOrigin: {
  borderColor: COLORS.success,
},
tripMarkerLabelDest: {
  borderColor: COLORS.error,
},
tripMarkerLabelName: {
  fontSize: 10,
  fontWeight: FONT_WEIGHTS.semibold,
  color: COLORS.textPrimary,
},
tripMarkerLabelWalk: {
  fontSize: 9,
  color: COLORS.textSecondary,
  marginTop: 1,
},
```

**Step 3: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 4: Commit**

```bash
git add src/screens/HomeScreen.js
git commit -m "feat(trip): render stop info labels on native origin/destination markers"
```

---

## Task 5: Render Origin/Destination Labels on Web Map

**Files:**
- Modify: `src/screens/HomeScreen.web.js`

**Step 1: Replace passive trip marker rendering with labeled markers**

Find the web trip markers rendering (lines 670-685). Replace the simple `divIcon` with one that includes a label below the circle, matching native.

Replace:

```jsx
{tripMarkers.map((marker) => (
  <Marker
    key={marker.id}
    position={[marker.coordinate.latitude, marker.coordinate.longitude]}
    zIndexOffset={1000}
    icon={L.divIcon({
      className: `trip-marker-${marker.type}`,
      html: marker.type === 'origin'
        ? `<div style="...">...</div>`
        : `<div style="...">...</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })}
  />
))}
```

With:

```jsx
{tripMarkers.map((marker) => {
  const color = marker.type === 'origin' ? '#4CAF50' : '#f44336';
  const borderColor = marker.type === 'origin' ? '#4CAF50' : '#f44336';
  const walkLabel = marker.walkDistance != null
    ? (marker.walkDistance >= 1000
        ? `${(marker.walkDistance / 1000).toFixed(1)}km walk`
        : `${marker.walkDistance}m walk`)
      + (marker.type === 'origin' ? ' from start' : ' to destination')
    : '';
  const labelHtml = marker.stopName
    ? `<div style="background:white;border-radius:6px;padding:3px 6px;margin-top:4px;border:1.5px solid ${borderColor};box-shadow:0 1px 4px rgba(0,0,0,0.15);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        <div style="font-size:10px;font-weight:600;color:#333;">${marker.stopCode ? `#${marker.stopCode} - ` : ''}${marker.stopName}</div>
        ${walkLabel ? `<div style="font-size:9px;color:#888;margin-top:1px;">${walkLabel}</div>` : ''}
      </div>`
    : '';
  return (
    <Marker
      key={marker.id}
      position={[marker.coordinate.latitude, marker.coordinate.longitude]}
      zIndexOffset={1000}
      icon={L.divIcon({
        className: `trip-marker-${marker.type}`,
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="background:${color};width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
            <div style="background:white;width:8px;height:8px;border-radius:50%;"></div>
          </div>
          ${labelHtml}
        </div>`,
        iconSize: [180, 70],
        iconAnchor: [90, 10],
      })}
    />
  );
})}
```

**Step 2: Verify build**

Run: `npx expo export --platform web --no-minify 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add src/screens/HomeScreen.web.js
git commit -m "feat(trip): render stop info labels on web origin/destination markers"
```

---

## Task 6: Manual Verification

**Step 1: Test native time picker**

1. Open the app on Android emulator
2. Tap "Plan Your Trip"
3. Enter origin and destination
4. Tap "Depart At" → verify TimePicker appears with quick offsets (+15m, +30m, +1h), "Set time..." custom picker, and Today/Tomorrow toggle
5. Select a time → tap Search → verify the API request includes the selected time (check Metro logs)
6. Tap "Arrive By" → verify it shows without quick offsets (only "Set time..." and day toggle)
7. Tap "Leave Now" → verify time picker collapses

**Step 2: Test origin/destination marker labels**

1. Plan a trip with results
2. Verify green origin marker shows stop name, number, and walk distance from entered address
3. Verify red destination marker shows stop name, number, and walk distance to entered destination
4. Try a trip with a long walk → verify distance shows in km format (e.g., "1.1km walk")
5. Verify web shows equivalent labels

**Step 3: Final commit if any tweaks needed**
