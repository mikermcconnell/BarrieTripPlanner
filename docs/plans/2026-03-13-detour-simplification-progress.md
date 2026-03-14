# Detour Simplification Progress

Date: 2026-03-13

## Goal

Simplify the auto detour feature by:

- making Firestore the single source of truth on the client
- collapsing the rider-facing client flag behavior to one effective default
- removing dead detour UI
- reducing backend complexity around overnight persistence, restart seeding, and morning reverification

## Status

Backend simplification completed for this pass.
First-pass detour start/end anchor refinement completed and verified.
Trip-shape-aware geometry selection completed and verified.
Focused detour map filtering completed for route-specific corridor interpretation.

## Completed

### Client-side simplification

- `src/context/TransitContext.js`
  - Removed client-side detour freshness pruning.
  - Removed the periodic re-prune timer.
  - The client now renders the detour feed as published by Firestore.

- `src/config/runtimeConfig.js`
  - `runtimeConfig.detours.enabledByDefault` now uses `EXPO_PUBLIC_ENABLE_AUTO_DETOURS`.
  - `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI` is treated as a legacy fallback only.
  - Removed `geometryEnabledByDefault`.

- `src/__tests__/runtimeConfig.test.js`
  - Updated tests for the simplified config behavior.
  - Added coverage for legacy fallback behavior.

- `src/components/DetourBanner.js`
  - deleted

- `src/components/DetourBanner.web.js`
  - deleted

- `.env.example`
  - Updated comments so `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` is the primary rider-facing flag.
  - Marked `EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI` as legacy fallback.

### Backend simplification

- `api-proxy/detourDetector.js`
  - Keeps service-hours gating.
  - Clears detour state on transition out of service.
  - No longer seeds detector state from Firestore.
  - No longer carries morning reverification behavior.

- `api-proxy/detourWorker.js`
  - Removed first-tick Firestore seeding and related imports.
  - Worker now starts fresh each run and republishes based on fresh vehicle evidence.

- `api-proxy/__tests__/detourDetector.test.js`
  - Removed the old `seedActiveDetour` coverage.
  - Removed the old morning re-verification coverage.
  - Rewrote service-hours and end-of-service expectations around the new clear-and-restart model.

- `api-proxy/detourSeedUtils.js`
  - deleted

- `api-proxy/__tests__/detourSeedUtils.test.js`
  - deleted

- `api-proxy/detourPublisher.js`
  - Removed the dead `seedVehicleCount` fallback when publishing vehicle counts.

- `api-proxy/detourGeometry.js`
  - Removed the dead `seedVehicleCount` handoff on projected sibling-route detours.
  - Added first-pass entry/exit boundary candidate selection so detour start/end anchors prefer route leave/rejoin transitions over raw cluster min/max points.

- `api-proxy/__tests__/detourIntegration.test.js`
  - Renamed the old restart-seeding test to reflect publisher hydration behavior.
  - Updated the fixture to use plain `vehicleCount`.

### Start/end anchor refinement

- `api-proxy/detourDetector.js`
  - Captures lightweight entry and exit boundary candidates from on-route to off-route and off-route to on-route transitions.
  - Exposes those candidates through the raw evidence window used by geometry generation.

- `api-proxy/detourGeometry.js`
  - Projects entry and exit candidates onto the selected shape.
  - Prefers those projected candidates when deriving `entryPoint` and `exitPoint`.

- `api-proxy/__tests__/detourGeometry.test.js`
  - Added coverage proving boundary candidates override the old cluster-only anchor selection when present.

- `src/components/DetourOverlay.js`
  - Native map now renders explicit `START` and `END` anchor markers from `entryPoint` and `exitPoint`.

- `src/components/DetourOverlay.web.js`
  - Web map now renders explicit `START` and `END` anchor markers from `entryPoint` and `exitPoint`.

- `src/__tests__/detourIntegration.test.js`
  - Updated overlay expectations so anchor markers remain visible even when stop markers are hidden.

### Trip-shape-aware route selection

- `api-proxy/detourDetector.js`
  - Evidence points and boundary candidates now retain `tripShapeId` when GTFS trip mapping resolves the active shape.
  - Snapshot geometry and detour-zone selection can now carry branch/variant context forward from live vehicles instead of re-guessing from the full route shape set.

- `api-proxy/detourGeometry.js`
  - Shape selection now prefers observed trip-shape hints from evidence and boundary candidates before falling back to route-wide distance matching.
  - This reduces wrong-branch snapping on routes like `8A` / `8B` when a nearby sibling shape is geographically closer than the vehicle's assigned shape.

- `api-proxy/__tests__/detourGeometry.test.js`
  - Added coverage proving trip-shape hints override a closer sibling shape and that the old closest-shape fallback still applies when no valid hint exists.

- `api-proxy/__tests__/detourDetector.test.js`
  - Added an end-to-end detector snapshot regression proving the published geometry stays on the assigned trip shape in a multi-shape route.

### Docs

- `docs/AUTO-DETOUR-DETECTION.md`
  - Removed references to detector seeding from Firestore.
  - Removed references to overnight persistence and morning reverification.
  - Removed `DETOUR_REVERIFICATION_WINDOW_MS` from the config table.
  - Updated failure modes and local development notes to match the simplified model.

### Route-specific focused detour semantics

- `src/screens/HomeScreen.js`
  - Focused detour mode now hides non-focused route shapes so detour entry and exit read against the selected route's own scheduled corridor only.

- `src/screens/HomeScreen.web.js`
  - Applied the same focused detour corridor filtering on web for parity with native.

- `docs/plans/2026-03-08-detour-map-parity-plan.md`
  - Recorded the rider-facing rule that detour interpretation must follow the focused route's own scheduled line, not overlapping geometry from other routes.

## Verification completed

Ran:

```bash
npx jest src/__tests__/runtimeConfig.test.js --runInBand
npx jest api-proxy/__tests__/detourDetector.test.js --runInBand
npx jest api-proxy/__tests__/detourGeometry.test.js --runInBand
npx jest api-proxy/__tests__/detourIntegration.test.js --runInBand
npx jest src/__tests__/detourIntegration.test.js --runInBand
```

Result: passed

Additional verification:

```bash
npx jest api-proxy/__tests__/detourGeometry.test.js --runInBand
npx jest api-proxy/__tests__/detourDetector.test.js --runInBand
npx jest api-proxy/__tests__/detourIntegration.test.js --runInBand
```

Result: passed

## Remaining follow-up

- Optional: run broader backend detour suites (`detourGeometry`, `detourPublisher`) before deploy.
- Optional: deploy/restart the Railway worker once the broader detour changes in the worktree are ready.

## Handoff for Next Chat

### Done in this pass

- Backend detour simplification was completed and verified:
  - detector no longer seeds from Firestore
  - morning re-verification behavior was removed
  - service-hours behavior now clears detector state at end of service and resumes fresh the next day
- First-pass detour start/end refinement was implemented:
  - `api-proxy/detourDetector.js` now records entry and exit boundary candidates from route leave/rejoin transitions
  - `api-proxy/detourGeometry.js` now projects those candidates onto the selected route shape and prefers them when deriving `entryPoint` and `exitPoint`
  - native and web overlays now render explicit `START` and `END` markers from `entryPoint` / `exitPoint`
- Targeted tests passed:
  - `npx jest api-proxy/__tests__/detourGeometry.test.js --runInBand`
  - `npx jest api-proxy/__tests__/detourDetector.test.js --runInBand`
  - `npx jest api-proxy/__tests__/detourIntegration.test.js --runInBand`
  - `npx jest src/__tests__/detourIntegration.test.js --runInBand`
- Trip-shape-aware geometry selection was added:
  - detour evidence now preserves `tripShapeId` when available
  - shape selection for detour zones and published geometry now prefers those observed trip-shape hints before route-wide fallback
  - added regressions proving a detouring branch stays on its assigned shape even when a nearby sibling shape is closer

### Still to do

- Validate the new anchor behavior against live 8A / 8B map cases and confirm whether the `START` / `END` markers now align with the actual branch split and rejoin points.
- If anchors are still slightly early or late on 8A / 8B:
  - add branch-specific snapping or biasing around the known diverge / merge area
- Decide whether the rider-facing UI should also show text like:
  - `Detour starts after <stop>`
  - `Regular route resumes before <stop>`
- If needed, add backend or UI tuning so start/end markers remain stable when buses jitter around the route boundary.
- Before deploy, consider running a broader detour/client regression pass because the worktree contains many unrelated in-progress UI changes.

### Known context

- The repo worktree is dirty in many unrelated files. Do not revert unrelated changes.
- `src/__tests__/detourIntegration.test.js` passes but emits the existing `react-test-renderer is deprecated` warning noise.
- `api-proxy/__tests__/detourIntegration.test.js` passes but logs one hydration message from `detourPublisher`; this is not a failure.

## Notes

- The repo worktree is still dirty in many unrelated files. Do not revert unrelated changes.
- The targeted detector simplification work is now in a verified state.
