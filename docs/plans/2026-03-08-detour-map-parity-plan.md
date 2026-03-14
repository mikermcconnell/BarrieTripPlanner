# Detour Map Parity Plan

**Date:** 2026-03-08
**Status:** In progress
**Goal:** Make active detours in the app read the same way as the detour reference image, with route 8 as the acceptance case.

## Problem Statement

The app already has:
- auto-detected detour geometry
- a detour alert strip
- a detour details sheet
- route-focused detour mode

What it does not yet have is the same rider-facing map language as the reference. The current app view still looks like a multi-route network map with detour overlays on top. The reference works because it makes three things obvious at a glance:

1. The scheduled route is still visible
2. The detour path is visually distinct from normal service
3. Stops that are not being served are unmistakable

## Acceptance Criteria

For an active route 8 detour:

1. The scheduled route appears in a neutral, solid style
2. The detour path appears in a high-contrast dashed alert style
3. Stops on the skipped segment render differently from active stops
4. The selected detour route is visually dominant over unrelated routes
5. When a specific detour route is focused, only that route's scheduled corridor remains visible for detour interpretation
6. Tapping the detour strip or sheet keeps the map focused on that route
7. Native and web use the same detour semantics

This means detour start and detour end are judged against the focused route's
own scheduled line, not against any overlapping corridor from another route.

## Implementation Sequence

### Phase 1: Data Model For Rider-Facing Detour Stops

Update the shared detour overlay derivation so it outputs:
- skipped segment polyline
- detour path polyline
- entry point
- exit point
- affected stop list
- skipped stop list
- entry stop
- exit stop

This keeps the detour map rendering driven by one shared data shape instead of duplicating stop logic in each platform renderer.

**Files**
- `src/hooks/useDetourOverlays.js`
- `src/hooks/useAffectedStops.js`

### Phase 2: Map Rendering Parity

Update native and web detour overlays so detour mode uses reference-style semantics:
- base route stays visible in a neutral black/dark style
- skipped route segment uses a strong red dashed line
- detour path uses a strong black or neutral route line consistent with the reference
- skipped stops use red slashed markers
- active route stops use white fill with black outline
- entry and exit markers are visually distinct but secondary to stop-state markers

**Files**
- `src/components/DetourOverlay.js`
- `src/components/DetourOverlay.web.js`
- new shared detour stop marker helpers/components if needed

### Phase 3: Home Screen Focus Behavior

Tighten detour mode in both home screens:
- when detour mode is active, reduce unrelated map clutter
- when a detour route is opened from the alert strip, treat it as the focused detour route
- when a detour route is focused, hide non-focused route shapes instead of merely dimming them
- keep strip, sheet, and map synchronized

**Files**
- `src/screens/HomeScreen.js`
- `src/screens/HomeScreen.web.js`

### Phase 4: Verification

Update pure-function tests first, then validate the route 8 case.

**Files**
- `src/__tests__/detourOverlays.test.js`
- `src/__tests__/useAffectedStops.test.js`

## Out Of Scope For This Pass

- detour legend UI
- temporary replacement stop derivation beyond entry/exit + skipped stops
- trip planner detour propagation
- historical detour playback

## Definition Of Done

The active route 8 detour in the app can be compared side-by-side with the reference image and a rider can immediately identify:
- the normal route
- the detour segment
- the stops not being served

The app should no longer require the rider to infer stop impact from the sheet alone.
