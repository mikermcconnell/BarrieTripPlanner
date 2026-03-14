# Home Screen UI Pass 2

Date: March 13, 2026

## Context

Reference state: native Android home screen after pass 1.

Screenshot review result: improved hierarchy, but the top stack still felt split into three competing surfaces.

Primary issue: the route tray and detour row still pulled too much attention relative to the search field, so the entry point did not yet feel like the clear anchor of the screen.

## Pass 2 Goals

1. Make the search/header area feel like one intentional top chrome block.
2. Increase the visual authority of the search field without adding new product features.
3. Let inactive route chips recede so active selections and the search bar carry the hierarchy.
4. Soften the detour/mode row so it reads as supporting status, not the primary control.

## Changes Implemented

### Top chrome backdrop

- Added a shared translucent backdrop behind the top stack.
- Sized the backdrop to support both the compact state and the detour-visible state.
- Kept it behind the interactive controls so touch behavior is unchanged.

Files:

- `src/screens/HomeScreen.js`

### Search bar polish

- Strengthened the search field card with a cleaner edge, stronger elevation, and a more deliberate search icon treatment.
- Increased input size and weight so the search bar reads as the primary action.
- Refined the right-side status capsule so it feels integrated instead of bolted on.

Files:

- `src/screens/HomeScreen.js`

### Route tray de-emphasis

- Reduced the tray contrast and weight so it sits inside the header system instead of floating as a second hero card.
- Changed inactive route chips from bold colored edge treatments to softer chips with small route dots.
- Kept active route chips vivid so selections still read clearly.

Files:

- `src/components/HomeScreenControls.js`

### Inline detour row softening

- Softened the inline detour strip border and fill.
- Softened the inline map-view toggle card so it matches the calmer secondary role.

Files:

- `src/components/DetourAlertStrip.js`
- `src/components/MapViewModeToggle.js`

## Expected Visual Result

- The top section should now read as one composed block rather than stacked floating pills.
- The search field should lead the eye first.
- Inactive route chips should feel available but quieter.
- The detour row should still be easy to scan while competing less with the search entry.

## Verification

- Babel transform check passed for:
  - `src/screens/HomeScreen.js`
  - `src/components/HomeScreenControls.js`
  - `src/components/DetourAlertStrip.js`
  - `src/components/MapViewModeToggle.js`

- Visual verification in emulator is still required for final tuning.
