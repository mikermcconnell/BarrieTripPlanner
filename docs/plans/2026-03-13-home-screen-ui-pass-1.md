# Home Screen UI Pass 1

Date: March 13, 2026

## Context

Review target: native Android home screen using the friendly design theme.

Initial design score: 7/10.

Primary issue: too many top-of-screen elements had similar visual weight, so the search bar, route chips, detour banner, and map mode controls competed with each other instead of reading as one clear hierarchy.

Constraint from review: keep the "show all routes" behavior and do not switch to a single featured route.

## First-Pass Goals

1. Reduce top-of-screen competition without changing the product model.
2. Make the route-chip area feel like one intentional control tray.
3. Combine detour status and map mode into one tighter band.
4. Unify the floating map controls so they feel like one control family.

## Changes Implemented

### Route filter tray

- Tightened the route-chip row spacing and reduced the vertical footprint.
- Wrapped the row in a single soft white tray so the chips read as one grouped control instead of many separate floating pills.
- Standardized chip height, borders, and corner treatment.
- Matched the filter/grid button styling to the chip family.

Files:

- `src/components/HomeScreenControls.js`

### Detour and map mode row

- Reworked the detour strip to support an inline layout.
- Reworked the map view toggle to support an inline layout.
- Moved both into a single compact row under the route filters.
- Removed the false vertical offset caused by treating service alerts as if a separate alert banner were visible.
- Simplified the inline detour strip so the detour text stays readable.

Files:

- `src/components/DetourAlertStrip.js`
- `src/components/MapViewModeToggle.js`
- `src/screens/HomeScreen.js`

### Search bar support chrome

- Grouped the right-side health/status indicators inside a softer capsule so the search row feels more deliberate and less fragmented.

Files:

- `src/screens/HomeScreen.js`

### Map controls

- Grouped the lower-left map controls inside one shared container.
- Softened the active stop-toggle treatment so it aligns better with the rest of the UI and does not compete with the main green FAB.

Files:

- `src/screens/HomeScreen.js`

## Visual Result After Pass 1

What improved:

- The top section now reads in clearer layers: search, route filters, detour/mode row, then map.
- The route-chip rail feels more like product chrome and less like scattered overlays.
- The detour controls no longer waste vertical space.
- The bottom-left map controls now feel related to each other.

What still needs work:

- The top area is improved but still dense.
- Route labels and route circles on the map can still feel crowded when many lines overlap.
- The search bar remains a little quiet compared with the route/filter system below it.

## Recommended Next Passes

### Pass 2

- Refine the search/header bar so it feels more anchored and premium.
- Improve spacing and typography inside the top control stack.
- Rebalance the chip colors so inactive chips recede slightly more.

### Pass 3

- Reduce on-map label clutter without hiding all routes.
- Show fewer simultaneous route labels or use more selective label emphasis rules.
- Review bus marker and route badge collisions in dense areas.

## Verification

- Babel transform check passed for:
  - `src/screens/HomeScreen.js`
  - `src/components/HomeScreenControls.js`
  - `src/components/DetourAlertStrip.js`
  - `src/components/MapViewModeToggle.js`

- Emulator screenshot was reviewed after the first pass to confirm the updated hierarchy.
