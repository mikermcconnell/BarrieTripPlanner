# MapLibre Web Migration Plan

Date: 2026-03-06
Status: In progress
Owner: Codex

## Objective

Replace the web Leaflet implementation with MapLibre GL JS in small, reversible chunks while preserving existing web behavior and keeping the public map wrapper API stable.

## Skills Applied

- `refactoring-safely`: use small reversible changes, isolate behavior-preserving refactors, verify after each step.
- `testing-strategy`: add focused tests around adapter behavior and maintain integration coverage where practical.

## Current State

The app already uses MapLibre on native and Leaflet on web.

Primary web Leaflet ownership:

- `src/components/WebMapView.js`
- `src/screens/HomeScreen.web.js`
- `src/screens/NavigationScreen.web.js`
- `src/components/DirectionArrows.web.js`
- `src/components/DetourOverlay.web.js`
- `src/components/ZoneOverlay.web.js`

Primary native MapLibre references to align with:

- `src/screens/HomeScreen.js`
- `src/components/RoutePolyline.js`
- `src/components/BusMarker.js`
- `src/config/constants.js`

## Non-Goals For Initial Chunks

- Do not migrate web navigation in the first pass.
- Do not remove Leaflet dependencies until Home web parity is verified.
- Do not rewrite unrelated trip-planning or detour logic.
- Do not change CORS proxy behavior for web.

## Constraints

- The git worktree is already dirty in unrelated files. Only touch web map files and new migration docs.
- Keep the existing `WebMapView` imperative API stable:
  - `animateToRegion`
  - `fitToCoordinates`
  - `onRegionChangeComplete`
  - `onPress`
  - `onUserInteraction`
- Work in small chunks with verification after each chunk.

## Success Criteria

### Functional

- Home web map renders with MapLibre GL JS instead of Leaflet.
- Route lines, labels, buses, stops, detours, and zones still render.
- Existing Home screen interactions still work:
  - route selection
  - map tap
  - fit to itinerary
  - center on Barrie
  - stop selection

### Technical

- Leaflet usage is removed from `WebMapView.js` and `HomeScreen.web.js`.
- A MapLibre-backed web adapter exists and preserves the prior wrapper contract.
- Tests are updated for the new web map implementation.

### Deferred

- `NavigationScreen.web.js` migration is deferred to a later chunk after Home screen parity.

## Migration Strategy

### Chunk 0: Documentation and planning

Deliverables:

- this implementation plan
- a progress log markdown file

Verification:

- plan reviewed for scope and order

### Chunk 1: Dependency and adapter scaffolding

Deliverables:

- add `maplibre-gl`
- create a small web adapter layer that owns:
  - map creation
  - camera helpers
  - bounds fitting
  - click handling
  - movement callbacks

Files expected:

- `package.json`
- `package-lock.json`
- `src/components/WebMapView.js`
- possible new helper module for shared map math if needed

Verification:

- install succeeds
- Jest remains green for unaffected tests or failures are isolated to updated map mocks

Rollback:

- revert dependency and adapter changes without touching downstream screens

### Chunk 2: Home screen migration

Deliverables:

- migrate `HomeScreen.web.js` off `react-leaflet`
- replace Leaflet markers/polylines with MapLibre equivalents
- keep current UX behavior where possible

Sub-steps:

1. Route polylines and labels
2. Stops and buses
3. Trip markers and map-tap marker
4. Detour and zone overlays
5. Direction arrows

Verification:

- app loads on web
- map interactions behave correctly
- visual smoke test for routes, buses, stops, selected trip overlays

Rollback:

- retain stable `WebMapView` API so screen code changes remain bounded

### Chunk 3: Navigation web migration

Deliverables:

- replace Leaflet `NavigationScreen.web.js` map internals with MapLibre GL JS

Risks:

- follow mode behavior
- fit-to-bounds timing
- heading-up mode on web
- tracked bus marker performance

Verification:

- manual browser navigation smoke test
- regression test updates where feasible

### Chunk 4: Cleanup

Deliverables:

- remove Leaflet packages and CSS injection
- remove obsolete tests and mocks
- update README if web map setup changes materially

Verification:

- grep confirms no production Leaflet imports remain

## Technical Design Decisions

### 1. Use `maplibre-gl` directly

Reason:

- `WebMapView` already acts as the app-specific abstraction layer.
- Avoid adding another React wrapper abstraction that the codebase does not need.

### 2. Preserve the `WebMapView` surface first

Reason:

- Keeps migration blast radius small.
- Lets Home screen switch renderers without forcing immediate navigation migration.

### 3. Prefer GeoJSON sources and layers for lines/polygons

Reason:

- Aligns with existing native MapLibre mental model.
- Better long-term parity with `RoutePolyline.js` and native overlays.

### 4. Use DOM markers only where layer-based rendering is not practical

Candidates:

- custom bus markers
- custom stop markers
- popups if retained

### 5. Defer web heading-up parity until navigation chunk

Reason:

- It is specific to `NavigationScreen.web.js` and not needed for Home screen migration.

## Known Risks

- MapLibre web marker and popup behavior differs from Leaflet.
- Route label placement may not exactly match the current Leaflet implementation.
- Direction arrows currently rely on `leaflet-polylinedecorator`; this must be replaced with symbol layers or a simpler arrow technique.
- Existing Jest tests mock `react-leaflet` and will need targeted updates.

## Verification Plan

After each chunk:

1. Run targeted Jest tests for changed modules.
2. Run a broader related test file set if targeted tests pass.
3. Run a web smoke test where possible.
4. Update the progress log with:
   - what changed
   - what was verified
   - open issues

## Initial Task Order

1. Add migration docs.
2. Install `maplibre-gl`.
3. Rewrite `WebMapView.js` as a MapLibre-backed adapter while preserving its API.
4. Update tests and mocks affected by `WebMapView.js`.
5. Migrate `HomeScreen.web.js` in sub-steps.
6. Verify and document before touching navigation.
