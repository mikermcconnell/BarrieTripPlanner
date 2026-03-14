# Home Screen UI Pass 3

Date: March 13, 2026

## Context

Reference state: native Android home screen after pass 2.

Screenshot review result: the top hierarchy was substantially improved, but the map body still felt crowded when multiple vehicles on the same route were visible at once.

Primary issue: repeated line labels and route annotation created visual collisions in dense areas, especially on overlapping route families such as 100, 8A, 8B, and branch variants.

## Pass 3 Goals

1. Reduce on-map annotation clutter without hiding buses.
2. Show fewer simultaneous route labels when the map is zoomed out.
3. Preserve full route emphasis when the rider selects a route or zooms in far enough.
4. Keep all live buses equally visible.

## Changes Implemented

### More selective route-line annotation

- Tightened route-line label and arrow rules so selected-route annotation only appears when the map is zoomed in enough and the selection count is low.
- This keeps selected routes readable while reducing the chance of text noise when multiple routes are highlighted.

Files:

- `src/screens/HomeScreen.js`

### Regression coverage

- Preserved the existing bus marker memo coverage after removing compact vehicle treatment.

Files:

- `src/__tests__/busMarker.test.js`

## Expected Visual Result

- Dense map areas should reduce line-label noise without hiding or shrinking any live buses.
- Zooming in or selecting a route should restore fuller route emphasis where it is actually useful.

## Verification

- Babel transform check passed for:
  - `src/screens/HomeScreen.js`
  - `src/components/BusMarker.js`

- Jest passed for:
  - `src/__tests__/busMarker.test.js`

- Emulator screenshot review is still required to confirm the compaction thresholds feel right in practice.
