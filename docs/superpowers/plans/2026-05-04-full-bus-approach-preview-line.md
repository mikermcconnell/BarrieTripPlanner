# Full Bus Approach Preview Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In trip-planning preview mode, show and fit the dashed “bus approaching pickup” line all the way back to the live bus that is expected to pick up the rider.

**Architecture:** The dashed line is already produced by `useTripVisualization` as `busApproachLines`. The missing behavior is mainly viewport ownership: preview auto-fit currently uses only itinerary coordinates, so a valid approach line can extend off-screen. Add a small shared helper that combines itinerary coordinates with bus-approach coordinates, then use it from native and web preview fitting without refitting on every live bus tick.

**Tech Stack:** React Native, Expo, MapLibre native/web, Jest.

---

## Complexity Assessment

Moderate, not high.

Why it is dynamic:
- The live bus moves independently from the static itinerary.
- The selected preview card can change.
- The best pickup bus can change as realtime data updates.
- Auto-fitting the map on every bus update would create annoying map jumping.

Why it is manageable:
- Rendering is already centralized in `useTripVisualization`.
- The dashed line already has coordinates in `busApproachLines`.
- The likely missing piece is preview viewport fitting, which is localized to `useTripPreviewViewport`, `itineraryViewport`, and both `HomeScreen` variants.

## Intended UX

- When a rider taps or sees a preview trip card, the map should include:
  - trip origin/destination,
  - walking and bus itinerary path,
  - pickup stop,
  - the dashed approach line,
  - the live bus at the far end of that dashed line.
- The map should not keep re-centering every few seconds as realtime bus data updates.
- The “full trip / map key” viewport action should include the current bus approach line.
- If no reliable bus approach line exists, viewport behavior stays exactly as today.

## Files

- Modify: `src/utils/itineraryViewport.js`
  - Add a helper that merges itinerary coordinates and extra preview line coordinates.
- Modify: `src/hooks/useTripPreviewViewport.js`
  - Allow `fitMapToItinerary` to accept optional extra coordinates.
- Modify: `src/screens/HomeScreen.js`
  - Pass bus approach coordinates into trip-preview fitting.
  - Gate initial auto-fit so it does not refit on every live vehicle update.
- Modify: `src/screens/HomeScreen.web.js`
  - Same behavior as native.
- Modify: `src/__tests__/itineraryViewport.test.js`
  - Cover coordinate collection with approach-line coordinates.
- Modify: `src/__tests__/useTripPreviewViewport.test.js`
  - Cover fitting itinerary + extra preview coordinates.
- Possibly modify: `src/__tests__/mapButtonInteractions.test.js`
  - Only if the viewport-control behavior has a direct test hook.

---

## Task 1: Add viewport coordinate helper

**Files:**
- Modify: `src/utils/itineraryViewport.js`
- Test: `src/__tests__/itineraryViewport.test.js`

- [ ] Add a failing test that proves approach-line coordinates are included.

Test shape:
```js
import { collectTripPreviewViewportCoordinates } from '../utils/itineraryViewport';

test('includes bus approach line coordinates when fitting a trip preview', () => {
  const itinerary = {
    legs: [
      {
        from: { lat: 44.2, lon: -79.8 },
        to: { lat: 44.3, lon: -79.7 },
      },
    ],
  };

  const coordinates = collectTripPreviewViewportCoordinates(itinerary, [
    {
      id: 'bus-approach-8B',
      coordinates: [
        { latitude: 44.1, longitude: -79.9 },
        { latitude: 44.2, longitude: -79.8 },
      ],
    },
  ]);

  expect(coordinates).toEqual(expect.arrayContaining([
    { latitude: 44.1, longitude: -79.9 },
    { latitude: 44.2, longitude: -79.8 },
    { latitude: 44.3, longitude: -79.7 },
  ]));
});
```

- [ ] Run the failing test.

Run:
```bash
npm test -- --runTestsByPath src/__tests__/itineraryViewport.test.js --runInBand
```

Expected: FAIL because `collectTripPreviewViewportCoordinates` does not exist.

- [ ] Implement the helper.

Implementation shape:
```js
export const collectTripPreviewViewportCoordinates = (itinerary, busApproachLines = []) => {
  const coordinates = collectItineraryViewportCoordinates(itinerary);

  busApproachLines.forEach((line) => {
    if (!Array.isArray(line?.coordinates)) return;
    line.coordinates.forEach((coordinate) => {
      const normalized = normalizeCoordinate(coordinate);
      if (normalized) coordinates.push(normalized);
    });
  });

  return coordinates;
};
```

- [ ] Run the test again.

Expected: PASS.

---

## Task 2: Let preview viewport fit extra coordinates

**Files:**
- Modify: `src/hooks/useTripPreviewViewport.js`
- Test: `src/__tests__/useTripPreviewViewport.test.js`

- [ ] Add a failing test that calls `fitMapToItinerary(itinerary, extraCoordinates)` and expects both sets of coordinates to be sent to `fitToCoordinates`.

Test shape:
```js
test('fits itinerary plus extra preview coordinates', () => {
  const fitToCoordinates = jest.fn();
  let hookApi;

  TestRenderer.act(() => {
    TestRenderer.create(
      React.createElement(TestHarness, {
        options: {
          isFocused: true,
          isTripPlanningMode: true,
          fitToCoordinates,
          edgePadding: { top: 1, right: 2, bottom: 3, left: 4 },
        },
        onReady: (api) => { hookApi = api; },
      })
    );
  });

  hookApi.fitMapToItinerary(
    { legs: [{ from: { lat: 44.2, lon: -79.8 }, to: { lat: 44.3, lon: -79.7 } }] },
    [{ latitude: 44.1, longitude: -79.9 }]
  );

  expect(fitToCoordinates).toHaveBeenCalledWith(
    expect.arrayContaining([
      { latitude: 44.1, longitude: -79.9 },
      { latitude: 44.2, longitude: -79.8 },
      { latitude: 44.3, longitude: -79.7 },
    ]),
    { edgePadding: { top: 1, right: 2, bottom: 3, left: 4 } }
  );
});
```

- [ ] Run the failing test.

Run:
```bash
npm test -- --runTestsByPath src/__tests__/useTripPreviewViewport.test.js --runInBand
```

Expected: FAIL because extra coordinates are ignored.

- [ ] Update the hook to use `collectTripPreviewViewportCoordinates`.

Implementation shape:
```js
import { collectTripPreviewViewportCoordinates } from '../utils/itineraryViewport';

const fitMapToItinerary = useCallback((itinerary, extraCoordinates = []) => {
  if (typeof fitToCoordinates !== 'function') return false;

  const coordinates = collectTripPreviewViewportCoordinates(itinerary, [
    { id: 'extra-preview-coordinates', coordinates: extraCoordinates },
  ]);

  if (coordinates.length === 0) return false;

  const options = { edgePadding };
  if (typeof animated === 'boolean') options.animated = animated;

  fitToCoordinates(coordinates, options);
  return true;
}, [animated, edgePadding, fitToCoordinates]);
```

- [ ] Run the tests again.

Expected: PASS.

---

## Task 3: Wire native HomeScreen without map-jump loops

**Files:**
- Modify: `src/screens/HomeScreen.js`

- [ ] Add a memoized coordinate list from current `busApproachLines`.

Implementation shape near the existing `busApproachLines` usage:
```js
const busApproachViewportCoordinates = useMemo(() => (
  busApproachLines.flatMap((line) => Array.isArray(line.coordinates) ? line.coordinates : [])
), [busApproachLines]);
```

- [ ] Update the trip-preview auto-fit effect.

Important: avoid refitting every live vehicle tick. Prefer one of these options:
1. Fit once when `selectedItinerary` changes, using whatever approach line is available then.
2. If no approach line existed at first fit, allow one delayed second fit when the first non-empty `busApproachViewportCoordinates` arrives.

Recommended shape:
```js
const tripPreviewFitKeyRef = useRef(null);

useEffect(() => {
  if (!isTripPreviewMode || !selectedItinerary) {
    tripPreviewFitKeyRef.current = null;
    return;
  }

  const itineraryKey = `${selectedItinerary.startTime || ''}-${selectedItinerary.endTime || ''}-${selectedItinerary.legs?.map((leg) => leg.tripId || leg.route?.id || leg.mode).join('|')}`;
  const hasApproach = busApproachViewportCoordinates.length > 0;
  const fitKey = `${itineraryKey}:${hasApproach ? 'with-approach' : 'no-approach'}`;

  if (tripPreviewFitKeyRef.current === fitKey) return;
  if (tripPreviewFitKeyRef.current === `${itineraryKey}:with-approach`) return;

  fitMapToItinerary(selectedItinerary, busApproachViewportCoordinates);
  tripPreviewFitKeyRef.current = fitKey;
}, [isTripPreviewMode, selectedItinerary, busApproachViewportCoordinates, fitMapToItinerary]);
```

- [ ] Make sure the “full trip” viewport control also calls `fitMapToItinerary(selectedItinerary, busApproachViewportCoordinates)` if that action exists in this file.

---

## Task 4: Wire web HomeScreen the same way

**Files:**
- Modify: `src/screens/HomeScreen.web.js`

- [ ] Repeat Task 3’s native wiring in the web file.
- [ ] Keep the same non-jumping behavior across native and web.
- [ ] Confirm the dependency arrays include the memoized coordinate list, not raw `vehicles`.

---

## Task 5: Verify behavior

- [ ] Run targeted tests.

```bash
npm test -- --runTestsByPath src/__tests__/itineraryViewport.test.js src/__tests__/useTripPreviewViewport.test.js src/__tests__/useTripVisualization.test.js --runInBand
```

Expected: PASS.

- [ ] Run route label and marker regression tests because these are adjacent map concerns.

```bash
npm test -- --runTestsByPath src/__tests__/routeLineLabelMarkers.test.js src/__tests__/busDirectionArrow.test.js src/__tests__/busMarker.test.js --runInBand
```

Expected: PASS.

- [ ] Run platform parity check.

```bash
npm run check:parity
```

Expected: no new unexpected warnings beyond known existing platform differences.

- [ ] Manual native check.

Use:
```bash
npm run android:dev:launch
```

Expected:
- Select a trip option where the pickup bus is not near the stop.
- The dashed bus-approach line is visible from the pickup stop back to the live bus.
- The live bus marker is included in the fitted viewport, not cut off just outside the map.
- The map does not keep jumping as realtime updates arrive.

---

## Risks and Guardrails

- Do not refit on every `busApproachLines` coordinate update.
- Do not include every live bus in bounds; include only the selected approach line.
- Do not change navigation-screen behavior unless a shared helper requires a compatible signature update.
- If the approach bus is very far away, consider capping viewport expansion later, but do not add that until Mike confirms the desired UX.
