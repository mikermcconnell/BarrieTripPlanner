# Route Line Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add balanced square route badges on map route lines when riders zoom in, with selected and hovered routes prioritized and trip preview kept clean.

**Architecture:** Build one shared route-label placement utility used by native and web. Native renders the returned markers with `MapLibreGL.MarkerView` and a reusable badge component; web renders the same marker list with `WebHtmlMarker`.

**Tech Stack:** Expo SDK 54, React Native 0.81, MapLibre native, MapLibre GL JS, Jest.

---

## File Structure

- Create: `src/utils/routeLineLabelMarkers.js` — zoom gates, placement, priority, collision filtering, caps.
- Create: `src/__tests__/routeLineLabelMarkers.test.js` — placement behavior tests.
- Create: `src/components/RouteLineBadge.js` — native square badge and style helpers.
- Create: `src/__tests__/routeLineBadge.test.js` — badge helper and render tests.
- Modify: `src/screens/HomeScreen.js` — compute and render native badge markers.
- Modify: `src/screens/HomeScreen.web.js` — compute and render web badge markers.
- Optional modify: `src/components/WebMapView.js` — only if manual testing shows web badges block taps.

## Behavior Contract

- No general labels below zoom `14`.
- Selected and hovered labels appear at zoom `13.5`.
- Zoom `14+`: one primary badge per visible route when it fits.
- Zoom `15+`: long routes may get a second badge if it does not collide.
- No general route line labels during trip preview.
- Missing route short names are skipped.
- Missing route colors use `#1A73E8`.
- Detour focus caps label count more aggressively.

---

### Task 1: Add Shared Placement Utility

**Files:**
- Create: `src/utils/routeLineLabelMarkers.js`
- Test: `src/__tests__/routeLineLabelMarkers.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/routeLineLabelMarkers.test.js`:

```js
import {
  ROUTE_LINE_LABEL_MARKERS,
  buildRouteLineLabelMarkers,
  pickPrimaryLabelCoordinate,
} from '../utils/routeLineLabelMarkers';

const point = (latitude, longitude) => ({ latitude, longitude });
const shape = (routeId, coordinates, color = '#1167B1') => ({
  id: `shape-${routeId}`, routeId, color, coordinates,
});
const names = new Map([['1', '1'], ['2', '2'], ['4', '4'], ['8A', '8A'], ['12B', '12B']]);

describe('route line label markers', () => {
  test('does not show general labels below zoom 14', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('1', [point(44.38, -79.69), point(44.39, -79.68)])],
      currentZoom: 13.75,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
    });
    expect(markers).toEqual([]);
  });

  test('shows selected route labels at zoom 13.5', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('1', [point(44.38, -79.69), point(44.39, -79.68)])],
      currentZoom: 13.5,
      routeShortNameMap: names,
      selectedRouteIds: new Set(['1']),
    });
    expect(markers[0]).toMatchObject({ routeId: '1', label: '1', slot: 'primary', isSelected: true });
  });

  test('shows one primary label per visible route at zoom 14 when labels do not collide', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [
        shape('1', [point(44.38, -79.69), point(44.39, -79.68)]),
        shape('2', [point(44.42, -79.72), point(44.43, -79.71)]),
      ],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
    });
    expect(markers.map((m) => m.routeId)).toEqual(['1', '2']);
    expect(markers.every((m) => m.slot === 'primary')).toBe(true);
  });

  test('skips routes without short names', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('99', [point(44.38, -79.69), point(44.39, -79.68)])],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
    });
    expect(markers).toEqual([]);
  });

  test('keeps selected labels before colliding general labels', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [
        shape('1', [point(44.3800, -79.6900), point(44.3900, -79.6800)]),
        shape('2', [point(44.3801, -79.6901), point(44.3901, -79.6801)]),
      ],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(['2']),
      collisionDistance: 0.02,
    });
    expect(markers).toHaveLength(1);
    expect(markers[0].routeId).toBe('2');
  });

  test('adds second label for long routes at zoom 15 when it fits', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('8A', [
        point(44.30, -79.80), point(44.34, -79.76), point(44.38, -79.72),
        point(44.42, -79.68), point(44.46, -79.64), point(44.50, -79.60),
      ])],
      currentZoom: 15,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
      collisionDistance: 0.001,
    });
    expect(markers.map((m) => m.slot)).toEqual(['primary', 'secondary']);
  });

  test('does not show labels during trip preview mode', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('1', [point(44.38, -79.69), point(44.39, -79.68)])],
      currentZoom: 15,
      routeShortNameMap: names,
      selectedRouteIds: new Set(['1']),
      isTripPreviewMode: true,
    });
    expect(markers).toEqual([]);
  });

  test('caps labels and prioritizes selected then hovered routes', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [
        shape('1', [point(44.31, -79.71), point(44.32, -79.70)]),
        shape('2', [point(44.35, -79.75), point(44.36, -79.74)]),
        shape('4', [point(44.39, -79.79), point(44.40, -79.78)]),
      ],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(['4']),
      hoveredRouteId: '2',
      maxLabels: 2,
    });
    expect(markers.map((m) => m.routeId)).toEqual(['4', '2']);
  });

  test('picks midpoint of longest segment for primary placement', () => {
    expect(pickPrimaryLabelCoordinate([
      point(44.00, -79.00),
      point(44.01, -79.01),
      point(44.09, -79.09),
    ])).toEqual({ latitude: 44.05, longitude: -79.05 });
  });

  test('uses fallback route color when shape color is missing', () => {
    const markers = buildRouteLineLabelMarkers({
      shapes: [shape('12B', [point(44.38, -79.69), point(44.39, -79.68)], null)],
      currentZoom: 14,
      routeShortNameMap: names,
      selectedRouteIds: new Set(),
    });
    expect(markers[0].color).toBe(ROUTE_LINE_LABEL_MARKERS.FALLBACK_COLOR);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- --runInBand src/__tests__/routeLineLabelMarkers.test.js
```

Expected: FAIL with module-not-found for `../utils/routeLineLabelMarkers`.

- [ ] **Step 3: Implement utility**

Create `src/utils/routeLineLabelMarkers.js`:

```js
export const ROUTE_LINE_LABEL_MARKERS = {
  SELECTED_MIN_ZOOM: 13.5,
  GENERAL_MIN_ZOOM: 14,
  SECONDARY_MIN_ZOOM: 15,
  DEFAULT_MAX_LABELS: 24,
  DETOUR_FOCUS_MAX_LABELS: 8,
  DEFAULT_COLLISION_DISTANCE: 0.0012,
  LONG_ROUTE_MIN_POINTS: 5,
  FALLBACK_COLOR: '#1A73E8',
};

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const validCoordinate = (coordinate) => (
  coordinate
  && numberOrNull(coordinate.latitude) !== null
  && numberOrNull(coordinate.longitude) !== null
);

const normalizeCoordinate = (coordinate) => ({
  latitude: Number(coordinate.latitude),
  longitude: Number(coordinate.longitude),
});

const getCoordinates = (shape) => (
  Array.isArray(shape?.coordinates)
    ? shape.coordinates.filter(validCoordinate).map(normalizeCoordinate)
    : []
);

const getLabel = (routeId, routeShortNameMap) => {
  const value = typeof routeShortNameMap?.get === 'function'
    ? routeShortNameMap.get(routeId)
    : routeShortNameMap?.[routeId];
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || null;
};

const segmentLength = (a, b) => {
  const lat = b.latitude - a.latitude;
  const lon = b.longitude - a.longitude;
  return Math.sqrt((lat * lat) + (lon * lon));
};

const midpoint = (a, b) => ({
  latitude: Number(((a.latitude + b.latitude) / 2).toFixed(6)),
  longitude: Number(((a.longitude + b.longitude) / 2).toFixed(6)),
});

export const pickPrimaryLabelCoordinate = (coordinates) => {
  const points = Array.isArray(coordinates) ? coordinates.filter(validCoordinate).map(normalizeCoordinate) : [];
  if (points.length < 2) return null;
  let bestIndex = 0;
  let bestLength = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = segmentLength(points[index], points[index + 1]);
    if (length > bestLength) {
      bestIndex = index;
      bestLength = length;
    }
  }
  return midpoint(points[bestIndex], points[bestIndex + 1]);
};

const pickCoordinateAtRatio = (coordinates, ratio) => {
  let total = 0;
  const segments = [];
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const segment = { start: coordinates[index], end: coordinates[index + 1] };
    segment.length = segmentLength(segment.start, segment.end);
    total += segment.length;
    segments.push(segment);
  }
  if (total === 0) return pickPrimaryLabelCoordinate(coordinates);
  const target = total * ratio;
  let travelled = 0;
  for (const segment of segments) {
    if (travelled + segment.length >= target) {
      const segmentRatio = (target - travelled) / segment.length;
      return {
        latitude: Number((segment.start.latitude + ((segment.end.latitude - segment.start.latitude) * segmentRatio)).toFixed(6)),
        longitude: Number((segment.start.longitude + ((segment.end.longitude - segment.start.longitude) * segmentRatio)).toFixed(6)),
      };
    }
    travelled += segment.length;
  }
  return normalizeCoordinate(coordinates[coordinates.length - 1]);
};

const priorityFor = (routeId, selectedRouteIds, hoveredRouteId) => {
  if (selectedRouteIds?.has?.(routeId)) return 300;
  if (hoveredRouteId === routeId) return 200;
  return 100;
};

const visibleAtZoom = (routeId, zoom, selectedRouteIds, hoveredRouteId) => {
  if (selectedRouteIds?.has?.(routeId) || hoveredRouteId === routeId) {
    return zoom >= ROUTE_LINE_LABEL_MARKERS.SELECTED_MIN_ZOOM;
  }
  return zoom >= ROUTE_LINE_LABEL_MARKERS.GENERAL_MIN_ZOOM;
};

const collides = (candidate, placed, distance) => (
  Math.abs(candidate.coordinate.latitude - placed.coordinate.latitude) < distance
  && Math.abs(candidate.coordinate.longitude - placed.coordinate.longitude) < distance
);

export const buildRouteLineLabelMarkers = ({
  shapes = [],
  currentZoom,
  routeShortNameMap,
  selectedRouteIds = new Set(),
  hoveredRouteId = null,
  isTripPreviewMode = false,
  hasDetourFocus = false,
  isDetourView = false,
  maxLabels = null,
  collisionDistance = ROUTE_LINE_LABEL_MARKERS.DEFAULT_COLLISION_DISTANCE,
} = {}) => {
  const zoom = numberOrNull(currentZoom);
  if (isTripPreviewMode || zoom === null || !Array.isArray(shapes)) return [];

  const limit = Number.isFinite(Number(maxLabels))
    ? Number(maxLabels)
    : hasDetourFocus || isDetourView
      ? ROUTE_LINE_LABEL_MARKERS.DETOUR_FOCUS_MAX_LABELS
      : ROUTE_LINE_LABEL_MARKERS.DEFAULT_MAX_LABELS;

  const candidates = [];
  shapes.forEach((shape, index) => {
    const routeId = shape?.routeId;
    const label = getLabel(routeId, routeShortNameMap);
    if (!label || !visibleAtZoom(routeId, zoom, selectedRouteIds, hoveredRouteId)) return;
    const coordinates = getCoordinates(shape);
    if (coordinates.length < 2) return;
    const priority = priorityFor(routeId, selectedRouteIds, hoveredRouteId);
    const base = shape.id || shape.shapeId || routeId || `shape-${index}`;
    const common = {
      routeId,
      label,
      color: shape.color || shape.routeColor || ROUTE_LINE_LABEL_MARKERS.FALLBACK_COLOR,
      isSelected: priority === 300,
      isHovered: priority === 200,
    };
    candidates.push({
      ...common,
      id: `route-line-label-${base}-primary`,
      coordinate: pickPrimaryLabelCoordinate(coordinates),
      priority,
      slot: 'primary',
      order: index,
    });
    if (zoom >= ROUTE_LINE_LABEL_MARKERS.SECONDARY_MIN_ZOOM && coordinates.length >= ROUTE_LINE_LABEL_MARKERS.LONG_ROUTE_MIN_POINTS) {
      candidates.push({
        ...common,
        id: `route-line-label-${base}-secondary`,
        coordinate: pickCoordinateAtRatio(coordinates, 0.72),
        priority: priority - 5,
        slot: 'secondary',
        order: index + 0.5,
      });
    }
  });

  return candidates
    .filter((candidate) => candidate.coordinate)
    .sort((a, b) => (b.priority - a.priority) || (a.order - b.order))
    .reduce((placed, candidate) => {
      if (placed.length >= limit) return placed;
      if (placed.some((marker) => collides(candidate, marker, collisionDistance))) return placed;
      placed.push(candidate);
      return placed;
    }, [])
    .map(({ order, ...marker }) => marker);
};
```

- [ ] **Step 4: Run tests and confirm pass**

Run:

```bash
npm test -- --runInBand src/__tests__/routeLineLabelMarkers.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/routeLineLabelMarkers.js src/__tests__/routeLineLabelMarkers.test.js
git commit -m "feat: add route line label placement utility"
```

---

### Task 2: Add Native Badge Component

**Files:**
- Create: `src/components/RouteLineBadge.js`
- Test: `src/__tests__/routeLineBadge.test.js`

- [ ] **Step 1: Write failing badge tests**

Create `src/__tests__/routeLineBadge.test.js`:

```js
import React from 'react';
import renderer from 'react-test-renderer';
import RouteLineBadge, {
  getRouteLineBadgeDimensions,
  getRouteLineBadgeTextColor,
} from '../components/RouteLineBadge';

describe('RouteLineBadge', () => {
  test('uses white text on dark route colors', () => {
    expect(getRouteLineBadgeTextColor('#0055AA')).toBe('#FFFFFF');
  });

  test('uses dark text on light route colors', () => {
    expect(getRouteLineBadgeTextColor('#F9D65C')).toBe('#111827');
  });

  test('sizes common label lengths', () => {
    expect(getRouteLineBadgeDimensions('1')).toEqual({ width: 30, height: 30, borderRadius: 8 });
    expect(getRouteLineBadgeDimensions('12')).toEqual({ width: 34, height: 30, borderRadius: 8 });
    expect(getRouteLineBadgeDimensions('12B')).toEqual({ width: 42, height: 30, borderRadius: 8 });
  });

  test('renders route label text', () => {
    const tree = renderer.create(<RouteLineBadge label="8A" color="#1167B1" />).toJSON();
    expect(JSON.stringify(tree)).toContain('8A');
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- --runInBand src/__tests__/routeLineBadge.test.js
```

Expected: FAIL with module-not-found for `../components/RouteLineBadge`.

- [ ] **Step 3: Implement badge component**

Create `src/components/RouteLineBadge.js`:

```js
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const normalizeHex = (value) => {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace('#', '');
  if (hex.length !== 6 || /[^0-9a-f]/i.test(hex)) return null;
  return hex;
};

export const getRouteLineBadgeTextColor = (backgroundColor) => {
  const hex = normalizeHex(backgroundColor);
  if (!hex) return '#FFFFFF';
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const brightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
  return brightness > 165 ? '#111827' : '#FFFFFF';
};

export const getRouteLineBadgeDimensions = (label) => {
  const length = String(label || '').length;
  if (length >= 3) return { width: 42, height: 30, borderRadius: 8 };
  if (length === 2) return { width: 34, height: 30, borderRadius: 8 };
  return { width: 30, height: 30, borderRadius: 8 };
};

const RouteLineBadge = ({ label, color }) => {
  const dimensions = getRouteLineBadgeDimensions(label);
  const textColor = getRouteLineBadgeTextColor(color);
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={`Route ${label}`}
      style={[styles.badge, dimensions, { backgroundColor: color || '#1A73E8' }]}
    >
      <Text numberOfLines={1} allowFontScaling={false} style={[styles.text, { color: textColor }]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    shadowColor: '#0F172A',
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.1,
    includeFontPadding: false,
    textAlign: 'center',
  },
});

export default RouteLineBadge;
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npm test -- --runInBand src/__tests__/routeLineBadge.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/components/RouteLineBadge.js src/__tests__/routeLineBadge.test.js
git commit -m "feat: add route line badge component"
```

---

### Task 3: Render Route Badges on Native Map

**Files:**
- Modify: `src/screens/HomeScreen.js`

- [ ] **Step 1: Add imports**

Add:

```js
import RouteLineBadge from '../components/RouteLineBadge';
import { buildRouteLineLabelMarkers } from '../utils/routeLineLabelMarkers';
```

- [ ] **Step 2: Add marker layer component**

Add after `HomeMapRoutesLayer`:

```js
const HomeMapRouteLineLabelsLayer = React.memo(({ isTripPreviewMode, markers }) => {
  if (isTripPreviewMode || !Array.isArray(markers) || markers.length === 0) return null;
  return markers.map((marker) => (
    <MapLibreGL.MarkerView
      key={marker.id}
      id={marker.id}
      coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
      allowOverlap
    >
      <RouteLineBadge label={marker.label} color={marker.color} />
    </MapLibreGL.MarkerView>
  ));
}, (prev, next) => (
  prev.isTripPreviewMode === next.isTripPreviewMode
  && prev.markers === next.markers
));
```

- [ ] **Step 3: Stop passing old inline labels to normal native route polylines**

In `HomeMapRoutesLayer`, replace:

```js
routeLabel={routeVisual.showRouteLabel ? (routeShortNameMap.get(shape.routeId) || null) : null}
```

with:

```js
routeLabel={null}
```

- [ ] **Step 4: Compute markers**

After:

```js
const isTripPreviewMode = isTripPlanningMode && Boolean(selectedItinerary);
```

add:

```js
const routeLineLabelMarkers = useMemo(() => buildRouteLineLabelMarkers({
  shapes: displayedShapes,
  currentZoom,
  routeShortNameMap,
  selectedRouteIds: selectedRoutes,
  hoveredRouteId: null,
  isTripPreviewMode,
  hasDetourFocus,
  isDetourView,
  maxLabels: Platform.OS === 'android' ? 14 : 24,
}), [
  displayedShapes,
  currentZoom,
  routeShortNameMap,
  selectedRoutes,
  isTripPreviewMode,
  hasDetourFocus,
  isDetourView,
]);
```

- [ ] **Step 5: Pass and render markers**

Pass into `HomeMapContent`:

```js
routeLineLabelMarkers={routeLineLabelMarkers}
```

Add `routeLineLabelMarkers` to `HomeMapContent` props.

Inside `HomeMapContent`, after `HomeMapRoutesLayer`, add:

```js
<HomeMapRouteLineLabelsLayer
  isTripPreviewMode={isTripPreviewMode}
  markers={routeLineLabelMarkers}
/>
```

In the `HomeMapContent` memo comparator, add:

```js
prev.routeLineLabelMarkers === next.routeLineLabelMarkers &&
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --runInBand src/__tests__/routeLineLabelMarkers.test.js src/__tests__/routeLineBadge.test.js src/__tests__/routePolyline.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/screens/HomeScreen.js
git commit -m "feat: render route line badges on native map"
```

---

### Task 4: Render Route Badges on Web Map

**Files:**
- Modify: `src/screens/HomeScreen.web.js`

- [ ] **Step 1: Add imports**

Add:

```js
import {
  getRouteLineBadgeDimensions,
  getRouteLineBadgeTextColor,
} from '../components/RouteLineBadge';
import { buildRouteLineLabelMarkers } from '../utils/routeLineLabelMarkers';
```

- [ ] **Step 2: Add web HTML builder**

Add near `buildTripRouteBadgeHtml`:

```js
const buildRouteLineBadgeHtml = (marker) => {
  const label = escapeHtml(marker.label || '');
  const color = marker.color || '#1A73E8';
  const textColor = getRouteLineBadgeTextColor(color);
  const dimensions = getRouteLineBadgeDimensions(label);
  return `
    <div aria-label="Route ${label}" style="
      width:${dimensions.width}px;
      height:${dimensions.height}px;
      border-radius:${dimensions.borderRadius}px;
      background:${color};
      color:${textColor};
      border:2.5px solid #FFFFFF;
      box-shadow:0 2px 7px rgba(15,23,42,0.24);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:12px;
      font-weight:800;
      line-height:1;
      pointer-events:none;
      user-select:none;
    ">${label}</div>
  `;
};
```

- [ ] **Step 3: Compute markers**

After:

```js
const isTripPreviewMode = isTripPlanningMode && Boolean(selectedItinerary);
```

add:

```js
const routeLineLabelMarkers = useMemo(() => buildRouteLineLabelMarkers({
  shapes: displayedShapes,
  currentZoom,
  routeShortNameMap,
  selectedRouteIds: selectedRoutes,
  hoveredRouteId,
  isTripPreviewMode,
  hasDetourFocus,
  isDetourView,
  maxLabels: hasDetourFocus || isDetourView ? 8 : 28,
}), [
  displayedShapes,
  currentZoom,
  routeShortNameMap,
  selectedRoutes,
  hoveredRouteId,
  isTripPreviewMode,
  hasDetourFocus,
  isDetourView,
]);
```

- [ ] **Step 4: Stop passing old inline labels to web route polylines**

Keep:

```js
let routeLabel = null;
```

Remove selected and hovered assignments to `routeLabel`. Add this comment where the assignments were:

```js
// Square route labels are rendered as WebHtmlMarker badges below.
```

- [ ] **Step 5: Render web markers**

After the `displayedShapes.map` block and before detour overlays, add:

```js
{!isTripPreviewMode && routeLineLabelMarkers.map((marker) => (
  <WebHtmlMarker
    key={marker.id}
    id={marker.id}
    coordinate={marker.coordinate}
    html={buildRouteLineBadgeHtml(marker)}
    anchor="center"
    zIndexOffset={650}
  />
))}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --runInBand src/__tests__/routeLineLabelMarkers.test.js src/__tests__/routeLineBadge.test.js src/__tests__/tripPlannerRegression.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/screens/HomeScreen.web.js
git commit -m "feat: render route line badges on web map"
```

---

### Task 5: Manual Verification and Tap Pass-Through Fix

**Files:**
- Optional modify: `src/components/WebMapView.js`
- Optional modify: `src/screens/HomeScreen.web.js`

- [ ] **Step 1: Run focused tests**

```bash
npm test -- --runInBand src/__tests__/routeLineLabelMarkers.test.js src/__tests__/routeLineBadge.test.js src/__tests__/routePolyline.test.js src/__tests__/tripPlannerRegression.test.js
```

Expected: PASS.

- [ ] **Step 2: Start web app**

```bash
npm run web:dev
```

Expected: local web app starts with proxy support.

- [ ] **Step 3: Web manual checks**

- Below zoom `13.5`: no route line badges.
- Zoom `13.5` to `14`: selected or hovered route badge appears.
- Zoom `14+`: one badge appears on visible routes where it fits.
- Zoom `15+`: long routes can show a second badge.
- Trip preview hides general route line badges and keeps itinerary leg badges.
- Badges do not visually fight with saved places, stops, buses, or detour overlays.

- [ ] **Step 4: Android manual checks**

```bash
npm run android:dev
```

Expected: Android dev client launches.

Checks:
- Zoom gates match web.
- Badge count stays modest.
- Panning and zooming stay smooth.
- Trip preview hides general route line badges.

- [ ] **Step 5: If web badges block route taps, add non-interactive marker support**

Modify `src/components/WebMapView.js` `WebHtmlMarker` props:

```js
interactive = true,
```

Set marker element behavior:

```js
element.style.pointerEvents = interactive ? 'auto' : 'none';
element.style.cursor = interactive && onPress ? 'pointer' : 'default';
```

Then update web badge usage:

```js
<WebHtmlMarker
  key={marker.id}
  id={marker.id}
  coordinate={marker.coordinate}
  html={buildRouteLineBadgeHtml(marker)}
  anchor="center"
  zIndexOffset={650}
  interactive={false}
/>
```

Run:

```bash
npm test -- --runInBand src/__tests__/routeLineLabelMarkers.test.js src/__tests__/routeLineBadge.test.js src/__tests__/tripPlannerRegression.test.js
```

Expected: PASS.

Commit if code changed:

```bash
git add src/components/WebMapView.js src/screens/HomeScreen.web.js
git commit -m "fix: let web route line badges pass through taps"
```

---

### Task 6: Final Review

**Files:**
- Review all changed files.

- [ ] **Step 1: Check working tree**

```bash
git status --short
```

Expected: only intentional files changed, or clean after commits.

- [ ] **Step 2: Run final verification**

```bash
npm test -- --runInBand src/__tests__/routeLineLabelMarkers.test.js src/__tests__/routeLineBadge.test.js src/__tests__/routePolyline.test.js src/__tests__/tripPlannerRegression.test.js
```

Expected: PASS.

- [ ] **Step 3: Confirm spec coverage**

Confirm:
- Shared utility drives native and web.
- Square badges replace repeated line text for normal route labels.
- Selected and hovered labels appear earlier.
- Collision filtering drops lower-priority labels.
- Trip preview suppresses general route line labels.
- Label caps protect performance.

- [ ] **Step 4: Final summary format**

```text
Implemented route line badges.

Changed files:
- src/utils/routeLineLabelMarkers.js
- src/components/RouteLineBadge.js
- src/screens/HomeScreen.js
- src/screens/HomeScreen.web.js
- src/__tests__/routeLineLabelMarkers.test.js
- src/__tests__/routeLineBadge.test.js

Verified:
- npm test -- --runInBand src/__tests__/routeLineLabelMarkers.test.js src/__tests__/routeLineBadge.test.js src/__tests__/routePolyline.test.js src/__tests__/tripPlannerRegression.test.js
- Web map manual check at zoom 13.5, 14, and 15
- Android manual check if emulator was available

Notes:
- General route labels are hidden during trip preview so itinerary badges remain the focus.
```

---

## Self-Review

- Spec coverage: Covers zoom thresholds, selected and hovered priority, one badge at zoom 14, second badge at zoom 15, collisions, missing names, fallback color, detour caps, native rendering, web rendering, and trip preview suppression.
- Placeholder scan: The plan avoids deferred-work markers and references only functions introduced in earlier tasks.
- Type consistency: Later tasks import only functions defined in earlier tasks.
