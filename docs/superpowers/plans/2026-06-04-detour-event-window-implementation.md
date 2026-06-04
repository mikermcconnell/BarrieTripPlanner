# Detour Event Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace route-keyed V2 detour lifecycle state with location-based detour events while preserving route-grouped rider display.

**Architecture:** V2 detours become event-window records keyed by event id. Detection, confirmation, clearing, runtime state, active Firestore docs, and history are event-scoped. The app subscribes to event docs and derives route-grouped detour objects for existing overlay and alert UI.

**Tech Stack:** Node.js, Jest, Firebase Admin SDK, Firestore, React Native / Expo, Firebase client SDK.

---

## Source design

Read first:

- `AGENTS.md`
- `docs/AUTO-DETOUR-DETECTION.md`
- `docs/AUTO-DETOUR-VALIDATION-MATRIX.md`
- `docs/superpowers/specs/2026-06-04-detour-event-window-design.md`

## File map

| File | Responsibility |
|---|---|
| `api-proxy/detourV2/eventWindows.js` | Pure event id, event window, overlap, expansion, freeze, and clear-window helpers. |
| `api-proxy/__tests__/detourV2EventWindows.test.js` | Helper unit tests. |
| `api-proxy/detourV2/detector.js` | Event-keyed candidates, active events, clear tracks, and runtime serialization. |
| `api-proxy/__tests__/detourV2Detector.test.js` | Event lifecycle tests. |
| `api-proxy/detour/storageConfig.js` | V2 event collection defaults. |
| `api-proxy/detourPublisher.js` | Active event and event-history Firestore writes. |
| `src/services/firebase/detourService.js` | Client event-doc mapping and route grouping. |
| `src/config/runtimeConfig.js` | Client default active event collection. |
| `firestore.rules`, `firestore.indexes.json` | Public read rules and event history indexes. |

## Rules

- Keep this V2-only.
- Use event id as the canonical backend key.
- Keep `routeId` on every event.
- Do not manually clear old 8A records.
- Commit after each task.

---

### Task 1: Add event-window helper module

**Files:**
- Create: `api-proxy/detourV2/eventWindows.js`
- Create: `api-proxy/__tests__/detourV2EventWindows.test.js`

- [ ] **Step 1: Write failing tests**

Create `api-proxy/__tests__/detourV2EventWindows.test.js`:

```js
const {
  makeEventId,
  buildInitialEventWindow,
  pointMatchesEventWindow,
  expandProvisionalEventWindow,
  freezeEventWindow,
  windowsOverlapOrNear,
  buildClearWindowForEvent,
} = require('../detourV2/eventWindows');

describe('detour V2 event windows', () => {
  test('creates stable bucketed ids', () => {
    expect(makeEventId({
      routeId: '8A',
      shapeId: 'shape-1',
      startProgressMeters: 123,
      endProgressMeters: 177,
    })).toBe('8A:shape-1:100-200');
  });

  test('builds provisional core confirm and clear windows', () => {
    const window = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 1500,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
    });

    expect(window).toEqual(expect.objectContaining({
      routeId: '8A',
      shapeId: 'shape-1',
      frozen: false,
      coreStartProgressMeters: 1400,
      coreEndProgressMeters: 1600,
      confirmStartProgressMeters: 1150,
      confirmEndProgressMeters: 1850,
      clearStartProgressMeters: 1000,
      clearEndProgressMeters: 2000,
      geoCenter: { latitude: 44.39, longitude: -79.69 },
    }));
  });

  test('matches only same-shape points inside the chosen window', () => {
    const window = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 1500,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
    });

    expect(pointMatchesEventWindow({ shapeId: 'shape-1', progressMeters: 1700 }, window, 'confirm')).toBe(true);
    expect(pointMatchesEventWindow({ shapeId: 'shape-1', progressMeters: 2500 }, window, 'confirm')).toBe(false);
    expect(pointMatchesEventWindow({ shapeId: 'shape-2', progressMeters: 1700 }, window, 'confirm')).toBe(false);
  });

  test('expands provisional windows but not frozen windows', () => {
    const initial = buildInitialEventWindow({
      routeId: '10',
      shapeId: 'shape-1',
      progressMeters: 1000,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
    });

    const expanded = expandProvisionalEventWindow(initial, {
      shapeId: 'shape-1',
      progressMeters: 1250,
      coordinate: { latitude: 44.391, longitude: -79.688 },
    }, { shapeLengthMeters: 5000 });

    expect(expanded.coreEndProgressMeters).toBeGreaterThan(initial.coreEndProgressMeters);
    expect(expandProvisionalEventWindow(freezeEventWindow(expanded), {
      shapeId: 'shape-1',
      progressMeters: 1800,
      coordinate: { latitude: 44.392, longitude: -79.687 },
    }, { shapeLengthMeters: 5000 })).toEqual(freezeEventWindow(expanded));
  });

  test('recognizes nearby windows and rejects far windows', () => {
    const first = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 1000,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
    });
    const nearby = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 1180,
      coordinate: { latitude: 44.391, longitude: -79.689 },
      shapeLengthMeters: 5000,
    });
    const far = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 3000,
      coordinate: { latitude: 44.40, longitude: -79.68 },
      shapeLengthMeters: 5000,
    });

    expect(windowsOverlapOrNear(first, nearby)).toBe(true);
    expect(windowsOverlapOrNear(first, far)).toBe(false);
  });

  test('uses a shorter lower-coverage clear window for weak detections', () => {
    const window = buildInitialEventWindow({
      routeId: '8A',
      shapeId: 'shape-1',
      progressMeters: 120,
      coordinate: { latitude: 44.39, longitude: -79.69 },
      shapeLengthMeters: 5000,
      coreHalfWidthMeters: 25,
    });

    const clearWindow = buildClearWindowForEvent(window, {
      shapeLengthMeters: 5000,
      quality: 'weak',
    });

    expect(clearWindow.endProgressMeters).toBeLessThanOrEqual(500);
    expect(clearWindow.minCoverageRatio).toBeLessThan(0.95);
  });
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npx jest --runTestsByPath __tests__/detourV2EventWindows.test.js --runInBand
```

Expected: fails because `eventWindows.js` does not exist.

- [ ] **Step 3: Implement helper**

Create `api-proxy/detourV2/eventWindows.js` with these exports:

```js
const DEFAULT_EVENT_PROGRESS_BUCKET_METERS = 100;
const DEFAULT_CORE_HALF_WIDTH_METERS = 100;
const DEFAULT_CONFIRM_PADDING_METERS = 250;
const DEFAULT_CLEAR_PADDING_METERS = 400;
const DEFAULT_WEAK_CLEAR_PADDING_METERS = 150;
const DEFAULT_MIN_CLEAR_SPAN_METERS = 1000;
const DEFAULT_WEAK_MIN_CLEAR_SPAN_METERS = 300;
const DEFAULT_NEARBY_GAP_METERS = 250;
const DEFAULT_GEO_PADDING_METERS = 120;
const METERS_PER_LATITUDE_DEGREE = 111_320;

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  const upper = Number.isFinite(max) && max >= min ? max : Infinity;
  return Math.max(min, Math.min(upper, value));
}

function clean(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function roundDown(value, bucket = DEFAULT_EVENT_PROGRESS_BUCKET_METERS) {
  return Math.floor(Number(value || 0) / bucket) * bucket;
}

function roundUp(value, bucket = DEFAULT_EVENT_PROGRESS_BUCKET_METERS) {
  return Math.ceil(Number(value || 0) / bucket) * bucket;
}

function makeEventId({ routeId, shapeId, startProgressMeters, endProgressMeters, bucketMeters = DEFAULT_EVENT_PROGRESS_BUCKET_METERS }) {
  const start = roundDown(startProgressMeters, bucketMeters);
  const end = Math.max(start + bucketMeters, roundUp(endProgressMeters, bucketMeters));
  return `${clean(routeId, 'route')}:${clean(shapeId, 'shape')}:${start}-${end}`;
}

function normalizeCoordinate(coordinate) {
  if (!coordinate || typeof coordinate !== 'object') return null;
  const latitude = numberOrNull(coordinate.latitude ?? coordinate.lat);
  const longitude = numberOrNull(coordinate.longitude ?? coordinate.lon ?? coordinate.lng);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

function buildGeoBounds(coordinates) {
  const points = coordinates.map(normalizeCoordinate).filter(Boolean);
  if (points.length === 0) return null;
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const centerLatitude = latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
  const latitudePadding = DEFAULT_GEO_PADDING_METERS / METERS_PER_LATITUDE_DEGREE;
  const longitudePadding = DEFAULT_GEO_PADDING_METERS /
    Math.max(1, METERS_PER_LATITUDE_DEGREE * Math.cos(centerLatitude * Math.PI / 180));
  return {
    minLatitude: Math.min(...latitudes) - latitudePadding,
    maxLatitude: Math.max(...latitudes) + latitudePadding,
    minLongitude: Math.min(...longitudes) - longitudePadding,
    maxLongitude: Math.max(...longitudes) + longitudePadding,
  };
}

function buildInitialEventWindow({
  routeId,
  shapeId,
  progressMeters,
  coordinate,
  shapeLengthMeters,
  coreHalfWidthMeters = DEFAULT_CORE_HALF_WIDTH_METERS,
}) {
  const progress = numberOrNull(progressMeters);
  if (progress == null) return null;
  const shapeLength = numberOrNull(shapeLengthMeters) ?? Infinity;
  const coreStart = clamp(progress - coreHalfWidthMeters, 0, shapeLength);
  const coreEnd = clamp(progress + coreHalfWidthMeters, 0, shapeLength);
  const geoCenter = normalizeCoordinate(coordinate);
  return {
    routeId: clean(routeId, ''),
    shapeId: clean(shapeId, ''),
    coreStartProgressMeters: coreStart,
    coreEndProgressMeters: coreEnd,
    confirmStartProgressMeters: clamp(coreStart - DEFAULT_CONFIRM_PADDING_METERS, 0, shapeLength),
    confirmEndProgressMeters: clamp(coreEnd + DEFAULT_CONFIRM_PADDING_METERS, 0, shapeLength),
    clearStartProgressMeters: clamp(coreStart - DEFAULT_CLEAR_PADDING_METERS, 0, shapeLength),
    clearEndProgressMeters: clamp(coreEnd + DEFAULT_CLEAR_PADDING_METERS, 0, shapeLength),
    geoCenter,
    geoBounds: buildGeoBounds(geoCenter ? [geoCenter] : []),
    frozen: false,
  };
}

function boundsFor(eventWindow, type = 'core') {
  const prefix = type === 'clear' ? 'clear' : type === 'confirm' ? 'confirm' : 'core';
  const start = numberOrNull(eventWindow?.[`${prefix}StartProgressMeters`]);
  const end = numberOrNull(eventWindow?.[`${prefix}EndProgressMeters`]);
  if (start == null || end == null) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function pointMatchesEventWindow(point, eventWindow, type = 'confirm') {
  const bounds = boundsFor(eventWindow, type);
  const progress = numberOrNull(point?.progressMeters);
  if (!bounds || progress == null) return false;
  const pointShapeId = clean(point?.shapeId, '');
  const windowShapeId = clean(eventWindow?.shapeId, '');
  if (pointShapeId && windowShapeId && pointShapeId !== windowShapeId) return false;
  return progress >= bounds.start && progress <= bounds.end;
}

function windowsOverlapOrNear(first, second, maxGapMeters = DEFAULT_NEARBY_GAP_METERS) {
  if (clean(first?.shapeId, '') !== clean(second?.shapeId, '')) return false;
  const a = boundsFor(first, 'confirm');
  const b = boundsFor(second, 'confirm');
  if (!a || !b) return false;
  const gap = a.end < b.start ? b.start - a.end : b.end < a.start ? a.start - b.end : 0;
  return gap <= maxGapMeters;
}

function expandProvisionalEventWindow(eventWindow, point, { shapeLengthMeters } = {}) {
  if (!eventWindow || eventWindow.frozen) return eventWindow;
  if (!pointMatchesEventWindow(point, eventWindow, 'confirm')) return eventWindow;
  const progress = numberOrNull(point.progressMeters);
  const core = boundsFor(eventWindow, 'core');
  const shapeLength = numberOrNull(shapeLengthMeters) ?? Infinity;
  const coreStart = clamp(Math.min(core.start, progress), 0, shapeLength);
  const coreEnd = clamp(Math.max(core.end, progress), 0, shapeLength);
  const geoPoint = normalizeCoordinate(point.coordinate);
  const geoCenter = eventWindow.geoCenter || geoPoint;
  return {
    ...eventWindow,
    coreStartProgressMeters: coreStart,
    coreEndProgressMeters: coreEnd,
    confirmStartProgressMeters: clamp(coreStart - DEFAULT_CONFIRM_PADDING_METERS, 0, shapeLength),
    confirmEndProgressMeters: clamp(coreEnd + DEFAULT_CONFIRM_PADDING_METERS, 0, shapeLength),
    clearStartProgressMeters: clamp(coreStart - DEFAULT_CLEAR_PADDING_METERS, 0, shapeLength),
    clearEndProgressMeters: clamp(coreEnd + DEFAULT_CLEAR_PADDING_METERS, 0, shapeLength),
    geoCenter,
    geoBounds: buildGeoBounds([geoCenter, geoPoint].filter(Boolean)) || eventWindow.geoBounds,
  };
}

function freezeEventWindow(eventWindow) {
  return eventWindow ? { ...eventWindow, frozen: true } : null;
}

function buildClearWindowForEvent(eventWindow, { shapeLengthMeters, quality = 'normal' } = {}) {
  const core = boundsFor(eventWindow, 'core');
  if (!core) return null;
  const weak = quality === 'weak';
  const shapeLength = numberOrNull(shapeLengthMeters) ?? Infinity;
  const minSpan = weak ? DEFAULT_WEAK_MIN_CLEAR_SPAN_METERS : DEFAULT_MIN_CLEAR_SPAN_METERS;
  const padding = weak ? DEFAULT_WEAK_CLEAR_PADDING_METERS : DEFAULT_CLEAR_PADDING_METERS;
  const coreSpan = Math.max(1, core.end - core.start);
  const targetSpan = Math.max(minSpan, coreSpan + padding * 2);
  const extraPadding = Math.max(0, (targetSpan - coreSpan) / 2);
  return {
    startProgressMeters: clamp(core.start - extraPadding, 0, shapeLength),
    endProgressMeters: clamp(core.end + extraPadding, 0, shapeLength),
    sourceStartProgressMeters: core.start,
    sourceEndProgressMeters: core.end,
    minCoverageRatio: weak ? 0.75 : 0.95,
    shapeId: eventWindow.shapeId || null,
  };
}

module.exports = {
  DEFAULT_EVENT_PROGRESS_BUCKET_METERS,
  makeEventId,
  buildInitialEventWindow,
  pointMatchesEventWindow,
  expandProvisionalEventWindow,
  freezeEventWindow,
  windowsOverlapOrNear,
  buildClearWindowForEvent,
  boundsFor,
};
```

- [ ] **Step 4: Verify pass and commit**

Run:

```bash
npx jest --runTestsByPath __tests__/detourV2EventWindows.test.js --runInBand
git add api-proxy/detourV2/eventWindows.js api-proxy/__tests__/detourV2EventWindows.test.js
git commit -m "feat: add detour event window helpers"
```

---

### Task 2: Convert V2 detector candidates and active state to event ids

**Files:**
- Modify: `api-proxy/detourV2/detector.js`
- Modify: `api-proxy/__tests__/detourV2Detector.test.js`

- [ ] **Step 1: Add detector test helpers**

Add near the top of `api-proxy/__tests__/detourV2Detector.test.js`:

```js
function detoursForRoute(result, routeId) {
  return Object.values(result || {}).filter((detour) => detour.routeId === routeId);
}

function detourForRoute(result, routeId) {
  return detoursForRoute(result, routeId)[0] || null;
}
```

- [ ] **Step 2: Write failing event candidate tests**

Add:

```js
test('keeps far-apart same-route evidence as separate event candidates', () => {
  const longShapes = new Map([['long-shape', [
    { latitude: 44.390, longitude: -79.760 },
    { latitude: 44.390, longitude: -79.750 },
    { latitude: 44.390, longitude: -79.740 },
    { latitude: 44.390, longitude: -79.730 },
    { latitude: 44.390, longitude: -79.720 },
    { latitude: 44.390, longitude: -79.710 },
    { latitude: 44.390, longitude: -79.700 },
  ]]]);
  const longMapping = new Map([['10', ['long-shape']]]);
  const detector = createDetourV2Detector();

  detector.processVehicles([
    vehicle({ id: 'bus-a1', routeId: '10', tripId: 'trip-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 1000 }),
    vehicle({ id: 'bus-b1', routeId: '10', tripId: 'trip-b1', coordinate: { latitude: 44.395, longitude: -79.708 }, timestampMs: 2000 }),
  ], longShapes, longMapping);

  expect(Object.keys(detector.serializeDetectorRuntimeState().eventCandidates || {})).toHaveLength(2);
});

test('publishes separate active events for two confirmed same-route detours', () => {
  const longShapes = new Map([['long-shape', [
    { latitude: 44.390, longitude: -79.760 },
    { latitude: 44.390, longitude: -79.750 },
    { latitude: 44.390, longitude: -79.740 },
    { latitude: 44.390, longitude: -79.730 },
    { latitude: 44.390, longitude: -79.720 },
    { latitude: 44.390, longitude: -79.710 },
    { latitude: 44.390, longitude: -79.700 },
  ]]]);
  const longMapping = new Map([['10', ['long-shape']]]);
  const detector = createDetourV2Detector();

  const result = detector.processVehicles([
    vehicle({ id: 'bus-a1', routeId: '10', tripId: 'trip-a1', coordinate: { latitude: 44.395, longitude: -79.758 }, timestampMs: 1000 }),
    vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.756 }, timestampMs: 2000 }),
    vehicle({ id: 'bus-a2', routeId: '10', tripId: 'trip-a2', coordinate: { latitude: 44.395, longitude: -79.754 }, timestampMs: 3000 }),
    vehicle({ id: 'bus-b1', routeId: '10', tripId: 'trip-b1', coordinate: { latitude: 44.395, longitude: -79.708 }, timestampMs: 4000 }),
    vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.706 }, timestampMs: 5000 }),
    vehicle({ id: 'bus-b2', routeId: '10', tripId: 'trip-b2', coordinate: { latitude: 44.395, longitude: -79.704 }, timestampMs: 6000 }),
  ], longShapes, longMapping);

  const events = detoursForRoute(result, '10');
  expect(events).toHaveLength(2);
  expect(events[0].eventId).toEqual(expect.any(String));
  expect(events[1].eventId).toEqual(expect.any(String));
  expect(events[0].eventId).not.toBe(events[1].eventId);
});
```

- [ ] **Step 3: Verify failure**

Run:

```bash
npx jest --runTestsByPath __tests__/detourV2Detector.test.js -t "far-apart same-route|separate active events" --runInBand
```

Expected: fails because detector state is still route keyed.

- [ ] **Step 4: Import event-window helpers**

In `api-proxy/detourV2/detector.js`, add:

```js
const {
  makeEventId,
  buildInitialEventWindow,
  pointMatchesEventWindow,
  expandProvisionalEventWindow,
  freezeEventWindow,
  buildClearWindowForEvent,
} = require('./eventWindows');
```

- [ ] **Step 5: Add event candidate functions**

Inside `createDetourV2Detector`, replace route-only candidate ownership with:

```js
const eventCandidates = new Map();
```

Add:

```js
function makeEventCandidate(routeId, shapeId, point, shapes) {
  const shapeLengthMeters = getShapeLengthMeters(shapes, shapeId);
  const eventWindow = buildInitialEventWindow({
    routeId,
    shapeId,
    progressMeters: point.progressMeters,
    coordinate: point.coordinate,
    shapeLengthMeters,
  });
  const eventId = makeEventId({
    routeId,
    shapeId,
    startProgressMeters: eventWindow.coreStartProgressMeters,
    endProgressMeters: eventWindow.coreEndProgressMeters,
  });
  return { ...makeCandidate(routeId, shapeId), eventId, eventWindow };
}

function findMatchingEventCandidate(routeId, shapeId, point) {
  for (const candidate of eventCandidates.values()) {
    if (candidate.routeId !== routeId || candidate.shapeId !== shapeId) continue;
    if (pointMatchesEventWindow(point, candidate.eventWindow, 'confirm')) return candidate;
  }
  return null;
}

function getEventCandidate(routeId, shapeId, point, shapes) {
  const existing = findMatchingEventCandidate(routeId, shapeId, point);
  if (existing) return existing;
  const candidate = makeEventCandidate(routeId, shapeId, point, shapes);
  eventCandidates.set(candidate.eventId, candidate);
  return candidate;
}
```

- [ ] **Step 6: Use event candidates in the off-route branch**

In `processVehicles`, after building `offRoutePoint`, replace route-only candidate lookup with:

```js
const candidate = getEventCandidate(routeId, projection.shapeId, {
  ...offRoutePoint,
  coordinate,
}, shapes);
candidate.eventWindow = expandProvisionalEventWindow(candidate.eventWindow, {
  ...offRoutePoint,
  coordinate,
}, {
  shapeLengthMeters: getShapeLengthMeters(shapes, projection.shapeId),
});
```

- [ ] **Step 7: Carry event fields into detour records**

In `buildDetour`, include:

```js
eventId: candidate.eventId,
detourVersion: 'v2-event-window',
eventWindow: freezeEventWindow(candidate.eventWindow),
```

Use event-derived clear windows:

```js
const eventClearWindow = buildClearWindowForEvent(candidate.eventWindow, {
  shapeLengthMeters: getShapeLengthMeters(shapes, candidate.shapeId),
  quality: canShowDetourPath ? 'normal' : 'weak',
});
```

Set:

```js
clearWindow: clearWindows[0] || eventClearWindow || buildClearWindow(detourZone, getShapeLengthMeters(shapes, candidate.shapeId)),
clearWindows: clearWindows.length > 0 ? clearWindows : [eventClearWindow].filter(Boolean),
```

- [ ] **Step 8: Store active detours by event id**

Replace active detour writes with:

```js
activeDetours.set(detour.eventId, detour);
```

Add this helper where route lookups are still needed:

```js
function getActiveEventsForRoute(routeId) {
  return [...activeDetours.values()].filter((detour) => detour.routeId === routeId);
}
```

- [ ] **Step 9: Serialize and hydrate event candidates**

In runtime serialization, emit:

```js
eventCandidates: Object.fromEntries(
  [...eventCandidates.entries()].map(([eventId, candidate]) => [eventId, serializeCandidate(candidate)])
),
activeEvents: Object.fromEntries(
  [...activeDetours.entries()].map(([eventId, detour]) => [eventId, serializeDetour(detour)])
),
```

Hydrate from `snapshot.eventCandidates || snapshot.candidates || {}` and from `snapshot.activeEvents || snapshot.activeDetours || {}`.

- [ ] **Step 10: Verify and commit**

Run:

```bash
npx jest --runTestsByPath __tests__/detourV2Detector.test.js -t "far-apart same-route|separate active events" --runInBand
npx jest --runTestsByPath __tests__/detourV2Detector.test.js --runInBand
git add api-proxy/detourV2/detector.js api-proxy/__tests__/detourV2Detector.test.js
git commit -m "feat: key v2 detours by event window"
```

---

### Task 3: Make clearing event-scoped

**Files:**
- Modify: `api-proxy/detourV2/detector.js`
- Modify: `api-proxy/__tests__/detourV2Detector.test.js`

- [ ] **Step 1: Add failing event clearing test**

Add:

```js
test('far-away same-route noise does not reset an event clear track', () => {
  const detector = createDetourV2Detector();

  detector.processVehicles([
    vehicle({ id: 'bus-1', tripId: 'trip-1', coordinate: { latitude: 44.395, longitude: -79.698 }, timestampMs: 1000 }),
    vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.696 }, timestampMs: 2000 }),
    vehicle({ id: 'bus-2', tripId: 'trip-2', coordinate: { latitude: 44.395, longitude: -79.694 }, timestampMs: 3000 }),
  ], shapes, routeShapeMapping);

  detector.processVehicles([
    vehicle({ id: 'bus-clear', tripId: 'trip-clear', coordinate: { latitude: 44.39, longitude: -79.700 }, timestampMs: 4000 }),
  ], shapes, routeShapeMapping);

  detector.processVehicles([
    vehicle({ id: 'bus-noise', tripId: 'trip-noise', coordinate: { latitude: 44.395, longitude: -79.682 }, timestampMs: 4500 }),
  ], shapes, routeShapeMapping);

  const state = detector.serializeDetectorRuntimeState();
  expect(Object.keys(state.clearTracksByEvent || {})).toHaveLength(1);
});
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npx jest --runTestsByPath __tests__/detourV2Detector.test.js -t "far-away same-route noise" --runInBand
```

Expected: fails until clear tracks are event keyed.

- [ ] **Step 3: Rename maps and helpers**

In `createDetourV2Detector`, use:

```js
const clearTracksByEvent = new Map();
const pendingClearsByEvent = new Map();
```

Replace route-keyed `trackClearSample` with `trackClearSampleForEvent(eventId, signature, sample, currentTickId)`, where:

```js
const detour = activeDetours.get(eventId);
const eventTracks = clearTracksByEvent.get(eventId) || new Map();
```

Queue clears in `pendingClearsByEvent` using `eventId`.

- [ ] **Step 4: Track clear samples only for matching events**

In the on-route-clear branch:

```js
for (const [eventId, detour] of activeDetours.entries()) {
  if (detour.routeId !== routeId) continue;
  const sample = {
    progressMeters: projection.progressMeters,
    timestampMs,
    shapeId: projection.shapeId,
    vehicleId: id,
    signature,
  };
  if (!sampleMatchesDetourZone(detour, sample)) continue;
  trackClearSampleForEvent(eventId, signature, sample, tickId);
}
```

- [ ] **Step 5: Reset and finalize only matching event windows**

Update reset and clear-pending finalization so off-route points are compared against each event's clear windows:

```js
function offRouteEvidenceBlocksEvent(detour, points = []) {
  return getDetourClearWindows(detour).some((clearWindow) => (
    currentOffRouteEvidenceMatchesWindow(points, clearWindow)
  ));
}
```

Delete a clear-pending event only when:

```js
!offRouteEvidenceBlocksEvent(detour, offRoutePointsThisTickByRoute.get(detour.routeId) || [])
```

- [ ] **Step 6: Serialize and hydrate clear tracks**

Runtime state should include:

```js
clearTracksByEvent: serializeClearTracksByEvent(),
clearTracks: serializeClearTracksByEvent(),
```

Hydrate from `snapshot.clearTracksByEvent || snapshot.clearTracks || {}`.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npx jest --runTestsByPath __tests__/detourV2Detector.test.js -t "far-away same-route noise|collectively clears|requires affected-span traversal" --runInBand
npx jest --runTestsByPath __tests__/detourV2Detector.test.js --runInBand
git add api-proxy/detourV2/detector.js api-proxy/__tests__/detourV2Detector.test.js
git commit -m "feat: scope v2 clearing to event windows"
```

---

### Task 4: Change V2 Firestore storage to event collections

**Files:**
- Modify: `api-proxy/detour/storageConfig.js`
- Modify: `api-proxy/__tests__/detourStorageConfig.test.js`
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`
- Modify: `src/__tests__/firestoreRules.test.js`
- Modify: `src/__tests__/firestoreIndexes.test.js`

- [ ] **Step 1: Update failing storage test**

Expected V2 config:

```js
expect(buildDetourStorageConfig({ DETOUR_DETECTOR_VERSION: 'v2' })).toEqual({
  detourVersion: 'v2',
  activeCollection: 'activeDetourEventsV2',
  historyCollection: 'detourEventHistoryV2',
  runtimeStateCollection: 'systemState',
  runtimeStateDoc: 'detourRuntimeV2',
});
```

Run:

```bash
npx jest --runTestsByPath __tests__/detourStorageConfig.test.js --runInBand
```

Expected: fails before code change.

- [ ] **Step 2: Update defaults**

In `api-proxy/detour/storageConfig.js`:

```js
const V2_DEFAULTS = {
  detourVersion: 'v2',
  activeCollection: 'activeDetourEventsV2',
  historyCollection: 'detourEventHistoryV2',
  runtimeStateCollection: 'systemState',
  runtimeStateDoc: 'detourRuntimeV2',
};
```

- [ ] **Step 3: Add Firestore rules**

In `firestore.rules`:

```firestore
    match /activeDetourEventsV2/{eventId} {
      allow read: if true;
      allow write: if false;
    }

    match /detourEventHistoryV2/{eventId} {
      allow read: if true;
      allow write: if false;
    }
```

Keep old V2 rules during development-tool transition.

- [ ] **Step 4: Add indexes**

In `firestore.indexes.json`, add:

```json
{
  "collectionGroup": "detourEventHistoryV2",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "routeId", "order": "ASCENDING" },
    { "fieldPath": "occurredAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "detourEventHistoryV2",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "eventType", "order": "ASCENDING" },
    { "fieldPath": "occurredAt", "order": "DESCENDING" }
  ]
}
```

- [ ] **Step 5: Update rules/index tests**

Rules test:

```js
expect(rules).toContain('match /activeDetourEventsV2/{eventId}');
expect(rules).toContain('match /detourEventHistoryV2/{eventId}');
```

Index test should filter `collectionGroup === 'detourEventHistoryV2'` and assert fields `routeId`, `eventType`, and `occurredAt`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx jest --runTestsByPath __tests__/detourStorageConfig.test.js --runInBand
npm test -- --runTestsByPath src/__tests__/firestoreRules.test.js src/__tests__/firestoreIndexes.test.js --runInBand
git add api-proxy/detour/storageConfig.js api-proxy/__tests__/detourStorageConfig.test.js firestore.rules firestore.indexes.json src/__tests__/firestoreRules.test.js src/__tests__/firestoreIndexes.test.js
git commit -m "feat: add v2 detour event collections"
```

---

### Task 5: Publish active event docs and event history

**Files:**
- Modify: `api-proxy/detourPublisher.js`
- Modify: `api-proxy/__tests__/detourPublisher.test.js`
- Modify: `api-proxy/__tests__/detourWorkerColdStart.test.js`

- [ ] **Step 1: Add failing publisher test**

In `api-proxy/__tests__/detourPublisher.test.js`, add a test following the file's existing mock DB style:

```js
test('publishes V2 active event docs by event id', async () => {
  await publishDetours({
    '8A:shape-1:100-300': {
      eventId: '8A:shape-1:100-300',
      routeId: '8A',
      shapeId: 'shape-1',
      detourVersion: 'v2-event-window',
      state: 'active',
      confidence: 'high',
      vehicleCount: 2,
      uniqueVehicleCount: 2,
      detectedAt: 1000,
      lastSeenAt: 2000,
      eventWindow: {
        routeId: '8A',
        shapeId: 'shape-1',
        coreStartProgressMeters: 100,
        coreEndProgressMeters: 300,
        frozen: true,
      },
      geometry: { shapeId: 'shape-1', canShowDetourPath: true, segments: [] },
    },
  }, {
    storageConfig: {
      detourVersion: 'v2',
      activeCollection: 'activeDetourEventsV2',
      historyCollection: 'detourEventHistoryV2',
    },
  });

  expect(db.collection).toHaveBeenCalledWith('activeDetourEventsV2');
  expect(db.doc).toHaveBeenCalledWith('8A:shape-1:100-300');
  expect(lastWrittenDoc).toEqual(expect.objectContaining({
    eventId: '8A:shape-1:100-300',
    routeId: '8A',
    detourVersion: 'v2-event-window',
    eventWindow: expect.objectContaining({ frozen: true }),
  }));
});
```

Use the test file's existing Firestore mock variable names in place of `db` and `lastWrittenDoc`.

- [ ] **Step 2: Verify failure**

Run:

```bash
npx jest --runTestsByPath __tests__/detourPublisher.test.js -t "active event docs" --runInBand
```

Expected: fails because publisher writes route id documents.

- [ ] **Step 3: Add publish id helper**

In `api-proxy/detourPublisher.js`:

```js
function detourPublishId(routeId, detour = {}) {
  return String(detour.eventId || detour.detourEventId || routeId || '').trim();
}
```

- [ ] **Step 4: Use event id for docs and caches**

Inside `publishDetours`, for each entry:

```js
const routeId = detour.routeId || inputId;
const publishId = detourPublishId(inputId, detour);
```

Write active docs with:

```js
await db.collection(storageConfig.activeCollection).doc(publishId).set(doc, { merge: true });
```

Set doc fields:

```js
doc.eventId = publishId;
doc.detourEventId = publishId;
doc.routeId = routeId;
doc.eventWindow = detour.eventWindow || null;
doc.detourVersion = detour.detourVersion || storageConfig.detourVersion || 'v2';
```

Use `publishId` for `lastPublishedIds`, `lastPublishedState`, `lastSeenUpdateTime`, `lastGeometryWriteTime`, and stale active doc deletes.

- [ ] **Step 5: Include event id in history events**

Update detected, updated, and cleared history payloads to include:

```js
eventId: currentSnapshot.eventId || routeId,
detourEventId: currentSnapshot.eventId || routeId,
routeId,
eventWindow: currentSnapshot.eventWindow || null,
```

Update history doc id construction:

```js
const safeEventId = String(event.eventId || event.routeId || 'event').replace(/[\\/]/g, '-');
const docId = `${event.occurredAt}-${safeEventId}-${event.eventType}-${suffix}`;
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
npx jest --runTestsByPath __tests__/detourPublisher.test.js --runInBand
npx jest --runTestsByPath __tests__/detourWorkerColdStart.test.js --runInBand
git add api-proxy/detourPublisher.js api-proxy/__tests__/detourPublisher.test.js api-proxy/__tests__/detourWorkerColdStart.test.js
git commit -m "feat: publish v2 detour events by event id"
```

---

### Task 6: Read event docs in the app and derive route-grouped detours

**Files:**
- Modify: `src/config/runtimeConfig.js`
- Modify: `src/services/firebase/detourService.js`
- Modify: `src/__tests__/runtimeConfig.test.js`
- Modify: `src/__tests__/detourService.test.js`

- [ ] **Step 1: Update runtime config tests**

Expect:

```js
expect(runtimeConfig.detours.activeCollection).toBe('activeDetourEventsV2');
```

Run:

```bash
npm test -- --runTestsByPath src/__tests__/runtimeConfig.test.js --runInBand
```

Expected: fails until fallback changes.

- [ ] **Step 2: Update fallback collection**

In `src/config/runtimeConfig.js`:

```js
EXPO_PUBLIC_ACTIVE_DETOURS_COLLECTION: 'activeDetourEventsV2',
```

- [ ] **Step 3: Add detour service tests**

Add:

```js
test('maps event-window detour documents', () => {
  const detour = mapActiveDetourDoc('8A:shape-1:100-300', {
    eventId: '8A:shape-1:100-300',
    routeId: '8A',
    state: 'active',
    eventWindow: { shapeId: 'shape-1', coreStartProgressMeters: 100, coreEndProgressMeters: 300, frozen: true },
  });

  expect(detour).toEqual(expect.objectContaining({
    eventId: '8A:shape-1:100-300',
    detourEventId: '8A:shape-1:100-300',
    routeId: '8A',
    eventWindow: expect.objectContaining({ frozen: true }),
  }));
});

test('groups active detour events by route for existing UI consumers', () => {
  const grouped = groupActiveDetourEventsByRoute({
    '8A:shape-1:100-300': mapActiveDetourDoc('8A:shape-1:100-300', {
      eventId: '8A:shape-1:100-300',
      routeId: '8A',
      state: 'active',
      segments: [{ skippedStopIds: ['101'] }],
    }),
    '8A:shape-1:900-1200': mapActiveDetourDoc('8A:shape-1:900-1200', {
      eventId: '8A:shape-1:900-1200',
      routeId: '8A',
      state: 'active',
      segments: [{ skippedStopIds: ['202'] }],
    }),
  });

  expect(Object.keys(grouped)).toEqual(['8A']);
  expect(grouped['8A'].eventCount).toBe(2);
  expect(grouped['8A'].detourEvents).toHaveLength(2);
  expect(grouped['8A'].segments).toHaveLength(2);
});
```

- [ ] **Step 4: Update `mapActiveDetourDoc`**

In `src/services/firebase/detourService.js`:

```js
export function mapActiveDetourDoc(docId, data) {
  const eventId = data.eventId ?? data.detourEventId ?? docId;
  const routeId = data.routeId ?? docId;
  return {
    eventId,
    detourEventId: eventId,
    routeId,
    eventWindow: data.eventWindow ?? null,
    eventCount: data.eventCount ?? 1,
```

Remove the old `routeId: docId` field.

- [ ] **Step 5: Add grouping helper**

Add:

```js
export function groupActiveDetourEventsByRoute(eventMap = {}) {
  const grouped = {};
  Object.values(eventMap || {}).forEach((event) => {
    if (!event?.routeId) return;
    const existing = grouped[event.routeId];
    if (!existing) {
      grouped[event.routeId] = {
        ...event,
        eventCount: 1,
        detourEvents: [event],
        segments: Array.isArray(event.segments) ? [...event.segments] : [],
      };
      return;
    }
    existing.eventCount += 1;
    existing.detourEvents.push(event);
    existing.vehicleCount = Math.max(existing.vehicleCount || 0, event.vehicleCount || 0);
    existing.uniqueVehicleCount = Math.max(existing.uniqueVehicleCount || 0, event.uniqueVehicleCount || 0);
    existing.currentVehicleCount = Math.max(existing.currentVehicleCount || 0, event.currentVehicleCount || 0);
    existing.riderVisible = existing.riderVisible || event.riderVisible;
    existing.segments = [
      ...(Array.isArray(existing.segments) ? existing.segments : []),
      ...(Array.isArray(event.segments) ? event.segments : []),
    ];
  });
  return grouped;
}
```

- [ ] **Step 6: Group in subscription**

Replace subscription map handling with:

```js
const eventMap = {};
snapshot.docs.forEach((doc) => {
  eventMap[doc.id] = mapActiveDetourDoc(doc.id, doc.data());
});
onUpdate(groupActiveDetourEventsByRoute(eventMap));
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm test -- --runTestsByPath src/__tests__/runtimeConfig.test.js src/__tests__/detourService.test.js --runInBand
git add src/config/runtimeConfig.js src/services/firebase/detourService.js src/__tests__/runtimeConfig.test.js src/__tests__/detourService.test.js
git commit -m "feat: read v2 detour event docs in app"
```

---

### Task 7: Update validation references and run full verification

**Files:**
- Modify: `src/__tests__/detourGroundTruthValidator.test.js`
- Modify only files that still actively default to old V2 collection names.

- [ ] **Step 1: Update ground-truth validator test**

Replace active collection test values with:

```js
collectionName: 'activeDetourEventsV2'
```

and document names like:

```js
projects/proj/databases/(default)/documents/activeDetourEventsV2/12A:shape-1:100-300
```

Expect raw result keys by event id:

```js
expect(result['12A:shape-1:100-300']).toEqual(expect.objectContaining({ routeId: '12A' }));
```

- [ ] **Step 2: Search for remaining active defaults**

Run:

```bash
git grep -n "activeDetoursV2\\|detourHistoryV2" -- ':!api-proxy/.env' ':!api-proxy/.env.barrie-transit-trip-plan-cc84e'
```

Expected: remaining matches are compatibility read rules, compatibility indexes, or historical docs. Replace any active defaults with `activeDetourEventsV2` or `detourEventHistoryV2`.

- [ ] **Step 3: Verify all tests**

Run:

```bash
npm --prefix api-proxy test
npm run test:app
npm run test:all
node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); console.log('firestore.indexes.json valid')"
```

Expected: API tests pass, app tests pass, combined tests pass, and JSON validity prints `firestore.indexes.json valid`.

- [ ] **Step 4: Commit validation updates**

Run:

```bash
git add src/__tests__/detourGroundTruthValidator.test.js
git commit -m "test: update detour validation for event collections"
```

If Step 2 changed additional files, include them in this commit.

---

## Completion checklist

- [ ] `activeDetourEventsV2` is the V2 active source-of-truth collection.
- [ ] `detourEventHistoryV2` is the V2 history collection.
- [ ] Detector candidates are keyed by event window.
- [ ] Detector active records are keyed by `eventId`.
- [ ] Clear tracks are keyed by `eventId`.
- [ ] Far-away same-route off-route evidence starts another event or candidate.
- [ ] Far-away same-route evidence does not reset or block clearing for another event.
- [ ] App reads event docs and derives route-grouped detours.
- [ ] Firestore rules allow public reads for event collections and deny client writes.
- [ ] API tests pass.
- [ ] App tests pass.

## Self-review notes

- Spec coverage: storage, history, runtime, event-scoped confirmation, event-scoped clearing, weak/tiny clear windows, and route-grouped rider display are covered.
- Route summaries: this plan chooses client-side grouping instead of storing `activeDetoursByRouteV2`, because active event volume should be small and the existing app already consumes a route-grouped object.
- Compatibility: old V2 read rules and indexes can remain for local inspection, but new defaults and app reads use event collections.
