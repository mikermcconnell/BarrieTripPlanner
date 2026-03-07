# MapLibre Web Migration Handoff

Date: 2026-03-06
Status: Code migration completed, manual smoke testing pending

## Goal

Migrate the web map from Leaflet to MapLibre GL JS in small, verifiable chunks while preserving current app behavior.

## What Was Completed

### Documentation

- Created detailed implementation plan:
  - `docs/plans/2026-03-06-maplibre-web-migration-plan.md`
- Created running progress log:
  - `docs/plans/2026-03-06-maplibre-web-migration-progress.md`

### Dependencies

- Added `maplibre-gl` to `package.json`.

### Core web adapter migration

- Replaced the internals of `src/components/WebMapView.js` with a MapLibre GL JS implementation.
- Preserved the public wrapper API used by the rest of the app:
  - `animateToRegion`
  - `fitToCoordinates`
  - `onRegionChangeComplete`
  - `onPress`
  - `onUserInteraction`

### Home screen migration

- Migrated `src/screens/HomeScreen.web.js` off direct `react-leaflet` and `leaflet` imports.
- Migrated these supporting web components off Leaflet:
  - `src/components/DirectionArrows.web.js`
  - `src/components/DetourOverlay.web.js`
  - `src/components/ZoneOverlay.web.js`

### Navigation screen migration

- Migrated `src/screens/NavigationScreen.web.js` off direct `react-leaflet` and `leaflet` imports.
- Reused `src/components/WebMapView.js` for web navigation polylines, markers, and map camera behavior.
- Preserved navigation web map behaviors for:
  - initial trip fit
  - per-leg fit
  - jump to current location
  - full-trip overview
  - heading-up bearing

### Adapter follow-up

- Added non-breaking web adapter capabilities in `src/components/WebMapView.js` for navigation:
  - `onMapReady`
  - `fitToCoordinates(..., { maxZoom })`
  - `setBearing(...)`
  - `getRegion()`

### Dependency cleanup

- Removed unused Leaflet packages from `package.json` and `package-lock.json`:
  - `leaflet`
  - `react-leaflet`
  - `leaflet-polylinedecorator`

### Tests

- Updated `src/__tests__/detourIntegration.test.js` to match the new web map primitives.

## What Was Verified

- `npm test -- detourIntegration.test.js --runInBand`
  - passed
- Babel transform/syntax check passed for:
  - `src/components/WebMapView.js`
  - `src/components/DirectionArrows.web.js`
  - `src/components/DetourOverlay.web.js`
  - `src/components/ZoneOverlay.web.js`
  - `src/screens/HomeScreen.web.js`
- `src/screens/NavigationScreen.web.js`
- Confirmed the repo source no longer imports:
  - `react-leaflet`
  - `leaflet`
  - `leaflet-polylinedecorator`

## What Is Not Done Yet

- Manual browser smoke testing has not yet been completed in this migration session.
- Full parity testing for Home and Navigation web behavior is still needed.

## Files Touched In This Session

- `package.json`
- `package-lock.json`
- `src/components/WebMapView.js`
- `src/components/DirectionArrows.web.js`
- `src/components/DetourOverlay.web.js`
- `src/components/ZoneOverlay.web.js`
- `src/screens/HomeScreen.web.js`
- `src/screens/NavigationScreen.web.js`
- `src/__tests__/detourIntegration.test.js`
- `docs/plans/2026-03-06-maplibre-web-migration-plan.md`
- `docs/plans/2026-03-06-maplibre-web-migration-progress.md`

## Recommended Next Steps

### Next chunk: verify web behavior in browser

1. Run the app in web mode.
2. Smoke test the Home screen map:
   - base map loads
   - routes render
   - route labels render
   - selected route arrows render
   - buses render and move
   - stops render and can be selected
   - trip overlays render
   - detours and zones render
   - map tap still works
   - `fitToCoordinates` behavior still works
3. Smoke test the Navigation screen map:
   - initial full-trip fit works
   - per-leg fit works as legs advance
   - current location recenter works
   - heading-up rotates correctly on touch devices
   - tracked bus and stop markers render in expected places
4. Fix any visual or interaction regressions found during the smoke test.

## Risks To Watch

- Marker performance on web with many DOM markers.
- Route label placement differences between Leaflet and MapLibre.
- Arrow rendering parity for selected routes.
- Navigation follow mode and heading-up behavior during manual parity validation.

## Resume Point

If resuming later, start by reading:

1. `docs/plans/2026-03-06-maplibre-web-migration-handoff.md`
2. `docs/plans/2026-03-06-maplibre-web-migration-progress.md`
3. `src/components/WebMapView.js`
4. `src/screens/HomeScreen.web.js`
5. `src/screens/NavigationScreen.web.js`

Then proceed with the browser smoke test for Home and Navigation.
