# Auto-Detour Detection Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the auto-detour detection system so it reliably detects real detours (like the current Route 8A/8B detour) and actively notifies users.

**Architecture:** Six independent fix areas: (1) trip-aware shape resolution in the backend detector, (2) longitude-scaled projection math, (3) spatial anchor computation for geometry, (4) extractSkippedSegment off-by-one, (5) client-side notification on new detours + show overlays for all routes, (6) web marker guards + visual differentiation of entry/exit markers. Each area is a standalone commit.

**Tech Stack:** Node.js (api-proxy backend), React Native + Expo (client), Firestore (pub/sub), Jest (tests)

---

## Task 1: Trip-Aware Shape Resolution (The Critical Fix)

**Why:** The detector checks distance to ALL shape variants for a route. Route 8A has 12 shapes, 8B has 8. A bus on a real detour is always near *some* shape variant, so detours are never detected. The fix: resolve each vehicle's `tripId` to its specific `shapeId` and measure distance to only that shape.

**Files:**
- Modify: `api-proxy/detourDetector.js` (lines 95, 133-149)
- Modify: `api-proxy/detourWorker.js` (line 94)
- Test: `api-proxy/__tests__/detourDetector.test.js`

### Step 1: Write the failing test — multi-shape route false negative

Add to the end of `api-proxy/__tests__/detourDetector.test.js` (before final closing brace if any, or at end of file):

```javascript
describe('trip-aware shape resolution', () => {
  // Route with multiple shape variants — simulates Route 8 with 3 shapes
  const multiShapes = new Map([
    ['shape-main', [
      { latitude: 44.39, longitude: -79.700 },
      { latitude: 44.39, longitude: -79.698 },
      { latitude: 44.39, longitude: -79.696 },
      { latitude: 44.39, longitude: -79.694 },
      { latitude: 44.39, longitude: -79.692 },
      { latitude: 44.39, longitude: -79.690 },
    ]],
    ['shape-variant-north', [
      { latitude: 44.395, longitude: -79.700 },
      { latitude: 44.395, longitude: -79.698 },
      { latitude: 44.395, longitude: -79.696 },
      { latitude: 44.395, longitude: -79.694 },
      { latitude: 44.395, longitude: -79.692 },
      { latitude: 44.395, longitude: -79.690 },
    ]],
    ['shape-variant-south', [
      { latitude: 44.385, longitude: -79.700 },
      { latitude: 44.385, longitude: -79.698 },
      { latitude: 44.385, longitude: -79.696 },
    ]],
  ]);
  const multiRouteMapping = new Map([
    ['route-8', ['shape-main', 'shape-variant-north', 'shape-variant-south']],
  ]);
  const tripMapping = new Map([
    ['trip-100', { routeId: 'route-8', shapeId: 'shape-main' }],
  ]);

  // Bus is on shape-variant-north (near it) but ASSIGNED to shape-main (far from it)
  // Without trip-aware resolution, minDist = ~0m (near shape-variant-north) → on-route
  // With trip-aware resolution, dist to shape-main = ~556m → off-route
  const offRouteForAssignedShape = { latitude: 44.395, longitude: -79.695 };

  it('detects detour when bus is near a non-assigned shape variant', () => {
    clearVehicleState();
    const vehicle = {
      id: 'bus-trip-aware',
      routeId: 'route-8',
      tripId: 'trip-100',
      coordinate: offRouteForAssignedShape,
    };

    // 3 consecutive off-route readings should trigger
    for (let i = 0; i < 3; i++) {
      processVehicles([vehicle], multiShapes, multiRouteMapping, tripMapping);
    }

    const state = getState();
    expect(state.activeDetourCount).toBe(1);
    expect(state.detours['route-8']).toBeDefined();
  });

  it('falls back to all shapes when tripId is missing', () => {
    clearVehicleState();
    const vehicle = {
      id: 'bus-no-trip',
      routeId: 'route-8',
      tripId: null,
      coordinate: offRouteForAssignedShape,
    };

    // With no tripId, falls back to min-across-all-shapes
    // Bus is ~0m from shape-variant-north → on-route (no detour)
    for (let i = 0; i < 3; i++) {
      processVehicles([vehicle], multiShapes, multiRouteMapping, tripMapping);
    }

    const state = getState();
    expect(state.activeDetourCount).toBe(0);
  });

  it('falls back to all shapes when tripId is not in mapping', () => {
    clearVehicleState();
    const vehicle = {
      id: 'bus-unknown-trip',
      routeId: 'route-8',
      tripId: 'trip-unknown',
      coordinate: offRouteForAssignedShape,
    };

    for (let i = 0; i < 3; i++) {
      processVehicles([vehicle], multiShapes, multiRouteMapping, tripMapping);
    }

    const state = getState();
    // Unknown trip → fallback → near shape-variant-north → no detour
    expect(state.activeDetourCount).toBe(0);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js --testNamePattern="trip-aware" --no-coverage`

Expected: FAIL — `processVehicles` doesn't accept 4th arg, bus registers as on-route for all 3 tests.

### Step 3: Implement trip-aware shape resolution

**In `api-proxy/detourDetector.js`:**

Change the `processVehicles` function signature (line 95) from:

```javascript
function processVehicles(vehicles, shapes, routeShapeMapping) {
```

to:

```javascript
function processVehicles(vehicles, shapes, routeShapeMapping, tripMapping) {
```

Replace lines 139-149 (the min-distance loop) with:

```javascript
    // Prefer trip-specific shape when available
    let minDist = Infinity;
    const tripData = vehicle.tripId && tripMapping ? tripMapping.get(vehicle.tripId) : null;
    const tripShapeId = tripData?.shapeId ?? null;

    if (tripShapeId) {
      const polyline = shapes.get(tripShapeId);
      if (polyline && polyline.length > 0) {
        minDist = pointToPolylineDistance(coordinate, polyline);
      }
    }

    // Fall back to all shapes only when trip-specific shape unavailable
    if (minDist === Infinity) {
      for (const shapeId of shapeIds) {
        const polyline = shapes.get(shapeId);
        if (!polyline || polyline.length === 0) continue;
        const dist = pointToPolylineDistance(coordinate, polyline);
        if (dist < minDist) minDist = dist;
      }
    }
```

### Step 4: Pass tripMapping through from the worker

**In `api-proxy/detourWorker.js`**, change line 94 from:

```javascript
const activeDetours = processVehicles(vehicles, baseline.shapes, baseline.routeShapeMapping);
```

to:

```javascript
const activeDetours = processVehicles(vehicles, baseline.shapes, baseline.routeShapeMapping, data.tripMapping);
```

### Step 5: Update existing tests that call processVehicles

All existing tests call `processVehicles(vehicles, shapes, routeShapeMapping)` with 3 args. This still works because `tripMapping` defaults to `undefined` and the code handles that (the `tripMapping ?` guard). **No changes needed** — existing tests continue to test the fallback path.

### Step 6: Run all tests to verify

Run: `cd api-proxy && npx jest __tests__/detourDetector.test.js --no-coverage`

Expected: ALL PASS (new trip-aware tests + all existing tests).

### Step 7: Commit

```bash
git add api-proxy/detourDetector.js api-proxy/detourWorker.js api-proxy/__tests__/detourDetector.test.js
git commit -m "feat(detour): trip-aware shape resolution to fix multi-variant routes

The detector was checking distance to ALL shape variants for a route.
Route 8A (12 shapes) and 8B (8 shapes) could never trigger detours
because a bus on detour was always near some non-active shape variant.

Now resolves each vehicle's tripId to its assigned shapeId and measures
distance to only that shape. Falls back to all-shapes minimum when
tripId is unavailable.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Fix Projection Math — Longitude Scaling

**Why:** The `pointToSegmentDistance` function uses raw degree differences for the projection parameter `t`. At Barrie's latitude (~44°), longitude degrees are ~71% the width of latitude degrees. This introduces 5-30m errors on diagonal segments.

**Files:**
- Modify: `api-proxy/geometry.js` (lines 17-33)
- Modify: `api-proxy/detourGeometry.js` (lines 39-57)
- Test: `api-proxy/__tests__/detourGeometry.test.js`

### Step 1: Write the failing test — diagonal segment distance

Add to end of `api-proxy/__tests__/detourGeometry.test.js`:

```javascript
describe('longitude-scaled projection', () => {
  it('findClosestShapePoint projects correctly on diagonal segments', () => {
    // Diagonal segment: SW to NE
    const diagonal = [
      { latitude: 44.380, longitude: -79.710 },
      { latitude: 44.400, longitude: -79.680 },
    ];
    // Point due east of the midpoint of the segment
    const point = { latitude: 44.390, longitude: -79.690 };
    const result = findClosestShapePoint(point, diagonal);
    // The projected point should be very close (within 5m)
    // because the point is near the midpoint of the segment
    expect(result.distanceMeters).toBeLessThan(5);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd api-proxy && npx jest __tests__/detourGeometry.test.js --testNamePattern="longitude-scaled" --no-coverage`

Expected: FAIL — distanceMeters will be >5m due to the unscaled projection.

### Step 3: Fix `pointToSegmentDistance` in geometry.js

Replace `api-proxy/geometry.js` lines 17-33 with:

```javascript
const pointToSegmentDistance = (point, segmentStart, segmentEnd) => {
  const x = point.longitude;
  const y = point.latitude;
  const x1 = segmentStart.longitude;
  const y1 = segmentStart.latitude;
  const x2 = segmentEnd.longitude;
  const y2 = segmentEnd.latitude;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return haversineDistance(y, x, y1, x1);
  }
  // Scale longitude by cos(lat) so the dot product works in equal-area units
  const cosLat = Math.cos(toRadians((y1 + y2) / 2));
  const sdx = dx * cosLat;
  const sdy = dy;
  const t = Math.max(0, Math.min(1, (((x - x1) * cosLat) * sdx + (y - y1) * sdy) / (sdx * sdx + sdy * sdy)));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return haversineDistance(y, x, closestY, closestX);
};
```

### Step 4: Fix `findClosestShapePoint` in detourGeometry.js

Replace `api-proxy/detourGeometry.js` lines 43-57 with:

```javascript
    const dx = p2.longitude - p1.longitude;
    const dy = p2.latitude - p1.latitude;
    const lenSq = dx * dx + dy * dy;

    let projLat, projLon;
    if (lenSq === 0) {
      projLat = p1.latitude;
      projLon = p1.longitude;
    } else {
      // Scale longitude by cos(lat) for accurate projection
      const cosLat = Math.cos(((p1.latitude + p2.latitude) / 2) * Math.PI / 180);
      const sdx = dx * cosLat;
      const sdy = dy;
      const t = Math.max(0, Math.min(1,
        (((coord.longitude - p1.longitude) * cosLat) * sdx + (coord.latitude - p1.latitude) * sdy) / (sdx * sdx + sdy * sdy)
      ));
      projLat = p1.latitude + t * dy;
      projLon = p1.longitude + t * dx;
    }
```

### Step 5: Run all geometry tests

Run: `cd api-proxy && npx jest __tests__/detourGeometry.test.js --no-coverage`

Expected: ALL PASS.

### Step 6: Run full detector tests (regression)

Run: `cd api-proxy && npx jest --no-coverage`

Expected: ALL PASS.

### Step 7: Commit

```bash
git add api-proxy/geometry.js api-proxy/detourGeometry.js api-proxy/__tests__/detourGeometry.test.js
git commit -m "fix(detour): scale longitude by cos(lat) in projection math

Raw degree dot products distorted segment projections at Barrie's
latitude (44°N) where 1° longitude = ~79km vs 1° latitude = ~111km.
Now both pointToSegmentDistance and findClosestShapePoint scale
longitude by cos(lat) before computing the projection parameter.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Spatial Anchor Computation + Off-by-One Fix

**Why:** `findAnchors` uses the first and last evidence points temporally. For an ongoing detour the "exit" is just the bus's current position, making geometry unstable. Fix: project all evidence onto the shape and use min/max index. Also fix `extractSkippedSegment` off-by-one (includes one extra point).

**Files:**
- Modify: `api-proxy/detourGeometry.js` (lines 75-115, 120-128)
- Test: `api-proxy/__tests__/detourGeometry.test.js`

### Step 1: Write the failing test — spatial vs temporal anchors

Add to end of `api-proxy/__tests__/detourGeometry.test.js`:

```javascript
describe('spatial anchor computation', () => {
  it('uses spatial min/max shape indices, not temporal first/last points', () => {
    // Evidence: bus went off-route near index 1, and is currently near index 3
    // But temporally, the first point is near shape index 3, last near index 1
    // (e.g. bus was spotted mid-detour first, then backtracked)
    const points = [
      { latitude: 44.395, longitude: -79.694, timestampMs: 1000, vehicleId: 'b1' },
      { latitude: 44.395, longitude: -79.698, timestampMs: 2000, vehicleId: 'b1' },
    ];
    const result = findAnchors(points, shapes, ['shape-1']);
    expect(result).not.toBeNull();
    // Spatial: the point at -79.698 is near index 1, -79.694 near index 3
    // entryIndex should be the smaller index regardless of temporal order
    expect(result.entryIndex).toBeLessThanOrEqual(result.exitIndex);
  });
});

describe('extractSkippedSegment bounds', () => {
  it('does not include extra point beyond exitIndex', () => {
    const poly = [
      { latitude: 44.39, longitude: -79.700 },
      { latitude: 44.39, longitude: -79.698 },
      { latitude: 44.39, longitude: -79.696 },
      { latitude: 44.39, longitude: -79.694 },
      { latitude: 44.39, longitude: -79.692 },
    ];
    // Extract indices 1 through 3 (inclusive) → should be 3 points
    const segment = extractSkippedSegment(poly, 1, 3);
    expect(segment).toHaveLength(3);
    expect(segment[0].longitude).toBeCloseTo(-79.698, 3);
    expect(segment[2].longitude).toBeCloseTo(-79.694, 3);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd api-proxy && npx jest __tests__/detourGeometry.test.js --testNamePattern="spatial anchor|extractSkippedSegment bounds" --no-coverage`

Expected: The extractSkippedSegment test FAILS (returns 4 points instead of 3).

### Step 3: Fix `findAnchors` — use spatial min/max indices

Replace `api-proxy/detourGeometry.js` lines 75-115 with:

```javascript
function findAnchors(evidencePoints, shapes, shapeIds) {
  if (!evidencePoints || evidencePoints.length === 0) return null;
  if (!shapeIds || shapeIds.length === 0) return null;

  let bestShapeId = null;
  let bestMinIndex = 0;
  let bestMaxIndex = 0;
  let bestTotalDist = Infinity;

  for (const shapeId of shapeIds) {
    const polyline = shapes.get(shapeId);
    if (!polyline || polyline.length < 2) continue;

    // Project ALL evidence points onto this shape, track min/max index and total distance
    let minIdx = Infinity;
    let maxIdx = -Infinity;
    let totalDist = 0;

    for (const pt of evidencePoints) {
      const csp = findClosestShapePoint(pt, polyline);
      if (!csp) continue;
      if (csp.index < minIdx) minIdx = csp.index;
      if (csp.index > maxIdx) maxIdx = csp.index;
      totalDist += csp.distanceMeters;
    }

    if (minIdx === Infinity || maxIdx === -Infinity) continue;

    if (totalDist < bestTotalDist) {
      bestTotalDist = totalDist;
      bestShapeId = shapeId;
      bestMinIndex = minIdx;
      bestMaxIndex = maxIdx;
    }
  }

  if (!bestShapeId) return null;

  return {
    shapeId: bestShapeId,
    entryIndex: bestMinIndex,
    exitIndex: bestMaxIndex,
    swapped: false,
  };
}
```

### Step 4: Fix `extractSkippedSegment` off-by-one

Replace `api-proxy/detourGeometry.js` lines 120-128 with:

```javascript
function extractSkippedSegment(polyline, entryIndex, exitIndex) {
  if (!polyline || polyline.length === 0) return [];
  const start = Math.max(0, entryIndex);
  const end = Math.min(polyline.length - 1, exitIndex);
  return polyline.slice(start, end + 1).map(p => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}
```

### Step 5: Update `buildGeometry` to remove swap logic

In `api-proxy/detourGeometry.js`, the `buildGeometry` function (around line 221-230) has swap logic for entry/exit. Since `findAnchors` no longer swaps, simplify:

Replace:
```javascript
  const entryIdx = anchors.entryIndex;
  const exitIdx = Math.min(anchors.exitIndex + 1, polyline.length - 1);
  const rawEntry = polyline[entryIdx]
    ? { latitude: polyline[entryIdx].latitude, longitude: polyline[entryIdx].longitude }
    : null;
  const rawExit = polyline[exitIdx]
    ? { latitude: polyline[exitIdx].latitude, longitude: polyline[exitIdx].longitude }
    : null;
  const entryPoint = anchors.swapped ? rawExit : rawEntry;
  const exitPoint = anchors.swapped ? rawEntry : rawExit;
```

With:
```javascript
  const entryIdx = anchors.entryIndex;
  const exitIdx = Math.min(anchors.exitIndex, polyline.length - 1);
  const entryPoint = polyline[entryIdx]
    ? { latitude: polyline[entryIdx].latitude, longitude: polyline[entryIdx].longitude }
    : null;
  const exitPoint = polyline[exitIdx]
    ? { latitude: polyline[exitIdx].latitude, longitude: polyline[exitIdx].longitude }
    : null;
```

### Step 6: Run all tests

Run: `cd api-proxy && npx jest --no-coverage`

Expected: ALL PASS.

### Step 7: Commit

```bash
git add api-proxy/detourGeometry.js api-proxy/__tests__/detourGeometry.test.js
git commit -m "fix(detour): spatial anchor computation + extractSkippedSegment off-by-one

findAnchors now projects ALL evidence points onto the shape and uses
min/max shape index, instead of temporal first/last evidence points.
This stabilizes the detour geometry during active detours.

Also fixes extractSkippedSegment which included one extra point
beyond exitIndex due to double-incrementing the end bound.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Client — Show Detour Overlays for All Routes + Notifications

**Why:** (1) When no route is selected (the default "All" view), zero detour overlays render. (2) No notification fires when a new detour is detected — the feature is completely passive.

**Files:**
- Modify: `src/hooks/useDetourOverlays.js` (line 25)
- Modify: `src/context/TransitContext.js` (lines 77, 389-406)
- Test: `src/__tests__/detourOverlays.test.js`

### Step 1: Write the failing test — overlays for unselected routes

Add to `src/__tests__/detourOverlays.test.js`:

```javascript
describe('all-routes view', () => {
  it('returns overlays for all active detours when no routes are selected', () => {
    const result = deriveDetourOverlays({
      selectedRouteIds: new Set(),
      activeDetours: {
        '8A': {
          state: 'active',
          skippedSegmentPolyline: [
            { latitude: 44.39, longitude: -79.70 },
            { latitude: 44.39, longitude: -79.69 },
          ],
          inferredDetourPolyline: [
            { latitude: 44.395, longitude: -79.70 },
            { latitude: 44.395, longitude: -79.69 },
          ],
          entryPoint: { latitude: 44.39, longitude: -79.70 },
          exitPoint: { latitude: 44.39, longitude: -79.69 },
        },
      },
      enabled: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].routeId).toBe('8A');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx jest src/__tests__/detourOverlays.test.js --testNamePattern="all-routes" --no-coverage`

Expected: FAIL — returns empty array.

### Step 3: Fix `deriveDetourOverlays` to show all detours when no routes selected

In `src/hooks/useDetourOverlays.js`, replace lines 23-49:

```javascript
export function deriveDetourOverlays({ selectedRouteIds, activeDetours, enabled }) {
  if (!enabled) return [];

  const overlays = [];

  // When no routes selected, show ALL active detours
  const routeIds = (selectedRouteIds && selectedRouteIds.size > 0)
    ? selectedRouteIds
    : new Set(Object.keys(activeDetours));

  routeIds.forEach((routeId) => {
    const detour = activeDetours[routeId];
    if (!detour) return;

    const hasGeometry =
      (detour.skippedSegmentPolyline?.length >= 2) ||
      (detour.inferredDetourPolyline?.length >= 2);
    if (!hasGeometry) return;

    overlays.push({
      routeId,
      state: detour.state ?? 'active',
      skippedSegmentPolyline: detour.skippedSegmentPolyline ?? null,
      inferredDetourPolyline: detour.inferredDetourPolyline ?? null,
      entryPoint: detour.entryPoint ?? null,
      exitPoint: detour.exitPoint ?? null,
      opacity: detour.state === 'clear-pending' ? 0.45 : 1.0,
      skippedColor: DETOUR_COLORS.SKIPPED,
      detourColor: DETOUR_COLORS.DETOUR,
      markerBorderColor: DETOUR_COLORS.MARKER_BORDER,
    });
  });

  return overlays;
}
```

### Step 4: Add detour notification in TransitContext

In `src/context/TransitContext.js`:

Add import at line 5 (after existing imports):
```javascript
import { showLocalNotification } from '../services/notificationService';
```

Add a `useRef` for previous detours after line 77 (`const [activeDetours, setActiveDetours] = useState({});`):
```javascript
const prevDetourIdsRef = useRef(new Set());
```

Replace lines 400-406 (the detour subscription useEffect) with:
```javascript
  // Subscribe to active detours (public collection, no auth required)
  useEffect(() => {
    const unsubscribe = subscribeToActiveDetours(
      (detourMap) => {
        // Notify on newly detected detours
        const newIds = Object.keys(detourMap);
        const prevIds = prevDetourIdsRef.current;
        for (const routeId of newIds) {
          if (!prevIds.has(routeId)) {
            showLocalNotification({
              title: `Route ${routeId} Detour`,
              body: `Route ${routeId} is on detour — stops may be affected.`,
              data: { type: 'detour_alert', routeId },
            }).catch(() => {}); // fire-and-forget, don't block state update
          }
        }
        prevDetourIdsRef.current = new Set(newIds);
        setActiveDetours(detourMap);
      },
      (error) => logger.error('Detour subscription error:', error)
    );
    return () => unsubscribe();
  }, []);
```

### Step 5: Run overlay tests

Run: `npx jest src/__tests__/detourOverlays.test.js --no-coverage`

Expected: ALL PASS.

### Step 6: Commit

```bash
git add src/hooks/useDetourOverlays.js src/context/TransitContext.js src/__tests__/detourOverlays.test.js
git commit -m "feat(detour): show overlays for all routes + notify on new detours

When no routes are selected (the default 'All' view), detour overlays
now render for every active detour instead of showing nothing.

Also fires a local notification via showLocalNotification when a new
detour routeId appears in the Firestore subscription, so users with
the app backgrounded learn about detours.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Web Marker Guards + Entry/Exit Visual Differentiation

**Why:** (1) Web `DetourOverlay` uses a loose truthiness check on entry/exit points, unlike native's strict `hasFiniteCoordinate`. (2) Both entry and exit markers are visually identical — users can't tell them apart.

**Files:**
- Modify: `src/components/DetourOverlay.js` (lines 62-77)
- Modify: `src/components/DetourOverlay.web.js` (lines 48-75)

### Step 1: Fix web marker guards and differentiate entry/exit

In `src/components/DetourOverlay.web.js`, add the guard function at the top (after imports):

```javascript
const hasFiniteCoordinate = (point) =>
  Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);
```

Replace lines 48-75 (the entry/exit CircleMarker blocks) with:

```javascript
    {hasFiniteCoordinate(entryPoint) && (
      <CircleMarker
        center={[entryPoint.latitude, entryPoint.longitude]}
        radius={8}
        pathOptions={{
          fillColor: markerBorderColor,
          fillOpacity: opacity,
          color: '#ffffff',
          weight: 2,
          opacity,
        }}
        interactive={false}
      />
    )}
    {hasFiniteCoordinate(exitPoint) && (
      <CircleMarker
        center={[exitPoint.latitude, exitPoint.longitude]}
        radius={6}
        pathOptions={{
          fillColor: '#ffffff',
          fillOpacity: opacity,
          color: markerBorderColor,
          weight: 2,
          opacity,
        }}
        interactive={false}
      />
    )}
```

### Step 2: Differentiate entry/exit on native

In `src/components/DetourOverlay.js`, add a second marker style and update the markers.

Add after `styles.marker` in the StyleSheet:
```javascript
  entryMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
  exitMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 2,
  },
```

Replace entry marker View (line 67):
```javascript
        <View style={[styles.entryMarker, { backgroundColor: markerBorderColor, borderColor: '#ffffff', opacity }]} />
```

Replace exit marker View (line 75):
```javascript
        <View style={[styles.exitMarker, { borderColor: markerBorderColor, opacity }]} />
```

### Step 3: Run existing overlay tests (regression)

Run: `npx jest src/__tests__/detourOverlays.test.js --no-coverage`

Expected: ALL PASS.

### Step 4: Commit

```bash
git add src/components/DetourOverlay.js src/components/DetourOverlay.web.js
git commit -m "fix(detour): web marker null guards + differentiate entry/exit markers

Web DetourOverlay now uses hasFiniteCoordinate() guard matching native.
Entry marker is larger with filled color (orange fill, white border).
Exit marker is smaller with outline style (white fill, orange border).
Users can now visually distinguish detour start from end.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Accessibility — Detour Dot Screen Reader Support

**Why:** The detour dot on route chips has no accessibility label. Screen reader users are completely unaware of detours.

**Files:**
- Modify: `src/components/HomeScreenControls.js` (lines 123-125)

### Step 1: Add accessibility props to detour dot

In `src/components/HomeScreenControls.js`, replace lines 123-125:

```javascript
                            {isRouteDetouring?.(r.id) && (
                                <View style={styles.detourDot} />
                            )}
```

with:

```javascript
                            {isRouteDetouring?.(r.id) && (
                                <View
                                    accessible={true}
                                    accessibilityLabel={`Route ${r.shortName} is on detour`}
                                    style={styles.detourDot}
                                />
                            )}
```

### Step 2: Commit

```bash
git add src/components/HomeScreenControls.js
git commit -m "fix(a11y): add screen reader label to detour indicator dot

The orange detour dot on route chips was invisible to VoiceOver and
TalkBack users. Now announces 'Route X is on detour'.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Verify Full Build

### Step 1: Run all backend tests

Run: `cd api-proxy && npx jest --no-coverage`

Expected: ALL PASS.

### Step 2: Run all client tests

Run: `npx jest --no-coverage`

Expected: ALL PASS.

### Step 3: Verify build compiles

Run: `npx expo export --platform web --output-dir /tmp/bttp-build-check 2>&1 | tail -5`

Expected: No TypeScript/compilation errors.

---

## Summary of Changes

| # | Fix | Files | Impact |
|---|---|---|---|
| 1 | Trip-aware shape resolution | `detourDetector.js`, `detourWorker.js` | **Critical** — enables detection on multi-shape routes |
| 2 | Longitude-scaled projection | `geometry.js`, `detourGeometry.js` | Fixes 5-30m errors on diagonal segments |
| 3 | Spatial anchors + off-by-one | `detourGeometry.js` | Stabilizes geometry during active detours |
| 4 | Show all overlays + notifications | `useDetourOverlays.js`, `TransitContext.js` | Users actually learn about detours |
| 5 | Web marker guards + visual diff | `DetourOverlay.js`, `DetourOverlay.web.js` | Platform parity + distinguishable markers |
| 6 | A11y detour dot | `HomeScreenControls.js` | Screen reader support |
