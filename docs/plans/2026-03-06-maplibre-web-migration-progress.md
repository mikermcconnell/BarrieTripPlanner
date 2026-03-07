# MapLibre Web Migration Progress

Date: 2026-03-06
Status: Code migration completed, manual smoke testing pending

## Scope

Migrate web mapping from Leaflet to MapLibre GL JS in small validated chunks.

## Progress Log

### 2026-03-06 1

Completed:

- Investigated the current map architecture.
- Confirmed the repo already uses MapLibre on native and Leaflet only on web.
- Identified the main Leaflet ownership files and migration hotspots.
- Selected applicable skills:
  - `refactoring-safely`
  - `testing-strategy`
- Wrote the migration implementation plan.

Decisions:

- Use `maplibre-gl` directly on web.
- Preserve the `WebMapView` API while changing its internals.
- Migrate Home web first and defer navigation web until later.

Verification:

- Repository map ownership reviewed with source inspection.
- Official Mapbox and MapLibre documentation reviewed for product direction.

Open items:

- Add the `maplibre-gl` dependency.
- Implement the MapLibre-backed `WebMapView`.
- Update map-related tests and mocks.

### 2026-03-06 2

Completed:

- Added `maplibre-gl` to `package.json`.
- Replaced `src/components/WebMapView.js` internals with a MapLibre GL JS adapter.
- Added reusable MapLibre-backed web primitives:
  - `WebHtmlMarker`
  - `WebRoutePolyline`
  - `WebRouteArrows`
  - `WebPolygon`
  - `RouteLineLabels`
- Migrated these web components off Leaflet:
  - `src/components/DirectionArrows.web.js`
  - `src/components/DetourOverlay.web.js`
  - `src/components/ZoneOverlay.web.js`
- Migrated `src/screens/HomeScreen.web.js` off direct `react-leaflet` and `leaflet` usage.
- Updated `src/__tests__/detourIntegration.test.js` for the new web marker primitive.

Verification:

- `npm test -- detourIntegration.test.js --runInBand`
  - passed
- Babel transform/syntax check passed for:
  - `src/components/WebMapView.js`
  - `src/components/DirectionArrows.web.js`
  - `src/components/DetourOverlay.web.js`
  - `src/components/ZoneOverlay.web.js`
  - `src/screens/HomeScreen.web.js`
- Repo grep confirms the migrated Home web path no longer imports:
  - `react-leaflet`
  - `leaflet`
  - `leaflet-polylinedecorator`

Notes:

- `NavigationScreen.web.js` was still using Leaflet at the end of this chunk.
- Leaflet packages were still required until navigation web was migrated.
- Manual browser smoke testing had not yet been run in this turn.

### 2026-03-06 3

Completed:

- Migrated `src/screens/NavigationScreen.web.js` off `react-leaflet` and `leaflet`.
- Reused the existing `WebMapView` MapLibre adapter for navigation web polylines, markers, and camera actions.
- Added small non-breaking navigation-oriented web map capabilities to `src/components/WebMapView.js`:
  - `onMapReady`
  - `fitToCoordinates(..., { maxZoom })`
  - `setBearing(...)`
  - `getRegion()`
- Preserved navigation screen behaviors for:
  - initial trip fit
  - per-leg fit
  - jump to current location
  - full-trip overview
  - heading-up bearing on touch devices
- Removed unused web Leaflet packages from `package.json` and `package-lock.json`:
  - `leaflet`
  - `react-leaflet`
  - `leaflet-polylinedecorator`

Verification:

- Babel transform/syntax check passed for:
  - `src/components/WebMapView.js`
  - `src/screens/NavigationScreen.web.js`
- `npm test -- detourIntegration.test.js --runInBand`
  - passed
- Repo grep confirms there are no remaining source imports for:
  - `leaflet`
  - `react-leaflet`
  - `leaflet-polylinedecorator`

Open items:

- Manual browser smoke testing is still needed for:
  - Home web map parity
  - Navigation web map parity
- If smoke testing finds no regressions, the web MapLibre migration can be considered complete.

Next:

- Run a real browser smoke test for Home and Navigation on web.
- Check camera behavior carefully on navigation:
  - initial trip fit
  - per-leg fit
  - jump to my location
  - heading-up mode
- Fix any visual or interaction regressions found during manual validation.
