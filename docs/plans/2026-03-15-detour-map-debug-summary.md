# Detour Map Debug Summary

Date: 2026-03-15  
Repo: `C:\Users\Mike McConnell\Documents\mike_apps\BTTP`

## Purpose

This note captures the detour investigation and fixes so a later chat session can continue without redoing the debugging work.

## Original Problem

The app was correctly detecting active auto detours for routes `8A` and `8B`, but riders could not clearly see where those detours were on the map UI.

## Findings

### 1. The frontend was receiving live detour geometry

This was not a Firestore subscription or overlay pipeline failure.

- Live `activeDetours` documents existed for `8A` and `8B`
- The frontend overlay flow was already wired to render active detour geometry
- The map issue was caused by what geometry was available and how the camera behaved

### 2. The live detours did not include `skippedSegmentPolyline`

The current detections contained only a short `inferredDetourPolyline`, not the route-aligned skipped segment riders expect to see.

Why:

- Backend detour geometry suppressed skipped-route geometry when the skipped span was under `500m`
- The live `8A` / `8B` skipped spans were only about `143.9m` and `132.7m`
- Result: the backend intentionally published `skippedSegmentPolyline: null`

Impact:

- The UI could only draw a short inferred off-route path
- That made the detour hard to notice and hard to interpret

### 3. Entering detour mode did not auto-fit the map camera

The app switched into detour mode from the detour banner, but it did not automatically move the camera to the detour geometry.

Impact:

- If the user was looking elsewhere on the map, the detour overlay could be off-screen
- Even valid geometry could appear to be missing

### 4. Cleared detours were not retaining location in history

Earlier in this work, it was confirmed that once a detour cleared, the map location was lost from persistent history because only the live `activeDetours` document stored geometry.

This was fixed so future `DETOUR_DETECTED` and `DETOUR_CLEARED` history events retain detour location fields.

## Changes Made

## Frontend

Added a shared detour viewport helper and used it to fit the map to actual detour geometry.

Files:

- `src/utils/detourViewport.js`
- `src/screens/HomeScreen.js`
- `src/screens/HomeScreen.web.js`
- `src/__tests__/detourViewport.test.js`

What changed:

- Added `getDetourViewportCoordinates(...)` to collect usable coordinates from:
  - `skippedSegmentPolyline`
  - `inferredDetourPolyline`
  - `entryPoint`
  - `exitPoint`
- Added `shouldAutoFitDetourViewport(...)` to determine when the camera should refocus
- Native and web `HomeScreen` now auto-fit when:
  - entering detour mode
  - switching focused detour routes while already in detour mode
- Detour details sheet "View on Map" now fits the full detour geometry instead of only entry/exit points

## Backend Geometry

Lowered the skipped-segment publish threshold so short but real detours can publish a visible route-aligned highlight.

Files:

- `api-proxy/detourGeometry.js`
- `api-proxy/__tests__/detourGeometry.test.js`
- `docs/AUTO-DETOUR-DETECTION.md`

What changed:

- Changed `DETOUR_MIN_LINEAR_SEGMENT_LENGTH_METERS` default from `500` to `100`
- Updated tests so the below-threshold case remains below the new threshold
- Documented the new threshold in the detour docs

## Backend History Persistence

Earlier in this same conversation, future detour history logging was upgraded to retain detour location fields when detections are created and cleared.

Files:

- `api-proxy/detourPublisher.js`
- `api-proxy/__tests__/detourPublisher.test.js`
- `api-proxy/__tests__/detourIntegration.test.js`
- `docs/AUTO-DETOUR-DETECTION.md`

What changed:

- Preserved primary geometry fields during publish throttling
- Added geometry-related fields to `DETOUR_DETECTED`
- Added geometry-related fields to `DETOUR_CLEARED`

Persisted history fields now include:

- `shapeId`
- `entryPoint`
- `exitPoint`
- `skippedSegmentPolyline`
- `inferredDetourPolyline`
- `segmentCount`
- `lastEvidenceAt`

## Verification

### Frontend tests

Command:

```bash
npx jest src/__tests__/detourViewport.test.js src/__tests__/detourOverlays.test.js src/__tests__/detourIntegration.test.js --runInBand
```

Result:

- Passed
- `59/59` tests passed

Notes:

- Existing React 19 `react-test-renderer` deprecation warnings appeared, but they did not fail the run

### Backend tests

Command run from `api-proxy/`:

```bash
npm test -- detourGeometry.test.js
```

Result:

- Passed
- Full backend Jest suite ran because of the package script shape
- `184/184` tests passed

Notes:

- Existing test log noise included CORS env warnings and baseline/detour hydration logs

## Why The UI Looked Broken

The bug was a combination of two separate issues:

1. The backend was omitting short skipped-route geometry, so the UI lacked the most legible detour highlight.
2. The frontend was not automatically moving the camera to the detour when users entered detour mode.

Either issue alone made the UX weaker. Together, they made valid detections look invisible.

## Operational Notes

These code changes are complete, but they are not all live automatically.

- Frontend changes require the app to reload or rebuild
- Backend geometry threshold and history logging changes require the `api-proxy` / detour worker deployment to restart or redeploy

Until the backend is redeployed, live detours will still use the old `500m` threshold and old history behavior.

## Recommended Next Checks

After deployment:

1. Confirm active short detours now publish `skippedSegmentPolyline`
2. Confirm entering detour mode visibly moves the map to the active detour
3. Confirm detour details sheet "View on Map" fits the correct geometry
4. After a detour clears, confirm the history record retains location fields for later analysis

## Suggested Next Prompt

Use this if continuing in a new chat:

> Read `docs/plans/2026-03-15-detour-map-debug-summary.md` and continue from there. Verify whether the deployed backend is now publishing `skippedSegmentPolyline` for short detours and whether the app camera auto-fits correctly in detour mode.
