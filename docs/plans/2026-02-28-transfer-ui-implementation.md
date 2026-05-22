# Transfer UI Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a journey segment timeline in selected trip cards when transfers exist, and render amber transfer markers on the map at transfer points.

**Architecture:** Purely presentational changes. The itinerary data model already contains all transfer info in legs array. We add conditional rendering in TripResultCard, extend useTripVisualization to emit transfer markers, and render them in both native (TransitMap) and web (HomeScreen.web.js) maps.

**Tech Stack:** React Native, react-leaflet (web), MapLibreGL (native), Animated API (native pulse), CSS keyframes (web pulse)

---

### Task 1: Add transfer color to theme

**Files:**
- Modify: `src/config/theme.js:6` (add to COLORS object)
- Modify: `src/config/theme.js:78` (add to COLORS_DARK object)

**Step 1: Add transfer color constants**

In `src/config/theme.js`, add after the `accentSubtle` line (line 23):

```javascript
// Transfer indicator (amber)
transfer: '#F5A623',
transferSubtle: '#FEF3E0',
```

And in `COLORS_DARK` after `accentSubtle` (line 93):

```javascript
transfer: '#FFB74D',
transferSubtle: '#3D2E0A',
```

**Step 2: Verify build**

Run: `npx tsc --noEmit 2>/dev/null; echo "Build check done"`

**Step 3: Commit**

```bash
git add src/config/theme.js
git commit -m "feat(theme): add amber transfer indicator colors"
```

---

### Task 2: Add transferMarkers to useTripVisualization

**Files:**
- Modify: `src/hooks/useTripVisualization.js:1-213`

**Step 1: Add transferMarkers memo**

After the `boardingAlightingMarkers` memo (after line 178), add a new `useMemo` that identifies transfer walk legs (walk legs sandwiched between two transit legs):

```javascript
// Transfer point markers (walk legs between two transit legs)
const transferMarkers = useMemo(() => {
  if (!selectedItinerary) return [];

  const markers = [];
  const legs = selectedItinerary.legs;

  legs.forEach((leg, index) => {
    if (leg.mode !== 'WALK') return;
    // Must be between two transit legs
    const prevLeg = legs[index - 1];
    const nextLeg = legs[index + 1];
    if (!prevLeg || !nextLeg) return;
    if (prevLeg.mode === 'WALK' || nextLeg.mode === 'WALK') return;

    // Use the alighting stop of prev transit leg as the transfer location
    const transferCoord = leg.from?.lat && leg.from?.lon
      ? { latitude: leg.from.lat, longitude: leg.from.lon }
      : prevLeg.to?.lat && prevLeg.to?.lon
        ? { latitude: prevLeg.to.lat, longitude: prevLeg.to.lon }
        : null;

    if (!transferCoord) return;

    const walkDuration = leg.duration || 0;
    const waitDuration = nextLeg.startTime && leg.endTime
      ? Math.max(0, Math.round((nextLeg.startTime - leg.endTime) / 1000))
      : null;

    markers.push({
      id: `transfer-${index}`,
      coordinate: transferCoord,
      fromStopName: leg.from?.name || prevLeg.to?.name || 'Transfer',
      toStopName: leg.to?.name || nextLeg.from?.name || '',
      walkDuration,
      waitDuration,
      walkDistance: leg.distance || 0,
    });
  });

  return markers;
}, [selectedItinerary]);
```

**Step 2: Also flag transfer walk segments in tripRouteCoordinates**

In the existing `tripRouteCoordinates` memo (around line 70-80), modify the route push to include an `isTransferWalk` flag. Replace the block inside `if (coords.length > 0)`:

```javascript
if (coords.length > 0) {
  // Detect if this walk leg is a transfer (between two transit legs)
  const isTransferWalk = leg.mode === 'WALK'
    && index > 0
    && index < selectedItinerary.legs.length - 1
    && selectedItinerary.legs[index - 1].mode !== 'WALK'
    && selectedItinerary.legs[index + 1].mode !== 'WALK';

  routes.push({
    id: `trip-leg-${index}`,
    coordinates: coords,
    color: leg.mode === 'WALK'
      ? (isTransferWalk ? COLORS.transfer || '#F5A623' : COLORS.grey500)
      : leg.isOnDemand ? (leg.zoneColor || COLORS.primary)
      : (leg.route?.color || COLORS.primary),
    isWalk: leg.mode === 'WALK',
    isTransferWalk,
    isOnDemand: !!leg.isOnDemand,
  });
}
```

Note: The `COLORS.transfer || '#F5A623'` fallback handles the case where theme hasn't been updated yet during development.

**Step 3: Add transferMarkers to return value**

Update the return statement (line 206-212) to include `transferMarkers`:

```javascript
return {
  tripRouteCoordinates,
  tripMarkers,
  intermediateStopMarkers,
  boardingAlightingMarkers,
  transferMarkers,
  tripVehicles,
};
```

**Step 4: Verify build**

Run: `npx tsc --noEmit 2>/dev/null; echo "Build check done"`

**Step 5: Commit**

```bash
git add src/hooks/useTripVisualization.js
git commit -m "feat(visualization): add transfer markers and amber transfer walk segments"
```

---

### Task 3: Add segment timeline to TripResultCard

**Files:**
- Modify: `src/components/TripResultCard.js:1-411`

This is the largest task. The segment timeline renders below the existing `mainRow` when `isSelected && itinerary.transfers > 0`.

**Step 1: Add helper imports**

At the top of the file (after the existing imports around line 17), add:

```javascript
import { COLORS as ThemeColors } from '../config/theme';
```

Wait — COLORS is already imported on line 15. Good. No new import needed.

**Step 2: Add transfer detection helper inside the component**

Inside the component function (after line 28), add a helper to compute transfer info from legs:

```javascript
// Build segment data for timeline (only when selected with transfers)
const segments = (isSelected && itinerary.transfers > 0) ? itinerary.legs.map((leg, index) => {
  const isTransfer = leg.mode === 'WALK'
    && index > 0
    && index < itinerary.legs.length - 1
    && itinerary.legs[index - 1].mode !== 'WALK'
    && itinerary.legs[index + 1].mode !== 'WALK';

  const waitDuration = isTransfer && itinerary.legs[index + 1]?.startTime && leg.endTime
    ? Math.max(0, Math.round((itinerary.legs[index + 1].startTime - leg.endTime) / 1000))
    : null;

  return {
    ...leg,
    isTransfer,
    waitDuration,
  };
}) : null;
```

**Step 3: Add the segment timeline JSX**

After the closing `</View>` of `mainRow` (line 192) and before the closing `</TouchableOpacity>`, add:

```jsx
{/* Segment Timeline — only for selected cards with transfers */}
{segments && (
  <View style={styles.segmentTimeline}>
    <View style={styles.segmentDivider} />
    {segments.map((seg, index) => {
      if (seg.isTransfer) {
        // Transfer walk between buses
        return (
          <View key={`seg-${index}`} style={styles.segmentRow}>
            <View style={styles.segmentIconCol}>
              <View style={styles.segmentLine} />
              <View style={styles.transferDiamond}>
                <Text style={styles.transferDiamondText}>◆</Text>
              </View>
              <View style={styles.segmentLine} />
            </View>
            <View style={styles.segmentContent}>
              <Text style={styles.transferTitle}>
                Transfer at {seg.to?.name || seg.from?.name || 'stop'}
              </Text>
              <Text style={styles.transferDetail}>
                {seg.distance > 0 ? `Walk ${formatDistance(seg.distance)}` : ''}
                {seg.distance > 0 && seg.waitDuration != null ? ' · ' : ''}
                {seg.waitDuration != null ? `Wait ~${formatDuration(seg.waitDuration)}` : ''}
              </Text>
            </View>
          </View>
        );
      }

      if (seg.mode === 'WALK') {
        // Origin or destination walk
        const isFirst = index === 0;
        const isLast = index === segments.length - 1;
        return (
          <View key={`seg-${index}`} style={styles.segmentRow}>
            <View style={styles.segmentIconCol}>
              {!isFirst && <View style={styles.segmentLine} />}
              <View style={[
                styles.segmentDot,
                isFirst && styles.segmentDotOrigin,
                isLast && styles.segmentDotDestination,
              ]} />
              {!isLast && <View style={styles.segmentLine} />}
            </View>
            <View style={styles.segmentContent}>
              <Text style={styles.segmentWalkText}>
                Walk {formatDuration(seg.duration)}
                {isFirst && seg.to?.name ? ` → ${seg.to.name}` : ''}
                {isLast && seg.from?.name ? ` → destination` : ''}
              </Text>
            </View>
          </View>
        );
      }

      // Bus leg
      const routeColor = seg.route?.color || COLORS.primary;
      return (
        <View key={`seg-${index}`} style={styles.segmentRow}>
          <View style={styles.segmentIconCol}>
            <View style={styles.segmentLine} />
            <View style={[styles.segmentBusBar, { backgroundColor: routeColor }]} />
            <View style={styles.segmentLine} />
          </View>
          <View style={styles.segmentContent}>
            <View style={styles.segmentBusRow}>
              <View style={[styles.segmentRouteBadge, { backgroundColor: routeColor }]}>
                <Text style={styles.segmentRouteText}>{seg.route?.shortName || '?'}</Text>
              </View>
              <Text style={styles.segmentBusTitle} numberOfLines={1}>
                {seg.headsign || seg.route?.longName || 'Bus'}
              </Text>
            </View>
            <Text style={styles.segmentBusDetail}>
              {formatDuration(seg.duration)} · {seg.intermediateStops?.length || 0} stops
            </Text>
          </View>
        </View>
      );
    })}
    <View style={styles.segmentDivider} />
  </View>
)}
```

**Step 4: Add the styles**

Add these styles inside the `StyleSheet.create({})` block (before the closing `});` on line 409):

```javascript
// Segment timeline styles
segmentTimeline: {
  marginTop: SPACING.sm,
  paddingTop: SPACING.xs,
},
segmentDivider: {
  height: 1,
  backgroundColor: COLORS.grey200,
  marginVertical: SPACING.xs,
},
segmentRow: {
  flexDirection: 'row',
  minHeight: 32,
},
segmentIconCol: {
  width: 24,
  alignItems: 'center',
},
segmentLine: {
  flex: 1,
  width: 2,
  backgroundColor: COLORS.grey300,
},
segmentDot: {
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: COLORS.grey400,
  borderWidth: 2,
  borderColor: COLORS.white,
},
segmentDotOrigin: {
  backgroundColor: COLORS.success,
},
segmentDotDestination: {
  backgroundColor: COLORS.error,
},
transferDiamond: {
  width: 20,
  height: 20,
  justifyContent: 'center',
  alignItems: 'center',
},
transferDiamondText: {
  fontSize: 16,
  color: '#F5A623',
  fontWeight: FONT_WEIGHTS.bold,
},
segmentBusBar: {
  width: 6,
  borderRadius: 3,
  minHeight: 16,
},
segmentContent: {
  flex: 1,
  paddingLeft: SPACING.sm,
  paddingVertical: 2,
  justifyContent: 'center',
},
transferTitle: {
  fontSize: FONT_SIZES.xs,
  fontWeight: FONT_WEIGHTS.semibold,
  color: '#F5A623',
},
transferDetail: {
  fontSize: FONT_SIZES.xxs,
  color: COLORS.textSecondary,
  marginTop: 1,
},
segmentWalkText: {
  fontSize: FONT_SIZES.xs,
  color: COLORS.textSecondary,
},
segmentBusRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACING.xs,
},
segmentRouteBadge: {
  paddingHorizontal: SPACING.xs,
  paddingVertical: 1,
  borderRadius: BORDER_RADIUS.xs,
},
segmentRouteText: {
  color: COLORS.white,
  fontSize: FONT_SIZES.xxs,
  fontWeight: FONT_WEIGHTS.bold,
},
segmentBusTitle: {
  fontSize: FONT_SIZES.xs,
  fontWeight: FONT_WEIGHTS.medium,
  color: COLORS.textPrimary,
  flex: 1,
},
segmentBusDetail: {
  fontSize: FONT_SIZES.xxs,
  color: COLORS.textSecondary,
  marginTop: 1,
},
```

**Step 5: Verify build**

Run: `npx tsc --noEmit 2>/dev/null; echo "Build check done"`

**Step 6: Commit**

```bash
git add src/components/TripResultCard.js
git commit -m "feat(card): add journey segment timeline for transfer routes"
```

---

### Task 4: Render transfer markers on web map (HomeScreen.web.js)

**Files:**
- Modify: `src/screens/HomeScreen.web.js`

**Step 1: Destructure transferMarkers from the hook**

Find the destructuring of `useTripVisualization` (around line 249-252). Add `transferMarkers`:

```javascript
const {
  tripRouteCoordinates, tripMarkers, intermediateStopMarkers,
  boardingAlightingMarkers, transferMarkers, tripVehicles,
} = useTripVisualization({ isTripPlanningMode, itineraries, selectedItineraryIndex, vehicles });
```

**Step 2: Add CSS keyframe for pulse animation**

Find where other `<style>` tags or CSS injections happen. If there's a `useEffect` that injects styles, add the pulse keyframe there. Otherwise, add a `<style>` tag in the JSX. Look for an appropriate place — likely near other map-related style injections.

If no existing style injection exists, add this inside the component (before the return), using a useEffect:

```javascript
// Inject transfer pulse animation CSS (web only)
React.useEffect(() => {
  const styleId = 'transfer-pulse-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes transfer-pulse {
        0% { transform: scale(1); opacity: 0.8; }
        100% { transform: scale(2.5); opacity: 0; }
      }
      .transfer-marker-pulse {
        animation: transfer-pulse 2s ease-out infinite;
      }
    `;
    document.head.appendChild(style);
  }
}, []);
```

**Step 3: Render transfer markers on the map**

After the `boardingAlightingMarkers.map(...)` block (around line 674), add:

```jsx
{/* Transfer point markers */}
{transferMarkers.map((marker) => (
  <Marker
    key={marker.id}
    position={[marker.coordinate.latitude, marker.coordinate.longitude]}
    icon={L.divIcon({
      className: 'transfer-point-marker',
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;background:#F5A623;opacity:0.3;" class="transfer-marker-pulse"></div>
          <div style="background:white;border-radius:8px;padding:4px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid #F5A623;margin-bottom:4px;white-space:nowrap;">
            <div style="font-size:10px;font-weight:bold;color:#F5A623;text-transform:uppercase;">🔄 Transfer</div>
            <div style="font-size:11px;font-weight:600;color:#333;">${marker.fromStopName}</div>
          </div>
          <div style="width:20px;height:20px;background:#F5A623;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);transform:rotate(45deg);border-radius:3px;"></div>
        </div>
      `,
      iconSize: [180, 80],
      iconAnchor: [90, 80],
    })}
    zIndexOffset={1000}
  />
))}
```

The marker uses:
- A tooltip-style label with "Transfer" header and stop name
- An amber diamond shape (rotated square) below the label
- A pulsing ring behind the diamond via CSS animation
- `zIndexOffset={1000}` to render above other markers

**Step 4: Update transfer walk polyline color**

The `tripRouteCoordinates` already includes `isTransferWalk` from Task 2. Find where polylines render (around line 609-622) and update the color/dashArray for transfer walks:

```jsx
{tripRouteCoordinates.map((route) => (
  <LeafletPolyline
    key={route.id}
    positions={route.coordinates.map(c => [c.latitude, c.longitude])}
    pathOptions={{
      color: route.isTransferWalk ? '#F5A623' : route.color,
      weight: route.isWalk ? 4 : route.isOnDemand ? 5 : 6,
      dashArray: route.isWalk ? '10, 8' : route.isOnDemand ? '12, 6' : null,
      lineCap: 'round',
      lineJoin: 'round',
      opacity: 1,
    }}
  />
))}
```

The only change is the `color` ternary — transfer walks get amber instead of grey.

**Step 5: Verify build**

Run: `npx tsc --noEmit 2>/dev/null; echo "Build check done"`

**Step 6: Commit**

```bash
git add src/screens/HomeScreen.web.js
git commit -m "feat(web-map): render amber transfer markers with pulse animation"
```

---

### Task 5: Render transfer markers on native map (TransitMap.js)

**Files:**
- Modify: `src/components/TransitMap.js:1-193`

**Step 1: Accept transferMarkers prop**

Update the component's destructured props (line 11-21) to include `transferMarkers`:

```javascript
const TransitMapComponent = forwardRef(({
    displayedShapes,
    displayedStops,
    displayedVehicles,
    tripRouteCoordinates,
    tripMarkers,
    transferMarkers,
    selectedRoute,
    selectedStop,
    onRegionChange,
    onStopPress,
    getRouteColor,
}, ref) => {
```

**Step 2: Add transfer marker rendering**

After the `tripMarkers.map(...)` block (after line 154), add transfer markers:

```jsx
{/* Transfer Point Markers */}
{(transferMarkers || []).map((marker) => (
  <MapLibreGL.PointAnnotation
    key={marker.id}
    id={`transit-transfer-${marker.id}`}
    coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
  >
    <View style={styles.transferMarker}>
      <View style={styles.transferMarkerDiamond} />
    </View>
  </MapLibreGL.PointAnnotation>
))}
```

**Step 3: Add transfer marker styles**

Add to the StyleSheet (before the closing `});`):

```javascript
transferMarker: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
},
transferMarkerDiamond: {
    width: 16,
    height: 16,
    backgroundColor: '#F5A623',
    borderWidth: 3,
    borderColor: COLORS.white,
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    ...SHADOWS.medium,
},
```

**Step 4: Pass transferMarkers from HomeScreen**

Check `src/screens/HomeScreen.js` — find where `<TransitMap>` is rendered and add the `transferMarkers` prop. The prop should already be available from `useTripVisualization`.

Look for the TransitMap usage and add:

```jsx
transferMarkers={transferMarkers}
```

**Step 5: Verify build**

Run: `npx tsc --noEmit 2>/dev/null; echo "Build check done"`

**Step 6: Commit**

```bash
git add src/components/TransitMap.js src/screens/HomeScreen.js
git commit -m "feat(native-map): render amber diamond transfer markers"
```

---

### Task 6: Visual QA and polish

**Step 1: Test web with transfer route**

Run: `npm run web:dev`

Plan a trip that requires a transfer (e.g., 43 Shanty Bay Road to 111 Victoria Street). Verify:
- [ ] Compact card shows existing layout when unselected
- [ ] Selecting the transfer route expands to show segment timeline
- [ ] Transfer row shows amber diamond, stop name, walk + wait info
- [ ] Bus rows show colored badge, headsign, duration, stops
- [ ] Walk rows show duration and direction
- [ ] Direct route card does NOT expand timeline
- [ ] Map shows amber diamond marker at transfer point
- [ ] Amber pulsing ring animates on web
- [ ] Transfer walk polyline is amber (not grey)
- [ ] Other polylines unchanged

**Step 2: Fix any visual issues**

Adjust spacing, font sizes, colors as needed.

**Step 3: Final commit**

```bash
git add -A
git commit -m "fix(transfer-ui): visual polish from QA"
```
